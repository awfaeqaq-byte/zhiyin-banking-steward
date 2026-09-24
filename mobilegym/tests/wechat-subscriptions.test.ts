import { describe, expect, it } from 'vitest';
import {
  createMemoryWechatSubscriptionBackend,
  type NewWechatSubscription,
} from '../apps/Wechat/subscriptions/backend';
import type { WechatSubscription } from '../apps/Wechat/types';

const activeSeed: WechatSubscription = {
  id: 'sub-unicom',
  membershipType: '中国联通话费自动交费',
  price: 100,
  billingCycle: '月',
  autoRenew: true,
  createdAt: 1_770_393_600_000,
  source: '广东联通',
};

const cancelledSeed: WechatSubscription = {
  id: 'sub-music',
  membershipType: '黑胶VIP会员包月',
  price: 15,
  billingCycle: '月',
  autoRenew: false,
  createdAt: 1_590_768_000_000,
  source: '网易云音乐主站',
};

const validDraft: NewWechatSubscription = {
  membershipType: '  视频会员  ',
  source: '  示例视频  ',
  price: 25,
  billingCycle: '月',
};

describe('WechatSubscriptionBackend', () => {
  it('returns only active services for the automatic-renewal list', async () => {
    const backend = createMemoryWechatSubscriptionBackend([activeSeed, cancelledSeed]);

    await expect(backend.listActive()).resolves.toEqual([activeSeed]);
    await expect(backend.listAll()).resolves.toHaveLength(2);
  });

  it('creates a normalized manual automatic-renewal service', async () => {
    const backend = createMemoryWechatSubscriptionBackend([]);

    const created = await backend.create(validDraft);

    expect(created).toEqual(expect.objectContaining({
      membershipType: '视频会员',
      source: '示例视频',
      price: 25,
      billingCycle: '月',
      autoRenew: true,
    }));
    expect(created.id).toMatch(/^wx-subscription-/);
    expect(created.createdAt).toBeGreaterThan(0);
    await expect(backend.listActive()).resolves.toEqual([created]);
  });

  it.each([0.29, 2.51, 19.9])('accepts the valid currency amount %s', async price => {
    const backend = createMemoryWechatSubscriptionBackend([]);

    const created = await backend.create({ ...validDraft, price });

    expect(created.price).toBe(price);
  });

  it.each([
    [{ ...validDraft, membershipType: '' }, '请输入服务名称'],
    [{ ...validDraft, source: '' }, '请输入商家名称'],
    [{ ...validDraft, price: 0 }, '请输入有效金额'],
    [{ ...validDraft, price: 12.345 }, '金额最多保留两位小数'],
  ] as Array<[NewWechatSubscription, string]>)('rejects invalid manual data', async (draft, message) => {
    const backend = createMemoryWechatSubscriptionBackend([]);

    await expect(backend.create(draft)).rejects.toThrow(message);
    await expect(backend.listAll()).resolves.toEqual([]);
  });

  it('prevents duplicate active services from the same merchant', async () => {
    const backend = createMemoryWechatSubscriptionBackend([]);
    await backend.create(validDraft);

    await expect(backend.create(validDraft)).rejects.toThrow('该商家的这项服务已在自动续费');
  });

  it('cancels an active service while retaining its record', async () => {
    const scheduled = { ...activeSeed, nextChargeAt: 1_780_000_000_000 };
    const backend = createMemoryWechatSubscriptionBackend([scheduled]);

    const cancelled = await backend.cancel(activeSeed.id);

    expect(cancelled.autoRenew).toBe(false);
    expect(cancelled.nextChargeAt).toBeUndefined();
    await expect(backend.listActive()).resolves.toEqual([]);
    await expect(backend.listAll()).resolves.toEqual([cancelled]);
    await expect(backend.cancel(activeSeed.id)).resolves.toEqual(cancelled);
  });

  it('fails safely when cancelling an unknown service', async () => {
    const backend = createMemoryWechatSubscriptionBackend([]);

    await expect(backend.cancel('missing')).rejects.toThrow('未找到自动续费服务');
  });

  it('persists automatic charges through the subscription backend', async () => {
    const dueAt = Date.parse('2026-09-16T08:00:00.000Z');
    const now = Date.parse('2026-09-17T08:00:00.000Z');
    const backend = createMemoryWechatSubscriptionBackend(
      [{ ...activeSeed, price: 20, nextChargeAt: dueAt }],
      {
        wallet: { balanceCents: 5_000, transfers: [] },
        payLedger: {
          transactions: [],
          monthlyHistory: [],
          settings: { dailyReport: true, includeManualRecords: true },
        },
      },
    );

    const result = await backend.settleDueCharges(now);

    expect(result.snapshot.wallet.balanceCents).toBe(3_000);
    expect(result.snapshot.payLedger.transactions[0]).toEqual(expect.objectContaining({
      amountCents: 2_000,
      category: 'service',
      source: 'wechat_pay',
    }));
    await expect(backend.listAll()).resolves.toEqual([
      expect.objectContaining({ lastChargedAt: now }),
    ]);
  });
});
