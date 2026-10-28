import {useId} from 'react';
import {ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, RotateCw} from 'lucide-react';
import {assetMoney} from '../lib/bank-assets';
import {bankCards, bankRecipients, type BankCardId, type BankSnapshot} from '../lib/bank-transfer';
import type {ExternalFinancialProvider} from '../lib/financial-connections';
import type {SubscriptionInsight} from '../lib/subscription-insights';
import './asset-schedule.css';

type Props = {
  snapshot?: BankSnapshot | null;
  hidden?: boolean;
  loading?: boolean;
  error?: string;
  subscriptions?: SubscriptionInsight[];
  subscriptionError?: string;
  now?: number;
  onOpenSchedule: () => void;
  onOpenFunding?: () => void;
  onOpenTransfer: (cardId: BankCardId) => void;
  onOpenDeposits: () => void;
  onOpenSubscription?: (provider: ExternalFinancialProvider, id: string) => void;
  onRetry?: () => void;
};

type Arrangement = {
  key: string;
  kind: 'transfer' | 'deposit' | 'subscription';
  dueAt: number;
  title: string;
  source: string;
  status: string;
  amount: number;
  cardId?: BankCardId;
  provider?: ExternalFinancialProvider;
  subscriptionId?: string;
};

const dateParts = (time: number) => {
  const date = new Date(time + 8 * 60 * 60 * 1000);
  return {year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate()};
};
const fullDate = (time: number) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
}).format(time);

function arrangements(snapshot: BankSnapshot | null | undefined, subscriptions: SubscriptionInsight[], now: number): Arrangement[] {
  const schedules = snapshot?.allSchedules ?? snapshot?.schedules?.map(schedule => ({
    ...schedule, cardId: snapshot.cardId ?? 'primary',
  })) ?? [];
  const transfers: Arrangement[] = schedules.filter(schedule => schedule.status === 'pending').map(schedule => ({
    key: `transfer:${schedule.cardId}:${schedule.id}`,
    kind: 'transfer', dueAt: schedule.executeAt, amount: schedule.amount, cardId: schedule.cardId,
    title: `转给${bankRecipients.find(recipient => recipient.id === schedule.recipientId)?.name ?? '收款人'}`,
    source: `${bankCards.find(card => card.id === schedule.cardId)?.name ?? '银行卡'} · ${bankCards.find(card => card.id === schedule.cardId)?.last4 ?? ''}`,
    status: schedule.executeAt <= now ? '等待核对' : '待转出',
  }));
  const deposits: Arrangement[] = (snapshot?.termDeposits ?? []).filter(deposit => deposit.closedAt === undefined).map(deposit => ({
    key: `deposit:${deposit.id}`, kind: 'deposit', dueAt: deposit.maturesAt, amount: deposit.amount,
    title: `${deposit.months} 个月定存到期`, source: '本金 · 到期后手动支取',
    status: deposit.maturesAt <= now ? '待支取' : '持有中',
  }));
  const renewals: Arrangement[] = subscriptions.filter(subscription => Number.isFinite(subscription.nextChargeAt)).map(subscription => ({
    key: `subscription:${subscription.key}`, kind: 'subscription', dueAt: subscription.nextChargeAt!,
    amount: subscription.amount, title: subscription.title,
    source: `${subscription.providerName} · 预计续费`,
    status: subscription.nextChargeAt! <= now ? '结果待核对' : '待扣费',
    provider: subscription.provider, subscriptionId: subscription.id,
  }));
  return [...transfers, ...deposits, ...renewals].sort((a, b) => a.dueAt - b.dueAt || a.key.localeCompare(b.key));
}

export function AssetSchedule({snapshot, hidden = false, loading = false, error, subscriptions = [], subscriptionError, now = snapshot?.asOf ?? Date.now(), onOpenSchedule, onOpenFunding, onOpenTransfer, onOpenDeposits, onOpenSubscription, onRetry}: Props) {
  const headingId = useId();
  const items = arrangements(snapshot, subscriptions, now);
  const waiting = loading || (!snapshot && !error);
  const incomplete = Boolean(error || subscriptionError);
  function open(item: Arrangement) {
    if (item.kind === 'transfer' && item.cardId) onOpenTransfer(item.cardId);
    else if (item.kind === 'deposit') onOpenDeposits();
    else if (item.provider && item.subscriptionId && onOpenSubscription) onOpenSubscription(item.provider, item.subscriptionId);
    else onOpenSchedule();
  }

  return <section className="asset-schedule" aria-labelledby={headingId} aria-busy={waiting}>
    <header className="asset-schedule-heading">
      <div><h2 id={headingId}>近期资金安排</h2><p>支出与到期，提前心中有数</p></div>
      <button type="button" onClick={onOpenSchedule}>查看日程<ChevronRight size={15} aria-hidden="true"/></button>
    </header>
    {incomplete && <div className="asset-schedule-notice" role="status">
      <span>{error ? '银行安排暂未更新，请刷新核对。' : '续费安排暂未更新，请到订阅页核对。'}{snapshot && items.length > 0 ? '以下为已读取的安排。' : ''}</span>
      {onRetry && error && <button type="button" onClick={onRetry}>重试</button>}
    </div>}
    {waiting && <p className="asset-schedule-loading" role="status">正在读取资金安排…</p>}
    {items.length > 0 ? <ol className="asset-schedule-list">
      {items.slice(0, 3).map(item => {
        const parts = dateParts(item.dueAt);
        const Icon = item.kind === 'deposit' ? ArrowDownLeft : item.kind === 'subscription' ? RotateCw : ArrowUpRight;
        return <li key={item.key} data-kind={item.kind}>
          <button type="button" className="asset-schedule-item" onClick={() => open(item)}>
            <time className="asset-schedule-date" dateTime={new Date(item.dueAt).toISOString()} aria-label={fullDate(item.dueAt)}>
              <span aria-hidden="true">{parts.month} 月</span><strong aria-hidden="true">{String(parts.day).padStart(2, '0')}</strong>
            </time>
            <span className="asset-schedule-content">
              <span className="asset-schedule-title"><strong>{item.title}</strong><Icon size={14} aria-hidden="true"/></span>
              <span className="asset-schedule-source">{item.source}</span>
              <span className="asset-schedule-bottom"><span className="asset-schedule-state">{item.status}</span><strong className="asset-schedule-amount" aria-label={hidden ? '金额已隐藏' : undefined}>{hidden ? '••••' : assetMoney(item.amount)}</strong></span>
            </span>
            <ChevronRight className="asset-schedule-chevron" size={15} aria-hidden="true"/>
          </button>
        </li>;
      })}
    </ol> : !waiting && !incomplete ? <div className="asset-schedule-empty">
      <CalendarDays size={25} aria-hidden="true"/>
      <div><strong>暂时没有待处理的资金安排</strong><p>预约转账、定存到期和已识别续费会列在这里。</p></div>
    </div> : null}
    {onOpenFunding && <button type="button" className="asset-schedule-funding" onClick={onOpenFunding}>查看资金安排<ChevronRight size={15} aria-hidden="true"/></button>}
  </section>;
}
