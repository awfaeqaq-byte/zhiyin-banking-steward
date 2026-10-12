#!/usr/bin/env python3
"""Convert an official WeChat XLSX export into a local MobileGym ledger seed.

The source workbook is read-only. Native transaction identifiers are hashed
before data reaches the browser. Neutral rows are reported but not coerced into
income or expense.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from analyze_wechat_bill import EXPECTED_HEADERS, parse_wechat_datetime, read_rows


def includes(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def category_for(direction: str, text: str) -> str:
    if direction == "收入":
        return "income"
    rules = (
        ("service", ("医院", "医疗", "药房", "诊所", "体检")),
        ("education", ("学校", "教育", "课程", "学费", "培训")),
        ("transport", ("地铁", "公交", "铁路", "打车", "滴滴", "高德", "航空", "车票")),
        ("dining", ("餐", "咖啡", "奶茶", "外卖", "食品", "美食")),
        ("transfer", ("转账", "红包", "扫二维码付款")),
        ("gift", ("礼物", "礼品")),
        ("entertainment", ("电影", "游戏", "娱乐", "会员", "视频", "音乐")),
        ("life", ("水费", "电费", "燃气", "物业", "话费", "宽带", "生活缴费")),
        ("shopping", ("购物", "商城", "便利店", "超市", "百货", "商店")),
        ("service", ("服务", "保险", "快递")),
    )
    for category, words in rules:
        if includes(text, words):
            return category
    return "other"


def stable_id(native_id: str, row_number: int) -> str:
    digest = hashlib.sha256(f"{native_id}|{row_number}".encode("utf-8")).hexdigest()
    return f"xlsx-{digest[:24]}"


def import_seed(file_path: Path) -> dict:
    file_path = file_path.resolve()
    if not file_path.is_absolute() or file_path.suffix.lower() != ".xlsx":
        raise ValueError("只支持绝对路径的 xlsx 文件")
    if not file_path.is_file() or file_path.name.startswith(".~"):
        raise ValueError("账单文件不存在或是临时文件")
    if file_path.stat().st_size > 50 * 1024 * 1024:
        raise ValueError("工作簿超过 50MB 上限")

    rows, formula_cells = read_rows(file_path)
    header_index = next((index for index, row in enumerate(rows) if row == EXPECTED_HEADERS), -1)
    if header_index < 0:
        raise ValueError("未找到微信支付账单明细表头")

    details = [row for row in rows[header_index + 1:] if any(value not in (None, "") for value in row)]
    transactions = []
    monthly = Counter()
    quarantined = Counter()
    seen_ids = set()

    for offset, row in enumerate(details, start=header_index + 2):
        occurred_at, kind, merchant, product, direction, amount, _payment, status, native_id, _merchant_id, note = row
        direction = (direction or "").strip()
        if direction not in ("支出", "收入"):
            quarantined["neutral_direction"] += 1
            continue
        parsed_date = parse_wechat_datetime(occurred_at)
        if parsed_date is None:
            quarantined["invalid_date"] += 1
            continue
        try:
            decimal_amount = Decimal(str(amount))
            scaled = decimal_amount * 100
            if not decimal_amount.is_finite() or scaled != scaled.to_integral_value() or scaled <= 0:
                raise InvalidOperation
            amount_cents = int(scaled)
        except (InvalidOperation, TypeError, ValueError):
            quarantined["invalid_amount"] += 1
            continue

        raw_id = (native_id or "").strip()
        identifier = stable_id(raw_id, offset)
        if identifier in seen_ids:
            quarantined["duplicate"] += 1
            continue
        seen_ids.add(identifier)

        combined = " ".join(value for value in (kind, merchant, product, status, note) if value)
        category = category_for(direction, combined)
        display_name = ((merchant or product or kind or "微信交易").strip())[:60]
        occurred_iso = parsed_date.isoformat(timespec="seconds") + "+08:00"
        transaction = {
            "id": identifier,
            "direction": "expense" if direction == "支出" else "income",
            "amountCents": amount_cents,
            "category": category,
            "merchant": display_name,
            "occurredAt": occurred_iso,
            "source": "wechat_pay",
        }
        note_text = " · ".join(value.strip() for value in (kind, product, status) if value and value.strip())[:120]
        if note_text:
            transaction["note"] = note_text
        transactions.append(transaction)
        if direction == "支出":
            monthly[parsed_date.strftime("%Y-%m")] += amount_cents

    transactions.sort(key=lambda item: item["occurredAt"], reverse=True)
    sha256 = hashlib.sha256(file_path.read_bytes()).hexdigest()
    dates = [item["occurredAt"] for item in transactions]
    return {
        "transactions": transactions,
        "monthlyHistory": [
            {"month": month, "expenseCents": monthly[month]}
            for month in sorted(monthly)
        ],
        "settings": {"dailyReport": True, "includeManualRecords": True},
        "importReport": {
            "version": 1,
            "fileName": file_path.name,
            "sha256": sha256,
            "sourceRows": len(details),
            "importedRows": len(transactions),
            "quarantinedRows": sum(quarantined.values()),
            "quarantineReasons": dict(quarantined),
            "formulaCells": formula_cells,
            "from": min(dates) if dates else None,
            "to": max(dates) if dates else None,
        },
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("用法: import_wechat_bill.py <xlsx>")
    try:
        print(json.dumps(import_seed(Path(sys.argv[1])), ensure_ascii=False, separators=(",", ":")))
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "error", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
