import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, BookOpen, ChevronRight, RefreshCw, Search} from 'lucide-react';
import {emptyExpenseState, type ExpenseState} from '../lib/expense-notebook';
import {expenseRequest} from '../lib/expense-service';
import {aaHistorySummary, filterAAHistory, type AAHistoryStatus} from '../lib/aa-history';
import {refreshAAHistoryBook} from '../lib/aa-history-service';
import {workspaceRequest} from '../lib/workspace-service';
import {AAHistoryDetail} from './aa-history-detail';
import './aa-history.css';

const money = (value: number) => `¥${(value / 100).toFixed(2)}`;
const date = (at: number) => Number.isFinite(at) && at > 0
  ? new Date(at).toLocaleDateString('zh-CN', {year: 'numeric', month: 'numeric', day: 'numeric'}) : '日期未记录';
const filters: {id: 'all' | AAHistoryStatus; label: string}[] = [
  {id: 'all', label: '全部'}, {id: 'pending', label: '待结算'},
  {id: 'collecting', label: '收款中'}, {id: 'settled', label: '已结清'}, {id: 'attention', label: '需核对'},
];

export function AAHistory({onOpenGroupAA, onOpenConversation, onStartBook, stewardName = '宁宁'}: {
  onOpenGroupAA: () => void;
  onOpenConversation?: (workspaceId: string) => void;
  onStartBook?: () => void;
  stewardName?: string;
}) {
  const [state, setState] = useState<ExpenseState>(emptyExpenseState);
  const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | AAHistoryStatus>('all');
  const [selected, setSelected] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true), loadId = useRef(0), checkLock = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectedRow = useRef<HTMLButtonElement | null>(null);
  const selectedRowId = useRef('');
  const currentSelection = useRef(selected);
  currentSelection.current = selected;
  const accept = useCallback((next: ExpenseState) => {
    setState(current => next.revision >= current.revision ? next : current);
  }, []);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true); setError('');
    try {
      const next = await expenseRequest();
      if (mounted.current && id === loadId.current) {accept(next); setLoaded(true);}
    } catch (cause) {
      if (mounted.current && id === loadId.current) setError(cause instanceof Error ? cause.message : '账本暂时无法读取');
    } finally {
      if (mounted.current && id === loadId.current) setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    mounted.current = true;
    void load();
    void workspaceRequest().then(next => {
      if (!mounted.current) return;
      const map: Record<string, string> = {};
      // Prefer an active conversation when more than one references the same book.
      [...next.items].sort((a, b) => Number(a.status === 'active') - Number(b.status === 'active'))
        .forEach(item => {if (item.expenseBookId) map[item.expenseBookId] = item.id;});
      setLinks(map);
    }).catch(() => {});
    const refresh = () => {if (!checkLock.current) void load();};
    window.addEventListener('zhiyin-expenses-updated', refresh);
    window.addEventListener('zhiyin-phone-foreground', refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener('zhiyin-expenses-updated', refresh);
      window.removeEventListener('zhiyin-phone-foreground', refresh);
    };
  }, [load]);
  useEffect(() => {if (selected) detailHeading.current?.focus({preventScroll: true});}, [selected]);
  const book = state.books.find(item => item.id === selected);
  const visible = filterAAHistory(state.books, query, filter);
  const summary = book ? aaHistorySummary(book) : null;
  async function checkProgress() {
    if (!book || checkLock.current) return;
    checkLock.current = true; setChecking(true); setError(''); setNotice('');
    try {
      const next = await refreshAAHistoryBook(book.id);
      if (mounted.current) {
        accept(next);
        if (currentSelection.current === book.id) setNotice('已核对微信现有收款记录');
      }
    } catch (cause) {
      if (mounted.current && currentSelection.current === book.id) setError(cause instanceof Error ? cause.message : '核对未完成，原记录已保留');
    } finally {
      checkLock.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  function backToList() {
    setSelected(''); setNotice(''); setError('');
    requestAnimationFrame(() => selectedRow.current?.focus());
  }
  return <div className="aa-history" aria-busy={loading || checking}>
    {error && <div className="aa-history-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()} disabled={loading}>重新读取账本</button></div>}
    {notice && <p className="aa-history-notice" role="status">{notice}</p>}
    {book && summary ? <>
      <button type="button" className="aa-history-back" onClick={backToList}><ArrowLeft size={16}/>全部账本</button>
      <header className="aa-history-book-heading">
        <span className="aa-history-status" data-status={summary.status}>{summary.label}</span>
        <h2 ref={detailHeading} tabIndex={-1}>{book.title}</h2>
        <p>{book.group.name} · {book.participants.length} 人参与 · {date(book.at)}</p>
        <div className="aa-history-total"><span>已记录消费</span><strong>{money(summary.total)}</strong><small>{summary.entryCount} 笔消费</small></div>
      </header>
      <AAHistoryDetail book={book}/>
      <div className="aa-history-actions">
        {!!book.batches.length && <button type="button" onClick={() => void checkProgress()} disabled={checking}><RefreshCw size={15} className={checking ? 'aa-history-spinning' : ''}/>{checking ? '正在核对…' : '核对微信收款'}</button>}
        {onOpenConversation && links[book.id] && <button type="button" onClick={() => onOpenConversation(links[book.id])}>回到原对话<ArrowUpRight size={15}/></button>}
      </div>
      {(!links[book.id] && loaded) && <p className="aa-history-footnote">消费与分摊记录独立保留，原对话不可用时仍可在这里查账。</p>}
    </> : <>
      <header className="aa-history-intro"><div><p>每次相聚，都有一本清楚的账。</p><span>消费、分摊和收款记录集中保留</span></div><button type="button" aria-label="刷新账本" onClick={() => void load()} disabled={loading}><RefreshCw size={18} className={loading ? 'aa-history-spinning' : ''}/></button></header>
      {loaded && state.books.length > 0 && <>
        <label className="aa-history-search"><Search size={17}/><input type="search" aria-label="搜索 AA 账本" placeholder="搜索活动、群聊或参与人" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="aa-history-filters" role="group" aria-label="按账本状态筛选">{filters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
        <p className="aa-history-list-caption" aria-live="polite">{visible.length} 本账本<span>按最近记录排序</span></p>
        <ul className="aa-history-list">{visible.map(item => {
          const info = aaHistorySummary(item);
          return <li key={item.id}><button type="button" className="aa-history-row" ref={node => {if (node && item.id === selectedRowId.current) selectedRow.current = node;}} data-book-id={item.id} onClick={event => {selectedRow.current = event.currentTarget; selectedRowId.current = item.id; setSelected(item.id); setNotice(''); setError('');}}>
            <div className="aa-history-row-top"><strong>{item.title}</strong><span className="aa-history-status" data-status={info.status}>{info.label}</span></div>
            <p>{item.group.name} · {item.participants.length} 人</p>
            <div className="aa-history-row-bottom"><span>{date(info.updatedAt)} · {info.entryCount} 笔</span><b>{money(info.total)}</b><ChevronRight size={15}/></div>
            {info.pendingTotal > 0 && info.status === 'collecting' && <small>另有 {money(info.pendingTotal)} 待结算</small>}
          </button></li>;
        })}</ul>
        {visible.length === 0 && <div className="aa-history-empty"><Search size={28}/><h2>没有找到相符的账本</h2><p>试试活动名、群名，或查看其他状态。</p><button type="button" onClick={() => {setQuery(''); setFilter('all');}}>查看全部账本</button></div>}
      </>}
      {loading && !loaded && <p className="aa-history-loading" role="status">正在读取历史账本…</p>}
      {loaded && !state.books.length && <div className="aa-history-empty"><BookOpen size={34}/><h2>还没有 AA 账本</h2><p>和{stewardName}说“帮我记下这次聚餐的消费”，记录后就会保存在这里。</p>{onStartBook && <button type="button" onClick={onStartBook}>记一笔 AA</button>}</div>}
      <button type="button" className="aa-history-legacy" onClick={onOpenGroupAA}><div><strong>微信群收款</strong><span>查看直接在群里发起的收款记录</span></div><ArrowUpRight size={17}/></button>
    </>}
  </div>;
}
