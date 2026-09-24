export type FinancialProvider = "bank" | "wechat_pay" | "alipay";
export type ExternalFinancialProvider = Exclude<FinancialProvider, "bank">;
export type FinancialScope = "balance" | "transactions" | "autopay";

export type FinancialTransaction = {
  id: string;
  title: string;
  amount: number;
  category: string;
  occurredAt: string;
  kind?: "payment" | "refund" | "income" | "transfer";
  linkedId?: string;
};

export type FinancialAutopay = {
  id: string;
  title: string;
  merchant?: string;
  amount: number;
  cycle: string;
  createdAt?: number;
  nextChargeAt?: number;
  lastChargedAt?: number;
};

export type FinancialSourceSnapshot = {
  provider: FinancialProvider;
  displayName: string;
  accountMasked: string;
  balance?: number;
  transactions: FinancialTransaction[];
  autopays: FinancialAutopay[];
  /** Some active agreements were omitted because they were invalid or exceeded the response limit. */
  autopaysIncomplete?: boolean;
  cancelledAutopayIds?: string[];
  syncedAt: string;
};

export type ConnectedFinancialSource = FinancialSourceSnapshot & {
  scopes: FinancialScope[];
};

export type FinancialSummary = {
  totalBalance: number;
  spending: number;
  duplicateCount: number;
  excludedCount: number;
  transactions: FinancialTransaction[];
  categories: Array<{ name: string; amount: number }>;
};

export function aggregateFinancialSources(sources: FinancialSourceSnapshot[]): FinancialSummary {
  const seen = new Set<string>();
  const transactions: FinancialTransaction[] = [];
  let duplicateCount = 0;
  let excludedCount = 0;

  for (const source of sources) {
    for (const transaction of source.transactions) {
      const key = transaction.linkedId ? `linked:${transaction.linkedId}` : `${source.provider}:${transaction.id}`;
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      if (transaction.amount >= 0 || ["refund", "income", "transfer"].includes(transaction.kind || "")) {
        excludedCount += 1;
        continue;
      }
      transactions.push(transaction);
    }
  }

  const categoryTotals = new Map<string, number>();
  for (const transaction of transactions) {
    categoryTotals.set(
      transaction.category,
      (categoryTotals.get(transaction.category) || 0) + Math.abs(transaction.amount),
    );
  }

  return {
    totalBalance: sources.reduce((total, source) => total + (source.balance || 0), 0),
    spending: transactions.reduce((total, transaction) => total + Math.abs(transaction.amount), 0),
    duplicateCount,
    excludedCount,
    transactions,
    categories: [...categoryTotals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export function createDemoBankSource(): FinancialSourceSnapshot {
  return {
    provider: "bank",
    displayName: "知银账户",
    accountMasked: "常用卡 · 8888",
    balance: 4_230_000,
    syncedAt: "2026-09-15T09:41:00+08:00",
    autopays: [{ id: "credit-card", title: "信用卡还款", amount: 1_200_000, cycle: "9月18日" }],
    transactions: [
      { id: "bank-starbucks", title: "星巴克", amount: -3_600, category: "餐饮", occurredAt: "2026-09-12" },
      { id: "bank-didi", title: "滴滴出行", amount: -4_800, category: "出行", occurredAt: "2026-09-11", linkedId: "order-didi" },
      { id: "bank-hema", title: "盒马鲜生", amount: -13_200, category: "购物", occurredAt: "2026-09-10", linkedId: "order-hema" },
      { id: "bank-jd", title: "京东", amount: -29_900, category: "购物", occurredAt: "2026-09-09" },
    ],
  };
}

export function formatCny(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
