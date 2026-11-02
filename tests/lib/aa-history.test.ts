import {describe, expect, it} from 'vitest';
import {aaHistorySummary, filterAAHistory} from '../../src/lib/aa-history';
import {settlementPlan, type ExpenseBook} from '../../src/lib/expense-notebook';
import {calculateGroupAA, type AACollection} from '../../src/lib/group-aa';
import type {SceneExpenseSource} from '../../src/lib/scene-expenses';

function bookFixture(): ExpenseBook {
  return {
    id: 'dinner', title: '周五夜宵', at: 100,
    group: {id: 'friends', name: '周末饭搭子', revision: 1, members: [
      {id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'},
      {id: 'wang', name: '小王'}, {id: 'unused', name: '未参与的群友'},
    ]},
    participants: ['me', 'li', 'wang'], defaultPayerId: 'me', batches: [],
    entries: [{id: 'supper', title: '夜宵', amount: 22000, payerId: 'me', fixed: [],
      shares: [{memberId: 'me', weight: 2}, {memberId: 'li', weight: 1}, {memberId: 'wang', weight: 2}], at: 200}],
  };
}

function prepare(book: ExpenseBook) {
  const plan = settlementPlan(book, book.entries.map(entry => entry.id));
  book.batches.push({id: 'collection', entryIds: book.entries.map(entry => entry.id), plan, status: 'prepared', at: 300});
  book.entries.forEach(entry => { entry.batchId = 'collection'; });
  return book;
}

function publish(book = prepare(bookFixture()), paidIds = ['li']) {
  const batch = book.batches[0];
  const amounts = calculateGroupAA(book.group, batch.plan);
  const receipt: AACollection = {
    ...amounts, id: batch.id, groupId: book.group.id, groupName: book.group.name,
    createdAt: 400, plan: batch.plan, status: 'pending',
    members: amounts.members.map(member => ({...member, paid: paidIds.includes(member.id)})),
  };
  batch.status = 'published';
  batch.collectionId = batch.id;
  batch.receipt = receipt;
  return book;
}

const source = (refundedAmount: number): SceneExpenseSource => ({
  id: 'source', workspaceId: 'occasion', orderId: 'order', paymentId: 'payment',
  kind: 'occasion', title: '夜宵', merchant: '餐厅', paidAmount: 22000,
  refundedAmount, paidAt: 180, checkedAt: 500,
});

describe('AA 历史账本汇总', () => {
  it('空账本与尚未确认的结算都保持待结算，不把预备方案当成已收款', () => {
    expect(aaHistorySummary({...bookFixture(), entries: []})).toMatchObject({
      status: 'pending', label: '待结算', total: 0, pendingTotal: 0, entryCount: 0,
    });
    expect(aaHistorySummary(prepare(bookFixture()))).toMatchObject({
      status: 'pending', total: 22000, pendingTotal: 22000, collected: 0, collectTotal: 0,
    });
  });

  it('按原来 2:1:2 的分摊回执计算实收，不重新按人数平分', () => {
    expect(aaHistorySummary(publish())).toEqual({
      status: 'collecting', label: '收款中', total: 22000, pendingTotal: 0,
      collected: 4400, collectTotal: 13200, updatedAt: 400, entryCount: 1,
    });
  });

  it('正在收款的活动新增消费后仍显示收款中，同时保留未发起结算的金额', () => {
    const book = publish();
    book.entries.push({...bookFixture().entries[0], id: 'taxi', title: '打车', amount: 3000, at: 600});
    expect(aaHistorySummary(book)).toMatchObject({
      status: 'collecting', total: 25000, pendingTotal: 3000, collected: 4400, updatedAt: 600,
    });
  });

  it('只有各成员实际付齐且没有新消费时才归档，状态文字不能替代实际回执', () => {
    const book = publish(undefined, ['li', 'wang']);
    expect(aaHistorySummary(book)).toMatchObject({status: 'settled', collected: 13200, collectTotal: 13200});
    book.entries.push({...bookFixture().entries[0], id: 'later', payerId: 'wang'});
    expect(aaHistorySummary(book)).toMatchObject({status: 'pending', pendingTotal: 22000});
    const falseComplete = publish();
    falseComplete.batches[0].receipt!.status = 'completed';
    expect(aaHistorySummary(falseComplete)).toMatchObject({status: 'attention', collected: 0});
  });

  it('取消、缺少回执、金额被改动和已发布后的退款都优先要求核对', () => {
    const cancelled = publish();
    cancelled.batches[0].receipt!.status = 'cancelled';
    expect(aaHistorySummary(cancelled)).toMatchObject({status: 'attention', collected: 4400});
    const missing = publish();
    delete missing.batches[0].receipt;
    expect(aaHistorySummary(missing)).toMatchObject({status: 'attention', collected: 0, collectTotal: 13200});
    const tampered = publish();
    tampered.batches[0].receipt!.total = 1;
    expect(aaHistorySummary(tampered)).toMatchObject({status: 'attention', collected: 0});
    const refunded = publish(undefined, ['li', 'wang']);
    refunded.batches[0].sourceChanged = true;
    expect(aaHistorySummary(refunded).status).toBe('attention');
  });

  it('全额退款保留原消费金额，未发起的已退款订单不再计入待结算', () => {
    const book = bookFixture();
    book.entries[0].source = source(22000);
    expect(aaHistorySummary(book)).toMatchObject({
      status: 'settled', total: 22000, pendingTotal: 0, collected: 0, collectTotal: 0, updatedAt: 500,
    });
    const published = publish(undefined, ['li', 'wang']);
    published.entries[0].source = source(22000);
    expect(aaHistorySummary(published).status).toBe('attention');
  });

  it('部分退款与原分摊未对齐时保留原账本并标记需核对', () => {
    const book = bookFixture();
    book.entries[0].source = source(4000);
    expect(aaHistorySummary(book)).toMatchObject({status: 'attention', total: 22000, pendingTotal: 22000});
    book.entries[0].amount = 18000;
    expect(aaHistorySummary(book)).toMatchObject({status: 'pending', total: 18000, pendingTotal: 18000});
  });

  it('结算关联丢失或重复时不能显示已结清', () => {
    const orphan = publish(undefined, ['li', 'wang']);
    orphan.entries[0].batchId = 'unknown';
    expect(aaHistorySummary(orphan).status).toBe('attention');
    const mismatch = publish(undefined, ['li', 'wang']);
    mismatch.batches[0].entryIds = ['missing'];
    expect(aaHistorySummary(mismatch).status).toBe('attention');
    const duplicate = publish(undefined, ['li', 'wang']);
    duplicate.batches.push({...duplicate.batches[0]});
    expect(aaHistorySummary(duplicate).status).toBe('attention');
  });

  it('排序只采用记录中的真实时间，忽略无效时间且不凭空变成当前时间', () => {
    const book = bookFixture();
    book.at = Number.NaN;
    book.entries[0].at = -1;
    expect(aaHistorySummary(book).updatedAt).toBe(0);
  });
});

describe('AA 历史账本筛选', () => {
  it('按活动、群与实际参与人查找，并结合真实结算状态筛选', () => {
    const pending = {...bookFixture(), id: 'pending', title: 'Trip to Shanghai'};
    const settled = {...publish(undefined, ['li', 'wang']), id: 'settled'};
    const books = [pending, settled];
    expect(filterAAHistory(books, ' shanghai ', 'all')).toEqual([pending]);
    expect(filterAAHistory(books, '饭搭子', 'settled')).toEqual([settled]);
    expect(filterAAHistory(books, '李娜', 'pending')).toEqual([pending]);
    expect(filterAAHistory(books, '未参与的群友', 'all')).toEqual([]);
    expect(filterAAHistory(books, '', 'attention')).toEqual([]);
  });

  it('按最新记录倒序展示，但不修改原来的账本顺序或账本内容', () => {
    const old = {...bookFixture(), id: 'old'};
    const newest = {...publish(), id: 'newest'};
    const books = [old, newest];
    const before = structuredClone(books);
    expect(filterAAHistory(books, '', 'all').map(book => book.id)).toEqual(['newest', 'old']);
    expect(books).toEqual(before);
    expect(filterAAHistory(books, '', 'all')[0]).toBe(newest);
  });
});
