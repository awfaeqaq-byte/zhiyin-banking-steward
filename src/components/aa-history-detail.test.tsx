import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {AAHistoryDetail} from './aa-history-detail';
import {settlementPlan, type ExpenseBook, type ExpenseEntry} from '../lib/expense-notebook';
import {calculateGroupAA} from '../lib/group-aa';

const at = new Date('2026-10-21T12:00:00+08:00').getTime();
function bookWith(entry: Partial<ExpenseEntry> = {}): ExpenseBook {
  return {
    id: 'book', title: '周末聚餐', at,
    group: {id: 'group', name: '朋友们', revision: 1, members: [
      {id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'},
      {id: 'wang', name: '小王'}, {id: 'other', name: '没有参加的群成员'},
    ]},
    participants: ['me', 'li', 'wang'], defaultPayerId: 'me', batches: [],
    entries: [{id: 'entry', title: '夜宵', at, amount: 22000, payerId: 'me', fixed: [], shares: [
      {memberId: 'me', weight: 2}, {memberId: 'li', weight: 1}, {memberId: 'wang', weight: 2},
    ], ...entry}],
  };
}

function withCollection(status: 'pending' | 'completed' | 'cancelled' = 'pending') {
  const book = bookWith();
  const plan = settlementPlan(book, ['entry']);
  const totals = calculateGroupAA(book.group, plan);
  book.entries[0].batchId = 'batch';
  book.batches.push({id: 'batch', entryIds: ['entry'], plan, status: 'published', at, collectionId: 'batch', receipt: {
    id: 'batch', groupId: 'group', groupName: '朋友们', plan, status, createdAt: at,
    ...totals, members: totals.members.map(member => ({...member, paid: status === 'completed' || member.id === 'li'})),
  }});
  return book;
}

describe('历史 AA 账本详情', () => {
  it('按相对份额呈现 220 元的 88 / 44 / 88，排除未参与群成员', async () => {
    render(<AAHistoryDetail book={bookWith()}/>);
    const totals = screen.getByLabelText('账本成员分摊汇总');
    expect(within(totals).getAllByText('¥88.00')).toHaveLength(2);
    expect(within(totals).getByText('¥44.00')).toBeInTheDocument();
    expect(screen.queryByText('没有参加的群成员')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('夜宵'));
    expect(screen.getByText(/你 2 份、李娜 1 份、小王 2 份/)).toBeInTheDocument();
    expect(screen.getByText(/分摊金额不代表已经付款/)).toBeInTheDocument();
    expect(screen.getByText('记录垫付 ¥220.00')).toBeInTheDocument();
  });

  it('总额 20 中固定可乐 4、余款 16 分摊，汇总只计算一次', async () => {
    const book = bookWith({title: '饮料', amount: 2000, fixed: [{memberId: 'me', amount: 400}], shares: [
      {memberId: 'li', weight: 1}, {memberId: 'wang', weight: 1},
    ]});
    render(<AAHistoryDetail book={book}/>);
    const totals = screen.getByLabelText('账本成员分摊汇总');
    expect(within(totals).getByText('¥4.00')).toBeInTheDocument();
    expect(within(totals).getAllByText('¥8.00')).toHaveLength(2);
    await userEvent.click(screen.getByText('饮料'));
    expect(screen.getByText('固定承担：你 ¥4.00。')).toBeInTheDocument();
    expect(screen.getByText(/剩余 ¥16.00按相同份数分摊/)).toBeInTheDocument();
    expect(screen.queryByText('¥40.00')).not.toBeInTheDocument();
  });

  it('取消收款保留取消前已付信息，不把取消当结清', async () => {
    render(<AAHistoryDetail book={withCollection('cancelled')}/>);
    expect(screen.getByText('已取消收款')).toBeInTheDocument();
    await userEvent.click(screen.getByText('第 1 笔收款'));
    expect(screen.getByText(/取消前已付 ¥44.00/)).toBeInTheDocument();
    const receipt = screen.getByLabelText('第 1 笔收款的付款记录');
    expect(within(receipt).getByText('取消前已付')).toBeInTheDocument();
    expect(within(receipt).getByText('取消前未付')).toBeInTheDocument();
    expect(screen.queryByText('已收齐（上次核对）')).not.toBeInTheDocument();
  });

  it('缺回执时不猜测付款，已准备方案不冒充已收款', async () => {
    const book = withCollection();
    delete book.batches[0].receipt;
    book.batches[0].status = 'prepared';
    render(<AAHistoryDetail book={book}/>);
    expect(screen.getByText('待微信确认')).toBeInTheDocument();
    await userEvent.click(screen.getByText('第 1 笔收款'));
    expect(screen.getByText('尚未取得微信回执，不能确认谁已付款。')).toBeInTheDocument();
    expect(screen.queryByLabelText('第 1 笔收款的付款记录')).not.toBeInTheDocument();
  });

  it('退款后保留旧方案，明确原实付、退款和净实付，不能以旧回执标记当前结清', async () => {
    const book = withCollection('completed');
    book.batches[0].sourceChanged = true;
    book.entries[0].source = {id: 'source', workspaceId: 'dinner', orderId: 'order', paymentId: 'payment', kind: 'food', title: '夜宵订单', merchant: '夜宵店', paidAmount: 22000, refundedAmount: 2000, paidAt: at, checkedAt: at};
    render(<AAHistoryDetail book={book}/>);
    expect(screen.queryByText('已收齐（上次核对）')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('夜宵'));
    expect(screen.getByText(/不代表退款后的应付金额/)).toBeInTheDocument();
    expect(screen.getByText('退款后净实付').parentElement).toHaveTextContent('¥200.00');
    expect(screen.getByText('已退款').parentElement).toHaveTextContent('¥20.00');
    await userEvent.click(screen.getByText('第 1 笔收款'));
    expect(screen.getByText(/以下为原收款方案及已保存回执/)).toBeInTheDocument();
    expect(screen.getByText('方案总额').parentElement).toHaveTextContent('¥220.00');
    expect(screen.getByText(/付款状态为已保存的微信回执/)).toBeInTheDocument();
  });

  it('不展示校验不一致回执里的付款状态', async () => {
    const book = withCollection();
    book.batches[0].receipt!.members[1].amount = 1;
    render(<AAHistoryDetail book={book}/>);
    expect(screen.getByText('回执待核对')).toBeInTheDocument();
    await userEvent.click(screen.getByText('第 1 笔收款'));
    expect(screen.getByText(/微信收款回执与原分摊不一致/)).toBeInTheDocument();
    expect(screen.queryByLabelText('第 1 笔收款的付款记录')).not.toBeInTheDocument();
  });
});
