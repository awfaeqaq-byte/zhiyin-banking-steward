import type {
  WechatPayLedgerData,
  WechatPayTransaction,
  WechatSubscription,
  WechatWalletData,
} from '../types';
import { fromTimestamp } from '../../../os/TimeService';

export type SubscriptionBillingSnapshot = {
  subscriptions: WechatSubscription[];
  wallet: WechatWalletData;
  payLedger: WechatPayLedgerData;
};

export type SubscriptionBillingFailure = {
  subscriptionId: string;
  reason: 'insufficient_funds';
};

export type SubscriptionBillingResult = {
  snapshot: SubscriptionBillingSnapshot;
  charged: WechatPayTransaction[];
  failed: SubscriptionBillingFailure[];
};

const cloneSnapshot = (snapshot: SubscriptionBillingSnapshot): SubscriptionBillingSnapshot => ({
  subscriptions: snapshot.subscriptions.map(subscription => ({ ...subscription })),
  wallet: {
    ...snapshot.wallet,
    transfers: snapshot.wallet.transfers.map(transfer => ({ ...transfer })),
  },
  payLedger: {
    ...snapshot.payLedger,
    transactions: snapshot.payLedger.transactions.map(transaction => ({ ...transaction })),
    monthlyHistory: snapshot.payLedger.monthlyHistory.map(item => ({ ...item })),
    settings: { ...snapshot.payLedger.settings },
  },
});

const daysInUtcMonth = (year: number, month: number) =>
  fromTimestamp(Date.UTC(year, month + 1, 0)).getUTCDate();

export function addSubscriptionBillingCycle(timestamp: number, cycle: string): number {
  const source = fromTimestamp(timestamp);
  const sourceDay = source.getUTCDate();
  let targetYear = source.getUTCFullYear();
  let targetMonth = source.getUTCMonth();

  if (cycle === '年') targetYear += 1;
  else targetMonth += cycle === '季' ? 3 : 1;

  targetYear += Math.floor(targetMonth / 12);
  targetMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, daysInUtcMonth(targetYear, targetMonth));

  return Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  );
}

export function getNextSubscriptionChargeAt(startAt: number, cycle: string, after = startAt): number {
  let next = addSubscriptionBillingCycle(startAt, cycle);
  let guard = 0;
  while (next <= after && guard < 240) {
    next = addSubscriptionBillingCycle(next, cycle);
    guard += 1;
  }
  return next;
}

export function settleDueSubscriptionCharges(
  rawSnapshot: SubscriptionBillingSnapshot,
  now: number,
): SubscriptionBillingResult {
  const snapshot = cloneSnapshot(rawSnapshot);
  const charged: WechatPayTransaction[] = [];
  const failed: SubscriptionBillingFailure[] = [];

  for (let index = 0; index < snapshot.subscriptions.length; index += 1) {
    const subscription = snapshot.subscriptions[index];
    if (!subscription.autoRenew) continue;

    if (!Number.isFinite(subscription.nextChargeAt)) {
      snapshot.subscriptions[index] = {
        ...subscription,
        nextChargeAt: getNextSubscriptionChargeAt(
          subscription.createdAt,
          subscription.billingCycle,
          now,
        ),
      };
      continue;
    }

    const dueAt = Number(subscription.nextChargeAt);
    if (dueAt > now) continue;

    const linkedId = `subscription:${subscription.id}:${dueAt}`;
    const transactionId = `subscription-charge-${subscription.id}-${dueAt}`;
    const existingTransaction = snapshot.payLedger.transactions.find(
      transaction => transaction.id === transactionId || transaction.linkedId === linkedId,
    );
    const nextChargeAt = getNextSubscriptionChargeAt(dueAt, subscription.billingCycle, now);

    if (existingTransaction) {
      snapshot.subscriptions[index] = {
        ...subscription,
        lastChargedAt: Date.parse(existingTransaction.occurredAt),
        lastChargeTransactionId: existingTransaction.id,
        nextChargeAt,
      };
      continue;
    }

    const amountCents = Math.round(subscription.price * 100);
    if (snapshot.wallet.balanceCents < amountCents) {
      failed.push({ subscriptionId: subscription.id, reason: 'insufficient_funds' });
      continue;
    }

    const transaction: WechatPayTransaction = {
      id: transactionId,
      direction: 'expense',
      amountCents,
      category: 'service',
      merchant: subscription.source,
      occurredAt: fromTimestamp(now).toISOString(),
      note: `${subscription.membershipType} · 自动续费`,
      linkedId,
      source: 'wechat_pay',
    };

    snapshot.wallet.balanceCents -= amountCents;
    snapshot.payLedger.transactions.unshift(transaction);
    snapshot.subscriptions[index] = {
      ...subscription,
      lastChargedAt: now,
      lastChargeTransactionId: transaction.id,
      nextChargeAt,
    };
    charged.push({ ...transaction });
  }

  return { snapshot, charged, failed };
}
