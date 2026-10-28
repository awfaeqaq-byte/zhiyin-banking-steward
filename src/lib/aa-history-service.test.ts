import {afterEach, expect, it, vi} from 'vitest';
import {refreshAAHistoryBook} from './aa-history-service';
import * as expenses from './expense-service';
import * as wechat from './group-aa';
import {changeExpenses, emptyExpenseState, type ExpenseCommand} from './expense-notebook';

function fixture(published = true) {
  let state = emptyExpenseState();
  const group = {id: 'group', name: '周末饭搭子', revision: 1, members: [{id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'}]};
  const apply = (operation: object) => state = changeExpenses(state, {...operation, bookId: 'book', revision: state.revision, requestId: crypto.randomUUID()} as ExpenseCommand);
  apply({type: 'create', title: '聚餐', group, participants: ['me', 'li'], defaultPayerId: 'me'});
  apply({type: 'add', entryId: 'dinner', entry: {title: '晚饭', amount: 2000, payerId: 'me', fixed: [], shares: [{memberId: 'me', weight: 1}, {memberId: 'li', weight: 1}]}});
  apply({type: 'prepare', batchId: 'batch', entryIds: ['dinner']});
  if (published) apply({type: 'published', batchId: 'batch', collectionId: 'batch'});
  const plan = state.books[0].batches[0].plan;
  const split = wechat.calculateGroupAA(group, plan);
  const receipt: wechat.AACollection = {...split, id: 'batch', groupId: group.id, groupName: group.name, createdAt: 1000, plan, status: 'completed', members: split.members.map(member => ({...member, paid: true}))};
  const requests = vi.spyOn(expenses, 'expenseRequest').mockImplementation(async (operation, revision) => {
    if (operation) state = changeExpenses(state, {...operation, revision, requestId: crypto.randomUUID()} as ExpenseCommand);
    return state;
  });
  return {receipt, requests, read: () => state};
}
afterEach(() => vi.restoreAllMocks());
it('只查询已有微信收款，核对并保存有效回执', async () => {
  const {receipt, requests} = fixture();
  const bridge = vi.spyOn(wechat, 'groupAARequest').mockResolvedValue({collections: [receipt]});
  const result = await refreshAAHistoryBook('book');
  expect(bridge).toHaveBeenCalledOnce();
  expect(bridge).toHaveBeenCalledWith('records', {groupId: 'group'});
  expect(result.books[0].batches[0].receipt?.status).toBe('completed');
  expect(requests.mock.calls.filter(([operation]) => operation).map(([operation]) => operation?.type)).toEqual(['sync-collections']);
});
it('微信已有回执时恢复本地准备状态，不再次发起群收款', async () => {
  const {receipt, requests} = fixture(false);
  vi.spyOn(wechat, 'groupAARequest').mockResolvedValue({collections: [receipt]});
  const result = await refreshAAHistoryBook('book');
  expect(result.books[0].batches[0].status).toBe('published');
  expect(requests.mock.calls.filter(([operation]) => operation).map(([operation]) => operation?.type)).toEqual(['published', 'sync-collections']);
});
it('缺失或篡改的回执不覆盖原记录，也不宣称刷新成功', async () => {
  const {receipt, requests} = fixture();
  const bridge = vi.spyOn(wechat, 'groupAARequest').mockResolvedValue({collections: []});
  await expect(refreshAAHistoryBook('book')).rejects.toThrow('部分收款未取得');
  bridge.mockResolvedValue({collections: [{...receipt, collectAmount: 1}]});
  await expect(refreshAAHistoryBook('book')).rejects.toThrow('与原分摊不一致');
  expect(requests.mock.calls.every(([operation]) => !operation)).toBe(true);
});
