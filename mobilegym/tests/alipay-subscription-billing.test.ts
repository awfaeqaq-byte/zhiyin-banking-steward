import { describe, expect, it } from 'vitest';
import {
  addAlipaySubscriptionBillingCycle,
  settleDueAlipaySubscriptions,
  type AlipaySubscriptionBillingSnapshot,
} from '../apps/Alipay/subscriptions/billing';
import type { AlipaySubscription } from '../apps/Alipay/types';

const dueAt = Date.parse('2026-09-16T08:00:00.000Z');
const settledAt = Date.parse('2026-09-17T08:00:00.000Z');

const dueSubscription: AlipaySubscription = {
  id: 'alipay-sub-video',
  membershipType: '视频VIP连续包月',
  source: '示例视频',
  price: 25,
  billingCycle: '月',
  autoRenew: true,
  createdAt: Date.parse('2026-06-16T08:00:00.000Z'),
  nextChargeAt: dueAt,
};

const snapshot = (
  overrides: Partial<AlipaySubscriptionBillingSnapshot> = {},
): AlipaySubscriptionBillingSnapshot => ({
  subscriptions: [dueSubscription],
  balance: { total: 100.5, dailyIncome: 0 },
  transferRecords: [],
  ...overrides,
});

describe('Alipay automatic renewal billing', () => {
  it('preserves the sandbox local calendar date across a month boundary', () => {
    const openedAt = Date.parse('2026-02-28T17:00:00.000Z'); // 2026-03-01 01:00 in China

    expect(addAlipaySubscriptionBillingCycle(openedAt, '月'))
      .toBe(Date.parse('2026-03-31T17:00:00.000Z')); // 2026-04-01 01:00 in China
  });

  it('deducts the real balance and writes one Alipay bill for a due service', () => {
    const result = settleDueAlipaySubscriptions(snapshot(), settledAt);

    expect(result.charged).toHaveLength(1);
    expect(result.failed).toEqual([]);
    expect(result.snapshot.balance.total).toBe(75.5);
    expect(result.snapshot.transferRecords[0]).toEqual(expect.objectContaining({
      id: `alipay-subscription-charge-alipay-sub-video-${dueAt}`,
      counterpartyName: '示例视频',
      displayTitle: '视频VIP连续包月',
      delta: -25,
      timestamp: settledAt,
      category: 'businessService',
      paymentMethod: '余额',
      linkedId: `alipay-subscription:alipay-sub-video:${dueAt}`,
    }));
    expect(result.snapshot.subscriptions[0]).toEqual(expect.objectContaining({
      lastChargedAt: settledAt,
      lastChargeRecordId: `alipay-subscription-charge-alipay-sub-video-${dueAt}`,
      nextChargeAt: Date.parse('2026-10-16T08:00:00.000Z'),
    }));
  });

  it('does not duplicate a charge when settlement runs repeatedly', () => {
    const first = settleDueAlipaySubscriptions(snapshot(), settledAt);
    const second = settleDueAlipaySubscriptions(first.snapshot, settledAt);

    expect(second.charged).toEqual([]);
    expect(second.snapshot.balance.total).toBe(75.5);
    expect(second.snapshot.transferRecords).toHaveLength(1);
  });

  it('makes one catch-up charge after a multi-cycle sandbox time jump, then resumes in the future', () => {
    const monthsLater = Date.parse('2027-01-20T08:00:00.000Z');

    const result = settleDueAlipaySubscriptions(snapshot(), monthsLater);

    expect(result.charged).toHaveLength(1);
    expect(result.snapshot.balance.total).toBe(75.5);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBeGreaterThan(monthsLater);
  });

  it('leaves all financial state unchanged when the balance is insufficient', () => {
    const result = settleDueAlipaySubscriptions(
      snapshot({ balance: { total: 10, dailyIncome: 0 } }),
      settledAt,
    );

    expect(result.charged).toEqual([]);
    expect(result.failed).toEqual([{ subscriptionId: dueSubscription.id, reason: 'insufficient_funds' }]);
    expect(result.snapshot.balance.total).toBe(10);
    expect(result.snapshot.transferRecords).toEqual([]);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBe(dueAt);
  });

  it('migrates a legacy active service to a future cycle without charging it immediately', () => {
    const legacy = { ...dueSubscription };
    delete legacy.nextChargeAt;

    const result = settleDueAlipaySubscriptions(snapshot({ subscriptions: [legacy] }), settledAt);

    expect(result.charged).toEqual([]);
    expect(result.snapshot.balance.total).toBe(100.5);
    expect(result.snapshot.transferRecords).toEqual([]);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBeGreaterThan(settledAt);
  });
});
