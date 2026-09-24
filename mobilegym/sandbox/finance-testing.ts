import { fromTimestamp } from '../os/TimeService';
import { settleDueSubscriptionCharges, type SubscriptionBillingSnapshot } from '../apps/Wechat/subscriptions/billing';
import { settleDueAlipaySubscriptions, type AlipaySubscriptionBillingSnapshot } from '../apps/Alipay/subscriptions/billing';

export type FinanceTestSnapshot = { wechat: SubscriptionBillingSnapshot; alipay: AlipaySubscriptionBillingSnapshot };
export type TestScenario = 'renewal' | 'shortfall' | 'duplicate' | 'recurring';
export type FinanceTestCommand =
  | { type: 'balance'; wechat: string; alipay: string }
  | { type: 'scenario'; scenario: TestScenario }
  | { type: 'advance'; days: number }
  | { type: 'settle' };
export type FinanceTestResult = { charged: number; failed: number; amountCents: number; at: number; reversible: boolean };
type Dependencies = {
  read: () => FinanceTestSnapshot;
  write: (snapshot: FinanceTestSnapshot) => void;
  now: () => number;
  setTime: (timestamp: number) => void;
};
const DAY = 86_400_000;
const PREFIX = 'sandbox-test-';

export function parseTestMoney(raw: string): number {
  if (typeof raw !== 'string' || !/^\d+(\.\d{1,2})?$/.test(raw.trim())) throw new Error('请输入非负金额，最多两位小数');
  const cents = Math.round(Number(raw.trim()) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) throw new Error('测试余额不得超过 1,000,000 元');
  return cents;
}

/** Local testing only. No grants, contacts, messages, or unrelated applications are written. */
export function createFinanceTestController(deps: Dependencies) {
  let undoPoint: { before: FinanceTestSnapshot; after: string } | undefined;
  const fingerprint = (snapshot: FinanceTestSnapshot) => JSON.stringify(snapshot);
  function canUndo() { return Boolean(undoPoint && fingerprint(deps.read()) === undoPoint.after); }
  function undo() {
    if (!undoPoint || !canUndo()) throw new Error('财务数据已发生变化，不能撤销；请重新设置，避免覆盖后续支付或订阅操作');
    deps.write(structuredClone(undoPoint.before));
    undoPoint = undefined;
  }
  function execute(command: FinanceTestCommand): FinanceTestResult {
    const before = structuredClone(deps.read());
    const next = structuredClone(before);
    const now = deps.now();
    if (!Number.isFinite(now)) throw new Error('沙箱时间无效');
    let at = now;
    let charged = 0, failed = 0, amountCents = 0;
    let reversible = true;
    if (command.type === 'balance') {
      const wechat = parseTestMoney(command.wechat), alipay = parseTestMoney(command.alipay);
      next.wechat.wallet.balanceCents = wechat;
      next.alipay.balance.total = alipay / 100;
    } else if (command.type === 'scenario') {
      if (!['renewal', 'shortfall', 'duplicate', 'recurring'].includes(command.scenario)) throw new Error('未知测试场景');
      if (command.scenario === 'recurring') {
        // Synthetic history is explicitly not a new debit. Fixed IDs make repeated loading idempotent.
        const entries = Array.from({ length: 4 }, (_, i) => ({
          id: `${PREFIX}recurring-${i}`, direction: 'expense' as const, amountCents: 1800,
          category: 'service' as const, merchant: '测试云盘', note: '测试云盘空间服务（历史测试数据）',
          occurredAt: fromTimestamp(now - (1 + i * 30) * DAY).toISOString(), source: 'wechat_pay' as const,
        }));
        next.wechat.payLedger.transactions = [
          ...entries, ...next.wechat.payLedger.transactions.filter(item => !entries.some(entry => entry.id === item.id)),
        ];
      } else {
        const id = `${PREFIX}${command.scenario}`;
        const subscription = {
          id, membershipType: command.scenario === 'duplicate' ? '测试视频甲会员' : '测试音乐会员',
          source: '沙箱测试商户', price: 25, billingCycle: '月', autoRenew: true,
          createdAt: now, nextChargeAt: now + DAY,
        };
        const existing = next.wechat.subscriptions.find(item => item.id === id);
        // Preserve settlement linkage and schedule once a fixture has actually billed.
        next.wechat.subscriptions = [existing?.lastChargeTransactionId ? existing : subscription,
          ...next.wechat.subscriptions.filter(item => item.id !== id)];
        if (command.scenario === 'shortfall') {
          next.wechat.wallet.balanceCents = 500;
          next.alipay.balance.total = 1000;
        }
        if (command.scenario === 'duplicate') {
          const existingAlipay = next.alipay.subscriptions.find(item => item.id === id);
          next.alipay.subscriptions = [existingAlipay?.lastChargeRecordId ? existingAlipay : { ...subscription, membershipType: '测试视频乙会员', nextChargeAt: now + 2 * DAY },
            ...next.alipay.subscriptions.filter(item => item.id !== id)];
        }
      }
    } else if (command.type === 'advance' || command.type === 'settle') {
      if (command.type === 'advance') {
        if (!Number.isInteger(command.days) || command.days < 1 || command.days > 30) throw new Error('只能推进 1 至 30 个整天');
        at += command.days * DAY;
      }
      if (!Number.isFinite(fromTimestamp(at).getTime())) throw new Error('沙箱时间超出范围');
      const wx = settleDueSubscriptionCharges(next.wechat, at);
      const ali = settleDueAlipaySubscriptions(next.alipay, at);
      next.wechat = wx.snapshot; next.alipay = ali.snapshot;
      charged = wx.charged.length + ali.charged.length;
      failed = wx.failed.length + ali.failed.length;
      amountCents = wx.charged.reduce((sum, item) => sum + item.amountCents, 0)
        + ali.charged.reduce((sum, item) => sum + Math.round(-item.delta * 100), 0);
      reversible = false;
    } else throw new Error('未知测试操作');

    // Billing engines compute both snapshots before committing; the clock broadcast sees settled state.
    deps.write(next);
    undoPoint = reversible ? { before, after: fingerprint(next) } : undefined;
    if (command.type === 'advance') deps.setTime(at);
    return { at, charged, failed, amountCents, reversible };
  }
  return { execute, undo, canUndo };
}
