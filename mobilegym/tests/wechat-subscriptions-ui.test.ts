import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('WeChat automatic renewal UI contract', () => {
  it('offers a discoverable add action and only renders active services', () => {
    const page = read('apps/Wechat/pages/settings/Subscriptions.tsx');
    const topBar = read('apps/Wechat/components/TopBar.tsx');

    expect(page).toContain('filter(subscription => subscription.autoRenew)');
    expect(topBar).toContain("'subscription.add.open'");
    expect(topBar).toContain("path === '/settings/subscriptions'");
  });

  it('provides a real add form for service, merchant, price and billing cycle', () => {
    const page = read('apps/Wechat/pages/settings/SubscriptionAddPage.tsx');

    expect(page).toContain('subscription_add_service_name');
    expect(page).toContain('subscription_add_merchant');
    expect(page).toContain('subscription_add_price');
    expect(page).toContain('subscription_add_cycle');
    expect(page).toContain("'subscription.add.confirm'");
    expect(page).toContain('getWechatSubscriptionBackend');
  });

  it('routes into the add form and persists cancellation through the backend', () => {
    const app = read('apps/Wechat/WechatApp.tsx');
    const navigation = read('apps/Wechat/navigation.declaration.ts');
    const detail = read('apps/Wechat/pages/settings/SubscriptionDetailPage.tsx');

    expect(app).toContain('path="settings/subscriptions/add"');
    expect(navigation).toContain("id: 'subscription.add.open'");
    expect(navigation).toContain("id: 'subscription.add.confirm'");
    expect(detail).toContain('getWechatSubscriptionBackend');
    expect(detail).toContain('await backend.cancel');
  });

  it('keeps the list keyboard reachable and the destructive confirmation accessible', () => {
    const list = read('apps/Wechat/pages/settings/Subscriptions.tsx');
    const detail = read('apps/Wechat/pages/settings/SubscriptionDetailPage.tsx');

    expect(list).toContain('<button');
    expect(list).toContain('bindTap<HTMLButtonElement>');
    expect(detail).toContain('role="dialog"');
    expect(detail).toContain('aria-modal="true"');
    expect(detail).toContain('aria-labelledby="subscription-cancel-title"');
    expect(detail).toContain("event.key === 'Escape'");
    expect(detail).toContain('cancellingRef.current');
    expect(detail).toContain('tabIndex={-1}');
  });

  it('settles renewals with the system clock and exposes the billing schedule', () => {
    const app = read('apps/Wechat/WechatApp.tsx');
    const detail = read('apps/Wechat/pages/settings/SubscriptionDetailPage.tsx');
    const ledger = read('apps/Wechat/pages/pay/ledger/WechatPayLedgerPages.tsx');

    expect(app).toContain('SubscriptionBillingWatcher');
    expect(app).toContain('ACTION_TIME_TICK');
    expect(app).toContain('settleDueCharges');
    expect(detail).toContain('subscription_detail_next_charge');
    expect(detail).toContain('subscription_detail_last_charge');
    expect(ledger).toContain('latestLedgerMonth');
    expect(read('apps/Wechat/pay-ledger/useWechatPayLedger.ts')).toContain('useWechatStore');
  });
});
