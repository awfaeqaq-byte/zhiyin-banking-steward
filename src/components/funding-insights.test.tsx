import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FundingInsights } from "./funding-insights";
import type { ConnectedFinancialSource } from "../lib/financial-connections";

const source: ConnectedFinancialSource = {
  provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生", scopes: ["transactions"],
  syncedAt: "2026-10-10T10:00:00+08:00", autopays: [],
  transactionCoverage: { complete: false, returned: 2, total: 20, invalid: 0 },
  transactions: [
    { id: "income", title: "工资", amount: 1000000, category: "收入", kind: "payment", occurredAt: "2026-10-01" },
    { id: "food", title: "餐饮", amount: -100000, category: "餐饮", kind: "payment", occurredAt: "2026-10-05" },
  ],
};
const props = { stewardName: "阿衡", onAsk: vi.fn(), onOpenAutomations: vi.fn() };

it("部分账单只展示真实小计，不外推月底结余或比较不等长月份", () => {
  render(<FundingInsights {...props} connections={{ wechat_pay: source }} />);
  expect(screen.getByRole("region", { name: "资金观察" })).toHaveTextContent("返回2/20笔");
  expect(screen.getByText("¥10,000")).toBeInTheDocument();
  expect(screen.getByText("¥1,000")).toBeInTheDocument();
  expect(screen.getByText(/不是可支配余额/)).toBeInTheDocument();
  expect(screen.queryByText(/本月预计可结余|支出较上月增加|本月主要支出/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /储蓄安排/ }));
  expect(props.onAsk).toHaveBeenCalledWith(expect.stringContaining("核对稳定收入、固定支出和需要预留的钱"));
});

it("未连接和空返回不会显示零元结余或假预算", () => {
  const view = render(<FundingInsights {...props} connections={{}} />);
  expect(screen.getByText("尚未连接账单")).toBeInTheDocument();
  expect(screen.queryByRole("definition")).not.toBeInTheDocument();
  view.rerender(<FundingInsights {...props} connections={{ wechat_pay: { ...source, transactions: [] } }} />);
  expect(screen.getByText(/当前范围尚无可汇总的账单记录/)).toBeInTheDocument();
  expect(screen.queryByText("¥0")).not.toBeInTheDocument();
});
