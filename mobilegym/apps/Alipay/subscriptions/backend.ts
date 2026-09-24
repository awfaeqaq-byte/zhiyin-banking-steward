import * as TimeService from '@/os/TimeService';
import { useAlipayStore } from '../state';
import type { AlipayBalance, AlipaySubscription, AlipayTransferRecord } from '../types';
import {
  getNextAlipaySubscriptionChargeAt,
  settleDueAlipaySubscriptions,
  type AlipaySubscriptionBillingResult,
  type AlipaySubscriptionBillingSnapshot,
} from './billing';

export type NewAlipaySubscription = Pick<
  AlipaySubscription,
  'membershipType' | 'source' | 'price' | 'billingCycle'
>;

export interface AlipaySubscriptionBackend {
  listAll(): Promise<AlipaySubscription[]>;
  listActive(): Promise<AlipaySubscription[]>;
  create(input: NewAlipaySubscription): Promise<AlipaySubscription>;
  cancel(id: string): Promise<AlipaySubscription>;
  settleDueCharges(now?: number): Promise<AlipaySubscriptionBillingResult>;
  getSnapshot(): Promise<AlipaySubscriptionBillingSnapshot>;
}

type MemoryBillingSeed = {
  balance: AlipayBalance;
  transferRecords: AlipayTransferRecord[];
};

let sequence = 0;

const cloneSubscriptions = (subscriptions: AlipaySubscription[]) =>
  subscriptions.map(subscription => ({ ...subscription }));

const cloneSnapshot = (
  snapshot: AlipaySubscriptionBillingSnapshot,
): AlipaySubscriptionBillingSnapshot => ({
  subscriptions: cloneSubscriptions(snapshot.subscriptions),
  balance: { ...snapshot.balance },
  transferRecords: snapshot.transferRecords.map(record => ({ ...record })),
});

function normalizeInput(input: NewAlipaySubscription): NewAlipaySubscription {
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
  if (!['月', '季', '年'].includes(input.billingCycle)) {
    throw new Error('请选择扣费周期');
  }
  return {
    membershipType,
    source,
    price: Math.round(input.price * 100) / 100,
    billingCycle: input.billingCycle,
  };
}

function assertNotDuplicate(subscriptions: AlipaySubscription[], input: NewAlipaySubscription) {
  const duplicate = subscriptions.some(subscription =>
    subscription.autoRenew
    && subscription.membershipType === input.membershipType
    && subscription.source === input.source,
  );
  if (duplicate) throw new Error('该商家的这项服务已在自动续费');
}

function createSubscription(input: NewAlipaySubscription): AlipaySubscription {
  sequence += 1;
  const createdAt = TimeService.now();
  return {
    ...input,
    id: `alipay-subscription-${createdAt}-${sequence}`,
    autoRenew: true,
    createdAt,
    nextChargeAt: getNextAlipaySubscriptionChargeAt(createdAt, input.billingCycle),
  };
}

const emptyBillingSeed = (): MemoryBillingSeed => ({
  balance: { total: 0, dailyIncome: 0 },
  transferRecords: [],
});

export function createMemoryAlipaySubscriptionBackend(
  initialSubscriptions: AlipaySubscription[],
  initialBilling: MemoryBillingSeed = emptyBillingSeed(),
): AlipaySubscriptionBackend {
  let snapshot: AlipaySubscriptionBillingSnapshot = {
    subscriptions: cloneSubscriptions(initialSubscriptions),
    balance: { ...initialBilling.balance },
    transferRecords: initialBilling.transferRecords.map(record => ({ ...record })),
  };

  return {
    async listAll() {
      return cloneSubscriptions(snapshot.subscriptions);
    },
    async listActive() {
      return cloneSubscriptions(snapshot.subscriptions.filter(subscription => subscription.autoRenew));
    },
    async create(rawInput) {
      const input = normalizeInput(rawInput);
      assertNotDuplicate(snapshot.subscriptions, input);
      const subscription = createSubscription(input);
      snapshot = { ...snapshot, subscriptions: [subscription, ...snapshot.subscriptions] };
      return { ...subscription };
    },
    async cancel(id) {
      const current = snapshot.subscriptions.find(subscription => subscription.id === id);
      if (!current) throw new Error('未找到自动续费服务');
      const cancelled = { ...current, autoRenew: false, nextChargeAt: undefined };
      snapshot = {
        ...snapshot,
        subscriptions: snapshot.subscriptions.map(subscription =>
          subscription.id === id ? cancelled : subscription),
      };
      return { ...cancelled };
    },
    async settleDueCharges(now = TimeService.now()) {
      const result = settleDueAlipaySubscriptions(snapshot, now);
      snapshot = result.snapshot;
      return result;
    },
    async getSnapshot() {
      return cloneSnapshot(snapshot);
    },
  };
}

const storeBackend: AlipaySubscriptionBackend = {
  async listAll() {
    return cloneSubscriptions(useAlipayStore.getState().subscriptions);
  },
  async listActive() {
    return cloneSubscriptions(
      useAlipayStore.getState().subscriptions.filter(subscription => subscription.autoRenew),
    );
  },
  async create(rawInput) {
    const input = normalizeInput(rawInput);
    const state = useAlipayStore.getState();
    assertNotDuplicate(state.subscriptions, input);
    const subscription = createSubscription(input);
    useAlipayStore.setState({ subscriptions: [subscription, ...state.subscriptions] });
    return { ...subscription };
  },
  async cancel(id) {
    const state = useAlipayStore.getState();
    const current = state.subscriptions.find(subscription => subscription.id === id);
    if (!current) throw new Error('未找到自动续费服务');
    const cancelled = { ...current, autoRenew: false, nextChargeAt: undefined };
    useAlipayStore.setState({
      subscriptions: state.subscriptions.map(subscription =>
        subscription.id === id ? cancelled : subscription),
    });
    return { ...cancelled };
  },
  async settleDueCharges(now = TimeService.now()) {
    const state = useAlipayStore.getState();
    const result = settleDueAlipaySubscriptions({
      subscriptions: state.subscriptions,
      balance: state.balance,
      transferRecords: state.transferRecords,
    }, now);
    const scheduleChanged = result.snapshot.subscriptions.some((subscription, index) => {
      const previous = state.subscriptions[index];
      return subscription.nextChargeAt !== previous?.nextChargeAt
        || subscription.lastChargeRecordId !== previous?.lastChargeRecordId;
    });
    if (result.charged.length > 0 || scheduleChanged) {
      useAlipayStore.setState({
        subscriptions: result.snapshot.subscriptions,
        balance: result.snapshot.balance,
        transferRecords: result.snapshot.transferRecords,
      });
    }
    return result;
  },
  async getSnapshot() {
    const state = useAlipayStore.getState();
    return cloneSnapshot({
      subscriptions: state.subscriptions,
      balance: state.balance,
      transferRecords: state.transferRecords,
    });
  },
};

let backendOverride: AlipaySubscriptionBackend | null = null;

/** Swap this adapter for an HTTP implementation without changing Alipay UI pages. */
export function configureAlipaySubscriptionBackend(backend: AlipaySubscriptionBackend | null) {
  backendOverride = backend;
}

export function getAlipaySubscriptionBackend(): AlipaySubscriptionBackend {
  return backendOverride || storeBackend;
}
