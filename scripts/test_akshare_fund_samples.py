import unittest
from datetime import date
from unittest.mock import patch

import akshare_fund_samples as samples


class IssuerSampleTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 10, 9)

    def test_money_fund_keeps_daily_income_and_annualized_separate(self):
        text = "易方达货币A 110006 0.2437 万份收益 (元) 1.002% 七日年化收益率 基金净值日期：2026-10-08"
        with patch.object(samples, "page_text", return_value=text):
            record = samples.issuer_record("110006", self.today)
        self.assertEqual((record["metric"], record["value"], record["sevenDayAnnualizedPct"]),
                         ("per_10k_income", 0.2437, 1.002))

    def test_bond_and_etf_parse_distinct_issuer_layouts(self):
        pages = {
            samples.SOURCES["026197"]: "易方达悦恒稳健债券A 026197 0.9852 单位净值(元) -0.36% 日涨跌 0.9852 累计净值(元) 基金净值日期：2026-10-08",
            samples.SOURCES["510330"]: "华夏沪深300ETF （基金代码：510330） 4.5699 净值 （2026-10-08） -1.10% 日涨跌幅",
        }
        with patch.object(samples, "page_text", side_effect=lambda url: pages[url]):
            bond = samples.issuer_record("026197", self.today)
            etf = samples.issuer_record("510330", self.today)
        self.assertEqual((bond["value"], etf["value"]), (0.9852, 4.5699))
        self.assertEqual((bond["metric"], etf["metric"]), ("unit_nav", "unit_nav"))

    def test_conflicting_third_party_nav_hides_value(self):
        record = {"code": "510330", "metric": "unit_nav", "status": "ready", "date": "2026-10-08", "value": 4.5699}
        with patch.object(samples, "secondary_nav", return_value=("2026-10-08", 4.6)):
            result = samples.cross_check(record)
        self.assertEqual(result["status"], "conflict")
        self.assertNotIn("value", result)

    def test_changed_issuer_layout_fails_closed(self):
        with patch.object(samples, "page_text", return_value="易方达货币A 110006 页面结构已变化"):
            result = samples.issuer_record("110006", self.today)
        self.assertEqual(result["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
