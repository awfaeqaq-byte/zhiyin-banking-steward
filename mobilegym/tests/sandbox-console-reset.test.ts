import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../os/TimeService',async importOriginal=>({...await importOriginal<object>(),now:()=>123}));

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe('sandbox console WeChat reset', () => {
  afterEach(()=>vi.restoreAllMocks());
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      configurable: true,
    });
  });

  it('restores only WeChat chat data and reports what changed', async () => {
    const { useWechatStore } = await import('../apps/Wechat/state');
    const { getWechatConfig } = await import('../apps/Wechat/data');
    const { resetWechatChats } = await import('../sandbox/actions');
    const {ensureNingningContact}=await import('../apps/Wechat/chat-ai/zhiyin');
    const config=getWechatConfig();
    const initialChats=ensureNingningContact({contacts:structuredClone(config.contacts),chats:structuredClone(config.chats)},123).chats;
    const walletBefore = structuredClone(useWechatStore.getState().wallet);
    const mutatedChats = structuredClone(initialChats);
    mutatedChats[0].messages.push({
      id: 'sandbox-extra-message',
      type: 'text',
      content: '演示过程中新增的消息',
      senderId: 'xiaoming001',
      timestamp: 123,
    });
    useWechatStore.setState(state => ({
      chats: mutatedChats,
      _temp: {
        ...state._temp,
        aiReplyPendingByWxid: { wxid_lina_lina: true },
      },
    }));

    const result = resetWechatChats();

    expect(result).toEqual({
      conversations: initialChats.length,
      removedMessages: 1,
      restoredMessages: initialChats.reduce((sum, chat) => sum + chat.messages.length, 0),
    });
    expect(useWechatStore.getState().chats).toEqual(initialChats);
    expect(useWechatStore.getState()._temp.aiReplyPendingByWxid).toEqual({});
    expect(useWechatStore.getState().wallet).toEqual(walletBefore);
  });

  it('is idempotent when chats are already at their initial state', async () => {
    const { resetWechatChats } = await import('../sandbox/actions');

    const result = resetWechatChats();

    expect(result.removedMessages).toBe(0);
    const {useWechatStore}=await import('../apps/Wechat/state');
    expect(result.restoredMessages).toBe(useWechatStore.getState().chats.reduce((sum,chat)=>sum+chat.messages.length,0));
    expect(useWechatStore.getState().chats.some(chat=>chat.id==='zhiyin_ningning')).toBe(true);
    expect(resetWechatChats().removedMessages).toBe(0);
  });
});
