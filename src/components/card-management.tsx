import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import {ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, CreditCard, MessageCircle, Moon, Plane, RefreshCw, ShieldCheck, Wallet, Wifi} from 'lucide-react';
import {bankCardsRequest, bankRecipients, type BankCardId, type BankCardSummary, type BankControls, type BankSnapshot} from '../lib/bank-transfer';
import {assetMoney} from '../lib/bank-assets';
import {availableBankFunds, heldOccasionBudget} from '../lib/occasion-plans';
import {useBankAccount} from '../lib/use-bank-account';
import {Button} from './ui/button';
import {Dialog} from './ui/dialog';
import {Switch} from './ui/switch';
import {CardApplicationPanel} from './card-application';
import './card-management.css';

type CardManagementProps = {
  onAsk: (prompt: string) => void;
  onTransfer: (cardId: BankCardId) => void;
  initialCardId?: BankCardId;
  onInitialCardConsumed?: () => void;
  onBack?: () => void;
};
type PendingChange = {revision: number} & (
  | {kind: 'freeze'; frozen: boolean}
  | {kind: 'limit'}
  | {kind: 'control'; key: keyof BankControls; enabled: boolean; title: string}
);
const controlRows = [
  {key: 'overseas', title: '境外交易', icon: Plane, enabledDescription: '允许境外渠道付款', disabledDescription: '拦截境外渠道付款'},
  {key: 'contactless', title: '无卡支付', icon: Wallet, enabledDescription: '允许线上无卡付款', disabledDescription: '拦截无卡渠道付款'},
  {key: 'night', title: '夜间保护', icon: Moon, enabledDescription: '23:00—06:00 限制付款', disabledDescription: '不额外限制夜间付款'},
] as const;

export function CardManagement({onAsk, onTransfer, initialCardId, onInitialCardConsumed, onBack}: CardManagementProps) {
  const [cards, setCards] = useState<BankCardSummary[]>([]);
  const [selectedId, setSelectedId] = useState<BankCardId>(initialCardId ?? 'primary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef<symbol | null>(null);
  const snapshots = useRef<Partial<Record<BankCardId, BankSnapshot>>>({});
  const picker = useRef<HTMLDivElement>(null);
  const focusCard = useRef<BankCardId | null>(null);
  const cardPositions = useRef(new Map<string, string>());
  const cardMotion = useRef<Animation[]>([]);
  const walletId = useId();
  const handledInitialCard = useRef<BankCardId | null>(null);
  const refresh = useCallback(async () => {
    const version = Symbol('card-list-request');
    requestVersion.current = version;
    setLoading(true);
    try {
      const next = await bankCardsRequest();
      if (requestVersion.current !== version) return;
      setCards(previous => next.map(card => {
        const cached = previous.find(item => item.id === card.id);
        return cached && cached.revision > card.revision ? cached : card;
      }));
      setError('');
    } catch (value) {
      if (requestVersion.current === version) setError(value instanceof Error ? value.message : '银行卡列表读取失败');
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener('zhiyin-bank-updated', reload);
    window.addEventListener('zhiyin-phone-foreground', reload);
    return () => {
      requestVersion.current = null;
      window.removeEventListener('zhiyin-bank-updated', reload);
      window.removeEventListener('zhiyin-phone-foreground', reload);
    };
  }, [refresh]);
  useEffect(() => {
    if (!initialCardId) {handledInitialCard.current = null; return;}
    if (handledInitialCard.current === initialCardId || !cards.some(card => card.id === initialCardId)) return;
    handledInitialCard.current = initialCardId;
    setSelectedId(initialCardId);
    onInitialCardConsumed?.();
  }, [initialCardId, onInitialCardConsumed, cards]);
  useLayoutEffect(() => {
    // Capture before React reorders the stack. CSS transitions alone can lose
    // their starting position when a keyed card moves to another DOM slot.
    const wallet = picker.current;
    const starts = cardPositions.current;
    cardMotion.current.forEach(animation => animation.cancel());
    cardMotion.current = [];
    if (wallet && starts.size && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !document.hidden) {
      const slot = parseFloat(getComputedStyle(wallet).getPropertyValue('--wallet-slot'));
      wallet.querySelectorAll<HTMLElement>('[data-card-id]').forEach(node => {
        const from = starts.get(node.dataset.cardId!);
        const position = Number(node.style.getPropertyValue('--wallet-position'));
        if (!from || !Number.isFinite(slot) || !node.animate) return;
        cardMotion.current.push(node.animate([
          {transform: from},
          {transform: `translateY(${position * slot}px)`},
        ], {duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)'}));
      });
    }
    starts.clear();
    if (focusCard.current !== selectedId) return;
    picker.current?.querySelector<HTMLElement>(`[data-card-id="${selectedId}"]`)?.focus({preventScroll: true});
    focusCard.current = null;
  }, [selectedId]);
  useEffect(() => {
    const stop = () => {cardMotion.current.forEach(animation => animation.cancel()); cardMotion.current = [];};
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPreference = () => {if (reducedMotion?.matches) stop();};
    const onVisibility = () => {if (document.hidden) stop();};
    reducedMotion?.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {stop(); reducedMotion?.removeEventListener('change', onPreference); document.removeEventListener('visibilitychange', onVisibility);};
  }, []);
  const selectCard = (id: BankCardId) => {
    if (id === selectedId) return;
    cardPositions.current.clear();
    picker.current?.querySelectorAll<HTMLElement>('[data-card-id]').forEach(node => {
      cardPositions.current.set(node.dataset.cardId!, getComputedStyle(node).transform);
    });
    focusCard.current = id;
    setSelectedId(id);
  };
  const acceptSnapshot = useCallback((id: BankCardId, state: BankSnapshot) => {
    const cached = snapshots.current[id];
    if (!cached || state.revision >= cached.revision) snapshots.current[id] = state;
    setCards(previous => previous.map(card => card.id === id && state.revision >= card.revision
      ? {...card, revision: state.revision, balance: state.balance, limit: state.limit, frozen: state.frozen, controls: state.controls}
      : card));
  }, []);
  const selected = cards.find(card => card.id === selectedId);
  const walletCards = [...cards.filter(card => card.id !== selectedId), ...(selected ? [selected] : [])];
  return <section className="card-management" aria-label="银行卡管理">
    <header className="card-management-heading">
      {onBack && <button className="card-back" aria-label="返回" onClick={onBack}><ArrowLeft size={21} aria-hidden="true"/></button>}
      <div><h1>我的卡包</h1><p>{cards.length ? `${cards.length} 张银行卡 · 轻点切换` : loading ? '正在读取银行卡' : '读取银行卡后可查看余额与权限'}</p></div>
      <button className="card-refresh" disabled={loading} onClick={() => void refresh()} aria-label="刷新银行卡列表"><RefreshCw size={18} className={loading ? 'is-refreshing' : ''} aria-hidden="true"/><span>刷新</span></button>
    </header>
    {error && <div className="card-management-error" role="alert"><CircleAlert size={19} aria-hidden="true"/><div><p>{error}</p>{cards.length > 0 && <small>列表可能不是最新，进入卡片后会重新核对。</small>}<Button variant="secondary" disabled={loading} onClick={() => void refresh()}>重新读取银行卡</Button></div></div>}
    {!cards.length && loading && <p className="card-loading" role="status">正在读取银行卡…</p>}
    {cards.length > 0 && <>
      <div className="card-wallet" ref={picker} role="group" aria-label="选择要管理的银行卡" style={{'--wallet-count': cards.length} as CSSProperties}>
        <div className="card-wallet-lining" aria-hidden="true"/>
        {walletCards.map((card, index) => <button key={card.id} className="wallet-bank-card" data-card-id={card.id} data-selected={card.id === selectedId} data-frozen={card.frozen} style={{'--wallet-position': index, zIndex: index + 1} as CSSProperties} aria-pressed={card.id === selectedId} aria-describedby={card.id === selectedId ? `${walletId}-${card.id}-balance` : undefined} aria-label={`${card.name}，尾号 ${card.last4}，${card.frozen ? '已挂失' : '正常'}`} onClick={() => selectCard(card.id)}>
          <span className="wallet-card-surface">
          <span className="wallet-card-header"><span className="wallet-card-name"><CreditCard size={18} aria-hidden="true"/>{card.name}</span><span className="wallet-card-peek">{card.frozen ? '已挂失 · ' : ''}{card.last4}</span><Check className="wallet-card-selected" size={18} aria-hidden="true"/></span>
          <span className="wallet-card-face" aria-hidden={card.id !== selectedId}>
            <span className="wallet-card-chip-row"><svg className="wallet-card-chip" viewBox="0 0 40 30" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="39" height="29" rx="6" fill="currentColor"/><path d="M14 1v8H1m13 0v12H1m13 0v8m12-28v8h13M26 9v12h13m-13 0v8M14 9h12M14 21h12" stroke="var(--chip-line)" strokeWidth=".8"/></svg><Wifi size={22} className="wallet-contactless" aria-hidden="true"/><span>知银 · 借记卡</span></span>
            <span className="wallet-card-number"><span aria-hidden="true">••••&nbsp; ••••&nbsp; ••••</span><strong>{card.last4}</strong></span>
            <span className="wallet-card-bottom"><span className="wallet-card-balance" id={`${walletId}-${card.id}-balance`}><small>账户余额</small><strong>{assetMoney(card.balance)}</strong></span><span className="wallet-card-status"><span/>{card.frozen ? '已挂失' : '正常使用'}</span></span>
          </span>
          </span>
        </button>)}
        <div className="card-wallet-pocket" aria-hidden="true"/>
      </div>
      {selected && <SelectedCard key={selected.id} card={selected} cachedSnapshot={snapshots.current[selected.id]} onAsk={onAsk} onTransfer={onTransfer} onSnapshot={acceptSnapshot}/>}
    </>}
  </section>;
}

function SelectedCard({card, cachedSnapshot, onAsk, onTransfer, onSnapshot}: CardManagementProps & {
  card: BankCardSummary;
  cachedSnapshot?: BankSnapshot;
  onSnapshot: (id: BankCardId, state: BankSnapshot) => void;
}) {
  const bank = useBankAccount(card.id);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [draftLimit, setDraftLimit] = useState('');
  const [validation, setValidation] = useState('');
  const [receipt, setReceipt] = useState('');
  const responseBehindCache = !!bank.state && !!cachedSnapshot && bank.state.revision < cachedSnapshot.revision;
  const freshState = responseBehindCache ? null : bank.state;
  const state = freshState ?? cachedSnapshot;
  const readError = bank.error || (responseBehindCache ? '账户信息尚未同步，请重新读取后操作。' : '');
  const actionsDisabled = !freshState || bank.busy || !!readError;
  useEffect(() => {if (freshState) onSnapshot(card.id, freshState);}, [freshState, card.id, onSnapshot]);
  const begin = (change: PendingChange) => {if (!actionsDisabled) {setValidation(''); setPending(change);}};
  const close = () => {if (!bank.busy) {setPending(null); setValidation('');}};
  const stale = !!pending && !!state && pending.revision !== state.revision;
  async function confirm() {
    if (!pending || !freshState || stale || actionsDisabled) return;
    let success = false;
    let result = '';
    if (pending.kind === 'limit') {
      const amount = Number(draftLimit);
      if (!/^\d+(?:\.\d{1,2})?$/.test(draftLimit) || !Number.isFinite(amount) || amount < 100 || amount > 50000) {
        setValidation('单笔限额需为 100 至 50,000 元，最多保留两位小数。');
        return;
      }
      success = await bank.change({limit: Math.round(amount * 100)});
      result = `单笔限额已改为 ${assetMoney(Math.round(amount * 100))}`;
    } else if (pending.kind === 'control') {
      success = await bank.change({controls: {...freshState.controls, [pending.key]: pending.enabled}});
      result = `${pending.title}已${pending.enabled ? '开启' : '关闭'}`;
    } else {
      success = await bank.change({frozen: pending.frozen});
      result = pending.frozen ? '已挂失，付款已暂停' : '已恢复，付款仍受当前权限与限额控制';
    }
    if (success) {setPending(null); setReceipt(`尾号 ${card.last4}：${result}`);}
  }
  const dialogTitle = pending?.kind === 'limit' ? '调整单笔支付限额' : pending?.kind === 'control' ? `确认${pending.enabled ? '开启' : '关闭'}${pending.title}` : pending?.frozen ? '确认挂失卡片' : '确认恢复卡片';
  const totalRecords = state ? state.transactions.length + (state.collections?.length ?? 0) + (state.payments?.length ?? 0) + (state.payments?.filter(item => item.refundedAt !== undefined).length ?? 0) : 0;
  return <div className={`selected-card${!state ? ' card-detail-placeholder' : ''}`} aria-label={`尾号 ${card.last4} 的卡片详情`}>
    <section className="card-account-section" aria-label={`尾号 ${card.last4} 的余额与操作`}>
      <div className="card-detail-heading"><h2>{card.name}<span>尾号 {card.last4}</span></h2></div>
      {readError && <div className="card-management-error" role="alert"><CircleAlert size={18} aria-hidden="true"/><div><p>{readError}</p>{state && <small>下方为上次读取结果，请重新核对后操作。</small>}<Button variant="secondary" disabled={bank.busy} onClick={() => void bank.refresh()}>重新读取尾号 {card.last4}</Button></div></div>}
      {!state ? !readError && <p className="card-loading" role="status">正在读取尾号 {card.last4} 的账户…</p> : <>
        <div className="card-available"><span>可用余额</span><strong>{assetMoney(availableBankFunds(state))}</strong></div>
        {heldOccasionBudget(state) > 0 && <p className="card-balance-note">账户余额 {assetMoney(state.balance)} · 生活筹备预留 {assetMoney(heldOccasionBudget(state))}</p>}
        {state.frozen && <p className="card-balance-note">此卡已挂失，付款已暂停；核实卡片安全后可恢复。</p>}
        <Button className="card-transfer-button" disabled={actionsDisabled} onClick={() => onTransfer(card.id)}><ArrowUpRight size={18} aria-hidden="true"/>用此卡转账与 AA 收款</Button>
      </>}
    </section>
    {state && <>
      <section className="card-permissions" aria-labelledby={`card-permissions-${card.id}`}>
        <h2 id={`card-permissions-${card.id}`}>权限与安全<span>仅作用于尾号 {card.last4}</span></h2>
        <div className="card-permission-list">
          <button className="card-permission-row card-limit-row" disabled={actionsDisabled} onClick={() => {setDraftLimit(String(state.limit / 100)); begin({kind: 'limit', revision: state.revision});}}><CreditCard size={19} aria-hidden="true"/><span><strong>单笔支付限额</strong><small>{assetMoney(state.limit)}</small></span><ChevronRight size={18} aria-hidden="true"/></button>
          {controlRows.map(({key, title, icon: Icon, enabledDescription, disabledDescription}) => <div className="card-permission-row" key={key}><Icon size={19} aria-hidden="true"/><span><strong>{title}</strong><small>{state.controls[key] ? `已开启 · ${enabledDescription}` : `已关闭 · ${disabledDescription}`}</small></span><Switch label={`尾号 ${card.last4} ${title}`} checked={state.controls[key]} disabled={actionsDisabled} onCheckedChange={enabled => begin({kind: 'control', key, title, enabled, revision: state.revision})}/></div>)}
        </div>
        <Button variant={state.frozen ? 'secondary' : 'danger'} className="card-freeze-button" disabled={actionsDisabled} onClick={() => begin({kind: 'freeze', frozen: !state.frozen, revision: state.revision})}>{state.frozen ? <ShieldCheck size={18} aria-hidden="true"/> : <CircleAlert size={18} aria-hidden="true"/>}{state.frozen ? '恢复这张卡' : '挂失这张卡'}</Button>
        {receipt && <p className="card-change-receipt" role="status"><CheckCircle2 size={18} aria-hidden="true"/>{receipt}</p>}
        {card.isPrimary && <button className="card-ask" disabled={actionsDisabled} onClick={() => onAsk(`帮我核对尾号 ${card.last4} 的用卡权限和限额，给我一些建议。`)}><MessageCircle size={17} aria-hidden="true"/><span>让管家帮我核对这张卡</span><ChevronRight size={16} aria-hidden="true"/></button>}
      </section>
      <details className="card-history">
        <summary><span>本卡交易记录<small>{totalRecords} 笔 · 尾号 {card.last4}</small></span><ChevronDown size={18} aria-hidden="true"/></summary>
        <CardHistory state={state} last4={card.last4}/>
      </details>
      {card.isPrimary && <details className="card-new-application"><summary><span>申请新卡<small>现有卡片之外的申请与进度</small></span><ChevronDown size={18} aria-hidden="true"/></summary><fieldset className="card-application-controls" disabled={actionsDisabled}><CardApplicationPanel bank={actionsDisabled ? null : freshState} onRefresh={bank.refresh}/></fieldset></details>}
    </>}
    <Dialog open={!!pending} onOpenChange={open => !open && close()} title={dialogTitle} description={`${card.name} · 尾号 ${card.last4}。只修改这张卡，其他卡保持不变。`}>
      {pending?.kind === 'limit' && <div className="card-limit-form"><p>当前单笔限额 {state && assetMoney(state.limit)}</p><label htmlFor={`limit-${card.id}`}>新的单笔限额（元）</label><input id={`limit-${card.id}`} inputMode="decimal" autoComplete="off" value={draftLimit} disabled={bank.busy} onChange={event => {setDraftLimit(event.target.value); setValidation('');}}/><small>支持 100 至 50,000 元。</small></div>}
      {pending?.kind === 'control' && <p className="card-confirm-copy">{pending.title}：当前{pending.enabled ? '关闭' : '开启'} → 拟{pending.enabled ? '开启' : '关闭'}。{pending.key === 'night' ? '开启后将在 23:00—06:00 限制付款。' : pending.key === 'overseas' ? '关闭后将拦截境外渠道付款。' : '关闭后将拦截无卡支付渠道付款。'}</p>}
      {pending?.kind === 'freeze' && <p className="card-confirm-copy">{pending.frozen ? '挂失后暂停此卡的付款，已完成交易不会撤销。' : '请确认卡片已找回或安全问题已解除。恢复后仍按此卡的支付权限和限额处理付款。'}</p>}
      {(validation || readError || stale) && <p role="alert" className="card-confirm-error">{stale ? '此卡状态已更新，请返回重新核对后再确认。' : validation || readError}</p>}
      <div className="card-confirm-actions"><Button variant="secondary" disabled={bank.busy} onClick={close}>返回核对</Button><Button variant={pending?.kind === 'freeze' && pending.frozen ? 'danger' : 'primary'} disabled={actionsDisabled || stale} onClick={() => void confirm()}>{bank.busy ? '正在保存…' : `确认${pending?.kind === 'freeze' ? pending.frozen ? '挂失' : '恢复' : '修改'}尾号 ${card.last4}`}</Button></div>
    </Dialog>
  </div>;
}

function CardHistory({state, last4}: {state: BankSnapshot; last4: string}) {
  const records = [
    ...state.transactions.map(item => ({id: `transfer:${item.id}`, title: `转给${bankRecipients.find(person => person.id === item.recipientId)?.name ?? '收款人'}`, amount: -item.amount, at: item.completedAt, balance: item.balanceAfter, receipt: item.id})),
    ...(state.collections ?? []).map(item => ({id: `collection:${item.id}`, title: `AA 收款 · ${bankRecipients.find(person => person.id === item.recipientId)?.name ?? '参与人'}`, amount: item.amount, at: item.completedAt, balance: item.balanceAfter, receipt: item.id})),
    ...(state.payments ?? []).flatMap(item => [
      {id: `payment:${item.id}`, title: item.merchant, amount: -item.amount, at: item.completedAt, balance: item.balanceAfter, receipt: item.id},
      ...(item.refundedAt !== undefined ? [{id: `refund:${item.id}`, title: `${item.merchant} · 退款`, amount: item.amount, at: item.refundedAt, balance: item.refundBalanceAfter, receipt: item.id}] : []),
    ]),
  ].sort((a, b) => b.at - a.at);
  return <div className="card-record-list">{records.length ? records.map(item => <details key={item.id}><summary><span>{item.title}<small>{new Date(item.at).toLocaleString('zh-CN')}</small></span><strong>{item.amount >= 0 ? '+' : '−'}{assetMoney(Math.abs(item.amount))}</strong></summary><p>尾号 {last4}{item.balance === undefined ? '' : ` · 交易后余额 ${assetMoney(item.balance)}`}</p><small>回执 {item.receipt}</small></details>) : <p>这张卡暂时没有交易记录。</p>}</div>;
}
