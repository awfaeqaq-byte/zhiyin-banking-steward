import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSubscriptionSync } from "../../src/lib/use-subscription-sync";
import type { ConnectedFinancialSource } from "../../src/lib/financial-connections";
import type { FinancialSourceResult } from "../../src/lib/phone-bridge";

const source: ConnectedFinancialSource = {
  provider: "alipay", displayName: "支付宝", accountMasked: "叶先生",
  scopes: ["autopay"], transactions: [], autopays: [], syncedAt: "2026-09-22",
};
const fresh = { ...source, autopays: [{ id: "new", title: "新增会员", amount: 2500, cycle: "月" }] };

describe("订阅实时同步", () => {
  it('拒绝授权后再断开所有平台，旧错误会清除且不再请求平台',async()=>{
    const load=vi.fn(async()=>({status:'denied' as const}));
    const {result}=renderHook(()=>useSubscriptionSync(()=>({alipay:source}),load));
    await act(async()=>{await result.current.refresh();});
    expect(result.current.error).toContain('授权已失效');
    expect(result.current.getCurrentConnections()).toEqual({});
    await act(async()=>{expect(await result.current.refresh()).toEqual({connections:{},error:''});});
    expect(result.current.error).toBe('');expect(load).toHaveBeenCalledOnce();
  });
  it("只有账单授权时也刷新，以识别历史周期扣费", async () => {
    const load = vi.fn(async () => ({ status: "granted" as const, source }));
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: { ...source, scopes: ["transactions"] } }), load));
    await act(async () => { await result.current.refresh(); });
    expect(load).toHaveBeenCalledWith("alipay", ["transactions"]);
  });
  it("返回最新快照，并合并同时发生的刷新", async () => {
    let resolve!: (value: FinancialSourceResult) => void;
    const load = vi.fn(() => new Promise<FinancialSourceResult>(done => { resolve = done; }));
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: source }), load));
    await act(async () => {
      const first = result.current.refresh();
      const second = result.current.refresh();
      resolve({ status: "granted", source: fresh });
      expect((await first).connections.alipay?.autopays[0].id).toBe("new");
      await second;
    });
    expect(load).toHaveBeenCalledOnce();
    expect(result.current.connections.alipay?.autopays).toEqual(fresh.autopays);
  });

  it("授权失效时移除旧数据，返回失败原因", async () => {
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: source }),
      vi.fn(async () => ({ status: "denied" as const }))));
    await act(async () => { expect((await result.current.refresh()).error).toContain("授权已失效"); });
    expect(result.current.connections.alipay).toBeUndefined();
  });

  it("请求失败保留缓存，但绝不标记为最新数据", async () => {
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: source }),
      vi.fn(async () => { throw new Error("offline"); })));
    await act(async () => { expect((await result.current.refresh()).error).toContain("无法同步"); });
    expect(result.current.connections.alipay).toEqual(source);
    expect(result.current.refreshing).toBe(false);
  });

  it("刷新期间取消或断开连接，迟到的快照不能恢复旧订阅", async () => {
    let resolve!: (value: FinancialSourceResult) => void;
    const load = vi.fn(() => new Promise<FinancialSourceResult>(done => { resolve = done; }));
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: source }), load));
    await act(async () => {
      const pending = result.current.refresh();
      result.current.setConnections({});
      resolve({ status: "granted", source: fresh });
      expect((await pending).error).toContain("已变化");
    });
    expect(result.current.connections).toEqual({});
  });

  it("只有余额授权也刷新，资金测算不能沿用旧余额", async () => {
    const load = vi.fn(async () => ({ status: "granted" as const, source: { ...source, balance: 5000 } }));
    const { result } = renderHook(() => useSubscriptionSync(() => ({ alipay: { ...source, scopes: ["balance"] } }), load));
    await act(async () => { expect((await result.current.refresh()).error).toBe(""); });
    expect(load).toHaveBeenCalledWith("alipay", ["balance"]);
    expect(result.current.connections.alipay?.balance).toBe(5000);
  });
});
