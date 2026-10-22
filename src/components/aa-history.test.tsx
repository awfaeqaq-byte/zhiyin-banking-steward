import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it, vi} from 'vitest';
import {AAHistory} from './aa-history';
import * as expenses from '../lib/expense-service';
import * as workspaces from '../lib/workspace-service';
import * as history from '../lib/aa-history-service';
import {emptyWorkspaces} from '../lib/workspaces';
import {emptyExpenseState, settlementPlan, type ExpenseBook} from '../lib/expense-notebook';

const book: ExpenseBook = {
  id: 'book', title: '周末聚餐', at: Date.parse('2026-10-18T12:00:00+08:00'),
  group: {id: 'group', name: '周末饭搭子', revision: 1, members: [{id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'}]},
  participants: ['me', 'li'], defaultPayerId: 'me', batches: [],
  entries: [{id: 'e', title: '饮料', amount: 2000, payerId: 'me', fixed: [{memberId: 'me', amount: 400}], shares: [{memberId: 'me', weight: 1}, {memberId: 'li', weight: 1}], at: Date.parse('2026-10-18T12:00:00+08:00')}],
};
function setup(books: ExpenseBook[] = [book]) {
  const request = vi.spyOn(expenses, 'expenseRequest').mockResolvedValue({...emptyExpenseState(), revision: 1, books});
  vi.spyOn(workspaces, 'workspaceRequest').mockResolvedValue({...emptyWorkspaces(), revision: 1, items: [{id: 'original', title: book.title, kind: 'aa', status: 'archived', expenseBookId: book.id, updatedAt: book.at, messages: [], memoryRevision: 0, summary: ''}]});
  return request;
}
afterEach(() => vi.restoreAllMocks());
it('搜索和筛选历史账本，详情保留特殊分摊，回原对话绑定真实任务', async () => {
  setup(); const user = userEvent.setup(), open = vi.fn();
  render(<AAHistory onOpenGroupAA={vi.fn()} onOpenConversation={open}/>);
  await user.type(await screen.findByRole('searchbox', {name: '搜索 AA 账本'}), '李娜');
  await user.click(screen.getByRole('button', {name: '已结清'}));
  expect(screen.getByRole('heading', {name: '没有找到相符的账本'})).toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '待结算'}));
  await user.click(screen.getByRole('button', {name: /周末聚餐/}));
  expect(screen.getByRole('heading', {name: '消费明细'})).toBeInTheDocument();
  expect(screen.getAllByText('¥12.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('¥8.00').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', {name: '回到原对话'}));
  expect(open).toHaveBeenCalledWith('original');
  await user.click(screen.getByRole('button', {name: '全部账本'}));
  expect(screen.getByRole('searchbox')).toHaveValue('李娜');
  expect(screen.getByRole('button', {name: '待结算'})).toHaveAttribute('aria-pressed', 'true');
});
it('读取失败可重试，不把失败显示成空账本；新账本使用当前管家', async () => {
  const request = setup([]); request.mockRejectedValueOnce(new Error('服务暂时不可用'));
  const user = userEvent.setup(), start = vi.fn();
  render(<AAHistory stewardName="阿衡" onStartBook={start} onOpenGroupAA={vi.fn()}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用');
  expect(screen.queryByText('还没有 AA 账本')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '重新读取账本'}));
  expect(await screen.findByRole('heading', {name: '还没有 AA 账本'})).toBeInTheDocument();
  expect(screen.getByText(/和阿衡说/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '记一笔 AA'})); expect(start).toHaveBeenCalledOnce();
});
it('打开历史仅读取账本，不自动调用微信或执行收款', async () => {
  const request = setup(); const check = vi.spyOn(history, 'refreshAAHistoryBook');
  render(<AAHistory onOpenGroupAA={vi.fn()}/>);
  await screen.findByRole('button', {name: /周末聚餐/});
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith(); expect(check).not.toHaveBeenCalled();
});
it('微信核对失败保留账本金额与分摊，不误报已收齐', async () => {
  const prepared: ExpenseBook = {...book, entries: book.entries.map(entry => ({...entry, batchId: 'batch'})), batches: [{id: 'batch', entryIds: ['e'], plan: settlementPlan(book, ['e']), status: 'prepared', at: book.at}]};
  setup([prepared]);
  const check = vi.spyOn(history, 'refreshAAHistoryBook').mockRejectedValue(new Error('微信暂时无法核对'));
  const user = userEvent.setup(); render(<AAHistory onOpenGroupAA={vi.fn()}/>);
  await user.click(await screen.findByRole('button', {name: /周末聚餐/}));
  await user.click(screen.getByRole('button', {name: '核对微信收款'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('微信暂时无法核对');
  expect(check).toHaveBeenCalledWith('book');
  expect(screen.getAllByText('¥12.00').length).toBeGreaterThan(0);
  expect(screen.queryByText('已核对微信现有收款记录')).not.toBeInTheDocument();
});
