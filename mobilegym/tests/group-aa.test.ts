import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ state: {} as any }));
vi.mock("../apps/Wechat/state", () => ({
  useWechatStore: {
    getState: () => holder.state,
    setState: (patch: object) => {
      holder.state = { ...holder.state, ...patch };
    },
  },
}));
vi.mock("@/os/TimeService", () => ({
  now: () => 1790000000000,
  getDate: () => new Date(1790000000000),
}));
import {
  initialGroupAA,
  grantGroupAA,
  revokeGroupAA,
  publishGroupAA,
  simulateGroupAAPayment,
  cancelGroupAA,
  readGroupAA,
  sendGroupAAMessage,
  updateGroupAASettings,
} from "../apps/Wechat/group-aa/backend";
const plan = {
  title: "聚餐",
  items: [
    {
      id: "food",
      title: "餐费",
      amount: 60000,
      shares: [
        { memberId: "self", weight: 2 },
        { memberId: "group-li", weight: 2 },
        { memberId: "group-wang", weight: 2 },
      ],
    },
  ],
};
beforeEach(() => {
  holder.state = {
    wallet: { balanceCents: 1000, transfers: [] },
    payLedger: { transactions: [] },
  };
});
describe("sandbox group collections", () => {
  it('supplies explicit member profiles and migrates old grants without losing money records',()=>{
    const fresh=initialGroupAA();
    expect(fresh.groups[0].members.find(m=>m.id==='group-li')).toMatchObject({gender:'female',avatar:expect.stringContaining('avatar_30')});
    holder.state.groupAA={groups:fresh.groups.map(g=>({...g,members:g.members.map(({avatar,gender,...m}:any)=>m)})),grants:['group-weekend'],collections:[{id:'keep'}]};
    const migrated=readGroupAA();
    expect(migrated.grants).toEqual([]);
    expect(migrated.collections).toEqual([{id:'keep'}]);
    expect(migrated.groups[0].members.find(m=>m.id==='group-li')?.gender).toBe('female');
    expect(holder.state.wallet.balanceCents).toBe(1000);
    expect(grantGroupAA('group-weekend').members[1].gender).toBe('female');
    expect(readGroupAA().grants).toEqual(['group-weekend']);
  });
  it('persists ordinary group messages and settings independently from financial actions',()=>{
    sendGroupAAMessage('group-weekend','今晚一起吃饭');
    expect(readGroupAA().messages?.['group-weekend'].at(-1)).toMatchObject({memberId:'self',text:'今晚一起吃饭'});
    expect(()=>sendGroupAAMessage('missing','hello')).toThrow();
    expect(()=>sendGroupAAMessage('group-weekend','  ')).toThrow();
    updateGroupAASettings('group-weekend',{muted:true});
    expect(readGroupAA().settings?.['group-weekend'].muted).toBe(true);
    expect(holder.state.wallet.balanceCents).toBe(1000);
    expect(readGroupAA().collections).toHaveLength(0);
  });
  it("shares one selected group only and allows revocation", () => {
    expect(readGroupAA().grants).toEqual([]);
    expect(grantGroupAA("group-weekend").members).toHaveLength(4);
    expect(readGroupAA().grants).toEqual(["group-weekend"]);
    revokeGroupAA("group-weekend");
    expect(readGroupAA().grants).toEqual([]);
    expect(() => grantGroupAA("fake")).toThrow();
  });
  it("requires grant, current membership and valid participants", () => {
    expect(() => publishGroupAA("one", "group-weekend", 1, plan)).toThrow();
    grantGroupAA("group-weekend");
    expect(() => publishGroupAA("one", "group-weekend", 2, plan)).toThrow();
    expect(() => publishGroupAA("!", "group-weekend", 1, plan)).toThrow();
    expect(() =>
      publishGroupAA("one", "group-weekend", 1, {
        ...plan,
        items: [
          { ...plan.items[0], shares: [{ memberId: "fake", weight: 1 }] },
        ],
      }),
    ).toThrow();
    expect(readGroupAA().collections).toHaveLength(0);
  });
  it("publishing is idempotent and never credits the wallet", () => {
    grantGroupAA("group-weekend");
    const first = publishGroupAA("one", "group-weekend", 1, plan);
    expect(publishGroupAA("one", "group-weekend", 1, plan)).toEqual(first);
    expect(readGroupAA().collections).toHaveLength(1);
    expect(holder.state.wallet.balanceCents).toBe(1000);
    expect(holder.state.payLedger.transactions).toHaveLength(0);
    expect(() =>
      publishGroupAA("one", "group-weekend", 1, { ...plan, title: "changed" }),
    ).toThrow();
  });
  it("each receipt credits exact cents once and completes only after all pay", () => {
    grantGroupAA("group-weekend");
    publishGroupAA("one", "group-weekend", 1, plan);
    simulateGroupAAPayment("one", "group-li");
    simulateGroupAAPayment("one", "group-li");
    expect(holder.state.wallet.balanceCents).toBe(21000);
    expect(holder.state.payLedger.transactions).toHaveLength(1);
    expect(readGroupAA().collections[0].status).toBe("pending");
    simulateGroupAAPayment("one", "group-wang");
    expect(holder.state.wallet.balanceCents).toBe(41000);
    expect(readGroupAA().collections[0].status).toBe("completed");
    expect(() => simulateGroupAAPayment("one", "self")).toThrow();
  });
  it("cancellation retains receipts but prevents further payment", () => {
    grantGroupAA("group-weekend");
    publishGroupAA("one", "group-weekend", 1, plan);
    simulateGroupAAPayment("one", "group-li");
    cancelGroupAA("one");
    expect(() => simulateGroupAAPayment("one", "group-wang")).toThrow();
    expect(holder.state.wallet.balanceCents).toBe(21000);
    expect(() => cancelGroupAA("one")).toThrow();
  });
  it("does not collapse two non-friends with identical names", () => {
    const group = initialGroupAA().groups[1];
    const wangs = group.members.filter((m) => m.name === "小王");
    expect(wangs).toHaveLength(2);
    expect(wangs[0].id).not.toBe(wangs[1].id);
  });
});
