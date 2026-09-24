import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFinancialSource } from "../apps/Zhiyin/finance-access";
import { configureWechatPayBackend, createMemoryWechatPayBackend } from "../apps/Wechat/pay-ledger/backend";
import * as TimeService from "../os/TimeService";

afterEach(() => {
  configureWechatPayBackend(null);
  vi.restoreAllMocks();
});

describe("Zhiyin financial source access", () => {
  const emptyDependencies = {
    nowIso: () => "2026-09-22T09:41:00+08:00",
    readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions: [] }),
    readWechatPay: () => ({ subscriptions: [] }),
    readWechatWallet: () => ({ balanceCents: 0 }),
    readWechatLedger: async () => [],
  };

  it("denies a request that contains no supported data scope", async () => {
    await expect(loadFinancialSource("alipay", []))
      .resolves.toEqual({ status: "denied" });
  });

  it("reads both live payment-provider adapters", async () => {
    const alipay = await loadFinancialSource("alipay", ["balance", "autopay"]);
    const wechat = await loadFinancialSource("wechat_pay", ["balance", "transactions", "autopay"]);
    expect(alipay).toEqual(expect.objectContaining({
      status: "granted", source: expect.objectContaining({ provider: "alipay" }),
    }));
    expect(wechat).toEqual(expect.objectContaining({
      status: "granted", source: expect.objectContaining({ provider: "wechat_pay" }),
    }));
  });

  it("returns only the scopes the user selected", async () => {
    const result = await loadFinancialSource("alipay", ["transactions"], {
      nowIso: () => "2026-09-15T09:41:00+08:00",
      readAlipay: () => ({
        balance: { total: 100.25 },
        transferRecords: [{
          id: "tr-1", displayTitle: "美团", counterpartyName: "美团外卖",
          delta: -18.5, timestamp: 1_789_430_460_000, category: "dining",
          orderId: "order-1",
        }],
        subscriptions: [{ id: "sub-1", membershipType: "会员", price: 18, billingCycle: "月", autoRenew: true }],
      }),
      readWechatPay: () => ({ subscriptions: [] }),
      readWechatWallet: () => ({ balanceCents: 0 }),
      readWechatLedger: async () => [],
    });

    expect(result.status).toBe("granted");
    expect(result.source?.balance).toBeUndefined();
    expect(result.source?.transactions).toEqual([
      expect.objectContaining({ id: "tr-1", amount: -1850, linkedId: "order-1" }),
    ]);
    expect(result.source?.autopays).toEqual([]);
  });

  it("provides a separate WeChat Pay balance and ledger", async () => {
    const result = await loadFinancialSource("wechat_pay", ["balance", "transactions"], {
      nowIso: () => "2026-09-15T09:41:00+08:00",
      readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions: [] }),
      readWechatPay: () => ({ subscriptions: [] }),
      readWechatWallet: () => ({ balanceCents: 12_345 }),
      readWechatLedger: async () => [
        {
          id: 'wx-ledger-1', direction: 'expense', amountCents: 405,
          category: 'shopping', merchant: '美宜佳便利店',
          occurredAt: '2026-09-14T21:39:00+08:00', linkedId: 'wx-order-1',
        },
        {
          id: 'wx-legacy-bad-link', direction: 'expense', amountCents: 850,
          category: 'shopping', merchant: '深圳吉米便利店',
          occurredAt: '2026-09-14T20:00:00+08:00', linkedId: 'order-hema',
        },
      ],
    });

    expect(result.source).toEqual(expect.objectContaining({
      provider: "wechat_pay", displayName: "微信支付", balance: 12_345,
    }));
    expect(result.source?.transactions).toEqual([
      expect.objectContaining({
        id: 'wx-ledger-1', title: '美宜佳便利店', amount: -405,
        category: '购物', occurredAt: '2026-09-14', linkedId: 'wx-order-1',
      }),
      expect.not.objectContaining({ linkedId: 'order-hema' }),
    ]);
  });

  it("exposes provider subscription dates and merchant details for renewal recognition", async () => {
    const nextChargeAt = Date.parse("2026-09-20T09:00:00+08:00");
    const createdAt = Date.parse("2026-02-07T09:00:00+08:00");
    const result = await loadFinancialSource("wechat_pay", ["autopay"], {
      nowIso: () => "2026-09-17T09:41:00+08:00",
      readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions: [] }),
      readWechatPay: () => ({ subscriptions: [{
        id: "sub-music", membershipType: "黑胶VIP会员包月", source: "网易云音乐主站",
        price: 15, billingCycle: "月", autoRenew: true, createdAt, nextChargeAt,
      }] }),
      readWechatWallet: () => ({ balanceCents: 0 }),
      readWechatLedger: async () => [],
    });

    expect(result.source?.autopays).toEqual([{
      id: "sub-music", title: "黑胶VIP会员包月", merchant: "网易云音乐主站",
      amount: 1500, cycle: "月", createdAt, nextChargeAt,
    }]);
  });

  it("ignores inactive subscriptions and preserves the last charge time", async () => {
    const lastChargedAt = Date.parse("2026-09-01T09:00:00+08:00");
    const result = await loadFinancialSource("alipay", ["autopay"], {
      nowIso: () => "2026-09-17T09:41:00+08:00",
      readAlipay: () => ({
        balance: { total: 0 }, transferRecords: [],
        subscriptions: [
          { id: "inactive", membershipType: "已取消", price: 10, billingCycle: "月", autoRenew: false },
          { id: "active", membershipType: "视频会员", price: 20, billingCycle: "月", autoRenew: true, lastChargedAt },
        ],
      }),
      readWechatPay: () => ({ subscriptions: [] }),
      readWechatWallet: () => ({ balanceCents: 0 }),
      readWechatLedger: async () => [],
    });
    expect(result.source?.autopays).toEqual([
      expect.objectContaining({ id: "active", merchant: "合作商户", lastChargedAt }),
    ]);
  });

  it("filters inactive subscriptions before applying the response limit", async () => {
    const inactive = Array.from({ length: 24 }, (_, index) => ({
      id: `inactive-${index}`, membershipType: "已取消", price: 10,
      billingCycle: "月", autoRenew: false,
    }));
    const result = await loadFinancialSource("alipay", ["autopay"], {
      nowIso: () => "2026-09-17T09:41:00+08:00",
      readAlipay: () => ({
        balance: { total: 0 }, transferRecords: [],
        subscriptions: [...inactive, {
          id: "active-after-limit", membershipType: "视频会员", price: 20,
          billingCycle: "月", autoRenew: true,
        }],
      }),
      readWechatPay: () => ({ subscriptions: [] }),
      readWechatWallet: () => ({ balanceCents: 0 }),
      readWechatLedger: async () => [],
    });
    expect(result.source?.autopays).toEqual([
      expect.objectContaining({ id: "active-after-limit" }),
    ]);
  });

  it("returns the newest 1000 valid Alipay records across months with subscription charge linkage", async () => {
    const records = Array.from({ length: 1_002 }, (_, index) => ({
      id: `alipay-history-${index}`, displayTitle: "云盘会员", delta: -12,
      timestamp: Date.parse("2026-06-01T10:00:00+08:00") + index * 3_600_000,
      linkedId: `alipay-subscription:cancelled-cloud:${index}`,
    }));
    const result = await loadFinancialSource("alipay", ["transactions"], {
      ...emptyDependencies,
      readAlipay: () => ({
        balance: { total: 0 }, subscriptions: [],
        transferRecords: [
          { id: "invalid-date", delta: -10, timestamp: Number.NaN },
          { id: "invalid-amount", delta: Number.POSITIVE_INFINITY, timestamp: records[0].timestamp },
          ...records,
        ],
      }),
    });

    expect(result.source?.transactions).toHaveLength(1_000);
    expect(result.source?.transactions[0]).toEqual(expect.objectContaining({
      id: "alipay-history-1001", title: "云盘会员", amount: -1_200,
      linkedId: "alipay-subscription:cancelled-cloud:1001", kind: "payment",
    }));
    expect(result.source?.transactions.at(-1)?.id).toBe("alipay-history-2");
  });

  it("returns the newest 1000 valid WeChat ledger records without losing prior months", async () => {
    const records = Array.from({ length: 1_002 }, (_, index) => ({
      id: `wechat-history-${index}`, direction: "expense" as const, amountCents: 1_500,
      category: "other" as const, merchant: "云盘会员",
      occurredAt: new Date(Date.parse("2026-06-01T10:00:00+08:00") + index * 3_600_000).toISOString(),
      linkedId: `subscription:cancelled-cloud:${index}`,
    }));
    const result = await loadFinancialSource("wechat_pay", ["transactions"], {
      ...emptyDependencies,
      readWechatLedger: async () => [
        { ...records[0], id: "invalid-date", occurredAt: "not-a-date" },
        { ...records[0], id: "invalid-amount", amountCents: Number.NaN },
        ...records,
      ],
    });

    expect(result.source?.transactions).toHaveLength(1_000);
    expect(result.source?.transactions[0]).toEqual(expect.objectContaining({
      id: "wechat-history-1001", title: "云盘会员", amount: -1_500,
      linkedId: "subscription:cancelled-cloud:1001", kind: "payment",
    }));
    expect(result.source?.transactions.at(-1)?.id).toBe("wechat-history-2");
  });

  it("reads older WeChat transactions through the configured backend without altering its data", async () => {
    const transactions = ["2026-06-15", "2026-07-15", "2026-08-15"].map((date) => ({
      id: `cloud-${date}`, direction: "expense" as const, amountCents: 1_200,
      category: "other" as const, merchant: "云盘会员", occurredAt: `${date}T12:00:00+08:00`,
    }));
    const backend = createMemoryWechatPayBackend({
      transactions, monthlyHistory: [], settings: { dailyReport: true, includeManualRecords: true },
    });
    configureWechatPayBackend(backend);

    const result = await loadFinancialSource("wechat_pay", ["transactions"]);

    expect(result.source?.transactions.map(item => item.id)).toEqual([
      "cloud-2026-08-15", "cloud-2026-07-15", "cloud-2026-06-15",
    ]);
    await expect(backend.getTransaction("cloud-2026-06-15")).resolves.toEqual(transactions[0]);
  });

  it.each(["alipay", "wechat_pay"] as const)("exposes cancelled %s agreement IDs only with autopay permission", async (provider) => {
    const subscriptions = [
      { id: "cancelled-cloud", autoRenew: false },
      { id: "active-music", autoRenew: true },
      { id: "unspecified-state" },
    ];
    const dependencies = {
      ...emptyDependencies,
      readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions }),
      readWechatPay: () => ({ subscriptions }),
    };

    const allowed = await loadFinancialSource(provider, ["transactions", "autopay"], dependencies);
    const restricted = await loadFinancialSource(provider, ["transactions"], dependencies);

    expect(allowed.source).toEqual(expect.objectContaining({ cancelledAutopayIds: ["cancelled-cloud"] }));
    expect(restricted.source).not.toHaveProperty("cancelledAutopayIds");
  });

  it("supports monthly-only WeChat adapters using the latest thirteen months", async () => {
    vi.spyOn(TimeService, "getDate").mockReturnValue(new Date("2026-09-22T09:41:00+08:00"));
    const backend = createMemoryWechatPayBackend({
      transactions: [{
        id: "year-old-charge", direction: "expense", amountCents: 12_000,
        category: "other", merchant: "云盘年费", occurredAt: "2025-09-22T09:00:00+08:00",
      }],
      monthlyHistory: [], settings: { dailyReport: true, includeManualRecords: true },
    });
    const getLedger = vi.fn(backend.getLedger);
    configureWechatPayBackend({ ...backend, getTransactionHistory: undefined, getLedger });

    const result = await loadFinancialSource("wechat_pay", ["transactions"]);

    expect(getLedger).toHaveBeenCalledTimes(13);
    expect(getLedger).toHaveBeenCalledWith({ month: "2025-09" });
    expect(result.source?.transactions).toEqual([expect.objectContaining({ id: "year-old-charge" })]);
  });

  it("does not access WeChat transaction history without transaction permission", async () => {
    const readWechatLedger = vi.fn(async () => []);
    await loadFinancialSource("wechat_pay", ["autopay"], { ...emptyDependencies, readWechatLedger });
    expect(readWechatLedger).not.toHaveBeenCalled();
  });

  it.each(["alipay", "wechat_pay"] as const)("preserves up to 1000 valid %s contracts and reports incomplete data above that limit", async provider => {
    const subscriptions = Array.from({ length: 1_001 }, (_, index) => ({
      id: `service-${index}`, autoRenew: true, membershipType: `服务${index}`, source: "商户",
      price: 18, billingCycle: "月", nextChargeAt: Date.parse("2026-09-25"),
    }));
    const dependencies = {
      ...emptyDependencies,
      readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions }),
      readWechatPay: () => ({ subscriptions }),
    };
    const capped = await loadFinancialSource(provider, ["autopay"], dependencies);
    expect(capped.source?.autopays).toHaveLength(1_000);
    expect(capped.source).toHaveProperty("autopaysIncomplete", true);

    subscriptions.pop();
    const complete = await loadFinancialSource(provider, ["autopay"], dependencies);
    expect(complete.source?.autopays).toHaveLength(1_000);
    expect(complete.source?.autopays.at(-1)?.id).toBe("service-999");
    expect(complete.source).toHaveProperty("autopaysIncomplete", false);

    const unauthorized = await loadFinancialSource(provider, ["balance"], dependencies);
    expect(unauthorized.source?.autopays).toEqual([]);
    expect(unauthorized.source).not.toHaveProperty("autopaysIncomplete");
  });

  it.each(["alipay", "wechat_pay"] as const)("marks %s contracts incomplete when invalid charges are omitted instead of converting them to zero", async provider => {
    const valid = { id: "valid", autoRenew: true, membershipType: "会员", price: 18, billingCycle: "月" };
    const subscriptions = [
      ...[undefined, Number.NaN, Number.POSITIVE_INFINITY, -18, 18.001, Number.MAX_SAFE_INTEGER].map((price, index) => ({
        ...valid, id: `invalid-${index}`, price,
      })),
      { ...valid, id: "" },
      { ...valid, id: "cancelled", price: Number.NaN, autoRenew: false },
      valid,
    ];
    const result = await loadFinancialSource(provider, ["autopay"], {
      ...emptyDependencies,
      readAlipay: () => ({ balance: { total: 0 }, transferRecords: [], subscriptions }),
      readWechatPay: () => ({ subscriptions }),
    });
    expect(result.source?.autopays).toEqual([expect.objectContaining({ id: "valid", amount: 1_800 })]);
    expect(result.source).toHaveProperty("autopaysIncomplete", true);
  });

  it.each(["alipay", "wechat_pay"] as const)("keeps invalid %s balances unknown instead of manufacturing an available zero balance", async provider => {
    for (const balance of [
      undefined as unknown as number, Number.NaN, Number.POSITIVE_INFINITY, -1,
      Number.MAX_SAFE_INTEGER + 1, provider === "alipay" ? 18.001 : 18.1,
    ]) {
      const result = await loadFinancialSource(provider, ["balance"], {
        ...emptyDependencies,
        readAlipay: () => ({ balance: { total: balance }, transferRecords: [], subscriptions: [] }),
        readWechatWallet: () => ({ balanceCents: balance }),
      });
      expect(result.source).not.toHaveProperty("balance");
    }
    const zero = await loadFinancialSource(provider, ["balance"], emptyDependencies);
    expect(zero.source).toHaveProperty("balance", 0);
  });
});
