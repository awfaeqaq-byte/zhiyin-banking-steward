import { describe, expect, it } from 'vitest';
import {
  createMemoryAlipaySubscriptionBackend,
  type NewAlipaySubscription,
} from '../apps/Alipay/subscriptions/backend';
import type { AlipaySubscription } from '../apps/Alipay/types';

const activeSeed: AlipaySubscription = {
  id: 'sub-music',
  membershipType: '音乐会员连续包月',
  source: '示例音乐',
  price: 15,
  billingCycle: '月',
  autoRenew: true,
  createdAt: Date.parse('2026-06-01T08:00:00.000Z'),
  nextChargeAt: Date.parse('2026-10-01T08:00:00.000Z'),
};

const validDraft: NewAlipaySubscription = {
  membershipType: '  视频会员  ',
  source: '  示例视频  ',
  price: 25,
  billingCycle: '月',
};

describe('AlipaySubscriptionBackend', () => {
  it('creates a normalized scheduled service without charging immediately', async () => {
    const backend = createMemoryAlipaySubscriptionBackend([], {
      balance: { total: 100, dailyIncome: 0 },
      transferRecords: [],
    });

    const created = await backend.create(validDraft);
    const state = await backend.getSnapshot();

    expect(created).toEqual(expect.objectContaining({
      membershipType: '视频会员',
      source: '示例视频',
      autoRenew: true,
    }));
    expect(created.nextChargeAt).toBeGreaterThan(created.createdAt);
    expect(state.balance.total).toBe(100);
    expect(state.transferRecords).toEqual([]);
  });

  it('cancels an active service and clears its future schedule', async () => {
    const backend = createMemoryAlipaySubscriptionBackend([activeSeed]);

    const cancelled = await backend.cancel(activeSeed.id);

    expect(cancelled.autoRenew).toBe(false);
    expect(cancelled.nextChargeAt).toBeUndefined();
    await expect(backend.listActive()).resolves.toEqual([]);
  });

  it('persists a due charge through the backend snapshot', async () => {
    const now = Date.parse('2026-09-17T08:00:00.000Z');
    const backend = createMemoryAlipaySubscriptionBackend(
      [{ ...activeSeed, price: 20, nextChargeAt: now - 1 }],
      { balance: { total: 50, dailyIncome: 0 }, transferRecords: [] },
    );

    const result = await backend.settleDueCharges(now);
    const state = await backend.getSnapshot();

    expect(result.charged).toHaveLength(1);
    expect(state.balance.total).toBe(30);
    expect(state.transferRecords[0]).toEqual(expect.objectContaining({
      category: 'businessService',
      delta: -20,
    }));
  });

  it.each([
    [{ ...validDraft, membershipType: '' }, '请输入服务名称'],
    [{ ...validDraft, source: '' }, '请输入商家名称'],
    [{ ...validDraft, price: 0 }, '请输入有效金额'],
    [{ ...validDraft, price: 12.345 }, '金额最多保留两位小数'],
  ] as Array<[NewAlipaySubscription, string]>)('rejects invalid input', async (draft, message) => {
    const backend = createMemoryAlipaySubscriptionBackend([]);
    await expect(backend.create(draft)).rejects.toThrow(message);
  });
});
