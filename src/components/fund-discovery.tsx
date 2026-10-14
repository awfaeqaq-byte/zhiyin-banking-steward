import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, ChartNoAxesCombined, ChevronRight, Flame, Globe2, Search, ShieldCheck, Sparkles, TrendingUp, X } from 'lucide-react';
import { findFund, fundDataDate, fundSections, funds, type Fund, type FundCategory } from '../lib/fund-discovery-data';
import './fund-discovery.css';

type View = 'home' | 'ranking' | 'watchlist' | 'search';
type DemoOrder = { fundId: string; amount: number; id: string };
const tabs: { id: FundCategory; label: string }[] = [
  { id:'popularity', label:'人气口碑' }, { id:'performance', label:'业绩表现' }, { id:'sector', label:'热门板块' },
];
const icons = [ChartNoAxesCombined, Sparkles, Globe2, ShieldCheck, TrendingUp, Flame];

function readIds() {
  try { const value = JSON.parse(localStorage.getItem('zhiyin-fund-watchlist') || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && !!findFund(id)) : []; }
  catch { return []; }
}
function readOrders(): DemoOrder[] {
  try { const value = JSON.parse(localStorage.getItem('zhiyin-fund-demo-orders') || '[]'); return Array.isArray(value) ? value.filter((order): order is DemoOrder => typeof order?.fundId === 'string' && typeof order?.amount === 'number' && typeof order?.id === 'string') : []; }
  catch { return []; }
}
function percent(value: number) { return `${value.toFixed(2)}%`; }
function Metric({ value, label }: { value: number; label: string }) {
  return <span className="fund-metric"><strong className={value < 0 ? 'down' : 'up'}>{percent(value)}</strong><small>{label}</small></span>;
}

export function FundDiscovery({ onOpenRisk, onBack }: { onOpenRisk: () => void; onBack?: () => void }) {
  const [category, setCategory] = useState<FundCategory>('popularity');
  const [view, setView] = useState<View>('home');
  const [sectionId, setSectionId] = useState('popular');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(readIds);
  const [filter, setFilter] = useState('all');
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [orderFund, setOrderFund] = useState<Fund | null>(null);
  const [orderAmount, setOrderAmount] = useState('100');
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [orders, setOrders] = useState<DemoOrder[]>(readOrders);
  const [orderError, setOrderError] = useState('');
  const sections = fundSections[category];
  const selectedSection = sections.find(section => section.id === sectionId) || sections[0];

  useEffect(() => { localStorage.setItem('zhiyin-fund-watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('zhiyin-fund-demo-orders', JSON.stringify(orders)); }, [orders]);

  const ranking = useMemo(() => {
    const first = selectedSection.fundIds.map(findFund).filter((fund): fund is Fund => !!fund);
    const related = funds.filter(fund => !selectedSection.fundIds.includes(fund.id) &&
      (category !== 'sector' || fund.sector === first[0]?.sector));
    return [...first, ...related].filter(fund => filter === 'all' ||
      (filter === 'positive' ? fund.week >= 0 : fund.week < 0));
  }, [selectedSection, category, filter]);
  const matches = funds.filter(fund => `${fund.name} ${fund.code} ${fund.kind} ${fund.sector || ''}`.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase()));
  const saved = watchlist.map(findFund).filter((fund): fund is Fund => !!fund);

  function switchCategory(next: FundCategory) { setCategory(next); setSectionId(fundSections[next][0].id); setFilter('all'); setView('home'); }
  function openRanking(id: string) { setSectionId(id); setFilter('all'); setView('ranking'); }
  function toggleWatchlist(id: string) { setWatchlist(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  function submitSearch(event: FormEvent) { event.preventDefault(); setSearchTerm(query.trim()); setView(query.trim() ? 'search' : 'home'); }
  function openOrder(fund: Fund) { setSelectedFund(null); setOrderFund(fund); setOrderAmount('100'); setOrderError(''); setOrder(null); }
  function confirmOrder() {
    const amount = Number(orderAmount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 1000000 || Math.round(amount * 100) !== amount * 100) {
      setOrderError('请输入 100 至 1,000,000 元，最多保留两位小数。'); return;
    }
    const receipt = { fundId: orderFund!.id, amount, id: `DEMO-${Date.now().toString(36).toUpperCase()}` };
    setOrder(receipt);
    setOrders(current => [receipt, ...current]);
    setOrderError('');
  }
  function FundCard({ fund, rank, compact = false }: { fund: Fund; rank?: number; compact?: boolean }) {
    const firstValue = category === 'performance' ? fund.quarter : category === 'sector' ? fund.sectorWeight ?? fund.week : fund.week;
    const firstLabel = category === 'performance' ? '近三个月涨跌幅' : category === 'sector' ? '板块仓位占比' : '近一周涨跌幅';
    return <article className={`fund-card ${compact ? 'compact' : ''}`} key={fund.id}>
      <div className="fund-card-top">
        {rank && <span className={`fund-rank rank-${Math.min(rank, 4)}`}>{rank}</span>}
        <button type="button" className="fund-name" onClick={() => setSelectedFund(fund)}>{fund.name}</button>
        <button type="button" className="fund-save" aria-label={`${watchlist.includes(fund.id) ? '取消自选' : '加入自选'} ${fund.name}`} aria-pressed={watchlist.includes(fund.id)} onClick={() => toggleWatchlist(fund.id)}>{watchlist.includes(fund.id) ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button>
      </div>
      <div className="fund-card-bottom">
        <Metric value={firstValue} label={firstLabel} />
        <Metric value={fund.year} label="近一年涨跌幅" />
        {!compact && <div className="fund-card-action"><small>{fund.tag}</small><button type="button" onClick={() => openOrder(fund)}>买一笔</button></div>}
      </div>
      {compact && <button type="button" className="fund-rank-buy" onClick={() => openOrder(fund)}>模拟买入 <ArrowRight size={14} /></button>}
    </article>;
  }

  return <div className="fund-discovery">
    <div className="fund-searchbar">
      {(view !== 'home' || onBack) && <button type="button" className="fund-back" aria-label={view === 'home' ? '返回上一页' : '返回选基首页'} onClick={() => view === 'home' ? onBack?.() : setView('home')}><ArrowLeft size={21} /></button>}
      <form onSubmit={submitSearch} role="search"><Search size={18} /><input aria-label="搜索基金名称或代码" placeholder="搜索产品名称 / 基金代码" value={query} onChange={event => setQuery(event.target.value)} /><button type="submit">搜索</button></form>
      <button type="button" className="fund-watchlist-link" aria-label="查看我的自选" onClick={() => setView('watchlist')}><Bookmark size={21} /><span>自选</span>{watchlist.length > 0 && <i>{watchlist.length}</i>}</button>
    </div>

    {view === 'home' && <>
      <div className="fund-shortcuts" aria-label="选基快捷入口">{['基金排行','指数基金','全球投资','黄金','固收+','偏债基金','债市行情','定投纳指','大数据选基','更多'].map((label,index) => { const Icon = icons[index % icons.length]; return <button type="button" key={label} onClick={() => { const next = index === 1 || index === 2 || index === 7 ? 'performance' : index === 3 || index === 6 ? 'sector' : 'popularity'; setCategory(next); openRanking(fundSections[next][0].id); }}><span className={`fund-shortcut-icon tone-${index % 5}`}><Icon size={23}/></span><span>{label}</span></button>; })}</div>
      <div className="fund-banners"><div><strong>大数据选基</strong><span>从不同维度发现基金</span></div><div><strong>小批量样本</strong><span>先体验榜单与自选</span></div></div>
    </>}

    {(view === 'home' || view === 'ranking') && <>
      <div className="fund-hero"><div><span>不同维度表现突出的基金</span><h1>大数据选基</h1><p>按人气、表现与板块探索</p></div><span className="fund-hero-mark" aria-hidden="true">✦</span></div>
      <div className="fund-category-tabs" role="tablist" aria-label="选基分类">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={category === tab.id} onClick={() => switchCategory(tab.id)}>{tab.label}</button>)}</div>
      <p className="fund-data-note">演示样本 · 数据基于截图录入，日期 {fundDataDate} · 非实时行情，过往表现不预示未来收益</p>
    </>}

    {view === 'home' && <div className="fund-sections">{category === 'sector' && <p className="fund-sector-date">板块涨跌幅样本截至 {fundDataDate} 15:00</p>}{sections.map(section => { const fund = findFund(section.fundIds[0])!; return <section className="fund-section" key={section.id}><div className="fund-section-heading"><div><h2>{section.title}</h2>{section.change !== undefined && <small>涨跌幅 <b className={section.change < 0 ? 'down' : 'up'}>{percent(section.change)}</b></small>}</div><button type="button" onClick={() => openRanking(section.id)}>更多 <ChevronRight size={17}/></button></div><FundCard fund={fund}/></section>; })}</div>}

    {view === 'ranking' && <div className="fund-ranking"><aside aria-label="榜单维度">{sections.map(section => <button key={section.id} type="button" className={section.id === selectedSection.id ? 'selected' : ''} onClick={() => setSectionId(section.id)}>{section.title.replace('的基金','').replace('基金','')}</button>)}</aside><div className="fund-ranking-main"><div className="fund-ranking-heading"><div><h2>{selectedSection.title}</h2><p>根据演示样本排序，供界面体验</p></div><label>筛选<select aria-label="筛选周涨跌" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部</option><option value="positive">近一周上涨</option><option value="negative">近一周下跌</option></select></label></div>{ranking.length ? ranking.map((fund,index) => <FundCard key={fund.id} fund={fund} rank={index + 1} compact />) : <p className="fund-empty">当前筛选条件下没有样本。</p>}</div></div>}

    {view === 'watchlist' && <section className="fund-list-view"><h1>我的自选</h1><p>收藏的演示基金保存在当前浏览器。</p>{saved.length ? saved.map(fund => <FundCard key={fund.id} fund={fund}/>) : <div className="fund-empty">还没有自选基金，返回榜单点书签即可添加。</div>}{orders.length > 0 && <div className="fund-demo-orders"><h2>模拟申购记录</h2><p>以下记录仅保存在当前浏览器，未发生真实交易或扣款。</p>{orders.map(item => <div key={item.id}><span>{findFund(item.fundId)?.name || '演示基金'}<small>{item.id}</small></span><strong>¥{item.amount.toFixed(2)}</strong></div>)}</div>}</section>}
    {view === 'search' && <section className="fund-list-view"><h1>搜索结果</h1><p>“{searchTerm}”找到 {matches.length} 项演示样本</p>{matches.length ? matches.map(fund => <FundCard key={fund.id} fund={fund}/>) : <div className="fund-empty">没有找到匹配的基金，试试名称、代码或板块关键词。</div>}</section>}

    {selectedFund && <div className="fund-modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedFund(null); }}><section className="fund-modal" role="dialog" aria-modal="true" aria-label="基金样本详情"><button type="button" className="fund-modal-close" aria-label="关闭详情" onClick={() => setSelectedFund(null)}><X size={20}/></button><span className="fund-modal-kicker">基金资料 · 演示样本</span><h2>{selectedFund.name}</h2><p>{selectedFund.code} · {selectedFund.kind} · 样本日期 {fundDataDate}</p><div className="fund-detail-metrics"><Metric value={selectedFund.week} label="近一周涨跌幅"/><Metric value={selectedFund.quarter} label="近三个月涨跌幅"/><Metric value={selectedFund.year} label="近一年涨跌幅"/></div><p className="fund-disclaimer">以上数值用于页面功能演示，未连接实时行情。基金有净值波动与本金损失风险；实际申购前请核对官方资料和适当性。</p><div className="fund-modal-actions"><button type="button" onClick={() => toggleWatchlist(selectedFund.id)}>{watchlist.includes(selectedFund.id) ? '取消自选' : '加入自选'}</button><button type="button" onClick={() => openOrder(selectedFund)}>模拟买入</button></div></section></div>}

    {orderFund && <div className="fund-modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOrderFund(null); }}><section className="fund-modal" role="dialog" aria-modal="true" aria-label="模拟申购核对"><button type="button" className="fund-modal-close" aria-label="关闭申购" onClick={() => setOrderFund(null)}><X size={20}/></button><span className="fund-modal-kicker">仅供体验 · 不扣款</span><h2>{order ? '模拟申购已记录' : '模拟申购核对'}</h2><p>{orderFund.name}</p>{order ? <><div className="fund-order-success"><ShieldCheck size={23}/><span>演示记录 {order.id}<br/>金额 ¥{order.amount.toFixed(2)} · 未发生真实交易</span></div><button type="button" className="fund-primary-wide" onClick={() => setOrderFund(null)}>完成</button></> : <><label className="fund-amount">演示金额（元）<input type="number" aria-label="演示申购金额" min="100" max="1000000" step="0.01" value={orderAmount} onChange={event => setOrderAmount(event.target.value)}/></label>{orderError && <p className="fund-order-error" role="alert">{orderError}</p>}<p className="fund-disclaimer">此操作只生成本页演示记录，不接入银行余额或真实基金交易。正式投资需先完成风险测评并阅读产品文件。</p><div className="fund-modal-actions"><button type="button" onClick={() => { setOrderFund(null); onOpenRisk(); }}>查看风险测评</button><button type="button" onClick={confirmOrder}>确认模拟申购</button></div></>}</section></div>}
  </div>;
}
