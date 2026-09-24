import { describe, expect, it } from "vitest";
import type { ConnectedFinancialSource, FinancialTransaction } from "./financial-connections";
import { buildRecurringCandidates } from "./recurring-payments";

const NOW = Date.parse("2026-09-22T12:00:00+08:00");
const expense = (id: string, date: string, amount = -1500, title = "听书空间会员"): FinancialTransaction => ({
  id, title, amount, category: "文化娱乐", occurredAt: `${date}T10:00:00+08:00`, kind: "payment",
});
const monthly = (title?: string) => [
  expense("jul", "2026-07-20", -1500, title),
  expense("aug", "2026-08-20", -1500, title),
  expense("sep", "2026-09-20", -1500, title),
];
const source = (
  transactions: FinancialTransaction[],
  overrides: Partial<ConnectedFinancialSource> = {},
): ConnectedFinancialSource => ({
  provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
  scopes: ["transactions"], transactions, autopays: [], syncedAt: "2026-09-22T12:00:00+08:00",
  ...overrides,
});

describe("historical recurring payment detection", () => {
  it("finds three monthly payments and exposes their actual evidence without claiming an agreement exists", () => {
    const [candidate] = buildRecurringCandidates({ wechat_pay: source(monthly()) }, NOW);
    expect(candidate).toEqual(expect.objectContaining({
      provider: "wechat_pay", providerName: "微信支付", title: "听书空间会员", amount: 1500,
      cycle: "月", confidence: "medium", estimatedNextChargeAt: Date.parse("2026-10-20T00:00:00+08:00"),
      evidence: monthly().map(({ id, occurredAt, amount }) => ({ id, occurredAt, amount })),
    }));
    expect(candidate.evidenceSummary).toContain("疑似");
    expect(candidate.evidenceSummary).toContain("尚未确认自动续费");
  });

  it("keeps the candidate key stable as a new bill arrives and source order changes", () => {
    const first = buildRecurringCandidates({ wechat_pay: source(monthly()) }, NOW)[0];
    const updated = buildRecurringCandidates({ wechat_pay: source([
      expense("oct", "2026-10-20"), ...monthly().reverse(),
    ]) }, Date.parse("2026-10-21T12:00:00+08:00"))[0];
    expect(updated.key).toBe(first.key);
    expect(updated.confidence).toBe("high");
    expect(updated.evidence).toHaveLength(4);
  });

  it("normalizes formatting without merging unrelated merchants or providers", () => {
    const rows = monthly("听书空间 VIP");
    rows[1].title = "听书空间ＶＩＰ";
    const result = buildRecurringCandidates({
      wechat_pay: source([...rows, ...monthly("另一家听书").map(row => ({ ...row, id: `other-${row.id}` }))]),
      alipay: source(monthly("听书空间 VIP"), { provider: "alipay", displayName: "支付宝" }),
    }, NOW);
    expect(result).toHaveLength(3);
    expect(new Set(result.map(item => item.key)).size).toBe(3);
    expect(result.find(item => item.provider === "alipay")?.providerName).toBe("支付宝");
  });

  it.each([
    ["季", ["2026-03-20", "2026-06-20", "2026-09-20"], "2026-12-20"],
    ["年", ["2024-09-20", "2025-09-20", "2026-09-20"], "2027-09-20"],
  ])("recognizes calendar-based %s payments", (cycle, dates, expected) => {
    const [candidate] = buildRecurringCandidates({
      wechat_pay: source((dates as string[]).map((date, i) => expense(String(i), date))),
    }, NOW);
    expect(candidate.cycle).toBe(cycle);
    expect(candidate.estimatedNextChargeAt).toBe(Date.parse(`${expected}T00:00:00+08:00`));
  });

  it("uses month-end clamping through February rather than a fixed 30-day interval", () => {
    const [candidate] = buildRecurringCandidates({ wechat_pay: source([
      expense("jan", "2026-01-31"), expense("feb", "2026-02-28"), expense("mar", "2026-03-31"),
    ]) }, Date.parse("2026-04-01T12:00:00+08:00"));
    expect(candidate.estimatedNextChargeAt).toBe(Date.parse("2026-04-30T00:00:00+08:00"));
  });

  it("recognizes leap-year annual renewals and projects the end of February correctly", () => {
    const [candidate] = buildRecurringCandidates({ wechat_pay: source([
      expense("24", "2024-02-29"), expense("25", "2025-02-28"), expense("26", "2026-02-28"),
    ]) }, Date.parse("2026-03-01T12:00:00+08:00"));
    expect(candidate.cycle).toBe("年");
    expect(candidate.estimatedNextChargeAt).toBe(Date.parse("2027-02-28T00:00:00+08:00"));
  });

  it("allows small billing-date and price variation but uses the latest actual amount as the estimate", () => {
    const [candidate] = buildRecurringCandidates({ wechat_pay: source([
      expense("jul", "2026-07-20", -1500), expense("aug", "2026-08-21", -1540),
      expense("sep", "2026-09-19", -1520),
    ]) }, NOW);
    expect(candidate.amount).toBe(1520);
    expect(candidate.confidence).toBe("medium");
    expect(candidate.evidenceSummary).toContain("最近一笔");
  });

  it("does not inspect ungranted transaction or autopay scopes", () => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly(), { scopes: ["balance", "autopay"] }) }, NOW)).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source(monthly(), {
      scopes: ["transactions"],
      autopays: [{ id: "same", title: "听书空间会员", amount: 1500, cycle: "月" }],
    }) }, NOW)).toHaveLength(1);
  });

  it("requires at least three distinct billing periods", () => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly().slice(1)) }, NOW)).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source([
      expense("1", "2026-09-18"), expense("2", "2026-09-19"), expense("3", "2026-09-20"),
    ]) }, NOW)).toEqual([]);
  });

  it("does not cherry-pick a monthly subset from frequent shopping or multiple same-month purchases", () => {
    const rows = [...monthly("便利店"), expense("extra", "2026-08-21", -1500, "便利店")];
    expect(buildRecurringCandidates({ wechat_pay: source(rows) }, NOW)).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source([
      ...monthly(), expense("one-off", "2026-08-23", -3500),
    ]) }, NOW)).toEqual([]);
  });

  it("rejects unstable prices, skipped periods, and irregular calendar dates", () => {
    const examples = [
      [expense("1", "2026-07-20", -1500), expense("2", "2026-08-20", -3500), expense("3", "2026-09-20", -1500)],
      [expense("1", "2026-06-20"), expense("2", "2026-08-20"), expense("3", "2026-09-20")],
      [expense("1", "2026-07-20"), expense("2", "2026-08-02"), expense("3", "2026-09-15")],
    ];
    for (const transactions of examples) expect(buildRecurringCandidates({ wechat_pay: source(transactions) }, NOW)).toEqual([]);
  });

  it("rejects stale patterns instead of moving a projected bill forward forever", () => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly()) }, Date.parse("2026-10-26T12:00:00+08:00"))).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source(monthly()) }, Date.parse("2026-12-01T12:00:00+08:00"))).toEqual([]);
    const result = buildRecurringCandidates({ wechat_pay: source(monthly()) }, Date.parse("2026-10-21T12:00:00+08:00"));
    expect(result[0].estimatedNextChargeAt).toBe(Date.parse("2026-10-20T00:00:00+08:00"));
  });

  it("ignores future rows, invalid dates, non-integer cents, income, refunds, and transfers", () => {
    const invalidRows: FinancialTransaction[] = [
      expense("future", "2026-10-20"),
      { ...expense("bad-date", "2026-09-20"), occurredAt: "not a date" },
      expense("overflow-date", "2026-02-30"),
      expense("fraction", "2026-08-20", -1500.25),
      expense("infinite", "2026-08-20", -Infinity),
      expense("income", "2026-08-20", 1500),
      { ...expense("refund", "2026-08-20"), kind: "refund" },
      { ...expense("transfer", "2026-08-20"), kind: "transfer" },
      { ...expense("positive-income", "2026-08-20"), kind: "income" },
    ];
    const [candidate] = buildRecurringCandidates({ wechat_pay: source([...monthly(), ...invalidRows]) }, NOW);
    expect(candidate.evidence).toHaveLength(3);
    expect(buildRecurringCandidates({ wechat_pay: source([monthly()[0], monthly()[1], ...invalidRows]) }, NOW)).toEqual([]);
  });

  it("excludes legacy transfer and refund categories even when kind is absent", () => {
    for (const title of ["转账给李娜", "信用卡还款", "退款到账"]) {
      expect(buildRecurringCandidates({ wechat_pay: source(monthly(title).map(row => ({ ...row, kind: undefined }))) }, NOW)).toEqual([]);
    }
    expect(buildRecurringCandidates({ wechat_pay: source(monthly().map(row => ({ ...row, category: "转账", kind: undefined }))) }, NOW)).toEqual([]);
  });

  it("deduplicates repeated IDs and linked payment IDs without inventing evidence", () => {
    const rows = monthly().map(row => ({ ...row, linkedId: `order-${row.id}` }));
    const [candidate] = buildRecurringCandidates({ wechat_pay: source([
      ...rows, rows[0], { ...rows[1], id: "reimported-aug" },
    ]) }, NOW);
    expect(candidate.evidence).toHaveLength(3);
    expect(buildRecurringCandidates({ wechat_pay: source([
      ...rows.slice(0, 2), { ...rows[1], id: "reimported-aug" },
    ]) }, NOW)).toEqual([]);
  });

  it("deduplicates linked bills mirrored by both providers", () => {
    const rows = monthly().map(row => ({ ...row, linkedId: `order-${row.id}` }));
    const result = buildRecurringCandidates({
      wechat_pay: source(rows), alipay: source(rows.map(row => ({ ...row, id: `ali-${row.id}` })), { provider: "alipay" }),
    }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("wechat_pay");
  });

  it.each(["payment-id", "order-id"])("excludes a charge refunded by its %s", reference => {
    const rows = monthly().map(row => ({ ...row, linkedId: `order-${row.id}` }));
    const refund: FinancialTransaction = {
      ...expense("returned", "2026-09-21", 1500), kind: "refund",
      linkedId: reference === "payment-id" ? "sep" : "order-sep",
    };
    expect(buildRecurringCandidates({ wechat_pay: source([...rows, refund]) }, NOW)).toEqual([]);
  });

  it("suppresses known active agreements by matching merchant and amount only when authorized", () => {
    const result = buildRecurringCandidates({ wechat_pay: source(monthly("听书空间会员自动续费"), {
      scopes: ["transactions", "autopay"],
      autopays: [{ id: "known", title: "听书空间连续包月", merchant: "听书空间", amount: 1500, cycle: "月" }],
    }) }, NOW);
    expect(result).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source(monthly(), {
      scopes: ["transactions", "autopay"],
      autopays: [{ id: "another-plan", title: "听书空间会员", amount: 5000, cycle: "月" }],
    }) }, NOW)).toHaveLength(1);
  });

  it("does not suppress a different same-price merchant simply because the category matches", () => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly("腾讯视频会员"), {
      scopes: ["transactions", "autopay"],
      autopays: [{ id: "music", title: "腾讯音乐会员", merchant: "腾讯音乐", amount: 1500, cycle: "月" }],
    }) }, NOW)).toHaveLength(1);
  });

  it.each(["subscription", "alipay-subscription"])("does not rediscover cancelled agreements from %s charge history", prefix => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly().map((row, i) => ({
      ...row, linkedId: `${prefix}:cancelled-service:${1780000000000 + i}`,
    })), { scopes: ["transactions", "autopay"], cancelledAutopayIds: ["cancelled-service"] }) }, NOW)).toEqual([]);
  });

  it("suppresses linked active agreements even if their display name has changed", () => {
    expect(buildRecurringCandidates({ wechat_pay: source(monthly().map((row, i) => ({
      ...row, linkedId: `subscription:known-service:${1780000000000 + i}`,
    })), {
      scopes: ["transactions", "autopay"],
      autopays: [{ id: "known-service", title: "全新品牌", amount: 1500, cycle: "月" }],
    }) }, NOW)).toEqual([]);
  });

  it("handles empty sources and invalid current time without throwing", () => {
    expect(buildRecurringCandidates({}, NOW)).toEqual([]);
    expect(buildRecurringCandidates({ wechat_pay: source(monthly()) }, NaN)).toEqual([]);
  });
});
