import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { emptyMemory } from './lib/steward-memory';
import { emptyWorkspaces } from './lib/workspaces';
import type { BankSnapshot } from './lib/bank-transfer';

const bank: BankSnapshot = {
  revision: 0,
  balance: 4230000,
  limit: 2000000,
  frozen: false,
  controls: { overseas: false, contactless: true, night: true },
  transactions: [],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith('/bank')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (body?.type === 'prepare') {
        return Response.json({ ...body, id: 'elder-transfer-draft', revision: 0,
          balance: bank.balance, createdAt: Date.now(), expiresAt: Date.now() + 300000 });
      }
      return Response.json(bank);
    }
    if (path.endsWith('/messages') || path.endsWith('/workspaces')) {
      return Response.json({ ...emptyWorkspaces(), conversation: [], runs: [] });
    }
    if (path.endsWith('/automations')) {
      return Response.json({ version: 1, engine: 'mastra', tasks: [], runs: [] });
    }
    return Response.json(emptyMemory());
  });
});

afterEach(() => vi.restoreAllMocks());

it.each(['classic', 'native'] as const)('长辈版选择可恢复，退出后保留原来的 %s 使用方式', async standardMode => {
  localStorage.setItem('zhiyin-mode', JSON.stringify(standardMode));
  const user = userEvent.setup();
  const first = render(<App />);

  await user.click(screen.getByRole('button', { name: '切换到长辈版' }));
  expect(first.container.querySelector('.app-shell')).toHaveClass('elder-mode');
  expect(localStorage.getItem('zhiyin-elder-mode')).toBe('true');
  expect(localStorage.getItem('zhiyin-mode')).toBe(JSON.stringify(standardMode));

  first.unmount();
  const restored = render(<App />);
  expect(restored.container.querySelector('.app-shell')).toHaveClass('elder-mode');
  expect(screen.getByRole('button', { name: /^查余额/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '切换到普通版' }));
  expect(restored.container.querySelector('.app-shell')).not.toHaveClass('elder-mode');
  expect(localStorage.getItem('zhiyin-elder-mode')).toBe('false');
  expect(localStorage.getItem('zhiyin-mode')).toBe(JSON.stringify(standardMode));
  if (standardMode === 'classic') {
    expect(screen.getByRole('heading', { name: '今天想办理什么？' })).toBeInTheDocument();
  } else {
    expect(screen.getByRole('textbox', { name: '和宁宁说点什么' })).toBeInTheDocument();
  }
});

it('切换外观与进入长辈聊天不会丢失尚未发送的文字', async () => {
  localStorage.setItem('zhiyin-mode', '"native"');
  const user = userEvent.setup();
  render(<App />);
  const draft = '我想了解这个月的生活开支';
  await user.type(screen.getByRole('textbox', { name: '和宁宁说点什么' }), draft);

  await user.click(screen.getByRole('button', { name: '切换到长辈版' }));
  await user.click(screen.getByRole('button', { name: '和宁宁聊聊' }));
  expect(screen.getByRole('textbox', { name: '和宁宁说点什么' })).toHaveValue(draft);
  await user.click(screen.getByRole('button', { name: '切换到普通版' }));
  expect(screen.getByRole('textbox', { name: '和宁宁说点什么' })).toHaveValue(draft);
});

it('长辈首页入口连接既有资产、账单和订阅页面，并可返回首页', async () => {
  localStorage.setItem('zhiyin-elder-mode', 'true');
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: /^查余额/ }));
  expect(screen.getByRole('heading', { name: '我的资产' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '返回' }));
  await user.click(screen.getByRole('button', { name: /^看账单/ }));
  expect(screen.getByRole('heading', { name: '账单报告' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '返回' }));
  await user.click(screen.getByRole('button', { name: /^扣费提醒/ }));
  expect(screen.getByRole('heading', { name: '订阅与续费' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '返回' }));
  expect(screen.getByRole('button', { name: '和宁宁聊聊' })).toBeInTheDocument();
});

it('长辈版转账先填写和核对，资金确认不会随入口点击或核对而自动执行', async () => {
  localStorage.setItem('zhiyin-elder-mode', 'true');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^转账汇款/ }));
  const dialog = within(screen.getByRole('dialog', { name: '智能转账' }));
  expect(dialog.getByRole('button', { name: '核对即时转账' })).toBeInTheDocument();
  expect(dialog.queryByRole('button', { name: '确认并立即转账（沙箱）' })).not.toBeInTheDocument();

  const bankCommands = () => vi.mocked(fetch).mock.calls
    .filter(([url, init]) => String(url).endsWith('/bank') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init!.body)).type);
  expect(bankCommands()).toEqual([]);
  await user.selectOptions(dialog.getByLabelText('从哪个账户转出'), 'demo-8888');
  await user.clear(dialog.getByLabelText('转账金额（元）'));
  await user.type(dialog.getByLabelText('转账金额（元）'), '120.50');
  await user.click(dialog.getByRole('button', { name: '核对即时转账' }));
  await waitFor(() => expect(dialog.getByRole('button', { name: '确认并立即转账（沙箱）' })).toBeEnabled());
  expect(dialog.getByText('¥120.5')).toBeInTheDocument();
  expect(bankCommands()).toEqual(['prepare']);
  expect(dialog.getByRole('button', { name: '返回修改' })).toBeInTheDocument();
});
