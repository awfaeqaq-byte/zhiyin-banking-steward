import { describe, expect, it } from 'vitest';
import { createFinanceTestController, parseTestMoney, type FinanceTestSnapshot } from '../sandbox/finance-testing';
import { loadFinancialSource } from '../apps/Zhiyin/finance-access';
import { buildRecurringCandidates } from '../../src/lib/recurring-payments';

const start = Date.parse('2026-09-24T10:00:00+08:00');
function setup() {
  let time = start;
  let state = {
    wechat: { wallet: { balanceCents: 10000, transfers: [] }, subscriptions: [], payLedger: { transactions: [], monthlyHistory: [], settings: {} } },
    alipay: { balance: { total: 200 }, subscriptions: [], transferRecords: [] },
  } as unknown as FinanceTestSnapshot;
  const controller = createFinanceTestController({
    read: () => structuredClone(state), write: next => { state = structuredClone(next); },
    now: () => time, setTime: next => { time = next; },
  });
  return { controller, read: () => state, time: () => time, mutate: (fn: (s: FinanceTestSnapshot) => void) => fn(state) };
}

describe('sandbox finance test controls', () => {
  it('feeds synthetic bills through the real Zhiyin adapter and recurring detector', async () => {
    const s = setup();
    s.controller.execute({ type: 'scenario', scenario: 'recurring' });
    const result = await loadFinancialSource('wechat_pay', ['transactions'], {
      nowIso: () => new Date(start).toISOString(),
      readAlipay: () => s.read().alipay,
      readWechatPay: () => s.read().wechat,
      readWechatWallet: () => s.read().wechat.wallet,
      readWechatLedger: async () => s.read().wechat.payLedger.transactions,
    });
    expect(result.source).toBeDefined();
    if (!result.source) throw new Error('Expected source');
    expect(result.source.balance).toBeUndefined();
    expect(result.source.autopays).toEqual([]);
    const candidates = buildRecurringCandidates({ wechat_pay: { ...result.source, scopes: ['transactions'] } }, start);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ title: '测试云盘', amount: 1800, cycle: '月' });
    expect(candidates[0].evidence).toHaveLength(4);
  });
  it.each(['', '-1', '1.001', 'NaN', 'Infinity', '1e3', '1000000.01'])('rejects invalid amount %s', value => {
    expect(() => parseTestMoney(value)).toThrow();
  });
  it('uses integer cents including zero and maximum', () => {
    expect(parseTestMoney('0')).toBe(0);
    expect(parseTestMoney('12.34')).toBe(1234);
    expect(parseTestMoney('1000000.00')).toBe(100000000);
  });
  it('sets balances without manufacturing a transaction and safely undoes it', () => {
    const s = setup(); const before = structuredClone(s.read());
    s.controller.execute({ type: 'balance', wechat: '1.01', alipay: '0' });
    expect(s.read().wechat.wallet.balanceCents).toBe(101);
    expect(s.read().alipay.balance.total).toBe(0);
    expect(s.read().wechat.payLedger.transactions).toEqual([]);
    expect(s.controller.canUndo()).toBe(true);
    s.controller.undo(); expect(s.read()).toEqual(before);
    expect(s.controller.canUndo()).toBe(false);
  });
  it('validates the entire request before writing either account', () => {
    const s = setup(); const before = structuredClone(s.read());
    expect(() => s.controller.execute({ type: 'balance', wechat: '10', alipay: '-1' })).toThrow();
    expect(s.read()).toEqual(before);
  });
  it('prepares a per-platform shortage and repeat loading never duplicates fixtures', () => {
    const s = setup();
    s.controller.execute({ type: 'scenario', scenario: 'shortfall' });
    expect(s.read().wechat.wallet.balanceCents).toBe(500);
    expect(s.read().alipay.balance.total).toBe(1000);
    expect(s.read().wechat.subscriptions[0]).toMatchObject({ price: 25, autoRenew: true, nextChargeAt: start + 86400000 });
    s.controller.execute({ type: 'scenario', scenario: 'shortfall' });
    expect(s.read().wechat.subscriptions).toHaveLength(1);
    expect(s.read().wechat.payLedger.transactions).toEqual([]);
  });
  it('creates a near renewal without overwriting existing balances or contracts', () => {
    const s = setup(); s.mutate(state => state.wechat.subscriptions.push({ id: 'user', membershipType: 'User', source: 'User', autoRenew: false, price: 1, billingCycle: '月', createdAt: start }));
    s.controller.execute({ type: 'scenario', scenario: 'renewal' });
    expect(s.read().wechat.subscriptions.some(item => item.id === 'user')).toBe(true);
    expect(s.read().wechat.wallet.balanceCents).toBe(10000);
  });
  it('creates subscriptions on both platforms for duplicate detection', () => {
    const s = setup(); s.controller.execute({ type: 'scenario', scenario: 'duplicate' });
    expect(s.read().wechat.subscriptions[0].membershipType).toContain('视频');
    expect(s.read().alipay.subscriptions[0].membershipType).toContain('视频');
  });
  it('injects labelled historical recurring bills, not a signed subscription or new debit', () => {
    const s = setup(); s.controller.execute({ type: 'scenario', scenario: 'recurring' });
    expect(s.read().wechat.payLedger.transactions).toHaveLength(4);
    expect(s.read().wechat.subscriptions).toEqual([]);
    expect(s.read().wechat.wallet.balanceCents).toBe(10000);
    expect(s.read().wechat.payLedger.transactions.every(item => item.amountCents === 1800 && item.occurredAt < new Date(start).toISOString())).toBe(true);
    s.controller.execute({ type: 'scenario', scenario: 'recurring' });
    expect(s.read().wechat.payLedger.transactions).toHaveLength(4);
  });
  it('advances time, debits through real billing engines and keeps repeated settlement idempotent', () => {
    const s = setup(); s.controller.execute({ type: 'scenario', scenario: 'renewal' });
    const result = s.controller.execute({ type: 'advance', days: 1 });
    expect(s.time()).toBe(start + 86400000);
    expect(result.charged).toBe(1);
    expect(s.read().wechat.wallet.balanceCents).toBe(7500);
    expect(s.read().wechat.payLedger.transactions[0].amountCents).toBe(2500);
    expect(s.controller.execute({ type: 'settle' }).charged).toBe(0);
    expect(s.controller.canUndo()).toBe(false);
  });
  it('reports insufficient balance and successfully retries after top-up', () => {
    const s = setup(); s.controller.execute({ type: 'scenario', scenario: 'shortfall' });
    expect(s.controller.execute({ type: 'advance', days: 1 }).failed).toBe(1);
    expect(s.read().wechat.wallet.balanceCents).toBe(500);
    s.controller.execute({ type: 'balance', wechat: '30', alipay: '1000' });
    expect(s.controller.execute({ type: 'settle' }).charged).toBe(1);
    expect(s.read().wechat.wallet.balanceCents).toBe(500);
  });
  it('does not charge cancelled subscriptions', () => {
    const s = setup(); s.controller.execute({ type: 'scenario', scenario: 'duplicate' });
    s.mutate(state => { state.wechat.subscriptions[0].autoRenew = false; });
    expect(s.controller.execute({ type: 'advance', days: 3 }).charged).toBe(1);
    expect(s.read().alipay.transferRecords).toHaveLength(1);
    expect(s.read().alipay.balance.total).toBe(175);
  });
  it('blocks undo after financial activity rather than erasing payments', () => {
    const s = setup(); s.controller.execute({ type: 'balance', wechat: '20', alipay: '10' });
    s.mutate(state => { state.wechat.wallet.balanceCents -= 100; });
    expect(s.controller.canUndo()).toBe(false);
    expect(() => s.controller.undo()).toThrow();
    expect(s.read().wechat.wallet.balanceCents).toBe(1900);
  });
  it('rejects unsupported commands or clock jumps and retains the previous undo', () => {
    const s = setup(); s.controller.execute({ type: 'balance', wechat: '20', alipay: '10' });
    expect(() => s.controller.execute({ type: 'advance', days: -1 })).toThrow();
    expect(() => s.controller.execute({ type: 'advance', days: 1.5 })).toThrow();
    expect(() => s.controller.execute({ type: 'scenario', scenario: 'invalid' } as never)).toThrow();
    expect(() => s.controller.execute({ type: 'invalid' } as never)).toThrow();
    expect(s.controller.canUndo()).toBe(true);
    expect(s.time()).toBe(start);
  });
});
