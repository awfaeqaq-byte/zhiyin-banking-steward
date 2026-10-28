import {afterEach, expect, it, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ExpenseNotebook} from './expense-notebook';
import {changeExpenses, emptyExpenseState, type ExpenseCommand} from '../lib/expense-notebook';
import * as sources from '../lib/scene-expenses';
import * as expenses from '../lib/expense-service';
import * as aa from '../lib/group-aa';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])('原任务归档造成来源失联时阻止旧金额收款（已有待确认批次：%s）', async prepared => {
  const group = {id: 'g', name: '生日群', revision: 1, members: [{id: 'me', name: '我', self: true}, {id: 'li', name: '李娜'}]};
  let state = changeExpenses(emptyExpenseState(), {type: 'create', bookId: 'book', title: '生日费用', group, participants: ['me', 'li'], defaultPayerId: 'me', revision: 0, requestId: 'create'});
  const receipt: sources.SceneExpenseSource = {id: 'source-a', workspaceId: 'birthday', orderId: 'order-a', paymentId: 'payment-a', kind: 'occasion', title: '生日蛋糕', merchant: '蛋糕店', paidAmount: 20600, refundedAmount: 0, paidAt: 1790000000000, checkedAt: 1790000000000};
  state = sources.importSceneExpenses(state, 'book', [receipt]);
  if (prepared) state = changeExpenses(state, {type: 'prepare', bookId: 'book', entryIds: [state.books[0].entries[0].id], batchId: 'batch', revision: state.revision, requestId: 'prepare'});
  const original = structuredClone(state);
  const expenseRequest = vi.spyOn(expenses, 'expenseRequest').mockImplementation(async (op, revision) => {
    if (op) state = changeExpenses(state, {...op, revision, requestId: crypto.randomUUID()} as ExpenseCommand);
    return state;
  });
  // The AA task still exists, but the archived original task no longer contributes
  // any verified source. Its saved entry must not be treated as freshly checked.
  vi.spyOn(sources, 'sceneExpenseRequest').mockImplementation(async () => ({sources: [], state}));
  const bridge = vi.spyOn(aa, 'groupAARequest').mockImplementation(async (operation, payload) => {
    if (operation !== 'publish') return {collections: []};
    const plan = payload?.plan as aa.AAPlan, result = aa.calculateGroupAA(group, plan);
    return {collection: {...result, id: payload!.id as string, groupId: group.id, groupName: group.name, plan, status: 'pending', createdAt: Date.now(), members: result.members.map(member => ({...member, paid: false}))}};
  });
  render(<ExpenseNotebook conversation activityKey="aa-workspace" initialBookId="book" onReconcileSources={vi.fn<() => Promise<void>>().mockResolvedValue()} onPrompt={vi.fn()}/>);
  await userEvent.click(await screen.findByRole('button', {name: /生日费用/}));
  if (prepared) await userEvent.click(screen.getByRole('button', {name: '继续微信确认'}));
  else {
    await userEvent.click(screen.getByRole('button', {name: '核对并结算'}));
    await userEvent.click(screen.getByRole('button', {name: /没问题，去微信确认收款/}));
  }
  await waitFor(() => expect(screen.getByRole('region', {name: '随手记消费'})).toHaveAttribute('aria-busy', 'false'));
  expect.soft(bridge).not.toHaveBeenCalled();
  expect.soft(expenseRequest.mock.calls.every(([op]) => !op || !['prepare', 'published'].includes(op.type))).toBe(true);
  expect(state.books[0].batches).toEqual(original.books[0].batches);
});
