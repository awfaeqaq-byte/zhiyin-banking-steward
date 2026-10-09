import { describe, expect, it, vi } from 'vitest';
import { resetSteward } from '../sandbox/steward-reset';

function storage() {
  const values = new Map([
    ['zhiyin-expense-scope', '11111111-1111-4111-8111-111111111111'],
    ['zhiyin-steward-conversation-v1', 'old conversation'],
    ['zhiyin-bill-scenes-v1', 'old bill'], ['zhiyin-workspace-active', 'task'],
    ['zhiyin-connections', 'authorized'], ['zhiyin-financial-grants-v1', 'authorized'],
    ['wechat', 'wallet'], ['zhiyin-mode', 'native'],
  ]);
  return { values, getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key), setItem: (key: string, value: string) => values.set(key, value) };
}
describe('沙箱重置宁宁', () => {
  it('先停止旧页面，后端确认成功才清理本地对话；保留授权、资金、配置', async () => {
    const local = storage(), calls: string[] = [];
    const request = vi.fn(async (_url, init) => { calls.push('request'); expect(init.headers['X-Zhiyin-Expense-Scope']).toContain('11111111'); return new Response(JSON.stringify({ reset: true, backupId: 'backup', memoryRevision: 8 })); });
    const result = await resetSteward({ storage: local, stop: () => { calls.push('stop'); }, request });
    expect(calls).toEqual(['stop', 'request']);
    expect(result.backupId).toBe('backup');
    for (const key of ['zhiyin-steward-conversation-v1', 'zhiyin-bill-scenes-v1', 'zhiyin-workspace-active']) expect(local.getItem(key)).toBeNull();
    for (const key of ['zhiyin-connections', 'zhiyin-financial-grants-v1', 'wechat', 'zhiyin-mode']) expect(local.getItem(key)).not.toBeNull();
    expect(local.getItem('zhiyin-memory-revision')).toBe('8');
  });
  it('失败时保留聊天且不冒充重置成功', async () => {
    const local = storage();
    await expect(resetSteward({ storage: local, stop: vi.fn(), request: vi.fn(async () => new Response(JSON.stringify({ error: '记录正在保存，请重试' }), { status: 409 })) })).rejects.toThrow('记录正在保存');
    expect(local.getItem('zhiyin-steward-conversation-v1')).toBe('old conversation');
  });
});
