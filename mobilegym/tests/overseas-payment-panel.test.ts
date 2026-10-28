// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverseasPaymentTestPanel } from '../sandbox/OverseasPaymentTestPanel';
import { bankRequest, type BankSnapshot } from '../../src/lib/bank-transfer';

vi.mock('../../src/lib/bank-transfer', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/bank-transfer')>(), bankRequest: vi.fn(),
}));
const snapshot: BankSnapshot = { revision: 0, balance: 10000, limit: 2000000, frozen: false, controls: { overseas: false, night: false, contactless: true }, transactions: [] };
let root: Root, host: HTMLDivElement;
const request = vi.mocked(bankRequest);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  request.mockImplementation(async body => body ? { ...(body as { payment: object }).payment, completedAt: 100, balanceAfter: 9900 } : snapshot);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
async function mount(active = true, disabled = false, onBusyChange = vi.fn()) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(OverseasPaymentTestPanel, { active, disabled, onBusyChange })));
  return onBusyChange;
}
function button(label: string) {
  const value = [...host.querySelectorAll('button')].find(item => item.textContent === label);
  if (!value) throw new Error('Missing button: ' + label);
  return value;
}
async function click(label: string) { await act(async () => button(label).click()); }
const paymentCalls = () => request.mock.calls.filter(([body]) => Boolean(body));

describe('境外交易测试迁入沙箱控制台', () => {
  it('折叠时不读数据，需明确核对1元；取消与禁用不会付款', async () => {
    await mount(false); expect(request).not.toHaveBeenCalled();
    await act(async () => root.render(React.createElement(OverseasPaymentTestPanel, { active: true })));
    await click('测试境外付款');
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('¥1.00');
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('已关闭');
    expect(paymentCalls()).toHaveLength(0);
    await click('取消'); expect(paymentCalls()).toHaveLength(0);
    await act(async () => root.render(React.createElement(OverseasPaymentTestPanel, { active: true, disabled: true })));
    expect(button('测试境外付款').disabled).toBe(true);
  });

  it('确认后通过原银行API付款，展示回执并通知同源知银刷新', async () => {
    await mount();
    const iframe = document.createElement('iframe'); iframe.className = 'zhiyin-phone-frame'; iframe.src = '/zhiyin/index.html?phone=mobilegym'; host.append(iframe);
    const notify = vi.spyOn(iframe.contentWindow!, 'postMessage');
    await click('测试境外付款'); await click('确认测试付款');
    expect(paymentCalls()).toEqual([[{ type: 'payment', authorized: true, payment: { id: expect.stringMatching(/^overseas:/), channel: 'overseas', amount: 100, merchant: '境外测试商户' } }]]);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('付款成功');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('99.00');
    expect(request.mock.calls.filter(([body]) => !body)).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith({ channel: 'zhiyin-phone', version: 1, type: 'bank-updated' }, window.location.origin);
  });

  it('保留服务端卡控拒绝原因，不伪造成功或自行开启境外交易', async () => {
    request.mockImplementation(async body => {
      if (body) { const error = new Error('境外交易已关闭'); error.name = 'BankRejection'; throw error; }
      return snapshot;
    });
    await mount(); await click('测试境外付款'); await click('确认测试付款');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('境外交易已关闭');
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(paymentCalls()).toHaveLength(1);
    expect(button('取消').disabled).toBe(false);
  });

  it('忙时不重复付款，网络结果不明时按同一编号核对，避免重复扣款', async () => {
    let reject!: (error: Error) => void;
    request.mockImplementation(async body => body ? new Promise((_resolve, fail) => { reject = fail; }) : snapshot);
    const busy = await mount();
    await click('测试境外付款'); await click('确认测试付款'); await click('正在核对…');
    expect(paymentCalls()).toHaveLength(1); expect(button('取消').disabled).toBe(true);
    await act(async () => reject(new Error('网络连接中断')));
    expect(button('取消').disabled).toBe(true);
    const first = paymentCalls()[0][0];
    request.mockImplementation(async body => body ? { ...(body as { payment: object }).payment, completedAt: 100, balanceAfter: 9900 } : snapshot);
    await click('核对付款结果');
    expect(paymentCalls()[1][0]).toEqual(first);
    expect(busy.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('付款已成功但刷新失败时仍保留回执，不能把刷新错误当作付款失败', async () => {
    await mount();
    request.mockImplementation(async body => {
      if (!body) throw new Error('状态读取失败');
      return { ...(body as { payment: object }).payment, completedAt: 100, balanceAfter: 9900 };
    });
    await click('测试境外付款'); await click('确认测试付款');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('付款成功');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('状态刷新失败');
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('银行读取失败时显示原因并禁用付款入口', async () => {
    request.mockRejectedValue(new Error('银行服务暂不可用'));
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('银行服务暂不可用');
    expect(button('测试境外付款').disabled).toBe(true);
  });
});
