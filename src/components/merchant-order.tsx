import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ClipboardList, LoaderCircle, Minus, Plus, ShoppingBag, Store, UtensilsCrossed} from 'lucide-react';
import {validMerchantMenu, type MerchantMenuItem, type MerchantOrder} from '../lib/merchant';
import {getPublicMerchant, submitMerchantOrder, MerchantSubmissionUnknownError, type MerchantOrderInput} from '../lib/merchant-service';
import './merchant-order.css';

type OrderPageProps = {token: string; initialTable?: string};
type Shop = {name: string; menu: MerchantMenuItem[]};
type SavedRequest = {input: MerchantOrderInput; menu: MerchantMenuItem[]; shopName: string};
const unknownResult = '订单结果待核对，请先重试获取原回执，或向店员核对，避免重复点单';
const storageKey = (token: string) => `zhiyin-merchant-order:${token}`;
function readSavedRequest(token: string): SavedRequest | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(token)) ?? 'null') as SavedRequest | null;
    if (!value || typeof value.shopName !== 'string' || value.shopName.length > 60 || !validMerchantMenu(value.menu) || !value.menu.length) return null;
    const input = value.input;
    if (!input || typeof input.table !== 'string' || !input.table.trim() || input.table.length > 30 || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId)) return null;
    if (!Array.isArray(input.items) || input.items.length !== value.menu.length || new Set(input.items.map(item => item.menuItemId)).size !== input.items.length) return null;
    if (!input.items.every(item => value.menu.some(dish => dish.id === item.menuItemId) && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99)) return null;
    return value;
  } catch { return null; }
}
function clearSavedRequest(token: string) {
  try { sessionStorage.removeItem(storageKey(token)); } catch { /* Storage may be disabled; the in-memory guard still holds. */ }
}
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The public route deliberately has no owner account, ledger, or payment controls. */
export function MerchantOrderPage(props: OrderPageProps) {
  return <MerchantOrderSession key={props.token} {...props}/>;
}

function MerchantOrderSession({token, initialTable = ''}: OrderPageProps) {
  const [saved] = useState(() => readSavedRequest(token));
  const [shop, setShop] = useState<Shop | null>(saved ? {name: saved.shopName, menu: saved.menu} : null);
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState<Record<string, number>>(saved ? Object.fromEntries(saved.input.items.map(item => [item.menuItemId, item.quantity])) : {});
  const [table, setTable] = useState(saved?.input.table ?? initialTable.slice(0, 30));
  const [stage, setStage] = useState<'menu' | 'review' | 'receipt'>(saved ? 'review' : 'menu');
  const [receipt, setReceipt] = useState<MerchantOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(saved ? unknownResult : '');
  const [uncertain, setUncertain] = useState(Boolean(saved));
  const submission = useRef<string | null>(saved?.input.requestId ?? null);
  const pendingRequest = useRef<SavedRequest | null>(saved);
  const sending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setLoadError('');
    getPublicMerchant(token).then(result => {
      if (active) setShop(result.shop);
    }).catch(error => {
      if (active) setLoadError(errorText(error, '菜单暂时无法打开，请重试或联系店员。'));
    });
    return () => {active = false;};
  }, [token, loadVersion]);

  useEffect(() => {if (stage !== 'menu') heading.current?.focus();}, [stage]);

  const selected = (uncertain && pendingRequest.current ? pendingRequest.current.menu : shop?.menu ?? []).filter(item => (cart[item.id] ?? 0) > 0);
  const total = selected.reduce((sum, item) => sum + item.price * cart[item.id], 0);
  const quantity = selected.reduce((sum, item) => sum + cart[item.id], 0);
  const categories = [...new Set(shop?.menu.map(item => item.category) ?? [])];
  const menu = shop?.menu.filter(item => !category || item.category === category) ?? [];

  function editQuantity(item: MerchantMenuItem, delta: number) {
    if (sending.current || uncertain || !item.available) return;
    const value = Math.max(0, Math.min(99, (cart[item.id] ?? 0) + delta));
    const next = {...cart, [item.id]: value};
    setCart(next);
    submission.current = null;
    setSubmitError('');
    if (!Object.values(next).some(Boolean)) setStage('menu');
  }

  function editTable(value: string) {
    if (sending.current || uncertain) return;
    setTable(value);
    submission.current = null;
    setSubmitError('');
  }

  async function submit() {
    if (sending.current || !quantity || !table.trim() || stage !== 'review') return;
    sending.current = true;
    setBusy(true);
    setSubmitError('');
    try {
      submission.current ??= requestId();
      const input = uncertain && pendingRequest.current ? pendingRequest.current.input : {
        table: table.trim(),
        items: selected.map(item => ({menuItemId: item.id, quantity: cart[item.id]})),
        requestId: submission.current,
      };
      const snapshot: SavedRequest = uncertain && pendingRequest.current ? pendingRequest.current : {input, menu: selected, shopName: shop?.name ?? ''};
      // Persist before sending: a reload must retry this same request, even after a lost response.
      try { sessionStorage.setItem(storageKey(token), JSON.stringify(snapshot)); }
      catch {
        setSubmitError('浏览器无法保存点单状态，请允许网站存储后重试，或联系店员核对。');
        return;
      }
      pendingRequest.current = snapshot;
      const result = await submitMerchantOrder(token, input);
      setReceipt(result.order);
      setCart({});
      setUncertain(false);
      setStage('receipt');
    } catch (error) {
      if (error instanceof MerchantSubmissionUnknownError) {
        setUncertain(true);
        setSubmitError(unknownResult);
      } else {
        clearSavedRequest(token);
        pendingRequest.current = null;
        setUncertain(false);
        setSubmitError(errorText(error, '暂未收到点单回执，请重试核对。'));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function stepper(item: MerchantMenuItem) {
    const count = cart[item.id] ?? 0;
    return <div className="merchant-order-stepper">
      {count > 0 && <>
        <button type="button" disabled={busy || uncertain} aria-label={`减少${item.name}`} onClick={() => editQuantity(item, -1)}><Minus size={17} aria-hidden="true"/></button>
        <span aria-label={`${item.name}数量`}>{count}</span>
      </>}
      <button type="button" className="merchant-order-add" disabled={!item.available || busy || uncertain || count >= 99} aria-label={`添加${item.name}`} onClick={() => editQuantity(item, 1)}><Plus size={18} aria-hidden="true"/></button>
    </div>;
  }

  return <main className="merchant-order-page">
    <div className="merchant-order-shell">
      <header className="merchant-order-header">
        <div className="merchant-order-shop-icon"><Store size={22} aria-hidden="true"/></div>
        <div><h1>{shop?.name ?? '扫码点餐'}</h1><p>{table.trim() ? `${table.trim()} 桌 · 堂食点单` : '选好菜品后，核对桌号并提交'}</p></div>
      </header>

      {!shop ? <section className="merchant-order-state">
        {loadError ? <><ClipboardList size={30} aria-hidden="true"/><h2>暂时无法打开菜单</h2><p role="alert">{loadError}</p><button type="button" className="merchant-order-secondary" onClick={() => setLoadVersion(value => value + 1)}>重新加载菜单</button></> : <p role="status"><LoaderCircle className="merchant-order-spinning" size={20} aria-hidden="true"/>正在读取菜单…</p>}
      </section> : stage === 'receipt' && receipt ? <section className="merchant-order-receipt">
        <div className="merchant-order-receipt-heading"><Check size={24} aria-hidden="true"/><div>
          <h2 ref={heading} tabIndex={-1}>{receipt.status === 'cancelled' ? '订单已取消' : receipt.status === 'refunded' ? '订单已登记退款' : '订单已提交'}</h2>
          <span>{({pending: '待收款', paid: '店员已登记收款', cancelled: '已取消', refunded: '已登记退款'} as const)[receipt.status]}</span>
        </div></div>
        <p className="merchant-order-receipt-note">{receipt.status === 'pending' ? '请向店员付款，本页不会扣款。' : receipt.status === 'paid' ? '收款状态来自店员登记，请以实际支付凭证为准。' : '如需重新点单，请与店员核对后再提交。'}</p>
        <dl className="merchant-order-receipt-meta"><div><dt>桌号</dt><dd>{receipt.table}</dd></div><div><dt>订单编号</dt><dd>{receipt.id}</dd></div><div><dt>提交时间</dt><dd>{new Date(receipt.createdAt).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false})}</dd></div></dl>
        <ul className="merchant-order-receipt-items" aria-label="已提交菜品">{receipt.items.map(item => <li key={item.menuItemId}><span>{item.name}<small>¥{(item.unitPrice / 100).toFixed(2)} × {item.quantity}</small></span><strong>{money(item.amount)}</strong></li>)}</ul>
        <div className="merchant-order-receipt-total"><span>订单合计</span><strong aria-label="订单合计">{money(receipt.total)}</strong></div>
        <button type="button" className="merchant-order-secondary merchant-order-new" onClick={() => {clearSavedRequest(token); pendingRequest.current = null; setReceipt(null); setStage('menu'); setCategory(''); submission.current = null;}}>再点一单<ArrowRight size={16} aria-hidden="true"/></button>
      </section> : stage === 'menu' && shop.menu.length === 0 ? <section className="merchant-order-state"><UtensilsCrossed size={32} aria-hidden="true"/><h2>菜单准备中</h2><p>店家还没有上架菜品，请联系店员。</p><button type="button" className="merchant-order-secondary" onClick={() => {setShop(null); setLoadVersion(value => value + 1);}}>刷新菜单</button></section> : <>
        {stage === 'menu' ? <>
          <nav className="merchant-order-categories" aria-label="菜品分类"><button type="button" aria-pressed={category === ''} onClick={() => setCategory('')}>全部</button>{categories.map(name => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</nav>
          <div className="merchant-order-menu-heading"><h2>{category || '今日菜单'}</h2><span>{menu.filter(item => item.available).length} 道可选</span></div>
          <ul className="merchant-order-menu" aria-label="菜品菜单">{menu.map(item => <li key={item.id} aria-label={item.name} data-unavailable={!item.available || undefined}>
            <div className="merchant-order-dish"><h3>{item.name}</h3><span>{item.category}{!item.available && ' · 已售罄'}</span><strong>{money(item.price)}<small> / 份</small></strong></div>
            {stepper(item)}
          </li>)}</ul>
          <p className="merchant-order-menu-note">如有忌口或过敏，请在点单前告知店员。</p>
        </> : <section className="merchant-order-review">
          <button type="button" disabled={busy || uncertain} className="merchant-order-back" onClick={() => setStage('menu')}><ArrowLeft size={18} aria-hidden="true"/>继续选菜</button>
          <h2 ref={heading} tabIndex={-1}>核对点单</h2>
          <label className="merchant-order-table">桌号<input aria-label="桌号" value={table} maxLength={30} placeholder="例如 A08" autoComplete="off" disabled={busy || uncertain} onChange={event => editTable(event.target.value)}/></label>
          <ul className="merchant-order-menu merchant-order-review-items" aria-label="已选菜品">{selected.map(item => <li key={item.id} aria-label={item.name}><div className="merchant-order-dish"><h3>{item.name}</h3><span>单价 {money(item.price)}</span><strong>{money(item.price * cart[item.id])}</strong></div>{stepper(item)}</li>)}</ul>
          <p className="merchant-order-confirm-note">提交后由店员处理，付款请与店员核对。</p>
          {submitError && <div className="merchant-order-error" role="alert"><p>{submitError}</p><span>重试会核对同一笔点单，不会重复创建。</span></div>}
        </section>}
        <footer className="merchant-order-cart">
          <div className="merchant-order-cart-value"><ShoppingBag size={22} aria-hidden="true"/><div><span>{quantity ? `已选 ${quantity} 份` : '还没有选菜'}</span><strong aria-label="订单合计">{money(total)}</strong></div></div>
          {stage === 'review' ? <button type="button" className="merchant-order-primary" disabled={busy || !table.trim() || quantity === 0} onClick={() => void submit()}>{busy ? <><LoaderCircle className="merchant-order-spinning" size={18} aria-hidden="true"/>正在提交订单</> : uncertain ? '核对原订单' : submitError ? '重试提交订单' : '确认提交订单'}</button> : <button type="button" className="merchant-order-primary" aria-label="查看已选菜品" disabled={quantity === 0} onClick={() => setStage('review')}>查看已选<ArrowRight size={17} aria-hidden="true"/></button>}
        </footer>
      </>}
      <div className="merchant-order-brand">知银 · 小店点单</div>
    </div>
  </main>;
}
