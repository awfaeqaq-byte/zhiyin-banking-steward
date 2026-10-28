import {useState, type ReactNode} from 'react';
import {ArrowUpRight, CalendarDays, ChevronRight, CreditCard, Eye, EyeOff, FileText, LockKeyhole, PieChart, ShieldCheck, TrendingUp, Wallet} from 'lucide-react';
import {assetMoney} from '../lib/bank-assets';
import type {BankCardId, BankSnapshot} from '../lib/bank-transfer';
import './asset-dashboard.css';

type AssetKind = 'cash' | 'cards' | 'wealth' | 'deposits';
type Props = {
  snapshot: BankSnapshot | null;
  error: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onRefresh: () => void;
  stewardName: string;
  stewardImage: string;
  onAsk: (prompt: string) => void;
  onOpenCards: (id: BankCardId) => void;
  onOpenHoldings: () => void;
  onOpenDeposits: () => void;
  onOpenBills: () => void;
  onOpenRisk: () => void;
  onOpenFunds: () => void;
  onOpenFocus: () => void;
  schedule: ReactNode;
};

export function AssetDashboard({snapshot, error, hidden, onToggleHidden, onRefresh, stewardName, stewardImage, onAsk, onOpenCards, onOpenHoldings, onOpenDeposits, onOpenBills, onOpenRisk, onOpenFunds, onOpenFocus, schedule}: Props) {
  const [selection, setSelection] = useState<AssetKind>('cash');
  const summary = snapshot?.assetSummary;
  const otherCards = snapshot?.cards?.filter(card => !card.isPrimary) ?? [];
  const otherCash = otherCards.reduce((sum, card) => sum + card.balance, 0);
  const total = summary ? summary.total + otherCash : undefined;
  const money = (amount?: number) => hidden ? '••••' : amount === undefined ? '待读取' : assetMoney(amount);
  const assets = [
    {id: 'cash' as const, name: '活期与现金', short: '常用卡现金', amount: snapshot?.balance, color: '#8fe0cc', icon: Wallet,
      detail: summary ? (summary.reservedCash > 0 ? `常用卡 8888 · 含预约和生活筹备等资金安排，安排金额 ${money(summary.reservedCash)}。` : '常用卡 8888 · 日常支付与转账使用的账户余额。') : '常用卡 8888 · 读取账户后可查看资金安排。', action: '查看常用卡', open: () => onOpenCards('primary')},
    ...(otherCards.length ? [{id: 'cards' as const, name: '其他银行卡', short: '其他银行卡', amount: otherCash, color: '#c8d9a7', icon: CreditCard,
      detail: `${otherCards.length} 张银行卡 · 各卡余额与支付权限分别管理。`, action: '查看其他银行卡', open: () => onOpenCards(otherCards[0].id)}] : []),
    {id: 'wealth' as const, name: '理财资产', short: '理财持仓', amount: summary?.wealth, color: '#8fc4d5', icon: TrendingUp,
      detail: summary ? `${summary.holdingCount} 项未赎回持仓 · 按持仓本金汇总。` : '读取账户后可查看持仓本金与明细。', action: '查看理财持仓', open: onOpenHoldings},
    {id: 'deposits' as const, name: '定期存款', short: '定期存款', amount: summary?.deposits, color: '#d7ceaa', icon: LockKeyhole,
      detail: summary ? `${summary.depositCount} 笔未支取定存 · 按存入本金汇总，到期可核对支取。` : '读取账户后可查看定存与到期安排。', action: '查看定期存款', open: onOpenDeposits},
  ];
  const active = assets.find(item => item.id === selection) ?? assets[0];
  const share = total && active.amount !== undefined ? active.amount / total * 100 : 0;
  let offset = 0;
  const segments = assets.map(item => {
    const length = total ? (item.amount ?? 0) / total * 100 : 0;
    const segment = {...item, length, offset};
    offset += length;
    return segment;
  });
  const percentage = hidden || !total ? '—' : `${share > 0 && share < 0.1 ? '<0.1' : share.toFixed(share % 1 ? 1 : 0)}%`;
  const tools = [
    {name: '授权账单报告', description: '看清收支去向', icon: FileText, action: onOpenBills},
    {name: '理财风险测评与持仓', description: '核对风险与持仓', icon: ShieldCheck, action: onOpenRisk},
    {name: '大数据选基', description: '比较产品资料', icon: TrendingUp, action: onOpenFunds},
    {name: '我的关注', description: '查看持续跟进', icon: CalendarDays, action: onOpenFocus},
  ];
  return <div className="asset-dashboard">
    {error && <div className="asset-read-error" role="alert"><p>资产暂未能更新。{snapshot ? '以下保留上次成功读取的快照，不代表当前可用资金。' : '请重试读取后再安排资金。'}</p><button type="button" onClick={onRefresh}>重新读取资产</button></div>}
    <div className="asset-dashboard-main">
      <section className="portfolio-overview" aria-label="账户资产概览">
        <div className="portfolio-overview-top"><span>总资产（元）</span><button type="button" onClick={onToggleHidden} aria-label={hidden ? '显示资产金额' : '隐藏资产金额'}>{hidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
        <div className="portfolio-overview-body">
          <div className="portfolio-total"><strong>{money(total)}</strong><span>银行卡现金 · 理财与定存本金</span></div>
          <div className="portfolio-ring" aria-hidden="true">
            <svg viewBox="0 0 120 120"><circle className="portfolio-ring-track" cx="60" cy="60" r="49"/>{!hidden && total !== undefined && total > 0 && segments.filter(item => item.length > 0).map(item => <circle key={item.id} cx="60" cy="60" r="49" pathLength="100" stroke={item.color} strokeDasharray={`${item.length} ${100 - item.length}`} strokeDashoffset={-item.offset} className={item.id === active.id ? 'is-selected' : ''}/>)}</svg>
            <span><strong>{percentage}</strong><small>{hidden ? '金额已隐藏' : total === undefined ? '待读取' : total === 0 ? '暂无分布' : active.short}</small></span>
          </div>
        </div>
        <div className="portfolio-overview-foot"><span>常用卡可用<strong>{money(summary?.availableCash)}</strong></span><span>常用卡已安排<strong>{money(summary?.reservedCash)}</strong></span></div>
        <p className="portfolio-source">不含微信、支付宝钱包余额</p>
      </section>

      <section className="portfolio-allocation" aria-label="资产分布">
        <div className="portfolio-section-heading"><h2>资产分布</h2><span>点选查看明细</span></div>
        <div className="portfolio-asset-options" role="group" aria-label="选择资产类型">{assets.map(({id, name, amount, icon: Icon}) => <button key={id} type="button" data-asset={id} aria-pressed={active.id === id} onClick={() => setSelection(id)}><span><Icon size={17} aria-hidden="true"/>{name}</span><strong>{money(amount)}</strong><i aria-hidden="true"/></button>)}</div>
        <div className="portfolio-asset-detail" aria-live="polite"><div><span>{active.short}<b>{hidden || !total ? '' : ` · ${percentage}`}</b></span><p>{active.detail}</p></div><button type="button" onClick={active.open}>{active.action}<ArrowUpRight size={16} aria-hidden="true"/></button></div>
      </section>
    </div>

    <div className="asset-dashboard-secondary">
      <button className="portfolio-steward" type="button" onClick={() => onAsk(`请结合我的资产分布和近期资金安排，帮我核对${active.name}，先说明现状，再告诉我还需要确认什么。`)}>
        <img src={stewardImage} alt=""/><span><strong>和{stewardName}一起看资产</strong><small>结合这笔钱的用途，梳理下一步安排</small></span><ChevronRight size={18} aria-hidden="true"/>
      </button>
      {schedule}
      <section className="portfolio-tools" aria-labelledby="portfolio-tools-title"><div className="portfolio-section-heading"><h2 id="portfolio-tools-title">分析与规划</h2><PieChart size={19} aria-hidden="true"/></div><div>{tools.map(({name, description, icon: Icon, action}) => <button key={name} type="button" onClick={action}><Icon size={20} aria-hidden="true"/><span><strong>{name}</strong><small>{description}</small></span><ChevronRight size={15} aria-hidden="true"/></button>)}</div></section>
    </div>
  </div>;
}
