import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpWideNarrow, Bookmark, BookmarkCheck, ChevronRight, MessageCircle, Search, X } from 'lucide-react';
import { wealthCatalog, type WealthCatalogProduct } from '../lib/wealth-catalog';
import { usePhoneBack } from '../lib/phone-bridge';
import './fund-discovery.css';

type FundProduct = WealthCatalogProduct & { metrics: { week: number; quarter: number; year: number } };
type SortPeriod = keyof FundProduct['metrics'];
type WeeklyFilter = 'all' | 'positive' | 'negative';
const catalogFunds = wealthCatalog.filter((product): product is FundProduct => product.source === 'fund' && !!product.metrics);
const fundKinds = [...new Set(catalogFunds.map(product => product.category))];
const periodLabels: Record<SortPeriod, string> = { week: '近一周', quarter: '近三个月', year: '近一年' };
const findCatalogFund = (id?: string) => catalogFunds.find(product => product.id === id);

function readWatchlist(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('zhiyin-fund-watchlist') || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!findCatalogFund(id)))] : [];
  } catch { return []; }
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="fund-metric"><strong className={`fund-metric-value ${value < 0 ? 'is-down' : value > 0 ? 'is-up' : ''}`}>{value > 0 ? '+' : ''}{value.toFixed(2)}%</strong><span>{label}</span></div>;
}

interface FundDiscoveryProps {
  onOpenRisk: () => void;
  onBack?: () => void;
  initialFundId?: string;
  onAskNingning?: (fundId: string) => void;
}

export function FundDiscovery({ onOpenRisk, onBack, initialFundId, onAskNingning }: FundDiscoveryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => findCatalogFund(initialFundId)?.id ?? null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [weeklyFilter, setWeeklyFilter] = useState<WeeklyFilter>('all');
  const [period, setPeriod] = useState<SortPeriod>('quarter');
  const [ascending, setAscending] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [watchlist, setWatchlist] = useState(readWatchlist);
  const [storageMessage, setStorageMessage] = useState('');
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const lastOpenedId = useRef<string | null>(null);
  const listButtons = useRef(new Map<string, HTMLButtonElement>());
  const previousSelection = useRef<string | null>(null);
  const selectedFund = findCatalogFund(selectedId ?? undefined);

  useEffect(() => { setSelectedId(findCatalogFund(initialFundId)?.id ?? null); }, [initialFundId]);
  useEffect(() => {
    if (selectedId) detailHeading.current?.focus();
    else if (previousSelection.current && lastOpenedId.current) listButtons.current.get(lastOpenedId.current)?.focus();
    previousSelection.current = selectedId;
  }, [selectedId]);
  usePhoneBack(() => { setSelectedId(null); return true; }, 50, !!selectedFund);

  const visibleFunds = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return catalogFunds.filter(fund =>
      (!onlySaved || watchlist.includes(fund.id)) &&
      (kind === 'all' || fund.category === kind) &&
      (weeklyFilter === 'all' || (weeklyFilter === 'positive' ? fund.metrics.week > 0 : fund.metrics.week < 0)) &&
      `${fund.name} ${fund.category} ${fund.sector ?? ''}`.toLocaleLowerCase().includes(keyword),
    ).sort((a, b) => (a.metrics[period] - b.metrics[period]) * (ascending ? 1 : -1));
  }, [query, kind, weeklyFilter, period, ascending, onlySaved, watchlist]);

  function toggleWatchlist(id: string) {
    const next = watchlist.includes(id) ? watchlist.filter(value => value !== id) : [...watchlist, id];
    setWatchlist(next);
    try {
      localStorage.setItem('zhiyin-fund-watchlist', JSON.stringify(next));
      setStorageMessage('');
    } catch {
      setStorageMessage('自选已在本页更新，浏览器暂时无法保存。刷新后可能无法保留。');
    }
  }
  function clearFilters() { setQuery(''); setKind('all'); setWeeklyFilter('all'); }
  function showAll() { clearFilters(); setOnlySaved(false); }

  return <div className="fund-discovery">
    <header className="fund-catalog-header">
      {(selectedFund || onBack) && <button type="button" className="fund-text-action" onClick={() => selectedFund ? setSelectedId(null) : onBack?.()} aria-label={selectedFund ? '返回基金列表' : '返回财富'}><ArrowLeft size={18} aria-hidden="true" />{selectedFund ? '基金列表' : '财富'}</button>}
      <h1>基金筛选</h1>
      <p>和财富页共用产品目录，选好后交给宁宁结合你的计划分析。</p>
    </header>

    {storageMessage && <p className="fund-storage-message" role="status">{storageMessage}</p>}

    {selectedFund ? <section className="fund-detail" aria-label="基金详情">
      <h2 ref={detailHeading} tabIndex={-1}>{selectedFund.name}</h2>
      <p className="fund-detail-category">{selectedFund.category}{selectedFund.sector ? ` · ${selectedFund.sector}` : ''}</p>
      <div className="fund-detail-metrics">
        <Metric value={selectedFund.metrics.week} label="近一周涨跌幅" />
        <Metric value={selectedFund.metrics.quarter} label="近三个月涨跌幅" />
        <Metric value={selectedFund.metrics.year} label="近一年涨跌幅" />
      </div>
      <div className="fund-detail-evidence">
        <h3>分析前需要了解</h3>
        <p>资料日期 {selectedFund.dataDate} · 非实时行情</p>
        <p>资料来源：既有选基截图录入，数值尚未由基金官方核验。过往表现不预示未来收益。</p>
        <p>风险等级、申购费用和赎回规则待核验。宁宁可以帮助梳理关注点，当前资料不用于直接下单。</p>
      </div>
      <div className="fund-detail-actions">
        <button type="button" className="fund-secondary-action" aria-pressed={watchlist.includes(selectedFund.id)} onClick={() => toggleWatchlist(selectedFund.id)}>{watchlist.includes(selectedFund.id) ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}{watchlist.includes(selectedFund.id) ? '已加入自选' : '加入自选'}</button>
        {onAskNingning && <button type="button" className="fund-primary-action" onClick={() => onAskNingning(selectedFund.id)}><MessageCircle size={18} aria-hidden="true" />请宁宁分析</button>}
      </div>
      <button type="button" className="fund-risk-link" onClick={onOpenRisk}>查看风险测评<ChevronRight size={16} aria-hidden="true" /></button>
    </section> : <>
      <div className="fund-search">
        <Search size={19} aria-hidden="true" />
        <input type="search" aria-label="搜索基金名称或方向" placeholder="搜索基金名称、类型或方向" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={18} aria-hidden="true" /></button>}
      </div>
      <nav className="fund-list-switch" aria-label="基金范围">
        <button type="button" aria-pressed={!onlySaved} onClick={() => setOnlySaved(false)}>全部基金 <span>{catalogFunds.length}</span></button>
        <button type="button" aria-pressed={onlySaved} onClick={() => setOnlySaved(true)}><Bookmark size={16} aria-hidden="true" />我的自选 <span>{watchlist.length}</span></button>
      </nav>
      <div className="fund-filter-row">
        <label>基金类型<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部类型</option>{fundKinds.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
        <label>周涨跌<select value={weeklyFilter} onChange={event => setWeeklyFilter(event.target.value as WeeklyFilter)}><option value="all">全部表现</option><option value="positive">近一周上涨</option><option value="negative">近一周下跌</option></select></label>
      </div>
      <div className="fund-sort-row">
        <label><span>排序指标</span><select aria-label="排序指标" value={period} onChange={event => setPeriod(event.target.value as SortPeriod)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}涨跌幅</option>)}</select></label>
        <button type="button" aria-label={ascending ? '切换为从高到低排序' : '切换为从低到高排序'} onClick={() => setAscending(value => !value)}>{ascending ? <ArrowUpWideNarrow size={17} aria-hidden="true" /> : <ArrowDownWideNarrow size={17} aria-hidden="true" />}{ascending ? '从低到高' : '从高到低'}</button>
      </div>
      <div className="fund-results-summary"><span role="status">{visibleFunds.length} 只基金</span><span>资料日期 {catalogFunds[0]?.dataDate} · 非实时</span></div>
      {visibleFunds.length ? <ul className="fund-results" aria-label="基金列表">{visibleFunds.map(fund => <li key={fund.id}>
        <div className="fund-row-heading">
          <button type="button" className="fund-name" ref={button => { if (button) listButtons.current.set(fund.id, button); else listButtons.current.delete(fund.id); }} aria-label={`查看 ${fund.name}`} onClick={() => { lastOpenedId.current = fund.id; setSelectedId(fund.id); }}>{fund.name}</button>
          <button type="button" className="fund-save" aria-label={`${watchlist.includes(fund.id) ? '取消自选' : '加入自选'} ${fund.name}`} aria-pressed={watchlist.includes(fund.id)} onClick={() => toggleWatchlist(fund.id)}>{watchlist.includes(fund.id) ? <BookmarkCheck size={20} aria-hidden="true" /> : <Bookmark size={20} aria-hidden="true" />}</button>
        </div>
        <p className="fund-row-category">{fund.category}{fund.sector ? ` · ${fund.sector}` : ''}</p>
        <div className="fund-row-data"><Metric value={fund.metrics[period]} label={`${periodLabels[period]}涨跌幅`} /><Metric value={fund.metrics[period === 'year' ? 'quarter' : 'year']} label={period === 'year' ? '近三个月涨跌幅' : '近一年涨跌幅'} /><button type="button" className="fund-row-detail" aria-label={`了解 ${fund.name}`} onClick={() => { lastOpenedId.current = fund.id; setSelectedId(fund.id); }}>详情<ChevronRight size={16} aria-hidden="true" /></button></div>
      </li>)}</ul> : <div className="fund-empty"><Bookmark size={26} aria-hidden="true" /><h2>{onlySaved && watchlist.length === 0 ? '还没有自选基金' : '没有符合条件的基金'}</h2><p>{onlySaved && watchlist.length === 0 ? '把感兴趣的基金加入自选，方便下次继续了解。' : '试试其他名称、类型或涨跌条件。'}</p><button type="button" className="fund-secondary-action" onClick={onlySaved && watchlist.length === 0 ? showAll : clearFilters}>{onlySaved && watchlist.length === 0 ? '浏览全部基金' : '清除筛选'}</button></div>}
    </>}
  </div>;
}
