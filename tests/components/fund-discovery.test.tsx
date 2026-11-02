import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FundDiscovery } from '../../src/components/fund-discovery';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fundNames() {
  return within(screen.getByRole('list', { name: '基金列表' }))
    .getAllByRole('button', { name: /^查看 / }).map(button => button.textContent);
}

it('shows the complete catalog and sorts by the actual selected period', async () => {
  const user = userEvent.setup();
  render(<FundDiscovery onOpenRisk={vi.fn()} />);
  expect(screen.getByRole('heading', { name: '基金筛选' })).toBeInTheDocument();
  expect(fundNames()).toHaveLength(11);
  expect(fundNames()[0]).toContain('易方达供给改革混合');
  await user.selectOptions(screen.getByRole('combobox', { name: '排序指标' }), 'week');
  expect(fundNames()[0]).toContain('天弘中证油气产业指数发起A');
  await user.click(screen.getByRole('button', { name: '切换为从低到高排序' }));
  expect(fundNames()[0]).toContain('汇添富纳斯达克生物科技ETF发起式联接A');
  await user.selectOptions(screen.getByRole('combobox', { name: '排序指标' }), 'year');
  expect(fundNames()[0]).toContain('银华体育文化灵活配置混合A');
  expect(screen.getByText(/2026-10-14 · 非实时/)).toBeInTheDocument();
  expect(screen.queryByText(/人气榜|连续三年|DEMO00/)).not.toBeInTheDocument();
});

it('combines actual fund types, search and weekly filters and can recover an empty result', async () => {
  const user = userEvent.setup();
  render(<FundDiscovery onOpenRisk={vi.fn()} />);
  await user.selectOptions(screen.getByRole('combobox', { name: '基金类型' }), '海外指数');
  expect(fundNames()).toHaveLength(4);
  await user.selectOptions(screen.getByRole('combobox', { name: '周涨跌' }), 'negative');
  expect(fundNames()).toHaveLength(2);
  await user.type(screen.getByRole('searchbox', { name: '搜索基金名称或方向' }), '不存在');
  expect(screen.getByText('没有符合条件的基金')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(fundNames()).toHaveLength(11);
  await user.type(screen.getByRole('searchbox', { name: '搜索基金名称或方向' }), '人工智能');
  expect(fundNames()).toEqual(['西部利得中证人工智能主题指数增强A']);
});

it('persists favorites and retains the previous filter when returning from details', async () => {
  const user = userEvent.setup();
  render(<FundDiscovery onOpenRisk={vi.fn()} />);
  await user.type(screen.getByRole('searchbox', { name: '搜索基金名称或方向' }), '油气');
  await user.click(screen.getByRole('button', { name: '加入自选 天弘中证油气产业指数发起A' }));
  expect(JSON.parse(localStorage.getItem('zhiyin-fund-watchlist')!)).toEqual(['energy']);
  await user.click(screen.getByRole('button', { name: '查看 天弘中证油气产业指数发起A' }));
  expect(screen.getByRole('region', { name: '基金详情' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '返回基金列表' }));
  expect(screen.getByRole('searchbox', { name: '搜索基金名称或方向' })).toHaveValue('油气');
  expect(screen.getByRole('button', { name: '查看 天弘中证油气产业指数发起A' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: /我的自选/ }));
  expect(fundNames()).toEqual(['天弘中证油气产业指数发起A']);
  await user.click(screen.getByRole('button', { name: '取消自选 天弘中证油气产业指数发起A' }));
  expect(screen.getByText('还没有自选基金')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '浏览全部基金' }));
  expect(fundNames()).toHaveLength(11);
});

it('opens a shared product directly and hands its stable ID to the wealth conversation', async () => {
  const user = userEvent.setup();
  const onAskNingning = vi.fn();
  const onOpenRisk = vi.fn();
  render(<FundDiscovery initialFundId="energy" onOpenRisk={onOpenRisk} onAskNingning={onAskNingning} />);
  const details = screen.getByRole('region', { name: '基金详情' });
  expect(within(details).getByRole('heading', { name: '天弘中证油气产业指数发起A' })).toBeInTheDocument();
  expect(within(details).getByText(/截图录入/)).toBeInTheDocument();
  expect(within(details).getByText(/风险等级、申购费用和赎回规则待核验/)).toBeInTheDocument();
  await user.click(within(details).getByRole('button', { name: '请宁宁分析' }));
  expect(onAskNingning).toHaveBeenCalledWith('energy');
  await user.click(within(details).getByRole('button', { name: '查看风险测评' }));
  expect(onOpenRisk).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /买入|申购|确认支付/ })).not.toBeInTheDocument();
  expect(localStorage.getItem('zhiyin-fund-demo-orders')).toBeNull();
});

it('ignores unknown deep links and malformed favorites without fabricating orders', () => {
  localStorage.setItem('zhiyin-fund-watchlist', '{broken');
  localStorage.setItem('zhiyin-fund-demo-orders', '[{"id":"legacy"}]');
  render(<FundDiscovery initialFundId="unknown" onOpenRisk={vi.fn()} />);
  expect(fundNames()).toHaveLength(11);
  expect(screen.queryByText(/模拟申购记录|演示产品|仅供学习/)).not.toBeInTheDocument();
  expect(localStorage.getItem('zhiyin-fund-demo-orders')).toBe('[{"id":"legacy"}]');
});

it('returns to wealth with the existing navigation callback', async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<FundDiscovery onBack={onBack} onOpenRisk={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: '返回财富' }));
  expect(onBack).toHaveBeenCalledOnce();
});


it('shows retained filters in favorites and clears them without losing saved funds', async () => {
  const user = userEvent.setup();
  localStorage.setItem('zhiyin-fund-watchlist', '["medical","energy"]');
  render(<FundDiscovery onOpenRisk={vi.fn()} />);
  await user.type(screen.getByRole('searchbox'), '油气');
  await user.click(screen.getByRole('button', { name: /我的自选/ }));
  expect(fundNames()).toHaveLength(1);
  expect(screen.getByLabelText('当前筛选条件')).toHaveTextContent('搜索“油气”');
  await user.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(fundNames()).toHaveLength(2);
  expect(screen.getByRole('button', { name: /我的自选/ })).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse(localStorage.getItem('zhiyin-fund-watchlist')!)).toEqual(['medical', 'energy']);
});

it('uses the selected steward and explains the handoff before analysis', async () => {
  const onAskNingning = vi.fn();
  render(<FundDiscovery initialFundId="energy" stewardName="阿衡" onOpenRisk={vi.fn()} onAskNingning={onAskNingning} />);
  expect(screen.getByText(/回到财富后会带入这只基金的提问/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '请阿衡分析' }));
  expect(onAskNingning).toHaveBeenCalledWith('energy');
});
