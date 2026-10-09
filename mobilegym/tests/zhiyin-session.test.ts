import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhoneSession } from '../apps/Zhiyin/phone-session';
import { manifest } from '../apps/Zhiyin/manifest';
import launcherDefaults from '../os/launcher/defaults.json';
import contactsDefaults from '../os/providers/defaults/contacts.json';
import { PERMISSIONS } from '../os/permissions';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(foodOrder?: (operation:string,payload:Record<string,unknown>)=>Promise<Record<string,unknown>>) {
  const peer = { postMessage: vi.fn() } as unknown as Window;
  const onStatus = vi.fn();
  const onExit = vi.fn();
  const isActive = vi.fn(() => true);
  const loadContacts = vi.fn(async () => ({
    status: 'granted' as const,
    contacts: [{ id: 'c_mother', displayName: '妈妈', phoneLast4: '6621', avatarColor: '#E4A36F' }],
  }));
  const loadFinancialSource = vi.fn(async () => ({ status: 'granted' as const, source: {
    provider: 'alipay', displayName: '支付宝', accountMasked: '叶先生', syncedAt: '2026-09-15T09:41:00+08:00',
    balance: 100_000, transactions: [], autopays: [],
  } }));
  const authorizeFinancialSource = vi.fn(async () => true);
  const hasFinancialAuthorization = vi.fn(() => true);
  const revokeFinancialAuthorization = vi.fn(() => true);
  const cancelFinancialAutopay = vi.fn(async (provider: string, subscriptionId: string) => ({
    status: 'cancelled' as const, provider, subscriptionId,
  }));
  const origin = 'http://localhost:3000';
  const session = createPhoneSession({
    origin, peer: () => peer, onStatus, onExit, isActive, loadContacts, foodOrder,
    loadFinancialSource, authorizeFinancialSource, hasFinancialAuthorization,
    revokeFinancialAuthorization, cancelFinancialAutopay,
  });
  const receive = (data: object, from = origin, source = peer) => session.receive({
    origin: from, source, data: { channel: 'zhiyin-phone', version: 1, ...data },
  });
  return {
    session, receive, peer, onStatus, onExit, isActive, loadContacts,
    loadFinancialSource, authorizeFinancialSource, hasFinancialAuthorization,
    revokeFinancialAuthorization, cancelFinancialAutopay,
  };
}

describe('Zhiyin phone app', () => {
  it('只接受可信且前台的点餐请求，并去重在途请求与返回核对错误', async () => {
    const foodOrder=vi.fn(async()=>({status:'ok',orderId:'order-1'}));
    const x=setup(foodOrder),request={type:'food-order-request',requestId:'food-1',operation:'prepare',taskId:'task',orderId:'order-1',authorized:true};
    x.receive(request,'http://untrusted.example');x.receive(request,undefined,{} as Window);
    x.isActive.mockReturnValue(false);x.receive(request);x.isActive.mockReturnValue(true);
    x.receive({...request,operation:'pay'});expect(foodOrder).not.toHaveBeenCalled();
    x.receive(request);x.receive(request);await vi.runAllTimersAsync();
    expect(foodOrder).toHaveBeenCalledOnce();expect(foodOrder).toHaveBeenCalledWith('prepare',expect.objectContaining({taskId:'task',authorized:true}));
    expect(x.peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'food-order-result',requestId:'food-1',orderId:'order-1'}),'http://localhost:3000');
    foodOrder.mockRejectedValueOnce(new Error('菜单价格变化'));x.receive({...request,requestId:'food-2'});await vi.runAllTimersAsync();
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'food-order-result',status:'error',message:'菜单价格变化'}),'http://localhost:3000');
    x.session.dispose();
  });
  it('notifies the ready webview on foreground, but not while backgrounded', () => {
    const x = setup();
    x.session.foreground();
    expect(x.peer.postMessage).not.toHaveBeenCalled();
    x.receive({ type: 'ready' });
    x.session.foreground();
    expect(x.peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'foreground' }), 'http://localhost:3000');
    vi.mocked(x.peer.postMessage).mockClear();
    x.isActive.mockReturnValue(false);
    x.session.foreground();
    expect(x.peer.postMessage).not.toHaveBeenCalled();
    x.session.dispose();
  });
  it('ships a first-screen Zhiyin shortcut and preserves the requested upstream theme', () => {
    expect(launcherDefaults.screen1.pinnedApps.some(app => app.appId === 'zhiyin')).toBe(true);
    expect(launcherDefaults.screen1.widgets.some(widget => widget.widgetType === 'wmr')).toBe(true);
    expect(launcherDefaults.wallpaper.imageUrl).toContain('themes/');
  });
  it('registers an independent app with the existing brand', () => {
    expect(manifest.id).toBe('zhiyin');
    expect(manifest.displayName).toBe('知银');
    expect(manifest.theme.colors.primary).toBe('#206a70');
    expect(manifest.permissions).toContain(PERMISSIONS.READ_CONTACTS);
  });
  it('ships the banking beneficiaries in the shared system contacts', () => {
    const mother = contactsDefaults.contacts.find(contact => contact.displayName === '妈妈');
    expect(mother?.phones[0]?.number.replace(/\D/g, '').endsWith('6621')).toBe(true);
  });
  it('returns sanitized contacts only for a trusted, active WebView request', async () => {
    const x = setup();
    x.receive({ type: 'contacts-request', requestId: 'contacts-1' });
    await vi.runAllTimersAsync();
    expect(x.loadContacts).toHaveBeenCalledOnce();
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'contacts-result', requestId: 'contacts-1', status: 'granted',
      contacts: [expect.objectContaining({ displayName: '妈妈', phoneLast4: '6621' })],
    }), 'http://localhost:3000');
  });
  it('returns a financial source only for a trusted, active scoped request', async () => {
    const x = setup();
    x.receive({ type: 'finance-source-request', requestId: 'finance-1', provider: 'alipay', scopes: ['balance', 'unknown'] });
    await vi.runAllTimersAsync();
    expect(x.authorizeFinancialSource).toHaveBeenCalledWith('alipay', ['balance']);
    expect(x.loadFinancialSource).toHaveBeenCalledWith('alipay', ['balance']);
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-source-result', requestId: 'finance-1', status: 'granted',
    }), 'http://localhost:3000');
  });
  it('refreshes an already-authorized source without reopening partner consent', async () => {
    const x = setup();
    x.receive({ type: 'finance-source-refresh-request', requestId: 'refresh-1', provider: 'alipay', scopes: ['autopay'] });
    await vi.runAllTimersAsync();
    expect(x.authorizeFinancialSource).not.toHaveBeenCalled();
    expect(x.loadFinancialSource).toHaveBeenCalledWith('alipay', ['autopay']);
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-source-result', requestId: 'refresh-1', status: 'granted',
    }), 'http://localhost:3000');
  });
  it('refuses background refresh and cancellation after the provider grant is missing', async () => {
    const x = setup();
    x.hasFinancialAuthorization.mockReturnValue(false);
    x.receive({ type: 'finance-source-refresh-request', requestId: 'refresh-denied', provider: 'alipay', scopes: ['autopay'] });
    x.receive({ type: 'finance-autopay-cancel-request', requestId: 'cancel-denied', provider: 'alipay', subscriptionId: 'sub-video' });
    await vi.runAllTimersAsync();
    expect(x.loadFinancialSource).not.toHaveBeenCalled();
    expect(x.cancelFinancialAutopay).not.toHaveBeenCalled();
    expect(x.peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'finance-source-result', requestId: 'refresh-denied', status: 'denied',
    }), 'http://localhost:3000');
    expect(x.peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'finance-autopay-cancel-result', requestId: 'cancel-denied', status: 'error',
    }), 'http://localhost:3000');
  });
  it('revokes the persisted provider grant and acknowledges disconnect', async () => {
    const x = setup();
    x.receive({ type: 'finance-source-revoke-request', requestId: 'revoke-1', provider: 'wechat_pay' });
    await vi.runAllTimersAsync();
    expect(x.revokeFinancialAuthorization).toHaveBeenCalledWith('wechat_pay');
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-source-revoke-result', requestId: 'revoke-1', provider: 'wechat_pay', status: 'revoked',
    }), 'http://localhost:3000');
  });
  it('reports a provider grant that could not be revoked', async () => {
    const x = setup();
    x.revokeFinancialAuthorization.mockReturnValue(false);
    x.receive({ type: 'finance-source-revoke-request', requestId: 'revoke-failed', provider: 'alipay' });
    await vi.runAllTimersAsync();
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-source-revoke-result', requestId: 'revoke-failed', provider: 'alipay', status: 'error',
    }), 'http://localhost:3000');
  });
  it('does not read financial data when the partner app denies consent', async () => {
    const x = setup();
    x.authorizeFinancialSource.mockResolvedValue(false);
    x.receive({ type: 'finance-source-request', requestId: 'finance-1', provider: 'wechat_pay', scopes: ['balance', 'transactions'] });
    await vi.runAllTimersAsync();
    expect(x.loadFinancialSource).not.toHaveBeenCalled();
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-source-result', requestId: 'finance-1', status: 'denied',
    }), 'http://localhost:3000');
  });
  it('cancels only a trusted, explicit and well-formed subscription request', async () => {
    const x = setup();
    x.receive({ type: 'finance-autopay-cancel-request', requestId: 'cancel-1', provider: 'wechat_pay', subscriptionId: 'sub-music' });
    await vi.runAllTimersAsync();
    expect(x.cancelFinancialAutopay).toHaveBeenCalledWith('wechat_pay', 'sub-music');
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-autopay-cancel-result', requestId: 'cancel-1', status: 'cancelled',
    }), 'http://localhost:3000');

    x.receive({ type: 'finance-autopay-cancel-request', requestId: 'cancel-2', provider: 'wechat_pay', subscriptionId: '' });
    expect(x.cancelFinancialAutopay).toHaveBeenCalledTimes(1);
  });
  it('keeps provider identity on a failed partner cancellation reply', async () => {
    const x = setup();
    x.cancelFinancialAutopay.mockRejectedValue(new Error('平台暂时不可用'));
    x.receive({ type: 'finance-autopay-cancel-request', requestId: 'cancel-failed', provider: 'alipay', subscriptionId: 'sub-video' });
    await vi.runAllTimersAsync();
    expect(x.peer.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'finance-autopay-cancel-result', requestId: 'cancel-failed', status: 'error',
      provider: 'alipay', subscriptionId: 'sub-video', message: '平台暂时不可用',
    }), 'http://localhost:3000');
  });
  it('requires the correct origin, frame and protocol before accepting ready', () => {
    const x = setup();
    x.receive({ type: 'ready' }, 'https://other.example');
    x.receive({ type: 'ready' }, 'http://localhost:3000', {} as Window);
    x.receive({ type: 'ready', version: 2 });
    expect(x.onStatus).not.toHaveBeenCalledWith('ready');
    x.session.ping();
    expect(x.peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ping' }), 'http://localhost:3000');
    x.receive({ type: 'ready' });
    expect(x.onStatus).toHaveBeenLastCalledWith('ready');
    x.session.dispose();
  });
  it('correlates back replies and prevents double navigation', () => {
    const x = setup();
    x.receive({ type: 'ready' });
    expect(x.session.back()).toBe(true);
    expect(x.session.back()).toBe(true);
    expect(x.peer.postMessage).toHaveBeenCalledTimes(1);
    const packet = vi.mocked(x.peer.postMessage).mock.calls[0][0];
    x.receive({ type: 'back-result', requestId: 'stale', handled: false });
    expect(x.onExit).not.toHaveBeenCalled();
    x.receive({ type: 'back-result', requestId: packet.requestId, handled: true });
    expect(x.onExit).not.toHaveBeenCalled();
    x.session.back();
    const next = vi.mocked(x.peer.postMessage).mock.calls[1][0];
    x.receive({ type: 'back-result', requestId: next.requestId, handled: false });
    expect(x.onExit).toHaveBeenCalledOnce();
    x.session.dispose();
  });
  it('does not steal focus from another app on a delayed reply or timeout', () => {
    const x = setup();
    x.receive({ type: 'ready' });
    x.session.back();
    x.isActive.mockReturnValue(false);
    vi.advanceTimersByTime(1000);
    expect(x.onExit).not.toHaveBeenCalled();
    x.session.dispose();
  });
  it('reports load failure, supports retry, and clears timers on disposal', () => {
    const x = setup();
    expect(x.session.back()).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(x.onStatus).toHaveBeenLastCalledWith('error');
    x.session.reload();
    expect(x.onStatus).toHaveBeenLastCalledWith('loading');
    x.receive({ type: 'ready' });
    x.session.back();
    vi.advanceTimersByTime(1000);
    expect(x.onExit).toHaveBeenCalledOnce();
    x.session.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
