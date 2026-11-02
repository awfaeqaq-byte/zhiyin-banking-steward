import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {type BankCardId} from '../../src/lib/bank-transfer';
import {CardManagement} from '../../src/components/card-management';

const directories: string[] = [];
afterEach(() => {vi.restoreAllMocks(); for (const path of directories.splice(0)) rmSync(path, {recursive: true, force: true});});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'zhiyin-card-management-'));
  directories.push(directory);
  const bank = createBankStore(join(directory, 'bank.json'));
  const writes: Record<string, unknown>[] = [];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = new URL(String(input), 'http://localhost');
    try {
      if (url.searchParams.get('view') === 'cards') return new Response(JSON.stringify(bank.getCards()));
      if (options?.body) {
        const body = JSON.parse(String(options.body));
        writes.push(body);
        if (body.type !== 'settings') throw Error('Unexpected write');
        const scoped = body.cardId ? bank.forCard(body.cardId) : bank;
        return new Response(JSON.stringify(scoped.configure(body)));
      }
      const cardId = url.searchParams.get('cardId') as BankCardId | null;
      return new Response(JSON.stringify(cardId ? bank.forCard(cardId).get() : bank.get()));
    } catch (value) {return new Response(JSON.stringify({error: (value as Error).message}), {status: 400});}
  });
  return {bank, writes, fetchMock};
}
const selectedCard = (last4: string) => screen.getByLabelText(`尾号 ${last4} 的卡片详情`);

describe('银行卡管理', () => {
  it('列出服务端的三张卡；选卡后使用本卡余额、权限、流水和转账入口', async () => {
    const {bank} = setup();
    bank.forCard('living').configure({revision: 0, limit: 50000, controls: {overseas: true, contactless: false, night: false}});
    const draft = bank.prepare({recipientId: 'mom', amount: 10000}, Date.parse('2026-10-21T12:00:00+08:00'));
    bank.confirm(draft.id, Date.parse('2026-10-21T12:00:01+08:00'));
    const onTransfer = vi.fn(), onBack = vi.fn();
    render(<CardManagement onAsk={vi.fn()} onTransfer={onTransfer} onBack={onBack}/>);
    const user = userEvent.setup();
    await screen.findByText('3 张银行卡 · 轻点切换');
    await within(selectedCard('8888')).findByText('¥42,200.00');
    expect(screen.getAllByRole('button', {name: /，尾号/})).toHaveLength(3);
    await user.click(screen.getByRole('button', {name: /生活备用卡，尾号 6216/}));
    await within(selectedCard('6216')).findByText('¥0.00');
    expect(within(selectedCard('6216')).getByText('¥500.00')).toBeInTheDocument();
    expect(screen.getByRole('switch', {name: '尾号 6216 境外交易'})).toBeChecked();
    expect(screen.getByRole('switch', {name: '尾号 6216 无卡支付'})).not.toBeChecked();
    expect(within(selectedCard('6216')).queryByText('转给妈妈')).not.toBeInTheDocument();
    expect(within(selectedCard('6216')).queryByText('申请新卡')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '让管家帮我核对这张卡'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: '用此卡转账与 AA 收款'}));
    expect(onTransfer).toHaveBeenCalledWith('living');
    await user.click(screen.getByRole('button', {name: /日常支付卡，尾号 8888/}));
    await within(selectedCard('8888')).findByText('¥42,200.00');
    expect(within(selectedCard('8888')).getByText('转给妈妈')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: '返回'}));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('键盘选中第三张卡后置于卡包最前，保留焦点并操作同一卡片', async () => {
    setup();
    const onTransfer = vi.fn();
    render(<CardManagement onAsk={vi.fn()} onTransfer={onTransfer}/>);
    const user = userEvent.setup();
    await within(await screen.findByLabelText('尾号 8888 的卡片详情')).findByText('¥42,300.00');
    const wallet = screen.getByRole('group', {name: '选择要管理的银行卡'});
    const primary = within(wallet).getByRole('button', {name: '日常支付卡，尾号 8888，正常'});
    const living = within(wallet).getByRole('button', {name: '生活备用卡，尾号 6216，正常'});
    const reserve = within(wallet).getByRole('button', {name: '储蓄备用卡，尾号 9073，正常'});
    expect(within(wallet).getAllByRole('button')).toEqual([living, reserve, primary]);
    expect(primary).toHaveAttribute('aria-pressed', 'true');

    await user.tab();
    expect(screen.getByRole('button', {name: '刷新银行卡列表'})).toHaveFocus();
    await user.tab();
    expect(living).toHaveFocus();
    await user.tab();
    expect(reserve).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(within(wallet).getAllByRole('button')).toEqual([primary, living, reserve]);
    expect(reserve).toHaveAttribute('aria-pressed', 'true');
    expect(primary).toHaveAttribute('aria-pressed', 'false');
    expect(living).toHaveAttribute('aria-pressed', 'false');
    expect(reserve).toHaveFocus();
    expect(screen.queryByLabelText('尾号 8888 的卡片详情')).not.toBeInTheDocument();
    await within(selectedCard('9073')).findByText('¥20,000.00');
    expect(screen.getByRole('switch', {name: '尾号 9073 境外交易'})).not.toBeChecked();
    expect(reserve).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: '用此卡转账与 AA 收款'})).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onTransfer).toHaveBeenCalledWith('reserve');
  });

  it('开关先核对尾号；取消不写入，确认只修改选中卡', async () => {
    const {bank, writes} = setup();
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /生活备用卡，尾号 6216/}));
    const overseas = await screen.findByRole('switch', {name: '尾号 6216 境外交易'});
    expect(within(selectedCard('6216')).getByText('已关闭 · 拦截境外渠道付款')).toBeInTheDocument();
    await user.click(overseas);
    let dialog = screen.getByRole('dialog', {name: '确认开启境外交易'});
    expect(within(dialog).getByText(/生活备用卡 · 尾号 6216/)).toBeInTheDocument();
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole('button', {name: '返回核对'}));
    expect(writes).toEqual([]);
    await user.click(overseas);
    dialog = screen.getByRole('dialog', {name: '确认开启境外交易'});
    await user.click(within(dialog).getByRole('button', {name: '确认修改尾号 6216'}));
    await screen.findByText('尾号 6216：境外交易已开启');
    expect(within(selectedCard('6216')).getByText('已开启 · 允许境外渠道付款')).toBeInTheDocument();
    expect(writes).toEqual([expect.objectContaining({cardId: 'living', controls: {overseas: true, contactless: true, night: true}})]);
    expect(bank.forCard('living').get().controls.overseas).toBe(true);
    expect(bank.get().controls.overseas).toBe(false);
    expect(bank.forCard('reserve').get().controls.overseas).toBe(false);
  });

  it('挂失与恢复均确认明确尾号，其他卡保持正常', async () => {
    const {bank} = setup();
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /储蓄备用卡，尾号 9073/}));
    await user.click(await screen.findByRole('button', {name: '挂失这张卡'}));
    expect(bank.forCard('reserve').get().frozen).toBe(false);
    await user.click(screen.getByRole('button', {name: '确认挂失尾号 9073'}));
    await screen.findByText('尾号 9073：已挂失，付款已暂停');
    expect(bank.forCard('reserve').get().frozen).toBe(true);
    expect(bank.get().frozen).toBe(false);
    expect(screen.getByRole('button', {name: /储蓄备用卡，尾号 9073，已挂失/})).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', {name: '恢复这张卡'}));
    await user.click(screen.getByRole('button', {name: '确认恢复尾号 9073'}));
    await screen.findByText('尾号 9073：已恢复，付款仍受当前权限与限额控制');
    expect(bank.forCard('reserve').get().frozen).toBe(false);
  });

  it('调整限额验证金额，关闭确认后换卡不会携带上一张卡的修改', async () => {
    const {bank, writes} = setup();
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /生活备用卡，尾号 6216/}));
    await user.click(await screen.findByRole('button', {name: /单笔支付限额/}));
    let input = screen.getByLabelText('新的单笔限额（元）');
    await user.clear(input); await user.type(input, '99');
    await user.click(screen.getByRole('button', {name: '确认修改尾号 6216'}));
    expect(screen.getByRole('alert')).toHaveTextContent('100 至 50,000');
    expect(writes).toEqual([]);
    await user.click(screen.getByRole('button', {name: '返回核对'}));
    await user.click(screen.getByRole('button', {name: /储蓄备用卡，尾号 9073/}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', {name: /单笔支付限额/}));
    input = screen.getByLabelText('新的单笔限额（元）');
    expect(input).toHaveValue('20000');
    await user.clear(input); await user.type(input, '1250');
    await user.click(screen.getByRole('button', {name: '确认修改尾号 9073'}));
    await screen.findByText('尾号 9073：单笔限额已改为 ¥1,250.00');
    expect(bank.forCard('reserve').get().limit).toBe(125000);
    expect(bank.forCard('living').get().limit).toBe(2000000);
    expect(writes).toEqual([expect.objectContaining({cardId: 'reserve', limit: 125000})]);
  });

  it('列表失败有重试且不伪装零余额；恢复后才能选择卡片', async () => {
    const {fetchMock} = setup();
    fetchMock.mockRejectedValueOnce(new Error('网络暂时不可用'));
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用');
    expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: '重新读取银行卡'}));
    await screen.findByText('3 张银行卡 · 轻点切换');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('选卡读取失败时不借用上一张卡数据，重新读取后恢复本卡', async () => {
    const {fetchMock} = setup();
    const original = fetchMock.getMockImplementation()!;
    let failLiving = true;
    fetchMock.mockImplementation(async (url, options) => String(url).includes('cardId=living') && failLiving ? Promise.reject(Error('本卡暂时不可用')) : original(url, options));
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    await within(await screen.findByLabelText('尾号 8888 的卡片详情')).findByText('¥42,300.00');
    await userEvent.click(screen.getByRole('button', {name: /生活备用卡，尾号 6216/}));
    await screen.findByText('本卡暂时不可用');
    expect(within(selectedCard('6216')).queryByText('¥42,300.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    failLiving = false;
    await userEvent.click(screen.getByRole('button', {name: '重新读取尾号 6216'}));
    await within(selectedCard('6216')).findByText('¥0.00');
    expect(screen.getByRole('switch', {name: '尾号 6216 无卡支付'})).toBeChecked();
  });

  it('重访卡片保留本卡详情，重新核对完成前禁用写入、转账和管家建议', async () => {
    const {bank, writes, fetchMock} = setup();
    const original = fetchMock.getMockImplementation()!;
    let holdPrimary = false;
    let finishPrimary: (() => void) | undefined;
    fetchMock.mockImplementation(async (url, options) => {
      const request = new URL(String(url), 'http://localhost');
      if (!holdPrimary || options?.body || request.searchParams.get('view') === 'cards' || request.searchParams.get('cardId')) return original(url, options);
      return new Promise<Response>(resolve => {finishPrimary = () => resolve(new Response(JSON.stringify(bank.get())));});
    });
    const onAsk = vi.fn(), onTransfer = vi.fn();
    const user = userEvent.setup();
    render(<CardManagement onAsk={onAsk} onTransfer={onTransfer}/>);
    await within(await screen.findByLabelText('尾号 8888 的卡片详情')).findByText('¥42,300.00');
    await user.click(screen.getByRole('button', {name: /生活备用卡，尾号 6216/}));
    await within(selectedCard('6216')).findByText('¥0.00');
    holdPrimary = true;
    await user.click(screen.getByRole('button', {name: /日常支付卡，尾号 8888/}));

    const details = within(selectedCard('8888'));
    expect(details.getByText('¥42,300.00')).toBeInTheDocument();
    expect(details.queryByText('¥0.00')).not.toBeInTheDocument();
    expect(details.getByRole('heading', {name: /权限与安全/})).toBeInTheDocument();
    const transfer = details.getByRole('button', {name: '用此卡转账与 AA 收款'});
    const advice = details.getByRole('button', {name: '让管家帮我核对这张卡'});
    const freeze = details.getByRole('button', {name: '挂失这张卡'});
    expect(transfer).toBeDisabled();
    expect(advice).toBeDisabled();
    expect(freeze).toBeDisabled();
    expect(details.getByRole('button', {name: /单笔支付限额/})).toBeDisabled();
    for (const control of details.getAllByRole('switch')) expect(control).toBeDisabled();
    await user.click(transfer);
    await user.click(advice);
    await user.click(freeze);
    await user.click(details.getByText('申请新卡'));
    const application = within(details.getByRole('region', {name: '卡申请'}));
    const products = application.getAllByRole('button');
    for (const product of products) expect(product).toBeDisabled();
    await user.click(products[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onTransfer).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
    expect(writes).toEqual([]);

    bank.configure({revision: bank.get().revision, limit: 125000});
    holdPrimary = false;
    await act(async () => {finishPrimary?.();});
    await waitFor(() => expect(transfer).toBeEnabled());
    expect(details.getByText('¥1,250.00')).toBeInTheDocument();
    expect(advice).toBeEnabled();
    await user.click(freeze);
    await user.click(screen.getByRole('button', {name: '确认挂失尾号 8888'}));
    await screen.findByText('尾号 8888：已挂失，付款已暂停');
    expect(writes).toEqual([expect.objectContaining({frozen: true, revision: 1})]);
    expect(bank.forCard('living').get().frozen).toBe(false);
  });

  it('重访收到旧版本时保留本卡缓存并禁用操作，重新读取当前版本后恢复', async () => {
    const {bank, writes, fetchMock} = setup();
    const oldSnapshot = bank.get();
    bank.configure({revision: oldSnapshot.revision, limit: 125000, controls: {overseas: true, contactless: true, night: true}});
    const original = fetchMock.getMockImplementation()!;
    let serveOldPrimary = false;
    fetchMock.mockImplementation(async (url, options) => {
      const request = new URL(String(url), 'http://localhost');
      if (!serveOldPrimary || options?.body || request.searchParams.get('view') === 'cards' || request.searchParams.get('cardId')) return original(url, options);
      return new Response(JSON.stringify(oldSnapshot));
    });
    const onAsk = vi.fn(), onTransfer = vi.fn();
    const user = userEvent.setup();
    render(<CardManagement onAsk={onAsk} onTransfer={onTransfer}/>);
    await within(await screen.findByLabelText('尾号 8888 的卡片详情')).findByText('¥1,250.00');
    await user.click(screen.getByRole('button', {name: /生活备用卡，尾号 6216/}));
    await within(selectedCard('6216')).findByText('¥0.00');
    serveOldPrimary = true;
    await user.click(screen.getByRole('button', {name: /日常支付卡，尾号 8888/}));

    const details = within(selectedCard('8888'));
    expect(await details.findByRole('alert')).toHaveTextContent('账户信息尚未同步');
    expect(details.getByText('¥1,250.00')).toBeInTheDocument();
    expect(details.queryByText('¥20,000.00')).not.toBeInTheDocument();
    expect(details.getByRole('switch', {name: '尾号 8888 境外交易'})).toBeChecked();
    const transfer = details.getByRole('button', {name: '用此卡转账与 AA 收款'});
    const advice = details.getByRole('button', {name: '让管家帮我核对这张卡'});
    const freeze = details.getByRole('button', {name: '挂失这张卡'});
    expect(transfer).toBeDisabled();
    expect(advice).toBeDisabled();
    expect(freeze).toBeDisabled();
    expect(details.getByRole('button', {name: /单笔支付限额/})).toBeDisabled();
    for (const control of details.getAllByRole('switch')) expect(control).toBeDisabled();
    await user.click(details.getByText('申请新卡'));
    const products = within(details.getByRole('region', {name: '卡申请'})).getAllByRole('button');
    for (const product of products) expect(product).toBeDisabled();
    await user.click(products[0]);
    await user.click(transfer);
    await user.click(advice);
    await user.click(freeze);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onTransfer).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
    expect(writes).toEqual([]);

    serveOldPrimary = false;
    await user.click(details.getByRole('button', {name: '重新读取尾号 8888'}));
    await waitFor(() => expect(transfer).toBeEnabled());
    expect(details.queryByRole('alert')).not.toBeInTheDocument();
    expect(details.getByText('¥1,250.00')).toBeInTheDocument();
    expect(advice).toBeEnabled();
    for (const product of products) expect(product).toBeEnabled();
    await user.click(freeze);
    await user.click(screen.getByRole('button', {name: '确认挂失尾号 8888'}));
    await screen.findByText('尾号 8888：已挂失，付款已暂停');
    expect(writes).toEqual([expect.objectContaining({frozen: true, revision: 1})]);
    expect(bank.forCard('living').get().frozen).toBe(false);
  });

  it('等待确认期间账户发生变化必须重新核对，不能沿用旧确认', async () => {
    const {bank, writes} = setup();
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /生活备用卡，尾号 6216/}));
    await user.click(await screen.findByRole('button', {name: '挂失这张卡'}));
    bank.forCard('living').configure({revision: 0, limit: 100000});
    act(() => window.dispatchEvent(new Event('zhiyin-bank-updated')));
    await screen.findByText('此卡状态已更新，请返回重新核对后再确认。');
    expect(screen.getByRole('button', {name: '确认挂失尾号 6216'})).toBeDisabled();
    expect(writes).toEqual([]);
    expect(bank.forCard('living').get().frozen).toBe(false);
  });

  it('快速切换时上一张卡的迟到响应不会污染当前卡', async () => {
    const {bank, fetchMock} = setup();
    bank.forCard('living').configure({revision: 0, limit: 50000, controls: {overseas: true, contactless: false, night: false}});
    const original = fetchMock.getMockImplementation()!;
    let finishLiving: (() => void) | undefined;
    fetchMock.mockImplementation(async (url, options) => {
      if (!String(url).includes('cardId=living')) return original(url, options);
      return new Promise<Response>(resolve => {finishLiving = () => resolve(new Response(JSON.stringify(bank.forCard('living').get())));});
    });
    render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /生活备用卡，尾号 6216/}));
    expect(within(selectedCard('6216')).getByRole('status')).toHaveTextContent('正在读取尾号 6216');
    await user.click(screen.getByRole('button', {name: /储蓄备用卡，尾号 9073/}));
    await within(selectedCard('9073')).findByText('¥20,000.00');
    await act(async () => {finishLiving?.();});
    expect(screen.queryByLabelText('尾号 6216 的卡片详情')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', {name: '尾号 9073 境外交易'})).not.toBeChecked();
    expect(within(selectedCard('9073')).queryByText('¥500.00')).not.toBeInTheDocument();
  });

  it('直接定位只消费一次；用户继续切卡不被入口参数切回', async () => {
    setup();
    const consumed = vi.fn(), onAsk = vi.fn();
    render(<CardManagement onAsk={onAsk} onTransfer={vi.fn()} initialCardId="living" onInitialCardConsumed={consumed}/>);
    await within(await screen.findByLabelText('尾号 6216 的卡片详情')).findByText('¥0.00');
    expect(consumed).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', {name: /日常支付卡，尾号 8888/}));
    await screen.findByRole('button', {name: '让管家帮我核对这张卡'});
    await userEvent.click(screen.getByRole('button', {name: '让管家帮我核对这张卡'}));
    expect(onAsk).toHaveBeenCalledWith('帮我核对尾号 8888 的用卡权限和限额，给我一些建议。');
    fireEvent(window, new Event('zhiyin-bank-updated'));
    await waitFor(() => expect(screen.getByRole('button', {name: /日常支付卡，尾号 8888/})).toHaveAttribute('aria-pressed', 'true'));
    expect(consumed).toHaveBeenCalledTimes(1);
  });
});
