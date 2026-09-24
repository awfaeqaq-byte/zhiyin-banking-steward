import { describe, expect, it } from "vitest";
import {
  aggregateFinancialSources,
  type FinancialSourceSnapshot,
} from "./financial-connections";

const source = (
  provider: FinancialSourceSnapshot["provider"],
  balance: number,
  transactions: FinancialSourceSnapshot["transactions"],
): FinancialSourceSnapshot => ({
  provider,
  displayName: provider === "alipay" ? "支付宝" : provider === "wechat_pay" ? "微信支付" : "银行卡",
  accountMasked: provider === "bank" ? "尾号 8888" : "叶先生",
  balance,
  transactions,
  autopays: [],
  syncedAt: "2026-09-15T09:41:00+08:00",
});

describe("financial source aggregation", () => {
  it("merges balances and counts a linked payment only once", () => {
    const result = aggregateFinancialSources([
      source("bank", 4_230_000, [
        { id: "bank-1", title: "盒马鲜生", amount: -13_200, category: "购物", occurredAt: "2026-09-10", linkedId: "order-hema" },
      ]),
      source("wechat_pay", 32_860, [
        { id: "wx-1", title: "盒马鲜生", amount: -13_200, category: "购物", occurredAt: "2026-09-10", linkedId: "order-hema" },
        { id: "wx-2", title: "瑞幸咖啡", amount: -2_400, category: "餐饮", occurredAt: "2026-09-11" },
      ]),
    ]);

    expect(result.totalBalance).toBe(4_262_860);
    expect(result.spending).toBe(15_600);
    expect(result.duplicateCount).toBe(1);
    expect(result.transactions).toHaveLength(2);
  });

  it("does not treat refunds, income or account transfers as spending", () => {
    const result = aggregateFinancialSources([
      source("alipay", 100_000, [
        { id: "pay", title: "便利店", amount: -3_000, category: "购物", occurredAt: "2026-09-12" },
        { id: "refund", title: "退款", amount: 1_000, category: "退款", occurredAt: "2026-09-12", kind: "refund" },
        { id: "transfer", title: "余额互转", amount: -5_000, category: "转账", occurredAt: "2026-09-12", kind: "transfer" },
      ]),
    ]);

    expect(result.spending).toBe(3_000);
    expect(result.excludedCount).toBe(2);
  });
});
