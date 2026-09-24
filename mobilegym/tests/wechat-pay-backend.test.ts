import { describe, expect, it } from 'vitest';
import {
  buildWechatPayLedgerResult,
  createMemoryWechatPayBackend,
  type WechatPayLedgerSeed,
} from '../apps/Wechat/pay-ledger/backend';
import payLedgerDefaults from '../apps/Wechat/data/pay-ledger-defaults.json';

const seed: WechatPayLedgerSeed = {
  transactions: [
    {
      id: 'expense-1', direction: 'expense', amountCents: 8050,
      category: 'shopping', merchant: '便利店', occurredAt: '2026-09-14T21:39:00+08:00',
    },
    {
      id: 'income-1', direction: 'income', amountCents: 175000,
      category: 'income', merchant: '工资', occurredAt: '2026-09-10T09:00:00+08:00',
    },
    {
      id: 'expense-2', direction: 'expense', amountCents: 20000,
      category: 'dining', merchant: '餐厅', occurredAt: '2026-08-30T18:20:00+08:00',
    },
  ],
  monthlyHistory: [{ month: '2026-08', expenseCents: 20000 }],
  settings: { dailyReport: true, includeManualRecords: true },
};

describe('WechatPayBackend', () => {
  it('keeps the demo seed aligned with the WeChat Pay reference totals', () => {
    const result = buildWechatPayLedgerResult(payLedgerDefaults as WechatPayLedgerSeed, { month: '2026-09' });

    expect(result.summary).toEqual({ expenseCents: 269453, incomeCents: 175000, count: 18 });
    expect(result.daily.find(item => item.date === '2026-09-14')).toEqual({
      date: '2026-09-14', expenseCents: 8047, incomeCents: 0, count: 8,
    });
    expect(result.transactions.find(item => item.id === 'wx-20260914-01')?.linkedId).toBeUndefined();
    expect(result.transactions.find(item => item.id === 'wx-20260914-07')?.linkedId).toBeUndefined();
  });

  it('filters one month and computes expense, income, daily and category summaries', async () => {
    const backend = createMemoryWechatPayBackend(seed);
    const result = await backend.getLedger({ month: '2026-09' });

    expect(result.transactions.map(item => item.id)).toEqual(['expense-1', 'income-1']);
    expect(result.summary).toEqual({ expenseCents: 8050, incomeCents: 175000, count: 2 });
    expect(result.daily[0]).toEqual(expect.objectContaining({ date: '2026-09-14', expenseCents: 8050 }));
    expect(result.categories).toEqual([
      expect.objectContaining({ category: 'shopping', expenseCents: 8050 }),
    ]);
  });

  it('loads transaction detail by id regardless of its month', async () => {
    const backend = createMemoryWechatPayBackend(seed);

    await expect(backend.getTransaction('expense-2')).resolves.toEqual(
      expect.objectContaining({ id: 'expense-2', occurredAt: '2026-08-30T18:20:00+08:00' }),
    );
  });

  it('provides a read-only cross-month transaction history for authorized financial analysis', async () => {
    const backend = createMemoryWechatPayBackend({
      ...seed,
      transactions: [seed.transactions[2], seed.transactions[1], seed.transactions[0]],
    });
    const history = await backend.getTransactionHistory?.();

    expect(history?.map(item => item.id)).toEqual(['expense-1', 'income-1', 'expense-2']);
    history![0].merchant = 'changed outside backend';
    await expect(backend.getTransaction('expense-1')).resolves.toEqual(seed.transactions[0]);
  });

  it('respects the manual-record preference when returning cross-month history', async () => {
    const backend = createMemoryWechatPayBackend({
      ...seed,
      transactions: [...seed.transactions, {
        ...seed.transactions[0], id: 'manual-hidden', source: 'manual',
      }],
      settings: { dailyReport: true, includeManualRecords: false },
    });

    const history = await backend.getTransactionHistory?.();

    expect(history).toHaveLength(3);
    expect(history?.some(item => item.id === 'manual-hidden')).toBe(false);
  });

  it('adds validated manual records and persists setting changes through the adapter', async () => {
    const backend = createMemoryWechatPayBackend(seed);

    const added = await backend.addTransaction({
      direction: 'expense', amountCents: 405, category: 'shopping', merchant: '美宜佳便利店',
      occurredAt: '2026-09-15T12:26:00+08:00', note: '零食',
    });
    await backend.updateSettings({ dailyReport: false });
    const result = await backend.getLedger({ month: '2026-09', category: 'shopping' });

    expect(added.id).toMatch(/^manual-/);
    expect(result.summary.expenseCents).toBe(8455);
    expect(result.settings.dailyReport).toBe(false);
    expect(result.settings.includeManualRecords).toBe(true);
  });

  it('excludes manual records when the user turns off manual records in statistics', async () => {
    const backend = createMemoryWechatPayBackend(seed);
    await backend.addTransaction({
      direction: 'expense', amountCents: 405, category: 'shopping', merchant: '现金便利店',
      occurredAt: '2026-09-15T12:26:00+08:00',
    });

    await backend.updateSettings({ includeManualRecords: false });
    const result = await backend.getLedger({ month: '2026-09' });

    expect(result.transactions.some(item => item.source === 'manual')).toBe(false);
    expect(result.summary.expenseCents).toBe(8050);
  });

  it('rejects invalid amounts instead of storing unusable test data', async () => {
    const backend = createMemoryWechatPayBackend(seed);
    await expect(backend.addTransaction({
      direction: 'expense', amountCents: 0, category: 'shopping', merchant: '便利店',
      occurredAt: '2026-09-15T12:26:00+08:00',
    })).rejects.toThrow('金额必须大于 0');
  });
});
