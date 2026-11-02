import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it, vi} from 'vitest';
import App from '../../src/App';
import * as expenses from '../../src/lib/expense-service';
import * as workspaces from '../../src/lib/workspace-service';
import {emptyExpenseState} from '../../src/lib/expense-notebook';
import {emptyWorkspaces} from '../../src/lib/workspaces';
import {emptyMemory} from '../../src/lib/steward-memory';

afterEach(() => vi.restoreAllMocks());
it('我的有历史 AA 账本入口，微信群 AA 页也能直接进入同一账本', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(emptyMemory())));
  vi.spyOn(expenses, 'expenseRequest').mockResolvedValue(emptyExpenseState());
  vi.spyOn(workspaces, 'workspaceRequest').mockResolvedValue(emptyWorkspaces());
  const user = userEvent.setup(); render(<App/>);
  await user.click(screen.getByRole('button', {name: '个人中心'}));
  await user.click(screen.getByRole('button', {name: /历史 AA 账本/}));
  expect(screen.getByRole('heading', {name: '历史 AA 账本'})).toBeInTheDocument();
  expect(await screen.findByRole('heading', {name: '还没有 AA 账本'})).toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: /微信群收款/}));
  await user.click(screen.getByRole('button', {name: /历史 AA 账本/}));
  expect(screen.getByRole('heading', {name: '历史 AA 账本'})).toBeInTheDocument();
});
