import { expect, it, vi } from 'vitest';
import { create } from 'zustand';

vi.mock('../os/createAppStore', () => ({
  memoSelector: (select: unknown) => select,
  createAppStoreWithActions: (_id: string, initial: object, actions: Function) => {
    const store = create((set, get) => ({ ...initial, ...actions(set, get) }));
    return Object.assign(store, { persist: { hasHydrated: () => true } });
  },
}));
vi.mock('../apps/Wechat/data', () => ({ getWechatConfig: () => ({
  user: { wxid: 'self', name: '测试用户' }, contacts: [], chats: [], settings: {},
}) }));
vi.mock('../os/SmsGateway', () => ({ SmsGateway: {} }));
vi.mock('../os/managers/registry', () => ({ getEffectiveBuildInfo: vi.fn() }));
vi.mock('../os/TimeService', () => ({
  now: () => 1700000000000,
  getDate: () => new Date(1700000000000),
  fromTimestamp: (value: number) => new Date(value),
}));
vi.mock('../os/NetworkService', () => ({ netJson: vi.fn() }));
import { netJson } from '../os/NetworkService';
import { useWechatStore } from '../apps/Wechat/state';
import { NINGNING_WXID } from '../apps/Wechat/chat-ai/zhiyin';

it('单轮等待期间阻止重复发送；失败保留原话，重试只追加一条回答', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let reject!: (error: Error) => void;
  vi.mocked(netJson).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const texts = () => useWechatStore.getState().chats.find(c => c.id === NINGNING_WXID)!.messages.filter(m => m.type === 'text');
  const initialCount = texts().length;
  try {
    useWechatStore.getState().sendMessage(NINGNING_WXID, '先帮我梳理AA方案');
    useWechatStore.getState().sendMessage(NINGNING_WXID, '重复提交');
    expect(netJson).toHaveBeenCalledTimes(1);
    expect(texts()).toHaveLength(initialCount + 1);
    expect(useWechatStore.getState()._temp.aiReplyPendingByWxid[NINGNING_WXID]).toBe(true);
    reject(new Error('503'));
    await vi.waitFor(() => expect(useWechatStore.getState()._temp.ningningReplyFailed).toBe(true));
    expect(texts().at(-1)?.content).toBe('先帮我梳理AA方案');
    vi.mocked(netJson).mockResolvedValueOnce({ output_text: '先确认参与人。' });
    useWechatStore.getState().retryNingningReply();
    await vi.waitFor(() => expect(texts().at(-1)?.content).toBe('先确认参与人。'));
    expect(texts()).toHaveLength(initialCount + 2);
    expect(useWechatStore.getState()._temp.ningningReplyFailed).toBe(false);
    expect(useWechatStore.getState()._temp.aiReplyPendingByWxid[NINGNING_WXID]).toBeUndefined();
    useWechatStore.getState().retryNingningReply();
    expect(netJson).toHaveBeenCalledTimes(2);
  } finally { log.mockRestore(); }
});
