import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSceneService} from '../../server/scene-service';
import {createSceneExpenseResolver} from '../../server/scene-expense-sources';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createExpenseStore} from '../../server/expense-store';
import {expenseActivityClosed} from '../../src/lib/expense-follow-up';

const scope = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-10-15T12:00:00+08:00');
const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  dirs.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true}));
});

it('全部实付在首次收款前退回时结束费用事项，无需发起零元收款', async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const dir = mkdtempSync(join(tmpdir(), 'scene-refund-closure-')); dirs.push(dir);
  const workspaces = createWorkspaceStore(join(dir, `.zhiyin-workspaces-${scope}.local.json`));
  const change = (op: object) => workspaces.change({...op, revision: workspaces.get().revision, requestId: crypto.randomUUID()} as Parameters<typeof workspaces.change>[0]);
  change({type: 'create', id: 'meal', kind: 'food', title: '生日晚餐'});
  change({type: 'progress', id: 'meal', memoryRevision: 0, progress: {goal: '生日晚餐', stage: 'ready', food: {items: [{productId: 'tea', quantity: 1}], note: '', orderId: 'order'}}});
  change({type: 'create', id: 'aa', kind: 'aa', title: '晚餐费用'});
  change({type: 'scene-parent', id: 'aa', parentId: 'meal'});
  change({type: 'link', id: 'aa', expenseBookId: 'book'});
  const expenses = createExpenseStore(join(dir, `.zhiyin-expenses-${scope}.local.json`));
  expenses.change({type: 'create', bookId: 'book', title: '晚餐费用', group: {id: 'group', name: '聚餐群', revision: 1, members: [{id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'}]}, participants: ['me', 'li'], defaultPayerId: 'me', revision: 0, requestId: 'create-book'});
  const service = createSceneService(dir), resolve = createSceneExpenseResolver(dir);
  const payment = {id: 'pay-order', amount: 1000, refundedAmount: 0, paidAt: now - 100, merchant: '小馆'};
  service.reconcile(scope, {orders: [{id: 'order', taskId: 'meal', status: 'COMPLETED', checkedAt: now, payment}]});
  const {sources} = await resolve(scope, 'aa');
  expenses.importSources('book', sources, {revision: expenses.get().revision, requestId: 'import-paid', references: sources.map(({id, paidAmount, refundedAmount}) => ({id, paidAmount, refundedAmount}))});

  vi.setSystemTime(now + 1000);
  const state = service.reconcile(scope, {orders: [{id: 'order', taskId: 'meal', status: 'REFUNDED', checkedAt: now + 1000, payment: {...payment, refundedAmount: 1000}}]});
  const book = expenses.get().books[0];
  expect(book.batches).toEqual([]);
  expect(book.entries[0].source?.refundedAmount).toBe(1000);
  expect.soft(expenseActivityClosed(book)).toBe(true);
  expect.soft(state.scenes![0].records.find(record => record.kind === 'expense_book')?.status).toBe('completed');
  expect(state.scenes![0].stage).toBe('completed');
});
