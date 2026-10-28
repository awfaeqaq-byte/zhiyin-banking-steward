import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {BankCardSchedule, BankSnapshot} from '../lib/bank-transfer';
import type {TermDeposit} from '../lib/bank-assets';
import type {SubscriptionInsight} from '../lib/subscription-insights';
import {AssetSchedule} from './asset-schedule';

const now = Date.parse('2026-10-21T10:00:00+08:00');
const tomorrow = now + 86400000;
const snapshot = (patch: Partial<BankSnapshot> = {}): BankSnapshot => ({
  revision: 1, balance: 4230000, limit: 5000000, frozen: false,
  controls: {overseas: false, contactless: false, night: true}, transactions: [], asOf: now,
  ...patch,
});
const transfer = (patch: Partial<BankCardSchedule> = {}): BankCardSchedule => ({
  id: 'living-mom', cardId: 'living', amount: 120000, recipientId: 'mom',
  executeAt: tomorrow, createdAt: now, status: 'pending', ...patch,
});
const deposit = (patch: Partial<TermDeposit> = {}): TermDeposit => ({
  id: 'deposit-1', amount: 880000, months: 3, rateBps: 110,
  openedAt: now - 90 * 86400000, maturesAt: tomorrow + 3600000, ...patch,
});
const renewal = (patch: Partial<SubscriptionInsight> = {}): SubscriptionInsight => ({
  id: 'music', title: '音乐会员', amount: 1800, cycle: '月', nextChargeAt: tomorrow + 7200000,
  key: 'wechat_pay:music', provider: 'wechat_pay', providerName: '微信支付', daysUntilCharge: 1,
  urgency: 'urgent', flags: [], category: '音乐会员', ...patch,
});
const handlers = () => ({onOpenSchedule: vi.fn(), onOpenFunding: vi.fn(), onOpenTransfer: vi.fn(), onOpenDeposits: vi.fn(), onOpenSubscription: vi.fn(), onRetry: vi.fn()});

describe('资产页近期资金安排', () => {
  it('合并真实来源按日期排序，只保留待执行预约与未支取定存，最多显示三项', () => {
    render(<AssetSchedule {...handlers()} snapshot={snapshot({
      allSchedules: [transfer({executeAt: tomorrow + 60000}), transfer({id: 'cancelled', status: 'cancelled', executeAt: now - 60000}), transfer({id: 'completed', status: 'completed', executeAt: now - 60000})],
      termDeposits: [deposit({maturesAt: tomorrow}), deposit({id: 'closed', closedAt: now, maturesAt: now - 60000})],
    })} subscriptions={[renewal(), renewal({id: 'later', key: 'alipay:later', title: '下月视频会员', nextChargeAt: tomorrow + 86400000})]}/>);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map(row => within(row).getByRole('button').textContent)).toEqual([
      expect.stringContaining('3 个月定存到期'), expect.stringContaining('转给妈妈'), expect.stringContaining('音乐会员'),
    ]);
    expect(within(rows[0]).getByText('¥8,800.00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('¥18.00')).toBeInTheDocument();
    expect(screen.queryByText('下月视频会员')).not.toBeInTheDocument();
  });

  it('分别打开预约所在银行卡、定存和对应支付来源的续费详情', () => {
    const callbacks = handlers();
    render(<AssetSchedule {...callbacks} snapshot={snapshot({allSchedules: [transfer()], termDeposits: [deposit()]})} subscriptions={[renewal()]}/>);
    fireEvent.click(screen.getByRole('button', {name: /转给妈妈/}));
    expect(callbacks.onOpenTransfer).toHaveBeenCalledWith('living');
    expect(screen.getByText('生活备用卡 · 6216')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /3 个月定存到期/}));
    expect(callbacks.onOpenDeposits).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', {name: /音乐会员/}));
    expect(callbacks.onOpenSubscription).toHaveBeenCalledWith('wechat_pay', 'music');
  });

  it('非汇总快照的预约沿用本卡作用域；已传空汇总时不重复读取本卡旧预约', () => {
    const callbacks = handlers();
    const state = snapshot({cardId: 'reserve', schedules: [transfer({id: 'reserve-mom'})]});
    const {rerender} = render(<AssetSchedule {...callbacks} snapshot={state}/>);
    fireEvent.click(screen.getByRole('button', {name: /转给妈妈/}));
    expect(callbacks.onOpenTransfer).toHaveBeenCalledWith('reserve');
    expect(screen.getByText('储蓄备用卡 · 9073')).toBeInTheDocument();
    rerender(<AssetSchedule {...callbacks} snapshot={snapshot({schedules: [transfer()], allSchedules: []})}/>);
    expect(screen.queryByRole('button', {name: /转给妈妈/})).not.toBeInTheDocument();
  });

  it('隐藏金额时文字和可访问名称都不暴露金额', () => {
    const {container} = render(<AssetSchedule {...handlers()} hidden snapshot={snapshot({allSchedules: [transfer()], termDeposits: [deposit()]})} subscriptions={[renewal()]}/>);
    expect(screen.getAllByLabelText('金额已隐藏')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/1,200|8,800|18\.00/);
    expect(screen.queryByRole('button', {name: /1,200|8,800|18\.00/})).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/120000|880000|18\.00/);
  });

  it('过了时间仍待处理的事项保留并显示待核对或待支取', () => {
    render(<AssetSchedule {...handlers()} snapshot={snapshot({
      allSchedules: [transfer({executeAt: now - 60000})], termDeposits: [deposit({maturesAt: now - 60000})],
    })} subscriptions={[renewal({nextChargeAt: now - 60000})]}/>);
    expect(screen.getByText('等待核对')).toBeInTheDocument();
    expect(screen.getByText('待支取')).toBeInTheDocument();
    expect(screen.getByText('结果待核对')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('读取中和失败不宣称没有事项，重试与空态的资金安排入口可用', () => {
    const callbacks = handlers();
    const {rerender} = render(<AssetSchedule {...callbacks} loading/>);
    expect(screen.getByRole('status')).toHaveTextContent('正在读取资金安排');
    expect(screen.queryByText('暂时没有待处理的资金安排')).not.toBeInTheDocument();
    rerender(<AssetSchedule {...callbacks} error="读取失败"/>);
    expect(screen.getByRole('status')).toHaveTextContent('银行安排暂未更新');
    expect(screen.queryByText('正在读取资金安排…')).not.toBeInTheDocument();
    expect(screen.queryByText('暂时没有待处理的资金安排')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '重试'}));
    expect(callbacks.onRetry).toHaveBeenCalledOnce();
    rerender(<AssetSchedule {...callbacks} snapshot={snapshot()}/>);
    expect(screen.getByText('暂时没有待处理的资金安排')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '查看资金安排'}));
    expect(callbacks.onOpenFunding).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', {name: '查看日程'}));
    expect(callbacks.onOpenSchedule).toHaveBeenCalledOnce();
  });
});
