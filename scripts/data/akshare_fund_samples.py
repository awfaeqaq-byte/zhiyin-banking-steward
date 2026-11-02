#!/usr/bin/env python3
"""Read three allowlisted issuer disclosures and cross-check available NAVs."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import date
from typing import Any

import requests
from bs4 import BeautifulSoup

try:
    import akshare as ak
except ImportError:
    print("AKSHARE_NOT_INSTALLED", file=sys.stderr)
    raise SystemExit(12)


SOURCES = {
    "110006": "https://www.efunds.com.cn/fund/110006.shtml",
    "026197": "https://www.efunds.com.cn/fund/026197.shtml",
    "510330": "https://www.chinaamc.com/fund/510330/index.shtml",
}


def page_text(url: str) -> str:
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; ZhiyinFundResearch/1.0)"}, timeout=8)
    response.raise_for_status()
    if len(response.content) > 1_000_000:
        raise ValueError("发行方页面超出大小限制")
    response.encoding = "gbk" if "chinaamc.com" in url else "utf-8"
    return " ".join(BeautifulSoup(response.text, "html.parser").stripped_strings)


def amount(raw: str) -> float:
    result = float(raw)
    if not math.isfinite(result) or result < 0:
        raise ValueError("披露值不是有效数字")
    return round(result, 4)


def issuer_record(code: str, today: date) -> dict[str, Any]:
    url = SOURCES[code]
    try:
        text = page_text(url)
        if code not in text[:1500]:
            raise ValueError("发行方页面基金代码不匹配")
        if code == "110006":
            match = re.search(r"([\d.]+)\s+万份收益\s*\(元\)\s+([\d.]+)%\s+七日年化收益率\s+基金净值日期[:：]\s*(\d{4}-\d{2}-\d{2})", text[:3000])
            if not match:
                raise ValueError("货币基金收益字段结构已变化")
            value, annualized, observed = match.groups()
            record = {"code": code, "metric": "per_10k_income", "status": "ready", "date": observed,
                      "value": amount(value), "sevenDayAnnualizedPct": amount(annualized)}
        elif code == "026197":
            match = re.search(r"([\d.]+)\s+单位净值\s*\(元\)\s+(-?[\d.]+)%\s+日涨跌\s+[\d.]+\s+累计净值\s*\(元\)\s+基金净值日期[:：]\s*(\d{4}-\d{2}-\d{2})", text[:3000])
            if not match:
                raise ValueError("债券基金净值字段结构已变化")
            value, change, observed = match.groups()
            record = {"code": code, "metric": "unit_nav", "status": "ready", "date": observed,
                      "value": amount(value), "changePct": float(change)}
        else:
            match = re.search(r"([\d.]+)\s+净值\s*（(\d{4}-\d{2}-\d{2})）\s+(-?[\d.]+)%\s+日涨跌幅", text[:1500])
            if not match:
                raise ValueError("ETF 发行方净值字段结构已变化")
            value, observed, change = match.groups()
            record = {"code": code, "metric": "unit_nav", "status": "ready", "date": observed,
                      "value": amount(value), "changePct": float(change)}
        observed_date = date.fromisoformat(record["date"])
        if observed_date > today or (today - observed_date).days > 14:
            raise ValueError("发行方净值日期超出可用窗口")
        return {**record, "source": url, "crossCheck": "issuer_only"}
    except Exception as error:
        return {"code": code, "metric": "per_10k_income" if code == "110006" else "unit_nav",
                "status": "unavailable", "message": f"发行方数据不可用：{str(error)[:110]}"}


def secondary_nav(code: str) -> tuple[str, float]:
    frame = ak.fund_open_fund_info_em(symbol=code, indicator="单位净值走势")
    if frame is None or frame.empty or "净值日期" not in frame or "单位净值" not in frame:
        raise ValueError("第三方净值字段缺失")
    row = frame.sort_values("净值日期").iloc[-1]
    return str(row["净值日期"]).split(" ")[0], amount(str(row["单位净值"]))


def cross_check(record: dict[str, Any]) -> dict[str, Any]:
    if record["status"] != "ready" or record["code"] == "110006":
        return record
    try:
        observed, value = secondary_nav(record["code"])
        if observed != record["date"]:
            return {**record, "message": "第三方净值日期不同，仅采用发行方披露"}
        if abs(value - record["value"]) > 0.0001:
            return {"code": record["code"], "metric": "unit_nav", "status": "conflict",
                    "message": "发行方与第三方同日净值冲突，已停止展示数值"}
        return {**record, "crossCheck": "matched"}
    except Exception:
        return {**record, "message": "第三方接口不可用，仅采用发行方披露"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--end", default=date.today().isoformat())
    args = parser.parse_args()
    today = date.fromisoformat(args.end)
    records = [cross_check(issuer_record(code, today)) for code in SOURCES]
    print(json.dumps({"provider": "issuer_akshare", "records": records}, ensure_ascii=False))


if __name__ == "__main__":
    main()
