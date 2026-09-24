import { describe, expect, it } from 'vitest';
import {
  settleDueSubscriptionCharges,
  type SubscriptionBillingSnapshot,
} from '../apps/Wechat/subscriptions/billing';
import type { WechatSubscription } from '../apps/Wechat/types';

const dueAt = Date.parse('2026-01-31T08:00:00.000Z');
const settledAt = Date.parse('2026-02-01T08:00:00.000Z');

const dueSubscription: WechatSubscription = {
  id: 'sub-music',
  membershipType: '音乐会员',
  price: 15.99,
  billingCycle: '月',
  autoRenew: true,
  createdAt: Date.parse('2025-12-31T08:00:00.000Z'),
  nextChargeAt: dueAt,
  source: '示例音乐',
};

const snapshot = (overrides: Partial<SubscriptionBillingSnapshot> = {}): SubscriptionBillingSnapshot => ({
  subscriptions: [dueSubscription],
  wallet: { balanceCents: 10_000, transfers: [] },
  payLedger: {
    transactions: [],
    monthlyHistory: [],
    settings: { dailyReport: true, includeManualRecords: true },
  },
  ...overrides,
});

describe('automatic renewal billing', () => {
  it('charges a due service, updates its schedule, and writes one WeChat Pay bill', () => {
    const result = settleDueSubscriptionCharges(snapshot(), settledAt);

    expect(result.charged).toHaveLength(1);
    expect(result.failed).toEqual([]);
    expect(result.snapshot.wallet.balanceCents).toBe(8_401);
    expect(result.snapshot.payLedger.transactions).toEqual([
      expect.objectContaining({
        direction: 'expense',
        amountCents: 1_599,
        category: 'service',
        merchant: '示例音乐',
        occurredAt: new Date(settledAt).toISOString(),
        linkedId: `subscription:sub-music:${dueAt}`,
        source: 'wechat_pay',
      }),
    ]);
    expect(result.snapshot.subscriptions[0]).toEqual(expect.objectContaining({
      lastChargedAt: settledAt,
      lastChargeTransactionId: `subscription-charge-sub-music-${dueAt}`,
      nextChargeAt: Date.parse('2026-02-28T08:00:00.000Z'),
    }));
  });

  it('is idempotent when settlement runs repeatedly at the same time', () => {
    const first = settleDueSubscriptionCharges(snapshot(), settledAt);
    const second = settleDueSubscriptionCharges(first.snapshot, settledAt);

    expect(second.charged).toEqual([]);
    expect(second.snapshot.wallet.balanceCents).toBe(8_401);
    expect(second.snapshot.payLedger.transactions).toHaveLength(1);
  });

  it('does not charge inactive or not-yet-due services', () => {
    const inactive = { ...dueSubscription, autoRenew: false };
    const future = { ...dueSubscription, id: 'sub-future', nextChargeAt: settledAt + 60_000 };
    const initial = snapshot({ subscriptions: [inactive, future] });

    const result = settleDueSubscriptionCharges(initial, settledAt);

    expect(result.charged).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.snapshot).toEqual(initial);
  });

  it('keeps the due date and ledger unchanged when零钱 is insufficient', () => {
    const initial = snapshot({ wallet: { balanceCents: 1_000, transfers: [] } });

    const result = settleDueSubscriptionCharges(initial, settledAt);

    expect(result.charged).toEqual([]);
    expect(result.failed).toEqual([{ subscriptionId: 'sub-music', reason: 'insufficient_funds' }]);
    expect(result.snapshot.wallet.balanceCents).toBe(1_000);
    expect(result.snapshot.payLedger.transactions).toEqual([]);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBe(dueAt);
  });

  it('migrates a legacy active service to its next future cycle without charging it immediately', () => {
    const legacy = { ...dueSubscription };
    delete legacy.nextChargeAt;
    const initial = snapshot({ subscriptions: [legacy] });

    const result = settleDueSubscriptionCharges(initial, settledAt);

    expect(result.charged).toEqual([]);
    expect(result.snapshot.wallet.balanceCents).toBe(10_000);
    expect(result.snapshot.payLedger.transactions).toEqual([]);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBe(Date.parse('2026-02-28T08:00:00.000Z'));
  });

  it('coalesces missed cycles into one catch-up charge and resumes at the next future cycle', () => {
    const lateSettlement = Date.parse('2026-05-15T08:00:00.000Z');

    const result = settleDueSubscriptionCharges(snapshot(), lateSettlement);

    expect(result.charged).toHaveLength(1);
    expect(result.snapshot.wallet.balanceCents).toBe(8_401);
    expect(result.snapshot.subscriptions[0].nextChargeAt).toBe(Date.parse('2026-05-28T08:00:00.000Z'));
  });
});
