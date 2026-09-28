import { useWechatStore } from "../state";
import * as TimeService from "@/os/TimeService";
import defaults from "../data/group-aa-defaults.json";
import {
  calculateGroupAA,
  type AAGroup,
  type AAPlan,
  type AACollection,
} from "../../../../src/lib/group-aa";
export type WechatGroupAAState = {
  groups: AAGroup[];
  grants: string[];
  collections: AACollection[];
};
export const initialGroupAA = (): WechatGroupAAState => ({
  groups: structuredClone(defaults),
  grants: [],
  collections: [],
});
export const readGroupAA = () =>
  useWechatStore.getState().groupAA ?? initialGroupAA();
export function grantGroupAA(id: string) {
  const state = readGroupAA();
  const group = state.groups.find((g) => g.id === id);
  if (!group) throw new Error("未找到这个群");
  useWechatStore.setState({
    groupAA: { ...state, grants: [...new Set([...state.grants, id])] },
  });
  return structuredClone(group);
}
export function revokeGroupAA(id: string) {
  const state = readGroupAA();
  useWechatStore.setState({
    groupAA: { ...state, grants: state.grants.filter((g) => g !== id) },
  });
}
export function publishGroupAA(
  id: string,
  groupId: string,
  revision: number,
  plan: AAPlan,
) {
  const state = readGroupAA();
  const group = state.groups.find((g) => g.id === groupId);
  if (!group || !state.grants.includes(groupId))
    throw new Error("请重新授权此群的成员信息");
  if (group.revision !== revision)
    throw new Error("群成员已变化，请重新选择并核对");
  if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id))
    throw new Error("收款编号无效");
  const result = calculateGroupAA(group, plan);
  if (result.collectAmount <= 0)
    throw new Error("请选择至少一位需要付款的其他成员");
  const existing = state.collections.find((c) => c.id === id);
  if (existing) {
    if (
      existing.groupId !== groupId ||
      JSON.stringify(existing.plan) !== JSON.stringify(plan)
    )
      throw new Error("此编号已有不同收款方案");
    return structuredClone(existing);
  }
  const collection: AACollection = {
    id,
    groupId,
    groupName: group.name,
    plan: structuredClone(plan),
    ...result,
    members: result.members.map((m) => ({
      ...m,
      paid: !!m.self || m.amount === 0,
    })),
    createdAt: TimeService.now(),
    status: "pending",
  };
  useWechatStore.setState({
    groupAA: { ...state, collections: [collection, ...state.collections] },
  });
  return structuredClone(collection);
}
/** Explicit sandbox receipt event; a model cannot call this through Zhiyin's bridge. */
export function simulateGroupAAPayment(id: string, memberId: string) {
  const state = readGroupAA();
  const current = state.collections.find((c) => c.id === id);
  const member = current?.members.find((m) => m.id === memberId);
  if (!current || current.status === "cancelled" || !member || member.self)
    throw new Error("这笔收款不可支付");
  if (member.paid) return;
  const members = current.members.map((m) =>
    m.id === memberId ? { ...m, paid: true } : m,
  );
  const updated = {
    ...current,
    members,
    status: members.every((m) => m.paid)
      ? ("completed" as const)
      : ("pending" as const),
  };
  const prev = useWechatStore.getState();
  const linkedId = `group-aa:${id}:${memberId}`;
  if (prev.payLedger.transactions.some((t) => t.linkedId === linkedId))
    throw new Error("这笔到账已入账，请核对记录");
  useWechatStore.setState({
    groupAA: {
      ...state,
      collections: state.collections.map((c) => (c.id === id ? updated : c)),
    },
    wallet: {
      ...prev.wallet,
      balanceCents: prev.wallet.balanceCents + member.amount,
    },
    payLedger: {
      ...prev.payLedger,
      transactions: [
        {
          id: linkedId,
          linkedId,
          direction: "income",
          amountCents: member.amount,
          category: "income",
          merchant: `${member.name} · 群收款`,
          occurredAt: TimeService.getDate().toISOString(),
          note: current.plan.title,
          source: "wechat_pay",
        },
        ...prev.payLedger.transactions,
      ],
    },
  });
}
export function cancelGroupAA(id: string) {
  const state = readGroupAA();
  const item = state.collections.find((c) => c.id === id);
  if (!item || item.status !== "pending") throw new Error("收款已经结束");
  useWechatStore.setState({
    groupAA: {
      ...state,
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, status: "cancelled" } : c,
      ),
    },
  });
}
