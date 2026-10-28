import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSceneService} from '../../server/scene-service';
import {createSceneExpenseResolver} from '../../server/scene-expense-sources';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createExpenseStore} from '../../server/expense-store';
import {calculateGroupAA, type AACollection} from './group-aa';
import type {ExpenseCommand} from './expense-notebook';

const scope = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-10-15T12:00:00+08:00');
const dirs: string[] = [];
afterEach(() => {vi.useRealTimers(); dirs.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true}));});
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const dir = mkdtempSync(join(tmpdir(), 'scene-background-expenses-')); dirs.push(dir);
  const workspaces = createWorkspaceStore(join(dir, `.zhiyin-workspaces-${scope}.local.json`));
  const change = (op: object) => workspaces.change({...op, revision: workspaces.get().revision, requestId: crypto.randomUUID()} as Parameters<typeof workspaces.change>[0]);
  const expenses = createExpenseStore(join(dir, `.zhiyin-expenses-${scope}.local.json`));
  const expense = (op: object) => expenses.change({bookId: 'book', ...op, revision: expenses.get().revision, requestId: crypto.randomUUID()} as ExpenseCommand);
  change({type: 'create', id: 'meal', kind: 'food', title: '生日晚餐'});
  change({type: 'progress', id: 'meal', memoryRevision: 0, progress: {goal: '生日晚餐', stage: 'ready', food: {items: [{productId: 'tea', quantity: 1}], note: '', orderId: 'order'}}});
  const service = createSceneService(dir), resolve = createSceneExpenseResolver(dir);
  const payment = {id: 'pay-order', amount: 1000, refundedAmount: 0, paidAt: now - 100, merchant: '小馆'};
  const observation = {id: 'order', taskId: 'meal', status: 'COMPLETED', checkedAt: now, payment};
  const group = {id: 'group', name: '生日聚餐', revision: 1, members: [{id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'}]};
  async function importPaid(bookId = 'book') {
    expense({type: 'create', bookId, title: '聚餐', group, participants: ['me', 'li'], defaultPayerId: 'me'});
    service.reconcile(scope, {orders: [observation]});
    const {sources} = await resolve(scope, 'meal');
    expenses.importSources(bookId, sources, {revision: expenses.get().revision, requestId: crypto.randomUUID(), references: sources.map(({id, paidAmount, refundedAmount}) => ({id, paidAmount, refundedAmount}))});
    return sources;
  }
  return {dir, change, workspaces, expenses, expense, service, resolve, payment, observation, group, importPaid};
}

it('实付变化产生待整理费用草案，净额准确；只改核对时间不刷聊天也不自动建账', () => {
  const f = fixture();
  const result = f.service.reconcile(scope, {orders: [{...f.observation, payment: {...f.payment, refundedAmount: 200}}]});
  expect(result.scenes![0]).toMatchObject({expenses: {pendingCount: 1, netAmount: 800, sourceIds: [expect.any(String)]}});
  expect(result.scenes![0].summary).toContain('有1笔实付可整理');
  expect(result.scenes![0].summary).toContain('8.00');
  expect(f.expenses.get().books).toEqual([]);
  vi.setSystemTime(now + 1000);
  const again = f.service.reconcile(scope, {orders: [{...f.observation, checkedAt: now + 1000, payment: {...f.payment, refundedAmount: 200}}]});
  expect(again.conversation).toHaveLength(result.conversation!.length);
});

it('已在同设备其他账本入账的付款不会再次列入费用草案', async () => {
  const f = fixture(); await f.importPaid('other-book');
  expect(f.service.get(scope).scenes![0]).toMatchObject({expenses: {pendingCount: 0, netAmount: 0, sourceIds: []}});
  expect(f.service.get(scope).scenes![0].summary).not.toContain('实付可整理');
});

it('AA界面未挂载时退款仍同步账本；原收款已收齐也不得把退款差额标成结清', async () => {
  const f = fixture(); await f.importPaid();
  f.change({type: 'create', id: 'aa', kind: 'aa', title: '晚餐AA'});
  f.change({type: 'scene-parent', id: 'aa', parentId: 'meal'}); f.change({type: 'link', id: 'aa', expenseBookId: 'book'});
  const entry = f.expenses.get().books[0].entries[0];
  f.expense({type: 'prepare', batchId: 'batch', entryIds: [entry.id]}); f.expense({type: 'published', batchId: 'batch', collectionId: 'batch'});
  const plan = f.expenses.get().books[0].batches[0].plan, amounts = calculateGroupAA(f.group, plan);
  const receipt: AACollection = {...amounts, id: 'batch', groupId: f.group.id, groupName: f.group.name, plan, status: 'completed', createdAt: now, members: amounts.members.map(member => ({...member, paid: true}))};
  f.expense({type: 'sync-collections', collections: [receipt]});
  expect(f.service.get(scope).scenes![0].stage).toBe('completed');
  vi.setSystemTime(now + 1000);
  const result = f.service.reconcile(scope, {orders: [{...f.observation, status: 'REFUNDED', checkedAt: now + 1000, payment: {...f.payment, refundedAmount: 1000}}]});
  expect(f.expenses.get().books[0].batches[0].sourceChanged).toBe(true);
  expect(f.expenses.get().books[0].entries[0].source?.refundedAmount).toBe(1000);
  expect(result.scenes![0].stage).not.toBe('completed');
  expect(result.scenes![0].summary).toContain('差额');
  expect(result.scenes![0].records.find(record => record.kind === 'collection')?.status).not.toBe('completed');
});

it('批次含异事项订单时，先拒绝整个观察批次，不能先把其中退款写入账本', async () => {
  const f = fixture(); await f.importPaid(); const before = f.expenses.get();
  expect(() => f.service.reconcile(scope, {orders: [{...f.observation, payment: {...f.payment, refundedAmount: 1000}}, {...f.observation, id: 'foreign-order'}]})).toThrow('归属');
  expect(f.expenses.get()).toEqual(before);
});

it('当前事项原订单读取失败时，确认来源接口拒绝旧付款候选，恢复核对后可再整理', async () => {
  const f = fixture(); f.service.reconcile(scope, {orders: [f.observation]});
  f.service.reconcile(scope, {errors: [{workspaceId: 'meal', message: '原订单读取失败'}]});
  await expect(Promise.resolve().then(() => f.resolve(scope, 'meal'))).rejects.toThrow('核对');
  f.service.reconcile(scope, {orders: [f.observation], errors: []});
  expect((await f.resolve(scope, 'meal')).sources).toHaveLength(1);
});
