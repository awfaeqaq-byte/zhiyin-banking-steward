import { fromTimestamp } from '../../../os/TimeService';
import type {
  AlipayBalance,
  AlipaySubscription,
  AlipayTransferRecord,
} from '../types';

export type AlipaySubscriptionBillingSnapshot = {
  subscriptions: AlipaySubscription[];
  balance: AlipayBalance;
  transferRecords: AlipayTransferRecord[];
};

export type AlipaySubscriptionBillingFailure = {
  subscriptionId: string;
  reason: 'insufficient_funds';
};

export type AlipaySubscriptionBillingResult = {
  snapshot: AlipaySubscriptionBillingSnapshot;
  charged: AlipayTransferRecord[];
  failed: AlipaySubscriptionBillingFailure[];
};

const cloneSnapshot = (
  snapshot: AlipaySubscriptionBillingSnapshot,
): AlipaySubscriptionBillingSnapshot => ({
  subscriptions: snapshot.subscriptions.map(subscription => ({ ...subscription })),
  balance: { ...snapshot.balance },
  transferRecords: snapshot.transferRecords.map(record => ({ ...record })),
});

const daysInLocalMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

export function addAlipaySubscriptionBillingCycle(timestamp: number, cycle: string): number {
  const source = fromTimestamp(timestamp);
  const sourceDay = source.getDate();
  let targetYear = source.getFullYear();
  let targetMonth = source.getMonth();

  if (cycle === '年') targetYear += 1;
  else targetMonth += cycle === '季' ? 3 : 1;

  targetYear += Math.floor(targetMonth / 12);
  targetMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, daysInLocalMonth(targetYear, targetMonth));

  return new Date(
    targetYear,
    targetMonth,
    targetDay,
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  ).getTime();
}

export function getNextAlipaySubscriptionChargeAt(
  startAt: number,
  cycle: string,
  after = startAt,
): number {
  let next = addAlipaySubscriptionBillingCycle(startAt, cycle);
  let guard = 0;
  while (next <= after && guard < 240) {
    next = addAlipaySubscriptionBillingCycle(next, cycle);
    guard += 1;
  }
  return next;
}

/**
 * Pure settlement function. It returns a cloned financial snapshot so the
 * store adapter can commit balance, bills and schedule in one state update.
 */
export function settleDueAlipaySubscriptions(
  rawSnapshot: AlipaySubscriptionBillingSnapshot,
  now: number,
): AlipaySubscriptionBillingResult {
  const snapshot = cloneSnapshot(rawSnapshot);
  const charged: AlipayTransferRecord[] = [];
  const failed: AlipaySubscriptionBillingFailure[] = [];

  for (let index = 0; index < snapshot.subscriptions.length; index += 1) {
    const subscription = snapshot.subscriptions[index];
    if (!subscription.autoRenew) continue;

    // Old persisted subscriptions did not have schedules. Migrate them to the
    // next future cycle instead of interpreting missing data as immediately due.
    if (!Number.isFinite(subscription.nextChargeAt)) {
      snapshot.subscriptions[index] = {
        ...subscription,
        nextChargeAt: getNextAlipaySubscriptionChargeAt(
          subscription.createdAt,
          subscription.billingCycle,
          now,
        ),
      };
      continue;
    }

    const dueAt = Number(subscription.nextChargeAt);
    if (dueAt > now) continue;

    const linkedId = `alipay-subscription:${subscription.id}:${dueAt}`;
    const recordId = `alipay-subscription-charge-${subscription.id}-${dueAt}`;
    const existingRecord = snapshot.transferRecords.find(
      record => record.id === recordId || record.linkedId === linkedId,
    );
    const nextChargeAt = getNextAlipaySubscriptionChargeAt(
      dueAt,
      subscription.billingCycle,
      now,
    );

    if (existingRecord) {
      snapshot.subscriptions[index] = {
        ...subscription,
        lastChargedAt: existingRecord.timestamp,
        lastChargeRecordId: existingRecord.id,
        nextChargeAt,
      };
      continue;
    }

    const amountCents = Math.round(subscription.price * 100);
    const balanceCents = Math.round(snapshot.balance.total * 100);
    if (balanceCents < amountCents) {
      failed.push({ subscriptionId: subscription.id, reason: 'insufficient_funds' });
      continue;
    }

    const merchant = subscription.source?.trim() || subscription.membershipType;
    const record: AlipayTransferRecord = {
      id: recordId,
      counterpartyName: merchant,
      counterpartyAvatar: '',
      displayTitle: subscription.membershipType,
      delta: -amountCents / 100,
      timestamp: now,
      description: `${subscription.membershipType}·自动续费`,
      note: '自动续费',
      kind: 'payment',
      category: 'businessService',
      detailTimeLabel: '支付时间',
      paymentMethod: '余额',
      productDescription: `${subscription.membershipType}自动续费`,
      linkedId,
      includeInBudget: true,
    };

    snapshot.balance.total = (balanceCents - amountCents) / 100;
    snapshot.transferRecords.unshift(record);
    snapshot.subscriptions[index] = {
      ...subscription,
      lastChargedAt: now,
      lastChargeRecordId: record.id,
      nextChargeAt,
    };
    charged.push({ ...record });
  }

  return { snapshot, charged, failed };
}
