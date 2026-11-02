import { describe, expect, it } from "vitest";
import type { ConnectedFinancialSource, FinancialAutopay } from "../../src/lib/financial-connections";
import { buildFundingForecast, fundingReferenceTime, type FundingHorizonDays } from "../../src/lib/funding-forecast";

const NOW = Date.parse("2026-09-22T12:00:00+08:00");
const at = (date: string) => Date.parse(`${date}T00:00:00+08:00`);
const bill = (id: string, amount: number, date = "2026-09-25"): FinancialAutopay => ({
  id, title: `${id}会员`, amount, cycle: "月", nextChargeAt: at(date),
});
const source = (autopays: FinancialAutopay[] = [], overrides: Partial<ConnectedFinancialSource> = {}): ConnectedFinancialSource => ({
  provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
  balance: 10_000, scopes: ["balance", "autopay"], autopays, transactions: [],
  syncedAt: new Date(NOW).toISOString(), ...overrides,
});

describe("authorized platform funding forecast", () => {
  it("uses the freshest authorized sandbox reference time without reading unrelated scopes", () => {
    expect(fundingReferenceTime({
      wechat_pay: source([], { syncedAt: "2027-01-01T12:00:00+08:00" }),
      alipay: source([], { provider: "alipay", scopes: ["transactions"], syncedAt: "2028-01-01T12:00:00+08:00" }),
    }, NOW)).toBe(Date.parse("2027-01-01T12:00:00+08:00"));
    expect(fundingReferenceTime({
      wechat_pay: source([], { scopes: ["balance"], syncedAt: "2027-01-01T12:00:00+08:00" }),
      alipay: source([], { provider: "alipay", scopes: ["autopay"], syncedAt: "2027-01-02T12:00:00+08:00" }),
    }, NOW)).toBe(Date.parse("2027-01-02T12:00:00+08:00"));
  });

  it("falls back when no valid authorized snapshot time is available", () => {
    expect(fundingReferenceTime({}, NOW)).toBe(NOW);
    expect(fundingReferenceTime({ wechat_pay: source([], { syncedAt: "invalid" }) }, NOW)).toBe(NOW);
  });

  it("subtracts signed upcoming charges chronologically using integer cents", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([
      bill("video", 1800, "2026-09-26"), bill("music", 1500, "2026-09-23"),
    ]) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({
      provider: "wechat_pay", providerName: "微信支付", balance: 10000,
      upcomingTotal: 3300, shortfall: 0, firstShortfallAt: null, status: "covered", warnings: [],
    });
    expect(forecast.accounts[0].charges).toEqual([
      { id: "music", title: "music会员", amount: 1500, chargeAt: at("2026-09-23"), projectedBalance: 8500 },
      { id: "video", title: "video会员", amount: 1800, chargeAt: at("2026-09-26"), projectedBalance: 6700 },
    ]);
    expect(forecast).toMatchObject({ knownBalanceTotal: 10000, upcomingTotal: 3300, shortfallTotal: 0, coverageIncomplete: false });
  });

  it("never offsets a platform shortfall using another platform's surplus", () => {
    const forecast = buildFundingForecast({
      wechat_pay: source([bill("music", 1500), bill("video", 2000, "2026-09-27")], { balance: 1000 }),
      alipay: source([bill("cloud", 1000)], { provider: "alipay", displayName: "支付宝", balance: 100000 }),
    }, NOW);
    expect(forecast.accounts[0]).toMatchObject({ status: "shortfall", shortfall: 2500, firstShortfallAt: at("2026-09-25") });
    expect(forecast.accounts[1]).toMatchObject({ status: "covered", shortfall: 0 });
    expect(forecast).toMatchObject({ knownBalanceTotal: 101000, upcomingTotal: 4500, shortfallTotal: 2500 });
  });

  it("treats an exactly sufficient balance, including zero with no charges, as covered", () => {
    expect(buildFundingForecast({ wechat_pay: source([bill("music", 1500)], { balance: 1500 }) }, NOW).accounts[0])
      .toMatchObject({ status: "covered", shortfall: 0, charges: [{ projectedBalance: 0 }] });
    expect(buildFundingForecast({ wechat_pay: source([], { balance: 0 }) }, NOW).accounts[0].status).toBe("covered");
  });

  it("only includes connected sources and marks an empty forecast incomplete", () => {
    expect(buildFundingForecast({}, NOW)).toMatchObject({
      accounts: [], knownBalanceTotal: 0, upcomingTotal: 0, shortfallTotal: 0, coverageIncomplete: true,
    });
  });

  it("rejects a provider mismatch so demo bank data cannot masquerade as platform funds", () => {
    expect(buildFundingForecast({ wechat_pay: source([], { provider: "bank" }) }, NOW).accounts).toEqual([]);
    expect(fundingReferenceTime({ wechat_pay: source([], { provider: "bank", syncedAt: "2028-01-01T12:00:00+08:00" }) }, NOW)).toBe(NOW);
  });

  it("does not infer authority from populated but ungranted fields", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("hidden", 99999)], { scopes: ["transactions"] }) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({ balance: null, charges: [], upcomingTotal: 0, shortfall: null, status: "unknown" });
    expect(forecast.accounts[0].warnings.join(" ")).toMatch(/余额.*授权/);
    expect(forecast.accounts[0].warnings.join(" ")).toMatch(/自动续费.*授权/);
    expect(forecast.knownBalanceTotal).toBe(0);
    expect(forecast.coverageIncomplete).toBe(true);
  });

  it("preserves visible obligations when only balance authorization is missing", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("music", 1800)], { scopes: ["autopay"] }) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({
      balance: null, upcomingTotal: 1800, shortfall: null, firstShortfallAt: null,
      status: "unknown", charges: [{ projectedBalance: null }],
    });
  });

  it("cannot claim covered from a known balance when autopay access is missing", () => {
    expect(buildFundingForecast({ wechat_pay: source([bill("hidden", 999999)], { scopes: ["balance"] }) }, NOW).accounts[0])
      .toMatchObject({ balance: 10000, charges: [], status: "unknown", shortfall: null });
  });

  it.each([undefined, NaN, Infinity, -1, 100.5, Number.MAX_SAFE_INTEGER + 1])("marks invalid balance %s unknown", balance => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("music", 1500)], { balance }) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({ balance: null, status: "unknown", shortfall: null });
    expect(forecast.coverageIncomplete).toBe(true);
  });

  it("covers today's whole Shanghai calendar date and the full seventh day", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([
      bill("today", 100, "2026-09-22"),
      { ...bill("last", 100), nextChargeAt: Date.parse("2026-09-29T23:59:59.999+08:00") },
      bill("outside", 100, "2026-09-30"),
    ]) }, NOW);
    expect(forecast).toMatchObject({ horizonDays: 7, from: at("2026-09-22"), to: at("2026-09-30") - 1 });
    expect(forecast.accounts[0].charges.map(item => item.id)).toEqual(["today", "last"]);
  });

  it.each([7, 14, 30] as const)("supports the %s-day horizon without expanding future recurrences", horizonDays => {
    const forecast = buildFundingForecast({ wechat_pay: source([
      { ...bill("daily", 100, "2026-09-22"), cycle: "日" },
      bill("later", 500, "2026-10-06"), bill("latest", 500, "2026-10-22"),
    ]) }, NOW, horizonDays);
    expect(forecast.horizonDays).toBe(horizonDays);
    expect(forecast.accounts[0].charges).toHaveLength(horizonDays === 7 ? 1 : horizonDays === 14 ? 2 : 3);
    expect(forecast.accounts[0].charges.filter(item => item.id === "daily")).toHaveLength(1);
  });

  it("uses Shanghai dates even when the UTC date has not advanced yet", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("today", 100, "2027-01-01")]) }, Date.parse("2026-12-31T16:01:00Z"));
    expect(forecast.from).toBe(at("2027-01-01"));
    expect(forecast.to).toBe(at("2027-01-09") - 1);
  });

  it("counts past-due known obligations once and flags their unresolved payment status", () => {
    const account = buildFundingForecast({ wechat_pay: source([
      bill("past", 2000, "2026-09-21"), bill("upcoming", 1500),
    ]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "unknown", upcomingTotal: 3500, shortfall: null, charges: [
      { id: "past", projectedBalance: null }, { id: "upcoming", projectedBalance: null },
    ] });
    expect(account.warnings.join(" ")).toContain("已到期，扣款状态待核实");
  });

  it("preserves a past-due deficit so failed charges cannot disappear from the forecast", () => {
    const account = buildFundingForecast({ wechat_pay: source([bill("failed", 15000, "2026-09-20")]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "shortfall", shortfall: 5000, firstShortfallAt: at("2026-09-20"), upcomingTotal: 15000 });
  });

  it("does not claim covered when an authorized source reports a partial autopay inventory", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("music", 1500)], { autopaysIncomplete: true }) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({ status: "unknown", upcomingTotal: 1500, shortfall: null, charges: [{ projectedBalance: null }] });
    expect(forecast.coverageIncomplete).toBe(true);
    expect(forecast.accounts[0].warnings.join(" ")).toContain("不完整");
  });

  it.each([undefined, NaN, Infinity, 1.5, 9e15])("flags missing or invalid date %s rather than assuming zero obligations", nextChargeAt => {
    const account = buildFundingForecast({ wechat_pay: source([{ ...bill("unknown", 1000), nextChargeAt }]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "unknown", charges: [], shortfall: null });
    expect(account.warnings.join(" ")).toContain("日期");
  });

  it.each([0, -100, NaN, Infinity, 100.5, Number.MAX_SAFE_INTEGER + 1])("does not invent a charge amount from %s", amount => {
    const account = buildFundingForecast({ wechat_pay: source([bill("unknown", amount)]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "unknown", charges: [], upcomingTotal: 0, shortfall: null });
    expect(account.warnings.join(" ")).toContain("金额");
  });

  it("ignores known dates outside the horizon without requiring their price", () => {
    const account = buildFundingForecast({ wechat_pay: source([bill("later", NaN, "2026-12-01")]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "covered", charges: [], warnings: [], shortfall: 0 });
  });

  it("deduplicates identical IDs within each platform but not across providers", () => {
    const record = bill("same", 1000);
    const forecast = buildFundingForecast({
      wechat_pay: source([record, { ...record }]),
      alipay: source([record], { provider: "alipay", displayName: "支付宝" }),
    }, NOW);
    expect(forecast.upcomingTotal).toBe(2000);
    expect(forecast.accounts.map(item => item.charges.length)).toEqual([1, 1]);
    expect(forecast.coverageIncomplete).toBe(false);
  });

  it("rejects conflicting duplicate contracts rather than choosing an arbitrary price", () => {
    const account = buildFundingForecast({ wechat_pay: source([bill("same", 1000), bill("same", 2000)]) }, NOW).accounts[0];
    expect(account).toMatchObject({ status: "unknown", charges: [], shortfall: null });
    expect(account.warnings.join(" ")).toContain("冲突");
  });

  it("retains a known lower-bound deficit even if other obligations are uncertain", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([
      bill("known", 15000), { ...bill("unknown", 1000), nextChargeAt: undefined },
    ]) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({
      status: "shortfall", shortfall: 5000, firstShortfallAt: at("2026-09-25"),
      charges: [{ projectedBalance: null }],
    });
    expect(forecast).toMatchObject({ shortfallTotal: 5000, coverageIncomplete: true });
  });

  it("excludes already cancelled contracts and does not include transaction-inferred candidates", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([bill("cancelled", 999999)], {
      cancelledAutopayIds: ["cancelled"],
      transactions: ["2026-07-22", "2026-08-22", "2026-09-22"].map(date => ({ id: date, title: "云盘会员", category: "订阅", amount: -1500, occurredAt: date })),
    }) }, NOW);
    expect(forecast.accounts[0]).toMatchObject({ charges: [], upcomingTotal: 0, status: "covered" });
  });

  it("rejects malformed IDs and uses a readable fallback for missing titles", () => {
    const forecast = buildFundingForecast({ wechat_pay: source([
      bill("", 1000), { ...bill("valid", 1000), title: " " },
    ]) }, NOW);
    expect(forecast.accounts[0].status).toBe("unknown");
    expect(forecast.accounts[0].charges[0].title).toBe("未命名自动续费");
  });

  it("does not mutate connected snapshots", () => {
    const connected = source([bill("later", 1000, "2026-09-27"), bill("earlier", 1500)]);
    const before = JSON.stringify(connected);
    buildFundingForecast({ wechat_pay: connected }, NOW);
    expect(JSON.stringify(connected)).toBe(before);
  });

  it("rejects invalid forecast input instead of silently returning a reassuring result", () => {
    expect(() => buildFundingForecast({}, NaN)).toThrow(RangeError);
    expect(() => buildFundingForecast({}, NOW, 8 as FundingHorizonDays)).toThrow(RangeError);
  });
});
