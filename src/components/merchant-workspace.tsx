import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowDownLeft, ArrowUpRight, BookOpen, Check, ChevronDown, Clipboard, CupSoda, Leaf, MessageCircle, Plus, QrCode, ReceiptText, RefreshCw, Send, Soup, Store, UtensilsCrossed} from 'lucide-react';
import {emptyMerchantState, merchantSummary, type MerchantMenuItem, type MerchantOperation, type MerchantOrder, type MerchantPeriod, type MerchantState} from '../lib/merchant';
import {hasPendingMerchantOperation, merchantOrderUrl, merchantRequest, recoverMerchantOperation} from '../lib/merchant-service';
import {MerchantQRCode} from './merchant-qr';
import {MerchantCashflow} from './merchant-cashflow';
import './merchant-workspace.css';

type Tab = 'overview' | 'orders' | 'menu';
type MenuDraft = Omit<MerchantMenuItem, 'price'> & {price: string};
type Confirmation = {type: 'record-payment' | 'cancel-order' | 'record-refund'; orderId: string; total: number; status: MerchantOrder['status']};
const money = (value: number) => `¥${(value / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const date = (at: number) => new Date(at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
const dateInput = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16);
const draftMenu = (menu: MerchantMenuItem[]): MenuDraft[] => menu.map(item => ({...item, price: (item.price / 100).toFixed(2)}));
const amountInCents = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Math.round(Number(value) * 100)) ? Math.round(Number(value) * 100) : null;
const orderLabels: Record<MerchantOrder['status'], string> = {pending: '待收款', paid: '已收款', cancelled: '已取消', refunded: '已退款'};
const periods: {id: MerchantPeriod; label: string}[] = [{id: 'today', label: '今天'}, {id: 'week', label: '近 7 天'}, {id: 'all', label: '全部'}];

function DishMark({name, category = ''}: {name: string; category?: string}) {
 const drink = /饮|茶|汤饮|咖啡|果汁|汽水|可乐|酸梅汤/.test(category + name);
 const vegetable = !drink && /蔬|时蔬|青菜|沙拉/.test(category + name);
 const Icon = drink ? CupSoda : vegetable ? Leaf : Soup;
 return <span className="merchant-dish-mark" data-kind={drink ? 'drink' : vegetable ? 'vegetable' : 'dish'} aria-hidden="true"><Icon size={25} strokeWidth={1.6}/></span>;
}

export function MerchantWorkspace({stewardName, onAsk}: {stewardName: string; onAsk: (prompt: string) => void}) {
 const [state, setState] = useState<MerchantState>(emptyMerchantState);
 const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
 const [pending, setPending] = useState(hasPendingMerchantOperation);
 const [error, setError] = useState(''), [notice, setNotice] = useState('');
 const [tab, setTab] = useState<Tab>('overview'), [period, setPeriod] = useState<MerchantPeriod>('today');
 const [shopName, setShopName] = useState(''), [question, setQuestion] = useState('');
 const [menu, setMenu] = useState<MenuDraft[]>([]), [menuDirty, setMenuDirty] = useState(false), [menuStale, setMenuStale] = useState(false);
 const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
 const [invalidMenuField, setInvalidMenuField] = useState<string | null>(null);
 useEffect(() => {
  if (!invalidMenuField) return;
  document.getElementById(invalidMenuField)?.focus();
  setInvalidMenuField(null);
 }, [invalidMenuField]);
 const [table, setTable] = useState(''), [showQR, setShowQR] = useState(false);
 const [expenseOpen, setExpenseOpen] = useState(false), [expenseTitle, setExpenseTitle] = useState(''), [expenseAmount, setExpenseAmount] = useState('');
 const [expenseCategory, setExpenseCategory] = useState('进货'), [expenseDate, setExpenseDate] = useState(dateInput);
 const [orderFilter, setOrderFilter] = useState<'all' | MerchantOrder['status']>('all'), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
 const mounted = useRef(false), loadId = useRef(0), lock = useRef(false), loadingRef = useRef(false);
 const revision = useRef(0), dirtyRef = useRef(false), errorOrigin = useRef<'load' | 'action'>('load');
 const confirmationHeading = useRef<HTMLHeadingElement>(null);
 const expenseInput = useRef<HTMLInputElement>(null);
 useEffect(() => {if (expenseOpen) expenseInput.current?.focus();}, [expenseOpen]);
 dirtyRef.current = menuDirty;

 const accept = useCallback((next: MerchantState, keepDraft = true) => {
  if (next.revision < revision.current) return;
  if (dirtyRef.current && keepDraft) {
   if (next.revision !== revision.current) setMenuStale(true);
  } else {setMenu(draftMenu(next.shop?.menu ?? [])); setMenuDirty(false); setMenuStale(false);}
  revision.current = next.revision; setState(next); setLoaded(true);
 }, []);
 const load = useCallback(async (quiet = false) => {
  if (lock.current || loadingRef.current) return;
  const id = ++loadId.current; loadingRef.current = true;
  if (!quiet) {setLoading(true); setError(''); errorOrigin.current = 'load';}
  try {
   const next = await merchantRequest();
   if (mounted.current && id === loadId.current && !lock.current) {accept(next); setPending(hasPendingMerchantOperation()); if (quiet && errorOrigin.current === 'load') setError('');}
  } catch (cause) {
   if (mounted.current && id === loadId.current && (!quiet || errorOrigin.current === 'load')) {errorOrigin.current = 'load'; setError(cause instanceof Error ? cause.message : '暂时无法读取小店，请重试');}
  } finally {
   loadingRef.current = false;
   if (mounted.current && id === loadId.current) setLoading(false);
  }
 }, [accept]);
 useEffect(() => {
  mounted.current = true; void load();
  const refresh = () => {if (document.visibilityState !== 'hidden') void load(true);};
  const timer = window.setInterval(refresh, 10000);
  window.addEventListener('zhiyin-merchant-updated', refresh);
  window.addEventListener('zhiyin-phone-foreground', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {mounted.current = false; window.clearInterval(timer); window.removeEventListener('zhiyin-merchant-updated', refresh); window.removeEventListener('zhiyin-phone-foreground', refresh); document.removeEventListener('visibilitychange', refresh);};
 }, [load]);
 useEffect(() => {if (confirmation) confirmationHeading.current?.focus({preventScroll: true});}, [confirmation]);

 async function mutate(operation: MerchantOperation, message: string, onSuccess?: () => void) {
  if (lock.current || hasPendingMerchantOperation()) {setPending(hasPendingMerchantOperation()); return;}
  lock.current = true; ++loadId.current; setLoading(false); setBusy(true); setError(''); setNotice(''); errorOrigin.current = 'action';
  try {
   const next = await merchantRequest(operation, revision.current);
   if (mounted.current) {accept(next, operation.type !== 'save-menu'); setNotice(message); onSuccess?.();}
  } catch (cause) {
   if (mounted.current) {
    const message = cause instanceof Error ? cause.message : '操作尚未完成，原记录和编辑已保留';
    setError(message);
    if (operation.type === 'save-menu' && /版本|更新|冲突/.test(message)) setMenuStale(true);
   }
  } finally {lock.current = false; if (mounted.current) {setBusy(false); setPending(hasPendingMerchantOperation());}}
 }
 async function recover() {
  if (lock.current) return;
  lock.current = true; ++loadId.current; setLoading(false); setBusy(true); setError(''); errorOrigin.current = 'action';
  try {
   const next = await recoverMerchantOperation();
   if (mounted.current) {accept(next, true); setConfirmation(null); setExpenseOpen(false); setNotice('上次记录结果已核对，请先查看账本。原编辑仍保留，不会自动再次提交。');}
  } catch (cause) {if (mounted.current) setError(cause instanceof Error ? cause.message : '结果仍未确认，请稍后继续核对');}
  finally {lock.current = false; if (mounted.current) {setBusy(false); setPending(hasPendingMerchantOperation());}}
 }
 function submitShop(event: FormEvent) {event.preventDefault(); if (shopName.trim()) void mutate({type: 'create-shop', name: shopName.trim()}, '小店已开通，请核对基础菜单后分享点餐码', () => setTab('menu'));}
 function changeMenu(id: string, patch: Partial<MenuDraft>) {setMenu(current => current.map(item => item.id === id ? {...item, ...patch} : item)); setMenuDirty(true); dirtyRef.current = true; setNotice('');}
 function saveMenu(event: FormEvent) {
  event.preventDefault(); if (menuStale) return;
  const items: MerchantMenuItem[] = [];
  for (const item of menu) {
   const price = amountInCents(item.price);
   if (!item.name.trim() || !item.category.trim() || price === null) {setExpandedMenuId(item.id); setInvalidMenuField(`merchant-${item.id}-${!item.name.trim() ? 'name' : !item.category.trim() ? 'category' : 'price'}`); errorOrigin.current = 'action'; setError('请为每道菜填写名称、分类，以及最多两位小数的正数价格'); return;}
   items.push({...item, name: item.name.trim(), category: item.category.trim(), price});
  }
  void mutate({type: 'save-menu', menu: items}, '菜单已保存，点餐页将使用最新菜品与价格');
 }
 function addExpense(event: FormEvent) {
  event.preventDefault(); const amount = amountInCents(expenseAmount), occurredAt = new Date(`${expenseDate}:00+08:00`).getTime();
  if (amount === null || !expenseTitle.trim() || !Number.isFinite(occurredAt) || occurredAt > Date.now()) {errorOrigin.current = 'action'; setError('请填写实际支出事项、正数金额和已经发生的时间'); return;}
  void mutate({type: 'add-expense', title: expenseTitle.trim(), category: expenseCategory, amount, occurredAt}, '支出已记录', () => {setExpenseOpen(false); setExpenseTitle(''); setExpenseAmount(''); setExpenseDate(dateInput());});
 }
 function ask(event: FormEvent) {event.preventDefault(); if (question.trim()) onAsk(`帮我分析小店经营：${question.trim()}`);}
 const summary = merchantSummary(state, period), shop = state.shop;
 const orderUrl = shop ? merchantOrderUrl(shop.publicToken, table) : '';
 async function copyOrderUrl() {
  try {if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable'); await navigator.clipboard.writeText(orderUrl); setNotice('点餐链接已复制');}
  catch {errorOrigin.current = 'action'; setError('无法自动复制，请打开点餐页后复制地址');}
 }
 const pendingCount = state.orders.filter(order => order.status === 'pending').length;
 const availableCount = shop?.menu.filter(item => item.available).length ?? 0;
 const maxDishAmount = Math.max(1, ...summary.dishes.map(dish => dish.quantity));
 const currentConfirmationOrder = confirmation && state.orders.find(order => order.id === confirmation.orderId);
 const confirmationValid = Boolean(currentConfirmationOrder && confirmation && currentConfirmationOrder.status === confirmation.status && currentConfirmationOrder.total === confirmation.total);
 const ledger = [
  ...state.orders.flatMap(order => [
   ...(order.paidAt ? [{id: `${order.id}-paid`, title: `${order.table ? `${order.table} 桌` : '到店点餐'}收款`, amount: order.total, at: order.paidAt, kind: '收款'}] : []),
   ...(order.refundedAt ? [{id: `${order.id}-refund`, title: `${order.table ? `${order.table} 桌` : '到店点餐'}退款`, amount: -order.total, at: order.refundedAt, kind: '退款'}] : []),
  ]),
  ...state.expenses.map(expense => ({id: expense.id, title: expense.title, amount: -expense.amount, at: expense.occurredAt, kind: expense.category})),
 ].filter(row => row.at >= summary.from && row.at <= summary.to).sort((a, b) => b.at - a.at);
 const orders = state.orders.filter(order => orderFilter === 'all' || order.status === orderFilter).slice().sort((a, b) => b.createdAt - a.createdAt);

 const assistantEntry = <form className="merchant-ask" onSubmit={ask}><label htmlFor="merchant-question"><MessageCircle size={19} aria-hidden="true"/>{stewardName}，帮我看看经营</label><div><input id="merchant-question" aria-label={`问${stewardName}小店经营`} value={question} onChange={event => setQuestion(event.target.value)} placeholder="今天什么卖得好？" maxLength={500}/><button type="submit" aria-label={`问${stewardName}`} disabled={!question.trim()}><Send size={18} aria-hidden="true"/></button></div><button type="button" className="merchant-ask-suggestion" onClick={() => onAsk(`帮我分析小店${period === 'today' ? '今天' : period === 'week' ? '近7天' : '全部'}的经营收支和菜品表现`)}>分析这段时间的经营<ArrowUpRight size={15} aria-hidden="true"/></button></form>;

 return <div className="merchant-workspace" aria-busy={busy || loading}>
  {error && <div role="alert" className="merchant-error"><p>{error}</p><button type="button" disabled={busy || loading} onClick={() => void load()}>重新读取</button></div>}
  {notice && <p role="status" className="merchant-notice"><Check size={16} aria-hidden="true"/>{notice}</p>}
  {pending && <section className="merchant-draft-warning" aria-label="上次记录结果待核对"><h3>上次记录结果待核对</h3><p>网络中断时，记录可能已经保存。先核对原来的那一笔，再继续新增或修改。</p><button type="button" onClick={() => void recover()} disabled={busy}>{busy ? '正在核对…' : '核对上次记录'}</button></section>}
  {!loaded && !error && <p role="status" className="merchant-loading">正在读取小店…</p>}
  {loaded && !shop && <section className="merchant-start">
   <div className="merchant-start-sign"><Store size={46} strokeWidth={1.5} aria-hidden="true"/><span>我的小店</span></div><h2>把小店的每一笔，记清楚</h2><p>顾客扫码点餐，菜品销售与日常账目留在一起。{stewardName}可以帮你看看收入从哪里来。</p>
   <ol className="merchant-start-flow" aria-label="小店使用流程"><li><QrCode size={22} aria-hidden="true"/><strong>扫码点餐</strong><span>一张码，连起菜单</span></li><li><ReceiptText size={22} aria-hidden="true"/><strong>记录实收</strong><span>每笔账，有迹可循</span></li><li><UtensilsCrossed size={22} aria-hidden="true"/><strong>看懂经营</strong><span>哪些菜，卖得更好</span></li></ol>
   <form onSubmit={submitShop}><label>店铺名称<input value={shopName} onChange={event => setShopName(event.target.value)} placeholder="例如：巷口小馆" maxLength={50} required disabled={busy || pending}/></label><p className="merchant-note">开通后会准备一份可编辑的基础菜单，请核对菜品和价格后再分享。营业记录从第一笔实际订单开始。</p><button className="merchant-primary" disabled={busy || pending || !shopName.trim()}>{busy ? '正在开通…' : '开通我的小店'}</button></form>
  </section>}
  {shop && <>
   <header className="merchant-heading"><span className="merchant-shop-sign" aria-hidden="true"><Store size={30} strokeWidth={1.5}/></span><div className="merchant-shop-identity"><h2>{shop.name}</h2><p>{availableCount} 道菜在售 · 每一笔生意，都有数</p></div><button type="button" aria-label="刷新小店" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={18} className={loading ? 'merchant-spinning' : ''} aria-hidden="true"/></button></header>
   <nav className="merchant-tabs" aria-label="小店功能"><button type="button" aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>概览</button><button type="button" aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>订单{pendingCount > 0 && <span aria-hidden="true">{pendingCount}</span>}</button><button type="button" aria-pressed={tab === 'menu'} onClick={() => setTab('menu')}>菜单</button></nav>
   {tab === 'overview' && <div className="merchant-tab-body">
    <section className="merchant-cashbook" aria-label="经营收支"><div className="merchant-period" role="group" aria-label="统计范围">{periods.map(item => <button type="button" key={item.id} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div>
    <div className="merchant-overview"><div className="merchant-overview-main"><span>净收款</span><strong>{money(summary.netCollected)}</strong><small>{period === 'today' ? '今天' : period === 'week' ? '近 7 天' : '全部记录'} · 按实际收付时间</small></div><dl><div><dt>已收款</dt><dd>{money(summary.collectedTotal)}</dd></div><div><dt>已退款</dt><dd>{money(summary.refundedTotal)}</dd></div></dl></div>
    <dl className="merchant-metrics"><div><dt>已记支出</dt><dd>{money(summary.expenseTotal)}</dd></div><div><dt>现金差额</dt><dd>{money(summary.cashDifference)}</dd></div></dl>
    <p className="merchant-note merchant-accounting-note">现金差额为净收款减已记支出，不等于利润。</p></section>
    {summary.pendingTotal > 0 && <button type="button" className="merchant-pending" onClick={() => {setOrderFilter('pending'); setTab('orders');}}><span>另有 {money(summary.pendingTotal)} 待收款<small>尚未计入收入</small></span><ArrowUpRight size={18} aria-hidden="true"/></button>}
    <div className="merchant-quick-tools"><button type="button" onClick={() => {setTab('menu'); setShowQR(true);}}><QrCode size={20} aria-hidden="true"/><span>点餐码</span><ArrowUpRight size={15} aria-hidden="true"/></button><button type="button" onClick={() => {setExpenseOpen(true); expenseInput.current?.focus();}}><Plus size={20} aria-hidden="true"/><span>记支出</span><ArrowUpRight size={15} aria-hidden="true"/></button></div>
    {assistantEntry}
    <MerchantCashflow state={state}/>
    <section className="merchant-section merchant-dish-ranking"><div className="merchant-section-heading"><h3><UtensilsCrossed size={18} aria-hidden="true"/>菜品表现</h3><span>按销量排序</span></div>
     {summary.dishes.length ? <ol>{summary.dishes.map((dish, index) => <li key={dish.id}><span className="merchant-rank">{index + 1}</span><DishMark name={dish.name}/><div><div className="merchant-dish-line"><strong>{dish.name}</strong><span>{money(dish.amount)}</span></div><div className="merchant-dish-track"><span style={{width: `${Math.max(0, dish.quantity / maxDishAmount * 100)}%`}}/></div><small>{dish.quantity} 份{index === 0 && summary.dishes.length > 1 ? (summary.dishes[1].quantity === dish.quantity ? ' · 并列最多' : ' · 销量最多') : ''}</small></div></li>)}</ol> : <div className="merchant-empty"><UtensilsCrossed size={28} aria-hidden="true"/><p>等待第一道菜的销售记录</p><span>顾客下单后，记录实际收款，就能看到菜品表现。</span><button type="button" onClick={() => {setTab('menu'); setShowQR(true);}}>查看点餐码<ArrowUpRight size={15} aria-hidden="true"/></button></div>}
    <p className="merchant-note merchant-ranking-note">统计所选期间已收款且当前未退款的菜品。</p></section>
    <section className="merchant-section merchant-ledger-section"><div className="merchant-section-heading"><h3><ReceiptText size={18} aria-hidden="true"/>经营账本</h3><button type="button" onClick={() => setExpenseOpen(current => !current)} aria-expanded={expenseOpen}><Plus size={15} aria-hidden="true"/>记一笔支出</button></div>
     {expenseOpen && <form className="merchant-expense-form" onSubmit={addExpense}><label>支出事项<input ref={expenseInput} value={expenseTitle} onChange={event => setExpenseTitle(event.target.value)} required maxLength={80} placeholder="例如：早市进货" disabled={busy || pending}/></label><div className="merchant-form-pair"><label>支出金额（元）<input type="number" inputMode="decimal" min="0.01" step="0.01" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)} required disabled={busy || pending}/></label><label>支出分类<select value={expenseCategory} onChange={event => setExpenseCategory(event.target.value)} disabled={busy || pending}>{['进货', '房租', '人工', '水电', '其他'].map(item => <option key={item}>{item}</option>)}</select></label></div><label>发生时间（北京时间）<input type="datetime-local" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} required disabled={busy || pending}/></label><p className="merchant-note">只记录已经发生的支出，不会从账户扣款。</p><div className="merchant-actions"><button className="merchant-primary" disabled={busy || pending}>{busy ? '正在保存…' : '保存支出'}</button><button type="button" disabled={busy || pending} onClick={() => setExpenseOpen(false)}>收起</button></div></form>}
     {ledger.length ? <ul className="merchant-ledger">{ledger.map(row => <li key={row.id}><span className="merchant-ledger-symbol" data-income={row.amount > 0} aria-hidden="true">{row.amount > 0 ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</span><div><strong>{row.title}</strong><small>{date(row.at)} · {row.kind}</small></div><span data-income={row.amount > 0}>{row.amount > 0 ? '+' : '−'}{money(Math.abs(row.amount))}</span></li>)}</ul> : <p className="merchant-empty">这个时间范围还没有收支记录。</p>}
    </section>
   </div>}
   {tab === 'orders' && <div className="merchant-tab-body"><div className="merchant-orders-heading"><ReceiptText size={22} aria-hidden="true"/><div><h3>每一单，都在这里</h3><p>待收款 {pendingCount} 单 · 共 {state.orders.length} 单</p></div></div><div className="merchant-order-filters" role="group" aria-label="订单状态">{(['all', 'pending', 'paid', 'refunded', 'cancelled'] as const).map(filter => <button key={filter} type="button" aria-pressed={orderFilter === filter} onClick={() => setOrderFilter(filter)}>{filter === 'all' ? '全部' : orderLabels[filter]}</button>)}</div><p className="merchant-note">订单自动刷新。下单不等于到账，实际收款后再记录。</p>
    {orders.length ? <div className="merchant-orders">{orders.map(order => <details key={order.id} className="merchant-order" data-status={order.status}><summary><span className="merchant-order-symbol" aria-hidden="true"><ReceiptText size={23}/></span><div className="merchant-order-label"><strong>{order.table ? `${order.table} 桌` : '到店点餐'}</strong><small>{date(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} 份</small></div><div className="merchant-order-total"><span className="merchant-order-status" data-status={order.status}>{orderLabels[order.status]}</span><b>{money(order.total)}</b></div><ChevronDown size={16} aria-hidden="true"/></summary><div className="merchant-order-detail"><ul>{order.items.map(item => <li key={item.menuItemId}><span>{item.name} × {item.quantity}</span><b>{money(item.amount)}</b></li>)}</ul><p className="merchant-note">订单尾号 {order.id.slice(-8)}{order.paidAt ? ` · 收款 ${date(order.paidAt)}` : ''}{order.refundedAt ? ` · 退款 ${date(order.refundedAt)}` : ''}</p><div className="merchant-actions">{order.status === 'pending' && <><button type="button" className="merchant-primary" disabled={busy || pending} onClick={() => setConfirmation({type: 'record-payment', orderId: order.id, total: order.total, status: order.status})}>记录已收款</button><button type="button" disabled={busy || pending} onClick={() => setConfirmation({type: 'cancel-order', orderId: order.id, total: order.total, status: order.status})}>取消订单</button></>}{order.status === 'paid' && <button type="button" disabled={busy || pending} onClick={() => setConfirmation({type: 'record-refund', orderId: order.id, total: order.total, status: order.status})}>记录退款</button>}</div>
      {confirmation?.orderId === order.id && <section className="merchant-confirm" aria-label={confirmation.type === 'record-payment' ? '确认收款记录' : confirmation.type === 'record-refund' ? '确认退款记录' : '确认取消订单'}><h4 ref={confirmationHeading} tabIndex={-1}>{confirmation.type === 'record-payment' ? '确认已经收到这笔款' : confirmation.type === 'record-refund' ? '确认已经退回这笔款' : '取消这张未付款订单'}</h4><p>{confirmation.type === 'record-payment' ? `请确认已实际收到 ${money(confirmation.total)}。这里只记账，不会向顾客发起扣款。` : confirmation.type === 'record-refund' ? `请确认已在原渠道全额退回 ${money(confirmation.total)}。这里只记录退款，不会代你转出资金。` : '取消后不再计入待收款，订单记录仍然保留。'}</p>{!confirmationValid && <p role="alert">订单状态已变化，请返回后核对最新记录。</p>}<div className="merchant-actions"><button type="button" className="merchant-primary" disabled={busy || pending || !confirmationValid} onClick={() => void mutate({type: confirmation.type, orderId: confirmation.orderId}, confirmation.type === 'record-payment' ? '收款已记录' : confirmation.type === 'record-refund' ? '退款已记录' : '订单已取消', () => setConfirmation(null))}>{busy ? '正在记录…' : confirmation.type === 'record-payment' ? `确认已收到 ${money(confirmation.total)}` : confirmation.type === 'record-refund' ? `确认已退回 ${money(confirmation.total)}` : '确认取消订单'}</button><button type="button" disabled={busy || pending} onClick={() => setConfirmation(null)}>返回</button></div></section>}
     </div></details>)}</div> : <div className="merchant-empty"><ReceiptText size={28} aria-hidden="true"/><p>还没有{orderFilter === 'all' ? '' : orderLabels[orderFilter]}订单</p><span>{orderFilter === 'all' || orderFilter === 'pending' ? '顾客提交点餐后，会显示在这里。' : orderFilter === 'paid' ? '确认实际到账并记录收款后，会显示在这里。' : orderFilter === 'refunded' ? '登记已实际退回的款项后，会显示在这里。' : '取消未付款订单后，记录会保留在这里。'}</span></div>}
   </div>}
   {tab === 'menu' && <div className="merchant-tab-body"><button className="merchant-qr-toggle" type="button" aria-expanded={showQR} onClick={() => setShowQR(current => !current)}><QrCode size={19} aria-hidden="true"/><span><strong>小店点餐码</strong><small>顾客扫码，直接查看菜单</small></span><ChevronDown size={17} aria-hidden="true"/></button>
    {showQR && <section className="merchant-qr-panel" aria-label="分享点餐码"><label>桌号（可选）<input value={table} onChange={event => setTable(event.target.value)} maxLength={20} placeholder="例如：3"/></label><MerchantQRCode url={orderUrl}/><div className="merchant-actions"><a href={orderUrl} target="_blank" rel="noreferrer">打开点餐页<ArrowUpRight size={15} aria-hidden="true"/></a><button type="button" onClick={() => void copyOrderUrl()}><Clipboard size={15} aria-hidden="true"/>复制链接</button></div>{/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) && <p className="merchant-note">当前地址可在这台电脑预览，手机扫码需要手机可访问的服务地址。</p>}{menuDirty && <p className="merchant-note">点餐页使用已保存的菜单，当前编辑还未发布。</p>}</section>}
    <form className="merchant-menu-form" onSubmit={saveMenu} noValidate><div className="merchant-section-heading"><h3><BookOpen size={19} aria-hidden="true"/>小店菜单</h3><span>{menu.filter(item => item.available).length} 道在售 / 共 {menu.length} 道</span></div><p className="merchant-note">点开菜品即可编辑，修改后统一保存菜单。</p>
     {menuStale && <div className="merchant-draft-warning" role="status"><p>小店记录有更新，菜单编辑已保留。请重新读取并核对最新记录后，再保存你的编辑。</p><details><summary>查看最新已保存菜单</summary><ul>{shop.menu.map(item => <li key={item.id}>{item.name} · {money(item.price)} · {item.available ? '在售' : '已下架'}</li>)}</ul></details><button type="button" onClick={() => setMenuStale(false)} disabled={busy || pending}>已核对，保留我的编辑</button><button type="button" onClick={() => {setMenu(draftMenu(shop.menu)); setMenuDirty(false); dirtyRef.current = false; setMenuStale(false);}} disabled={busy || pending}>放弃编辑，改用最新菜单</button></div>}
     <div className="merchant-menu-grid">{menu.map((item, index) => <details className="merchant-menu-item" key={item.id} open={expandedMenuId === item.id}><summary aria-label={`编辑菜品：${item.name || '新菜品'}`} onClick={event => {event.preventDefault(); setExpandedMenuId(current => current === item.id ? null : item.id);}}><DishMark name={item.name} category={item.category}/><div><strong>{item.name || '新菜品'}</strong><span>{item.category || '待填分类'} · {item.price ? `¥${item.price}` : '待定价'}</span></div><span className="merchant-menu-availability" data-available={item.available}>{item.available ? '在售' : '已下架'}</span><ChevronDown size={16} aria-hidden="true"/></summary><fieldset disabled={busy || pending}><legend>编辑菜品 {index + 1}</legend><input id={`merchant-${item.id}-name`} aria-label={`菜品${index + 1}名称`} value={item.name} maxLength={60} onChange={event => changeMenu(item.id, {name: event.target.value})} required placeholder="菜品名称"/><div className="merchant-form-pair"><label>分类<input id={`merchant-${item.id}-category`} aria-label={`菜品${index + 1}分类`} value={item.category} maxLength={30} onChange={event => changeMenu(item.id, {category: event.target.value})} required/></label><label>价格（元）<input id={`merchant-${item.id}-price`} aria-label={`菜品${index + 1}价格（元）`} type="number" inputMode="decimal" min="0.01" step="0.01" value={item.price} onChange={event => changeMenu(item.id, {price: event.target.value})} required/></label></div><label className="merchant-available"><input type="checkbox" checked={item.available} onChange={event => changeMenu(item.id, {available: event.target.checked})}/><span>{item.available ? '在售' : '已下架'}</span><small>{item.available ? '顾客可在点餐页选择' : '保留历史，顾客暂不可点'}</small></label></fieldset></details>)}</div>
     <button type="button" className="merchant-add-dish" disabled={busy || pending} onClick={() => {const id = crypto.randomUUID(); setExpandedMenuId(id); setMenu(current => [...current, {id, name: '', category: '热菜', price: '', available: true}]); setMenuDirty(true); dirtyRef.current = true;}}><Plus size={17} aria-hidden="true"/>添加菜品</button><div className="merchant-menu-save"><span>{menuDirty ? '有未保存的修改' : '菜单已保存'}</span><button className="merchant-primary" disabled={busy || pending || !menuDirty || menuStale}>{busy ? '正在保存…' : '保存菜单'}</button></div>
    </form>
   </div>}
   {tab !== 'overview' && assistantEntry}

  </>}
 </div>;
}
