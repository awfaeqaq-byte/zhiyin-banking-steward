#!/usr/bin/env python3
"""Recover date-only values from a damaged WeChat bill using a confirmed range.

The source workbook is never modified. Recovery combines the confirmed inclusive
range, descending source row order and a fuzzy match against the damaged date
tokens. It intentionally does not reconstruct hours, minutes or seconds.
"""

from __future__ import annotations

import calendar
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

from analyze_wechat_bill import EXPECTED_HEADERS, read_rows


def levenshtein(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for row, left_character in enumerate(left, 1):
        current = [row]
        for column, right_character in enumerate(right, 1):
            current.append(min(
                current[-1] + 1,
                previous[column] + 1,
                previous[column - 1] + (left_character != right_character),
            ))
        previous = current
    return previous[-1]


def damaged_variants(number: int) -> set[str]:
    # Observed damage is not a single substitution cipher. These variants cover
    # both unchanged digits and the stable expansions visible throughout the file.
    replacements = {
        "0": ("6", "0"),
        "1": ("1",),
        "2": ("26", "2"),
        "3": ("3",),
        "4": ("4", "61", "1"),
        "5": ("5",),
        "6": ("6",),
        "7": ("7",),
        "8": ("8",),
        "9": ("9", "6"),
    }
    variants = [""]
    for digit in str(number):
        variants = [prefix + replacement for prefix in variants for replacement in replacements[digit]]
    return set(variants)


def token_cost(observed: str, expected: int) -> int:
    return min(levenshtein(observed, variant) for variant in damaged_variants(expected))


def descending_months(start: date, end: date) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    year, month = end.year, end.month
    while (year, month) >= (start.year, start.month):
        months.append((year, month))
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return months


def recover_monotonic_states(emissions: list[list[float]], force_last: bool = True) -> list[int]:
    row_count = len(emissions)
    state_count = len(emissions[0])
    infinity = float("inf")
    previous_states: list[list[int | None]] = [[None] * state_count for _ in range(row_count)]
    costs = [infinity] * state_count
    costs[0] = emissions[0][0]
    for row in range(1, row_count):
        next_costs = [infinity] * state_count
        for state in range(state_count):
            for previous in (state, state - 1):
                if previous >= 0:
                    candidate = costs[previous] + emissions[row][state]
                    if candidate < next_costs[state]:
                        next_costs[state] = candidate
                        previous_states[row][state] = previous
        costs = next_costs
    state = state_count - 1 if force_last else min(range(state_count), key=costs.__getitem__)
    recovered = [0] * row_count
    for row in range(row_count - 1, -1, -1):
        recovered[row] = state
        state = previous_states[row][state] if row else 0
        if state is None:
            raise ValueError("日期序列无法按确认区间恢复")
    return recovered


def recover(file_path: Path, start: date, end: date) -> dict:
    if start > end:
        raise ValueError("起始日期不能晚于终止日期")
    rows, _formula_cells = read_rows(file_path)
    header_index = next((index for index, row in enumerate(rows) if row == EXPECTED_HEADERS), -1)
    if header_index < 0:
        raise ValueError("未找到微信支付账单明细表头")
    detail_rows = [(index + 1, row) for index, row in enumerate(rows[header_index + 1:], header_index + 1)
                   if any(value not in (None, "") for value in row)]
    parsed: list[tuple[str, str, str]] = []
    for _row_number, row in detail_rows:
        match = re.fullmatch(r"([^/]+)/([^/]+)/([^ ]+)\s+.*", str(row[0] or ""))
        if not match:
            raise ValueError("存在无法拆分的损坏交易时间")
        parsed.append(match.groups())

    months = descending_months(start, end)
    month_emissions = [[token_cost(month_token, month) for _year, month in months]
                       for _year_token, month_token, _day_token in parsed]
    month_states = recover_monotonic_states(month_emissions)
    recovered_dates: list[date | None] = [None] * len(parsed)
    recovery_costs: list[tuple[int, int]] = [(0, 0)] * len(parsed)

    for month_state, (year, month) in enumerate(months):
        indices = [index for index, state in enumerate(month_states) if state == month_state]
        if not indices:
            raise ValueError(f"确认区间中的 {year}-{month:02d} 没有分配到记录")
        maximum_day = min(calendar.monthrange(year, month)[1], end.day) if (year, month) == (end.year, end.month) else calendar.monthrange(year, month)[1]
        minimum_day = start.day if (year, month) == (start.year, start.month) else 1
        days = list(range(maximum_day, minimum_day - 1, -1))
        day_emissions = [[token_cost(parsed[index][2], day) for day in days] for index in indices]

        row_count = len(indices)
        state_count = len(days)
        infinity = float("inf")
        previous_states: list[list[int | None]] = [[None] * state_count for _ in range(row_count)]
        costs = [infinity] * state_count
        costs[0] = day_emissions[0][0]
        for row in range(1, row_count):
            next_costs = [infinity] * state_count
            for state in range(state_count):
                for previous in range(state + 1):
                    candidate = costs[previous] + day_emissions[row][state] + 0.01 * (state - previous)
                    if candidate < next_costs[state]:
                        next_costs[state] = candidate
                        previous_states[row][state] = previous
            costs = next_costs
        day_state = state_count - 1
        assigned_states = [0] * row_count
        for row in range(row_count - 1, -1, -1):
            assigned_states[row] = day_state
            day_state = previous_states[row][day_state] if row else 0
            if day_state is None:
                raise ValueError("日序恢复失败")

        for local_index, source_index in enumerate(indices):
            recovered_day = days[assigned_states[local_index]]
            recovered_dates[source_index] = date(year, month, recovered_day)
            recovery_costs[source_index] = (
                month_emissions[source_index][month_state],
                day_emissions[local_index][assigned_states[local_index]],
            )

    output_rows = []
    quality_counts: Counter[str] = Counter()
    for index, ((source_row, _row), recovered_date, costs) in enumerate(zip(detail_rows, recovered_dates, recovery_costs)):
        if recovered_date is None:
            raise ValueError("存在未恢复的日期")
        total_cost = sum(costs)
        confidence = "high" if total_cost == 0 else "medium" if total_cost <= 1 else "low"
        quality_counts[confidence] += 1
        output_rows.append({
            "sourceRow": source_row,
            "recoveredDate": recovered_date.isoformat(),
            "confidence": confidence,
        })

    date_values = [row["recoveredDate"] for row in output_rows]
    if date_values[0] != end.isoformat() or date_values[-1] != start.isoformat():
        raise ValueError("恢复结果未覆盖用户确认的完整边界")
    if any(left < right for left, right in zip(date_values, date_values[1:])):
        raise ValueError("恢复结果不是倒序日期")

    return {
        "version": 1,
        "method": "range_constrained_sequence_recovery_v1",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "recordCount": len(output_rows),
        "quality": {
            "high": quality_counts["high"],
            "medium": quality_counts["medium"],
            "low": quality_counts["low"],
        },
        "rows": output_rows,
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("用法: recover_wechat_dates.py <xlsx> <start yyyy-mm-dd> <end yyyy-mm-dd>")
    result = recover(Path(sys.argv[1]).resolve(), date.fromisoformat(sys.argv[2]), date.fromisoformat(sys.argv[3]))
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
