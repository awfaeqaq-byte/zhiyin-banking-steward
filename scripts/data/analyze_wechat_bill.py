#!/usr/bin/env python3
"""Read a WeChat XLSX locally and emit aggregate-only JSON.

The output intentionally excludes merchants, products, notes, account details,
transaction IDs and raw amounts. It never evaluates workbook formulas.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
EXPECTED_HEADERS = [
    "交易时间", "交易类型", "交易对方", "商品", "收/支", "金额(元)",
    "支付方式", "当前状态", "交易单号", "商户单号", "备注",
]


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference or "")
    value = 0
    for character in letters.group(0) if letters else "":
        value = value * 26 + ord(character) - 64
    return value - 1


def cell_text(cell: ET.Element, shared: list[str]) -> Optional[str]:
    cell_type = cell.attrib.get("t")
    value = cell.find(f"{{{MAIN_NS}}}v")
    if cell_type == "inlineStr":
        texts = [node.text or "" for node in cell.findall(f".//{{{MAIN_NS}}}t")]
        return "".join(texts)
    if value is None or value.text is None:
        return None
    if cell_type == "s":
        try:
            return shared[int(value.text)]
        except (ValueError, IndexError):
            return None
    return value.text


def first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find(f".//{{{MAIN_NS}}}sheet")
    if first_sheet is None:
        raise ValueError("工作簿没有工作表")
    relationship_id = first_sheet.attrib.get(f"{{{REL_NS}}}id")
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall(f"{{{PKG_REL_NS}}}Relationship"):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib.get("Target", "")
            target = target.lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError("无法定位第一个工作表")


def read_rows(file_path: Path) -> tuple[list[list[Optional[str]]], int]:
    with zipfile.ZipFile(file_path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 120 * 1024 * 1024:
            raise ValueError("解压后工作簿过大")
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.text or "" for node in item.findall(f".//{{{MAIN_NS}}}t"))
                      for item in shared_root.findall(f"{{{MAIN_NS}}}si")]
        sheet = ET.fromstring(archive.read(first_sheet_path(archive)))
        rows: list[list[Optional[str]]] = []
        formula_cells = 0
        for row in sheet.findall(f".//{{{MAIN_NS}}}row"):
            values: list[Optional[str]] = [None] * 11
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                if cell.find(f"{{{MAIN_NS}}}f") is not None:
                    formula_cells += 1
                index = column_index(cell.attrib.get("r", ""))
                if 0 <= index < 11:
                    values[index] = cell_text(cell, shared)
            rows.append(values)
        return rows, formula_cells


def parse_wechat_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parse both WeChat text timestamps and Excel 1900-system serial values."""
    text = (value or "").strip()
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            pass
    try:
        serial = Decimal(text)
        if not serial.is_finite() or serial < 1 or serial > 2_958_465:
            return None
        return datetime(1899, 12, 30) + timedelta(days=float(serial))
    except (InvalidOperation, ValueError, OverflowError):
        return None


def has_keyword(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def analyze(file_path: Path) -> dict:
    if not file_path.is_absolute() or file_path.suffix.lower() != ".xlsx":
        raise ValueError("只支持绝对路径的 xlsx 文件")
    if file_path.name.startswith(".~"):
        raise ValueError("不能读取 Excel 临时锁文件")
    size = file_path.stat().st_size
    if size > 50 * 1024 * 1024:
        raise ValueError("工作簿超过 50MB 上限")
    rows, formula_cells = read_rows(file_path)
    header_index = next((index for index, row in enumerate(rows) if row == EXPECTED_HEADERS), -1)
    if header_index < 0:
        raise ValueError("未找到微信支付账单明细表头")
    details = [row for row in rows[header_index + 1:] if any(value not in (None, "") for value in row)]
    if not details:
        raise ValueError("账单中没有明细记录")
    if len(details) > 100_000:
        raise ValueError("账单记录超过 100000 条上限")

    directions: Counter[str] = Counter()
    transaction_types: Counter[str] = Counter()
    transaction_ids: list[str] = []
    date_valid = 0
    parsed_dates: list[datetime] = []
    amount_numeric = 0
    amount_exact_cents = 0
    formula_risk_texts = 0
    signals: Counter[str] = Counter()

    for row in details:
        occurred_at, kind, merchant, product, direction, amount, _payment, status, transaction_id, _merchant_id, note = row
        directions[(direction or "未知").strip()] += 1
        transaction_types[(kind or "未知").strip()] += 1
        transaction_ids.append((transaction_id or "").strip())
        parsed_date = parse_wechat_datetime(occurred_at)
        if parsed_date is not None:
            date_valid += 1
            parsed_dates.append(parsed_date)
        try:
            numeric = Decimal(str(amount))
            if numeric.is_finite():
                amount_numeric += 1
                if numeric * 100 == (numeric * 100).to_integral_value():
                    amount_exact_cents += 1
        except (InvalidOperation, TypeError):
            pass
        text = " ".join(str(value) for value in (kind, merchant, product, status, note) if value)
        if has_keyword(text, ("收款", "收钱", "货款")):
            signals["collections"] += 1
        if has_keyword(text, ("退款", "退还", "赔付")):
            signals["refunds"] += 1
        if has_keyword(text, ("理财通", "零钱通", "基金", "证券", "黄金")):
            signals["wealth"] += 1
        if has_keyword(text, ("会员", "续费", "订阅")):
            signals["subscriptions"] += 1
        if has_keyword(text, ("医院", "医疗", "教育", "学校", "物业", "保险", "房贷", "母婴", "儿童")):
            signals["family_planning"] += 1
        if has_keyword(text, ("转账", "红包", "扫二维码付款")):
            signals["transfer_safety"] += 1
        for value in row:
            if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
                formula_risk_texts += 1

    nonempty_ids = [value for value in transaction_ids if value]
    unique_ids = len(set(nonempty_ids))
    duplicate_id_rows = len(nonempty_ids) - unique_ids
    record_count = len(details)
    suggestions: list[dict] = []
    suggested_needs: list[str] = []

    def add_need(need: str, title: str, reason: str, evidence_count: int, confidence: str = "medium") -> None:
        suggested_needs.append(need)
        suggestions.append({
            "id": need,
            "need": need,
            "title": title,
            "reason": reason,
            "evidenceCount": evidence_count,
            "confidence": confidence,
        })

    if signals["collections"] >= 20 or signals["refunds"] >= 20:
        add_need("business_reconcile", "优先查看收款与退款对账",
                 f"账单中识别到 {signals['collections']} 条收款线索和 {signals['refunds']} 条退款线索。",
                 signals["collections"] + signals["refunds"])
    if signals["wealth"] >= 5:
        add_need("asset_allocation", "关注理财与流动性",
                 f"账单中识别到 {signals['wealth']} 条理财或零钱通相关线索。",
                 signals["wealth"])
        suggested_needs.append("liquidity")
    if signals["subscriptions"] >= 3:
        add_need("subscription_review", "检查会员和续费",
                 f"账单中识别到 {signals['subscriptions']} 条会员、续费或订阅线索。",
                 signals["subscriptions"], "low")
    if signals["transfer_safety"] >= 20:
        add_need("safety_first", "强化转账与扫码支付安全提醒",
                 f"账单中识别到 {signals['transfer_safety']} 条转账、红包或扫码付款线索。",
                 signals["transfer_safety"])
    if signals["family_planning"] >= 10:
        add_need("family_planning", "关注家庭类固定支出",
                 f"账单中识别到 {signals['family_planning']} 条医疗、教育、物业或保险线索。",
                 signals["family_planning"], "low")
    suggested_needs = list(dict.fromkeys(suggested_needs))[:6]

    segment_scores = {
        "merchant_sme": signals["collections"] + signals["refunds"],
        "wealth_management": signals["wealth"] * 2,
        "family": signals["family_planning"] * 2,
    }
    suggested_segment = max(segment_scores, key=segment_scores.get)
    if segment_scores[suggested_segment] < 20:
        suggested_segment = "general"

    date_invalid = record_count - date_valid
    amount_invalid_precision = amount_numeric - amount_exact_cents
    return {
        "version": 1,
        "status": "ready",
        "source": {
            "fileName": file_path.name,
            "sha256": hashlib.sha256(file_path.read_bytes()).hexdigest(),
            "modifiedAt": int(file_path.stat().st_mtime * 1000),
            "analyzedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        },
        "recordCount": record_count,
        "directions": {
            "expense": directions["支出"],
            "income": directions["收入"],
            "neutral": record_count - directions["支出"] - directions["收入"],
        },
        "quality": {
            "dateValid": date_valid,
            "dateInvalid": date_invalid,
            "amountNumeric": amount_numeric,
            "amountExactCents": amount_exact_cents,
            "amountInvalidPrecision": amount_invalid_precision,
            "nonemptyIds": len(nonempty_ids),
            "uniqueIds": unique_ids,
            "duplicateIdRows": duplicate_id_rows,
            "formulaCells": formula_cells,
            "formulaRiskTexts": formula_risk_texts,
            "analysisLevel": "structure_only" if date_invalid or amount_invalid_precision else "full",
        },
        "coverage": {
            "from": min(parsed_dates).isoformat(timespec="seconds") if parsed_dates else None,
            "to": max(parsed_dates).isoformat(timespec="seconds") if parsed_dates else None,
        },
        "signals": dict(signals),
        "suggestedSegment": suggested_segment,
        "suggestedNeeds": suggested_needs,
        "suggestions": suggestions,
        "limitations": [
            *( ["日期字段无法标准解析，不用于月度趋势、周期规律或时间异常。"] if date_invalid else [] ),
            *( ["部分金额无法精确转换为分，不输出金额合计或理财可投金额。"] if amount_invalid_precision else [] ),
            *( ["交易单号重复或失真，不依赖原始单号去重。"] if duplicate_id_rows else [] ),
        ],
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("用法: analyze_wechat_bill.py <xlsx>")
    try:
        print(json.dumps(analyze(Path(sys.argv[1]).resolve()), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:  # Return a safe message; never print workbook contents.
        print(json.dumps({"version": 1, "status": "error", "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
