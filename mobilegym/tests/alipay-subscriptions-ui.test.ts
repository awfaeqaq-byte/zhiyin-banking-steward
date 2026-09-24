import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Alipay automatic renewal UI contract', () => {
  it('provides active list, add and detail routes instead of an immediate-charge demo form', () => {
    const app = read('apps/Alipay/AlipayApp.tsx');
    const list = read('apps/Alipay/pages/SubscriptionsPage.tsx');

    expect(app).toContain('settings/payment/subscriptions/add');
    expect(app).toContain('settings/payment/subscriptions/:id');
    expect(list).toContain('filter(subscription => subscription.autoRenew)');
    expect(list).toContain('subscription.add.open');
    expect(list).not.toContain('recordTransfer');
  });

  it('settles renewals on app launch and simulated time changes', () => {
    const app = read('apps/Alipay/AlipayApp.tsx');

    expect(app).toContain('AlipaySubscriptionBillingWatcher');
    expect(app).toContain('ACTION_TIME_TICK');
    expect(app).toContain('ACTION_TIME_SET');
    expect(app).toContain('settleDueCharges');
  });

  it('shows the real schedule and links the latest charge to Alipay bills', () => {
    const detail = read('apps/Alipay/pages/SubscriptionDetailPage.tsx');

    expect(detail).toContain('nextChargeAt');
    expect(detail).toContain('lastChargedAt');
    expect(detail).toContain('subscription.bill.open');
    expect(detail).toContain('backend.cancel');
    expect(detail).toContain('aria-modal="true"');
  });

  it('keeps assets derived from the shared real balance', () => {
    const assets = read('apps/Alipay/pages/TotalAssetsPage.tsx');
    const finance = read('apps/Alipay/pages/FinancePage.tsx');

    expect(assets).toContain('useAlipayStore(s => s.balance)');
    expect(finance).toContain('useAlipayStore(state => state.balance)');
  });
});
