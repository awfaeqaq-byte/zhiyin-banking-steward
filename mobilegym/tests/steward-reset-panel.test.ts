// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StewardResetPanel } from '../sandbox/StewardResetPanel';
import { resetSteward } from '../sandbox/steward-reset';
vi.mock('../sandbox/steward-reset', () => ({ resetSteward: vi.fn() }));
let root: Root, host: HTMLDivElement;
async function mount(disabled = false, onBusyChange = vi.fn()) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(StewardResetPanel, { disabled, onBusyChange })));
  return onBusyChange;
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === label);
  if (!button) throw new Error('missing button ' + label);
  await act(async () => button.click());
}
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe('重置确认交互', () => {
  it('点入口仅确认，取消不清数据，禁用不执行', async () => {
    await mount(); await click('重置宁宁');
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('连接授权');
    expect(vi.mocked(resetSteward)).not.toHaveBeenCalled();
    await click('取消'); expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => root.render(React.createElement(StewardResetPanel, { disabled: true })));
    await click('重置宁宁'); expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it('确认后才重置，忙时不可重复提交，成功展示结果', async () => {
    let resolve!: (value: { reset: true; backupId: string; memoryRevision: number }) => void;
    vi.mocked(resetSteward).mockImplementation(() => new Promise(done => { resolve = done; }));
    const busy = await mount(); await click('重置宁宁'); await click('确认重置');
    await click('正在重置…'); expect(resetSteward).toHaveBeenCalledTimes(1);
    expect(host.querySelector('button')?.disabled).toBe(true);
    await act(async () => resolve({ reset: true, backupId: 'test', memoryRevision: 1 }));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('宁宁已重置');
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
  it('失败显示原因并允许再次确认，不显示成功', async () => {
    vi.mocked(resetSteward).mockRejectedValue(new Error('记录正在保存'));
    await mount(); await click('重置宁宁'); await click('确认重置');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('记录正在保存');
    expect(host.querySelector('[role="status"]')).toBeNull();
    await click('重置宁宁'); expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
