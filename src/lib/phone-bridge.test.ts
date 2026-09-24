import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectPhoneBridge, registerPhoneBack, dispatchPhoneBack, requestPhoneContacts,
  requestFinancialSource,
  refreshFinancialSource,
  cancelFinancialAutopay,
  revokeFinancialSource,
  requestAuthorizedFinancialSource,
} from "./phone-bridge";

afterEach(() => vi.useRealTimers());

describe("phone navigation bridge", () => {
  async function receiveAutopays(autopays: unknown[], autopaysIncomplete?: unknown, balance?: unknown) {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    try {
      const pending = requestFinancialSource("alipay", ["balance", "autopay"]);
      const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin, source: peer,
        data: { channel: "zhiyin-phone", version: 1, type: "finance-source-result", requestId: request.requestId, status: "granted",
          source: { provider: "alipay", displayName: "支付宝", accountMasked: "叶先生", syncedAt: "2026-09-22",
            transactions: [], autopays, ...(autopaysIncomplete === undefined ? {} : { autopaysIncomplete }),
            ...(balance === undefined ? {} : { balance }),
          },
        },
      }));
      return await pending;
    } finally {
      disconnect();
    }
  }

  it("keeps 1000 valid renewal contracts instead of silently dropping everything after 50", async () => {
    const autopays = Array.from({ length: 1_000 }, (_, index) => ({
      id: `service-${index}`, title: `服务${index}`, amount: 1_800, cycle: "月",
    }));
    const result = await receiveAutopays(autopays, false);
    expect(result.source?.autopays).toHaveLength(1_000);
    expect(result.source?.autopays.at(-1)?.id).toBe("service-999");
    expect(result.source).toHaveProperty("autopaysIncomplete", false);

    const capped = await receiveAutopays([...autopays, { ...autopays[0], id: "service-overflow" }], false);
    expect(capped.source?.autopays).toHaveLength(1_000);
    expect(capped.source).toHaveProperty("autopaysIncomplete", true);
  });

  it("marks malformed renewal data incomplete and preserves valid contracts after malformed entries", async () => {
    const valid = { id: "valid", title: "会员", amount: 1_800, cycle: "月" };
    const result = await receiveAutopays([
      null, { ...valid, amount: -1 }, { ...valid, amount: Number.NaN },
      { ...valid, amount: 1.1 }, { ...valid, id: "" }, { ...valid, title: "" }, valid,
    ], false);
    expect(result.source?.autopays).toEqual([valid]);
    expect(result.source).toHaveProperty("autopaysIncomplete", true);
  });

  it("accepts only boolean upstream completeness metadata and never clears a reported omission", async () => {
    const valid = [{ id: "valid", title: "会员", amount: 1_800, cycle: "月" }];
    expect((await receiveAutopays(valid, true)).source).toHaveProperty("autopaysIncomplete", true);
    expect((await receiveAutopays(valid, false)).source).toHaveProperty("autopaysIncomplete", false);
    expect((await receiveAutopays(valid, "true")).source).not.toHaveProperty("autopaysIncomplete");
  });

  it("keeps malformed or negative balances unknown while preserving a genuine zero", async () => {
    for (const balance of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await receiveAutopays([], false, balance)).source).not.toHaveProperty("balance");
    }
    expect((await receiveAutopays([], false, 0)).source).toHaveProperty("balance", 0);
  });

  it("preserves cross-month history and sanitizes cancelled subscription IDs", async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = requestFinancialSource("alipay", ["transactions", "autopay"]);
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: { channel: "zhiyin-phone", version: 1, type: "finance-source-result", requestId: request.requestId, status: "granted",
        source: { provider: "alipay", displayName: "支付宝", accountMasked: "叶先生", syncedAt: "2026-09-22", autopays: [],
          cancelledAutopayIds: ["cancelled-1", null, 42, ""],
          transactions: Array.from({ length: 150 }, (_, index) => ({ id: `bill-${index}`, title: "账单", amount: -1800,
            category: "服务", occurredAt: index > 100 ? "2026-07-15" : "2026-09-15" })),
        },
      },
    }));
    const result = await pending;
    expect(result.source?.transactions).toHaveLength(150);
    expect(result.source?.transactions.at(-1)?.occurredAt).toBe("2026-07-15");
    expect(result.source?.cancelledAutopayIds).toEqual(["cancelled-1"]);
    disconnect();
  });
  it("only a trusted phone foreground event triggers a subscription refresh signal", () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const refresh = vi.fn();
    window.addEventListener("zhiyin-phone-foreground", refresh);
    const data = { channel: "zhiyin-phone", version: 1, type: "foreground" };
    window.dispatchEvent(new MessageEvent("message", { data, source: peer, origin: "https://wrong.example" }));
    expect(refresh).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent("message", { data, source: peer, origin: window.location.origin }));
    expect(refresh).toHaveBeenCalledOnce();
    window.removeEventListener("zhiyin-phone-foreground", refresh);
    disconnect();
  });
  it("closes the topmost handler before navigating and removes unmounted handlers", () => {
    const page = vi.fn(() => true);
    const modal = vi.fn(() => true);
    const removePage = registerPhoneBack(page, 0);
    const removeModal = registerPhoneBack(modal, 100);
    expect(dispatchPhoneBack()).toBe(true);
    expect(modal).toHaveBeenCalledOnce();
    expect(page).not.toHaveBeenCalled();
    removeModal();
    expect(dispatchPhoneBack()).toBe(true);
    expect(page).toHaveBeenCalledOnce();
    removePage();
    expect(dispatchPhoneBack()).toBe(false);
  });

  it("falls through handlers that do not consume back", () => {
    const remove = registerPhoneBack(() => false, 10);
    expect(dispatchPhoneBack()).toBe(false);
    remove();
  });

  it("replies only to its same-origin parent and only accepts navigation messages", () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const message = (data: unknown, origin = window.location.origin, source = peer) =>
      window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
    expect(peer.postMessage).toHaveBeenCalledWith(
      { channel: "zhiyin-phone", version: 1, type: "ready" }, window.location.origin,
    );
    vi.mocked(peer.postMessage).mockClear();
    const packet = { channel: "zhiyin-phone", version: 1, type: "back", requestId: "1" };
    message(packet, "https://untrusted.example");
    message(packet, window.location.origin, window);
    message({ ...packet, type: "authorize" });
    message({ ...packet, version: 2 });
    message({ ...packet, requestId: null });
    message(null);
    expect(peer.postMessage).not.toHaveBeenCalled();
    message(packet);
    expect(peer.postMessage).toHaveBeenLastCalledWith(
      { channel: "zhiyin-phone", version: 1, type: "back-result", requestId: "1", handled: false },
      window.location.origin,
    );
    message({ ...packet, type: "ping" });
    expect(peer.postMessage).toHaveBeenLastCalledWith(
      { channel: "zhiyin-phone", version: 1, type: "ready" }, window.location.origin,
    );
    disconnect();
    vi.mocked(peer.postMessage).mockClear();
    message(packet);
    expect(peer.postMessage).not.toHaveBeenCalled();
  });

  it("reports consumed navigation without authorizing any banking action", () => {
    const remove = registerPhoneBack(() => true);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: { channel: "zhiyin-phone", version: 1, type: "back", requestId: "2" },
    }));
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ handled: true }), window.location.origin);
    disconnect();
    remove();
  });

  it("requests contacts from the phone and accepts only a correlated result", async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = requestPhoneContacts();
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "contacts-request",
      requestId: request.requestId,
    }), window.location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "contacts-result",
        requestId: request.requestId, status: "granted",
        contacts: [{ id: "c_mother", displayName: "妈妈", phoneLast4: "6621" }],
      },
    }));
    await expect(pending).resolves.toEqual(expect.objectContaining({
      status: "granted",
      contacts: [expect.objectContaining({ displayName: "妈妈", phoneLast4: "6621" })],
    }));
    disconnect();
  });

  it("requests a scoped financial source and rejects malformed rows", async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = requestFinancialSource("alipay", ["balance", "transactions"]);
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "finance-source-request", provider: "alipay",
      scopes: ["balance", "transactions"], requestId: request.requestId,
    }), window.location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-source-result",
        requestId: request.requestId, status: "granted",
        source: {
          provider: "alipay", displayName: "支付宝", accountMasked: "叶先生",
          balance: 100_023_46, syncedAt: "2026-09-15T09:41:00+08:00",
          transactions: [
            { id: "ok", title: "美团", amount: -1850, category: "餐饮", occurredAt: "2026-09-15" },
            { id: "bad", title: "异常", amount: 1.2, category: "其他", occurredAt: "2026-09-15" },
          ],
          autopays: [],
        },
      },
    }));
    await expect(pending).resolves.toEqual(expect.objectContaining({
      status: "granted",
      source: expect.objectContaining({
        provider: "alipay",
        transactions: [expect.objectContaining({ id: "ok", amount: -1850 })],
      }),
    }));
    disconnect();
  });

  it("refreshes an existing scoped connection through a distinct read-only command", async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = refreshFinancialSource("alipay", ["autopay"]);
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "finance-source-refresh-request", provider: "alipay", scopes: ["autopay"],
    }), window.location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-source-result",
        requestId: request.requestId, status: "granted",
        source: { provider: "alipay", displayName: "支付宝", accountMasked: "叶先生", syncedAt: "2026-09-17", transactions: [], autopays: [] },
      },
    }));
    await expect(pending).resolves.toEqual(expect.objectContaining({ status: "granted" }));
    disconnect();
  });

  it("sends a correlated cancellation command and accepts only its result", async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = cancelFinancialAutopay("wechat_pay", "sub-music");
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "finance-autopay-cancel-request", provider: "wechat_pay",
      subscriptionId: "sub-music", requestId: request.requestId,
    }), window.location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: { channel: "zhiyin-phone", version: 1, type: "finance-autopay-cancel-result", requestId: request.requestId, status: "cancelled", provider: "wechat_pay", subscriptionId: "sub-music" },
    }));
    await expect(pending).resolves.toEqual({ status: "cancelled", provider: "wechat_pay", subscriptionId: "sub-music" });
    disconnect();
  });

  it("ignores a cancellation result for another subscription and recovers after timeout", async () => {
    vi.useFakeTimers();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = cancelFinancialAutopay("wechat_pay", "sub-music");
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-autopay-cancel-result",
        requestId: request.requestId, status: "cancelled", provider: "wechat_pay",
        subscriptionId: "another-subscription",
      },
    }));
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toEqual(expect.objectContaining({ status: "unavailable" }));
    expect(cancelFinancialAutopay("wechat_pay", "sub-music")).toBeInstanceOf(Promise);
    disconnect();
  });

  it("times out a lost financial refresh and confirms provider revocation", async () => {
    vi.useFakeTimers();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = refreshFinancialSource("alipay", ["autopay"]);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    const revocation = revokeFinancialSource("alipay");
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    expect(peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "finance-source-revoke-request", provider: "alipay",
    }), window.location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-source-revoke-result",
        requestId: request.requestId, provider: "alipay", status: "revoked",
      },
    }));
    await expect(revocation).resolves.toEqual({ status: "revoked", provider: "alipay" });
    disconnect();
  });

  it("keeps a revocation failure correlated and recovers after timeout", async () => {
    vi.useFakeTimers();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const rejected = revokeFinancialSource("wechat_pay");
    const request = vi.mocked(peer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string };
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: peer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-source-revoke-result",
        requestId: request.requestId, provider: "wechat_pay", status: "error", message: "授权仍然有效",
      },
    }));
    await expect(rejected).resolves.toEqual({
      status: "error", provider: "wechat_pay", message: "授权仍然有效",
    });

    const lost = revokeFinancialSource("alipay");
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(lost).resolves.toEqual(expect.objectContaining({ status: "unavailable", provider: "alipay" }));
    disconnect();
  });

  it("recovers a partner authorization when the activity return drops the first reply", async () => {
    vi.useFakeTimers();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const disconnect = connectPhoneBridge(window, peer);
    const pending = requestAuthorizedFinancialSource("wechat_pay", ["autopay"]);
    disconnect();
    await vi.advanceTimersByTimeAsync(50);
    const resumedPeer = { postMessage: vi.fn() } as unknown as Window;
    const resumedDisconnect = connectPhoneBridge(window, resumedPeer);
    await vi.advanceTimersByTimeAsync(100);
    const retry = vi.mocked(resumedPeer.postMessage).mock.calls.at(-1)?.[0] as { requestId: string; type: string };
    expect(retry.type).toBe("finance-source-refresh-request");
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: resumedPeer,
      data: {
        channel: "zhiyin-phone", version: 1, type: "finance-source-result",
        requestId: retry.requestId, status: "granted",
        source: {
          provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
          syncedAt: "2026-09-17", transactions: [], autopays: [],
        },
      },
    }));
    await expect(pending).resolves.toEqual(expect.objectContaining({ status: "granted" }));
    resumedDisconnect();
  });
});
