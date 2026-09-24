import * as TimeService from '@/os/TimeService';
import { useWechatStore } from '../state';
import type { WechatPayLedgerData, WechatSubscription, WechatWalletData } from '../types';
import {
  getNextSubscriptionChargeAt,
  settleDueSubscriptionCharges,
  type SubscriptionBillingResult,
  type SubscriptionBillingSnapshot,
} from './billing';

export type NewWechatSubscription = Pick<
  WechatSubscription,
  'membershipType' | 'source' | 'price' | 'billingCycle'
>;

export interface WechatSubscriptionBackend {
  listAll(): Promise<WechatSubscription[]>;
  listActive(): Promise<WechatSubscription[]>;
  create(input: NewWechatSubscription): Promise<WechatSubscription>;
  cancel(id: string): Promise<WechatSubscription>;
  settleDueCharges(now?: number): Promise<SubscriptionBillingResult>;
}

let sequence = 0;

function cloneSubscription(subscription: WechatSubscription): WechatSubscription {
  return { ...subscription };
}

function cloneSubscriptions(subscriptions: WechatSubscription[]): WechatSubscription[] {
  return subscriptions.map(cloneSubscription);
}

function normalizeInput(input: NewWechatSubscription): NewWechatSubscription {
  const membershipType = input.membershipType.trim().slice(0, 40);
  const source = input.source.trim().slice(0, 40);
  if (!membershipType) throw new Error('请输入服务名称');
  if (!source) throw new Error('请输入商家名称');
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 99999.99) {
    throw new Error('请输入有效金额');
  }
  const scaledPrice = input.price * 100;
  if (Math.abs(scaledPrice - Math.round(scaledPrice)) > 1e-7) {
    throw new Error('金额最多保留两位小数');
  }
  if (!['月', '季', '年'].includes(input.billingCycle)) throw new Error('请选择扣费周期');
  return {
    membershipType,
    source,
    price: Math.round(input.price * 100) / 100,
    billingCycle: input.billingCycle,
  };
}

function assertNotDuplicate(subscriptions: WechatSubscription[], input: NewWechatSubscription) {
  const duplicate = subscriptions.some(subscription =>
    subscription.autoRenew
    && subscription.membershipType === input.membershipType
    && subscription.source === input.source,
  );
  if (duplicate) throw new Error('该商家的这项服务已在自动续费');
}

function newSubscription(input: NewWechatSubscription): WechatSubscription {
  sequence += 1;
  const createdAt = TimeService.now();
  return {
    ...input,
    id: `wx-subscription-${createdAt}-${sequence}`,
    autoRenew: true,
    createdAt,
    nextChargeAt: getNextSubscriptionChargeAt(createdAt, input.billingCycle),
  };
}

type MemoryBillingSeed = {
  wallet: WechatWalletData;
  payLedger: WechatPayLedgerData;
};

const emptyMemoryBillingSeed = (): MemoryBillingSeed => ({
  wallet: { balanceCents: 0, transfers: [] },
  payLedger: {
    transactions: [],
    monthlyHistory: [],
    settings: { dailyReport: true, includeManualRecords: true },
  },
});

export function createMemoryWechatSubscriptionBackend(
  initialSubscriptions: WechatSubscription[],
  initialBilling: MemoryBillingSeed = emptyMemoryBillingSeed(),
): WechatSubscriptionBackend {
  let billing: SubscriptionBillingSnapshot = {
    subscriptions: cloneSubscriptions(initialSubscriptions),
    wallet: {
      ...initialBilling.wallet,
      transfers: initialBilling.wallet.transfers.map(transfer => ({ ...transfer })),
    },
    payLedger: {
      ...initialBilling.payLedger,
      transactions: initialBilling.payLedger.transactions.map(transaction => ({ ...transaction })),
      monthlyHistory: initialBilling.payLedger.monthlyHistory.map(item => ({ ...item })),
      settings: { ...initialBilling.payLedger.settings },
    },
  };
  return {
    async listAll() {
      return cloneSubscriptions(billing.subscriptions);
    },
    async listActive() {
      return cloneSubscriptions(billing.subscriptions.filter(subscription => subscription.autoRenew));
    },
    async create(rawInput) {
      const input = normalizeInput(rawInput);
      assertNotDuplicate(billing.subscriptions, input);
      const subscription = newSubscription(input);
      billing = { ...billing, subscriptions: [subscription, ...billing.subscriptions] };
      return cloneSubscription(subscription);
    },
    async cancel(id) {
      const current = billing.subscriptions.find(subscription => subscription.id === id);
      if (!current) throw new Error('未找到自动续费服务');
      if (!current.autoRenew) return cloneSubscription(current);
      const cancelled = { ...current, autoRenew: false, nextChargeAt: undefined };
      billing = {
        ...billing,
        subscriptions: billing.subscriptions.map(subscription => subscription.id === id ? cancelled : subscription),
      };
      return cloneSubscription(cancelled);
    },
    async settleDueCharges(now = TimeService.now()) {
      const result = settleDueSubscriptionCharges(billing, now);
      billing = result.snapshot;
      return result;
    },
  };
}

const storeBackend: WechatSubscriptionBackend = {
  async listAll() {
    return cloneSubscriptions(useWechatStore.getState().subscriptions);
  },
  async listActive() {
    return cloneSubscriptions(
      useWechatStore.getState().subscriptions.filter(subscription => subscription.autoRenew),
    );
  },
  async create(rawInput) {
    const input = normalizeInput(rawInput);
    const state = useWechatStore.getState();
    assertNotDuplicate(state.subscriptions, input);
    const subscription = newSubscription(input);
    state.addSubscription(subscription);
    return cloneSubscription(subscription);
  },
  async cancel(id) {
    const state = useWechatStore.getState();
    const current = state.subscriptions.find(subscription => subscription.id === id);
    if (!current) throw new Error('未找到自动续费服务');
    if (!current.autoRenew) return cloneSubscription(current);
    const cancelled = { ...current, autoRenew: false, nextChargeAt: undefined };
    state.updateSubscription(id, { autoRenew: false, nextChargeAt: undefined });
    return cloneSubscription(cancelled);
  },
  async settleDueCharges(now = TimeService.now()) {
    const state = useWechatStore.getState();
    const result = settleDueSubscriptionCharges({
      subscriptions: state.subscriptions,
      wallet: state.wallet,
      payLedger: state.payLedger,
    }, now);
    if (result.charged.length > 0 || result.snapshot.subscriptions.some((item, index) =>
      item.nextChargeAt !== state.subscriptions[index]?.nextChargeAt
      || item.lastChargeTransactionId !== state.subscriptions[index]?.lastChargeTransactionId
    )) {
      useWechatStore.setState({
        subscriptions: result.snapshot.subscriptions,
        wallet: result.snapshot.wallet,
        payLedger: result.snapshot.payLedger,
      });
    }
    return result;
  },
};

let backendOverride: WechatSubscriptionBackend | null = null;

/** Swap this adapter for an HTTP implementation without changing the WeChat UI. */
export function configureWechatSubscriptionBackend(backend: WechatSubscriptionBackend | null) {
  backendOverride = backend;
}

export function getWechatSubscriptionBackend(): WechatSubscriptionBackend {
  return backendOverride || storeBackend;
}
