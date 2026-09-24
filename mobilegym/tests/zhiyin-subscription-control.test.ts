import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelZhiyinAutopay } from "../apps/Zhiyin/subscription-control";
import {
  configureWechatSubscriptionBackend,
  createMemoryWechatSubscriptionBackend,
} from "../apps/Wechat/subscriptions/backend";
import {
  configureAlipaySubscriptionBackend,
  createMemoryAlipaySubscriptionBackend,
} from "../apps/Alipay/subscriptions/backend";

afterEach(() => {
  configureWechatSubscriptionBackend(null);
  configureAlipaySubscriptionBackend(null);
});

describe("Zhiyin subscription control", () => {
  it("routes an explicit cancellation to the owning payment provider", async () => {
    const cancelWechat = vi.fn(async () => ({
      id: "wx-sub", membershipType: "黑胶VIP", source: "网易云音乐",
      price: 15, billingCycle: "月", autoRenew: false, createdAt: 1,
    }));
    const cancelAlipay = vi.fn();

    await expect(cancelZhiyinAutopay("wechat_pay", "wx-sub", {
      cancelWechat, cancelAlipay,
    })).resolves.toEqual({
      status: "cancelled", provider: "wechat_pay", subscriptionId: "wx-sub",
    });
    expect(cancelWechat).toHaveBeenCalledWith("wx-sub");
    expect(cancelAlipay).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before touching a provider", async () => {
    const cancelWechat = vi.fn();
    const cancelAlipay = vi.fn();
    await expect(cancelZhiyinAutopay("alipay", " ", { cancelWechat, cancelAlipay }))
      .rejects.toThrow("无效的订阅");
    expect(cancelAlipay).not.toHaveBeenCalled();
  });

  it("uses the real provider adapters when no test dependency is supplied", async () => {
    configureWechatSubscriptionBackend(createMemoryWechatSubscriptionBackend([{
      id: "wx-real", membershipType: "会员", source: "微信商户", price: 15,
      billingCycle: "月", autoRenew: true, createdAt: 1,
    }]));
    configureAlipaySubscriptionBackend(createMemoryAlipaySubscriptionBackend([{
      id: "ali-real", membershipType: "会员", source: "支付宝商户", price: 20,
      billingCycle: "月", autoRenew: true, createdAt: 1,
    }]));

    await expect(cancelZhiyinAutopay("wechat_pay", "wx-real"))
      .resolves.toEqual(expect.objectContaining({ status: "cancelled" }));
    await expect(cancelZhiyinAutopay("alipay", "ali-real"))
      .resolves.toEqual(expect.objectContaining({ status: "cancelled" }));
  });

  it("rejects an unsupported provider at runtime", async () => {
    await expect(cancelZhiyinAutopay("card" as "alipay", "sub", {
      cancelWechat: vi.fn(), cancelAlipay: vi.fn(),
    })).rejects.toThrow("不支持的支付平台");
  });
});
