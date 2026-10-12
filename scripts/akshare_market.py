#!/usr/bin/env python3
"""Fetch a deliberately small, normalized market context payload via AKShare."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from typing import Any

try:
    import akshare as ak
except ImportError:
    print("AKSHARE_NOT_INSTALLED", file=sys.stderr)
    raise SystemExit(12)


def scalar(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def date_text(value: Any) -> str:
    return str(value).split(" ")[0].replace("-", "").replace("/", "")


def index_indicator(start: str, end: str) -> dict[str, Any] | None:
    last_error: Exception | None = None
    frame = None
    for attempt in range(3):
        try:
            frame = ak.stock_zh_index_daily_em(
                symbol="sh000300", start_date=start, end_date=end
            )
            break
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(0.4 * (attempt + 1))
    if frame is None:
        try:
            fallback = ak.stock_zh_index_daily_tx(symbol="sh000300")
            fallback_dates = fallback["date"].map(date_text)
            frame = fallback[(fallback_dates >= start) & (fallback_dates <= end)]
        except Exception:
            if last_error is not None:
                raise last_error
            raise
    if frame is None or frame.empty:
        return None
    date_column = next((name for name in ("date", "日期") if name in frame.columns), None)
    close_column = next((name for name in ("close", "收盘") if name in frame.columns), None)
    if not date_column or not close_column:
        raise ValueError(f"沪深300字段不兼容：{list(frame.columns)}")
    ordered = frame.sort_values(date_column)
    latest = scalar(ordered.iloc[-1][close_column])
    if latest is None:
        return None
    result: dict[str, Any] = {
        "key": "csi300",
        "label": "沪深300",
        "date": date_text(ordered.iloc[-1][date_column]),
        "value": round(latest, 4),
        "unit": "point",
    }
    if len(ordered) > 1:
        previous = scalar(ordered.iloc[-2][close_column])
        if previous not in (None, 0):
            result["change"] = round((latest / previous - 1) * 100, 4)
    return result


def shibor_indicator() -> dict[str, Any] | None:
    frame = ak.rate_interbank(
        market="上海银行同业拆借市场", symbol="Shibor人民币", indicator="3月"
    )
    if frame is None or frame.empty:
        return None
    date_column = next(
        (name for name in ("报告日", "日期", "date") if name in frame.columns), None
    )
    value_column = next(
        (name for name in ("利率", "rate", "3月") if name in frame.columns), None
    )
    if not date_column or not value_column:
        raise ValueError(f"Shibor字段不兼容：{list(frame.columns)}")
    ordered = frame.sort_values(date_column)
    value = scalar(ordered.iloc[-1][value_column])
    if value is None:
        return None
    return {
        "key": "shibor_3m",
        "label": "Shibor 3个月",
        "date": date_text(ordered.iloc[-1][date_column]),
        "value": round(value, 4),
        "unit": "percent",
    }


def collect(name: str, loader: Any) -> tuple[list[dict[str, Any]], dict[str, str]]:
    try:
        indicator = loader()
        if indicator is None:
            return [], {"name": name, "status": "empty", "message": "接口返回为空"}
        return [indicator], {"name": name, "status": "ready"}
    except Exception as error:  # The caller needs partial results, not a collapsed batch.
        return [], {"name": name, "status": "error", "message": str(error)[:240]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("probe", "batch"), required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    args = parser.parse_args()

    indicators, capability = collect(
        "小样本 · 沪深300" if args.mode == "probe" else "沪深300日线",
        lambda: index_indicator(args.start, args.end),
    )
    capabilities = [capability]
    if args.mode == "batch":
        extra_indicators, capability = collect("Shibor 3个月", shibor_indicator)
        indicators.extend(extra_indicators)
        capabilities.append(capability)
    print(json.dumps({"indicators": indicators, "capabilities": capabilities}, ensure_ascii=False))


if __name__ == "__main__":
    main()
