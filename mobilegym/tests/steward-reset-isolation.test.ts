import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const browserWindow = new JSDOM('', { url: 'http://localhost/' }).window;
const native = {
  getItem: browserWindow.Storage.prototype.getItem,
  setItem: browserWindow.Storage.prototype.setItem,
  removeItem: browserWindow.Storage.prototype.removeItem,
  clear: browserWindow.Storage.prototype.clear,
};
const scope = '22222222-2222-4222-8222-222222222222';
const parentScope = '11111111-1111-4111-8111-111111111111';
const conversationKey = 'zhiyin-steward-conversation-v1';
const oldMessages = JSON.stringify([{ id: 'old', role: 'user', content: '原来的聊天' }]);
const readOrigin = (key: string) => native.getItem.call(localStorage, key);
const writeOrigin = (key: string, value: string) => native.setItem.call(localStorage, key, value);

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', browserWindow);
  vi.stubGlobal('Storage', browserWindow.Storage);
  vi.stubGlobal('localStorage', browserWindow.localStorage);
  vi.stubGlobal('sessionStorage', browserWindow.sessionStorage);
  native.clear.call(localStorage);
  sessionStorage.clear();
  window.name = '';
  window.history.replaceState({}, '', '/?storageIsolation=tab');
});
afterEach(() => {
  Object.assign(Storage.prototype, native);
  Reflect.deleteProperty(Storage.prototype, '__MG_LOCALSTORAGE_NS_PATCH__');
  native.clear.call(localStorage);
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('重置知银内嵌页面，不清错沙箱隔离存储', () => {
  it.each(['tab', 'load', 'off'])('%s 模式：清理实际聊天，重开内嵌页面也不会恢复，并使用真实后台任务 scope', async mode => {
    window.history.replaceState({}, '', `/?storageIsolation=${mode}`);
    const { installLocalStorageNamespacing } = await import('../os/storageIsolation');
    installLocalStorageNamespacing();
    // MobileGym namespaces its own realm; the same-origin Zhiyin iframe does not.
    localStorage.setItem('wechat', 'wallet and chats');
    localStorage.setItem('zhiyin-financial-grants-v1', 'platform consent');
    if (mode !== 'off') localStorage.setItem('zhiyin-expense-scope', parentScope);
    writeOrigin('zhiyin-expense-scope', scope);
    writeOrigin(conversationKey, oldMessages);
    writeOrigin('zhiyin-steward-chat-v3', oldMessages);
    writeOrigin('zhiyin-workspace-active', 'aa-task');
    writeOrigin('zhiyin-connections', 'authorized');
    writeOrigin('zhiyin-mode', 'native');
    const calls: string[] = [];
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      calls.push('request');
      expect(new Headers(init?.headers).get('X-Zhiyin-Expense-Scope')).toBe(scope);
      return new Response(JSON.stringify({ reset: true, backupId: 'test', memoryRevision: 4 }));
    });
    const { resetSteward } = await import('../sandbox/steward-reset');
    await resetSteward({ stop: () => { calls.push('stop'); }, request });
    expect(calls).toEqual(['stop', 'request']);
    // Reopening creates a fresh iframe realm and reads the unprefixed keys again.
    expect(JSON.parse(readOrigin(conversationKey) || '[]')).toEqual([]);
    expect(readOrigin('zhiyin-steward-chat-v3')).toBeNull();
    expect(readOrigin('zhiyin-workspace-active')).toBeNull();
    expect(readOrigin('zhiyin-memory-revision')).toBe('4');
    expect(readOrigin('zhiyin-expense-scope')).toBe(scope);
    expect(readOrigin('zhiyin-connections')).toBe('authorized');
    expect(readOrigin('zhiyin-mode')).toBe('native');
    expect(localStorage.getItem('wechat')).toBe('wallet and chats');
    expect(localStorage.getItem('zhiyin-financial-grants-v1')).toBe('platform consent');
    if (mode !== 'off') expect(localStorage.getItem('zhiyin-expense-scope')).toBe(parentScope);
  });

  it('即使知银未打开也读取原来的 scope；后台失败不能清除实际聊天', async () => {
    const { installLocalStorageNamespacing } = await import('../os/storageIsolation');
    installLocalStorageNamespacing();
    writeOrigin('zhiyin-expense-scope', scope);
    writeOrigin(conversationKey, oldMessages);
    const { resetSteward } = await import('../sandbox/steward-reset');
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      expect(new Headers(init?.headers).get('X-Zhiyin-Expense-Scope')).toBe(scope);
      return new Response(JSON.stringify({ error: '忙碌' }), { status: 409 });
    });
    await expect(resetSteward({ stop: vi.fn(), request })).rejects.toThrow('忙碌');
    expect(readOrigin(conversationKey)).toBe(oldMessages);
  });

  it('热更新还留着旧隔离补丁时要求刷新，不向错误 scope 发出重置请求', async () => {
    Object.defineProperty(Storage.prototype, '__MG_LOCALSTORAGE_NS_PATCH__', {
      configurable: true, value: { namespace: 'legacy' },
    });
    writeOrigin(conversationKey, oldMessages);
    const { resetSteward } = await import('../sandbox/steward-reset');
    const request = vi.fn<typeof fetch>(), stop = vi.fn();
    await expect(resetSteward({ request, stop })).rejects.toThrow('请先刷新整个沙箱页面');
    expect(request).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(readOrigin(conversationKey)).toBe(oldMessages);
  });
});
