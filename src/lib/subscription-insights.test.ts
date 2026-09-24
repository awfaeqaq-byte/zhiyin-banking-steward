import { describe, expect, it } from "vitest";
import { buildSubscriptionInsights, duplicateGroupKey } from "./subscription-insights";
import type { ConnectedFinancialSource } from "./financial-connections";

const source = (
  provider: "wechat_pay" | "alipay",
  autopays: ConnectedFinancialSource["autopays"],
): ConnectedFinancialSource => ({
  provider, displayName: provider === "wechat_pay" ? "微信支付" : "支付宝",
  accountMasked: "叶先生", scopes: ["autopay"], transactions: [], autopays,
  syncedAt: "2026-09-17T09:00:00+08:00",
});

describe("subscription renewal insights", () => {
  it("respects the exact retained group without hiding renewals or newly added memberships", () => {
    const now = Date.parse('2026-09-24T10:00:00+08:00');
    const music = [
      { id: 'qq', title: 'QQ音乐', amount: 2500, cycle: '月', nextChargeAt: now + 86400000 },
      { id: 'netease', title: '网易云音乐', amount: 1500, cycle: '月', nextChargeAt: now + 86400000 },
    ];
    const connections = { wechat_pay: source('wechat_pay', music) };
    const initial = buildSubscriptionInsights(connections, now);
    expect(initial.possibleDuplicateCount).toBe(2);
    const key = duplicateGroupKey(initial.items);
    expect(duplicateGroupKey([...initial.items].reverse())).toBe(key);
    const kept = buildSubscriptionInsights(connections, now, { [key]: { decision: 'keep' } });
    expect(kept.possibleDuplicateCount).toBe(0);
    expect(kept.upcomingAmount).toBe(4000);
    expect(kept.upcoming).toHaveLength(2);
    expect(buildSubscriptionInsights(connections, now, { [key]: { decision: 'later', until: now + 1 } }).possibleDuplicateCount).toBe(0);
    expect(buildSubscriptionInsights(connections, now + 2, { [key]: { decision: 'later', until: now + 1 } }).possibleDuplicateCount).toBe(2);
    const changed = { wechat_pay: source('wechat_pay', [...music, { ...music[0], id: 'third' }]) };
    expect(buildSubscriptionInsights(changed, now, { [key]: { decision: 'keep' } }).possibleDuplicateCount).toBe(3);
  });
  it("recognizes upcoming renewals and sorts the closest charge first", () => {
    const now = Date.parse("2026-09-17T09:00:00+08:00");
    const result = buildSubscriptionInsights({
      wechat_pay: source("wechat_pay", [{
        id: "wx-music", title: "黑胶VIP会员包月", merchant: "网易云音乐",
        amount: 1500, cycle: "月", nextChargeAt: now + 3 * 86_400_000,
      }]),
      alipay: source("alipay", [{
        id: "ali-food", title: "超级吃货卡", merchant: "饿了么",
        amount: 1000, cycle: "月", nextChargeAt: now + 15 * 86_400_000,
      }]),
    }, now);

    expect(result.items.map(item => item.id)).toEqual(["wx-music", "ali-food"]);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]).toEqual(expect.objectContaining({ daysUntilCharge: 3, urgency: "urgent" }));
    expect(result.upcomingAmount).toBe(1500);
  });

  it("marks same-category memberships across providers as possible duplicates", () => {
    const now = Date.parse("2026-09-17T09:00:00+08:00");
    const result = buildSubscriptionInsights({
      wechat_pay: source("wechat_pay", [{ id: "wx-music", title: "黑胶VIP会员", amount: 1500, cycle: "月" }]),
      alipay: source("alipay", [{ id: "ali-music", title: "QQ音乐绿钻会员", amount: 2500, cycle: "月" }]),
    }, now);

    expect(result.items.every(item => item.flags.includes("possible_duplicate"))).toBe(true);
    expect(result.possibleDuplicateCount).toBe(2);
  });
});
