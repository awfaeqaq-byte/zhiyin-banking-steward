import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {AssetDashboard} from '../../src/components/asset-dashboard';
import type {BankSnapshot} from '../../src/lib/bank-transfer';

const snapshot: BankSnapshot = {revision: 0, balance: 100000, limit: 2000000, frozen: false, controls: {overseas: false, night: true, contactless: true}, transactions: [], assetSummary: {cash: 100000, availableCash: 80000, reservedCash: 20000, wealth: 200000, deposits: 300000, total: 600000, holdingCount: 2, depositCount: 1}};
function props() {
  return {snapshot, error: '', hidden: false, onToggleHidden: vi.fn(), onRefresh: vi.fn(), stewardName: '阿衡', stewardImage: '/aheng.png', onAsk: vi.fn(), onOpenCards: vi.fn(), onOpenHoldings: vi.fn(), onOpenDeposits: vi.fn(), onOpenBills: vi.fn(), onOpenRisk: vi.fn(), onOpenFunds: vi.fn(), onOpenFocus: vi.fn(), schedule: null};
}

it('点选资产联动占比与真实说明，明细入口保留对应业务，管家提问带当前上下文', async () => {
  const handlers = props();
  render(<AssetDashboard {...handlers}/>);
  const user = userEvent.setup();
  expect(within(screen.getByRole('region', {name: '账户资产概览'})).getByText('¥6,000.00')).toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: /^理财资产/}));
  expect(screen.getByRole('button', {name: /^理财资产/})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('2 项未赎回持仓 · 按持仓本金汇总。')).toBeInTheDocument();
  expect(screen.getByText('33.3%')).toBeInTheDocument();
  expect(handlers.onOpenHoldings).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', {name: '查看理财持仓'}));
  expect(handlers.onOpenHoldings).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', {name: /和阿衡一起看资产/}));
  expect(handlers.onAsk).toHaveBeenCalledWith(expect.stringContaining('理财资产'));
});

it('隐藏金额同步遮住总额、分类、安排金额和占比；无数据不能显示零余额', () => {
  const handlers = props();
  const view = render(<AssetDashboard {...handlers} hidden/>);
  expect(screen.queryByText(/¥/)).not.toBeInTheDocument();
  expect(screen.queryByText(/\d+\.\d+%/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: '显示资产金额'})).toBeInTheDocument();
  view.rerender(<AssetDashboard {...handlers} snapshot={null} error="读取失败"/>);
  expect(screen.getByRole('alert')).toHaveTextContent('资产暂未能更新');
  expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: '重新读取资产'})).toBeInTheDocument();
});
