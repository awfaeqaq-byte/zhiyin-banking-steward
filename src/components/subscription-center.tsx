import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CircleAlert,
  CheckCircle2,
  ChevronRight,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  ConnectedFinancialSource,
  ExternalFinancialProvider,
} from "../lib/financial-connections";
import { formatCny } from "../lib/financial-connections";
import {
  buildSubscriptionInsights,
  duplicateGroupKey, subscriptionGroups, EMPTY_DUPLICATE_PREFERENCES, type DuplicatePreferences, type DuplicateDecision,
  RENEWAL_REMINDER_WINDOW_DAYS,
  renewalTimingLabel,
  type SubscriptionInsight,
} from "../lib/subscription-insights";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { buildRecurringCandidates } from "../lib/recurring-payments";
import { RecurringSubscriptionReview, type RecurringReviews, type RecurringReviewStatus } from "./recurring-subscription-review";
import "./subscription-center.css";

type Props = {
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
  duplicatePreferences?: DuplicatePreferences;
  onDuplicatePreference?: (key: string, decision: DuplicateDecision) => void;
  now?: number;
  disabledReminders: string[];
  onToggleReminder: (key: string, enabled: boolean) => void;
  onCancel: (provider: ExternalFinancialProvider, id: string) => Promise<void>;
  onConnect: () => void;
  refreshing?: boolean;
  refreshError?: string;
  onRefresh?: () => void;
  selectedKey?: string | null;
  onSelectionConsumed?: () => void;
  focusKey?: string | null;
  onFocusConsumed?: () => void;
  recurringReviews?: RecurringReviews;
  onReviewRecurring?: (key: string, status: RecurringReviewStatus) => void;
};

const providerTone: Record<ExternalFinancialProvider, string> = {
  wechat_pay: "wechat",
  alipay: "alipay",
};

function dateLabel(timestamp?: number) {
  if (typeof timestamp !== "number") return "暂未提供下次扣费日";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }).format(timestamp);
}

export function SubscriptionCenter({
  duplicatePreferences = EMPTY_DUPLICATE_PREFERENCES, onDuplicatePreference,
  connections,
  now = Date.now(),
  disabledReminders,
  onToggleReminder,
  onCancel,
  onConnect,
  refreshing = false,
  refreshError = "",
  onRefresh,
  selectedKey = null,
  onSelectionConsumed,
  focusKey = null,
  onFocusConsumed,
  recurringReviews = {},
  onReviewRecurring = () => undefined,
}: Props) {
  const insights = useMemo(
    () => buildSubscriptionInsights(connections, now, duplicatePreferences),
    [connections, now, duplicatePreferences],
  );
  const [selected, setSelected] = useState<SubscriptionInsight | null>(null);
  const recurring = useMemo(() => buildRecurringCandidates(connections, now), [connections, now]);
  const recurringSection = <RecurringSubscriptionReview candidates={recurring} reviews={recurringReviews} onReview={onReviewRecurring} />;
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const subscriptionItems = useRef(new Map<string, HTMLElement>());
  const connectedCount = Object.keys(connections).length;
  const hasAutopayAccess = Object.values(connections).some(source => source?.scopes.includes("autopay"));
  const enabledUpcoming = insights.upcoming.filter(
    item => !disabledReminders.includes(item.key),
  );
  const recognizedSources = Array.from(new Set(
    insights.items.map(item => item.providerName),
  )).join("、");

  useEffect(() => {
    if (!selectedKey) return;
    const item = insights.items.find(candidate => candidate.key === selectedKey);
    if (item) {
      setError("");
      setSelected(item);
    }
    onSelectionConsumed?.();
  }, [insights.items, onSelectionConsumed, selectedKey]);

  useEffect(() => {
    if (!focusKey) return;
    const item = subscriptionItems.current.get(focusKey);
    if (item) {
      setLookupError("");
      setFocusedKey(focusKey);
      item.scrollIntoView?.({ block: "center", behavior: "auto" });
      item.focus({ preventScroll: true });
      onFocusConsumed?.();
    } else if (!refreshing) {
      setLookupError("这项续费暂未出现在当前记录中，请同步后重试或到签约平台核对。");
      onFocusConsumed?.();
    }
  }, [focusKey, insights.items, onFocusConsumed, refreshing]);

  const confirmCancellation = async () => {
    if (!selected) return;
    setCancelling(true);
    setError("");
    try {
      await onCancel(selected.provider, selected.id);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取消失败，请稍后再试。");
    } finally {
      setCancelling(false);
    }
  };

  if (!insights.items.length) {
    if (refreshing) {
      return (
        <section className="subscription-empty" aria-live="polite">
          <span aria-hidden="true"><RefreshCw className="spin" size={27} /></span>
          <h2>正在识别自动续费</h2>
          <p>正在从你已授权的支付账户获取最新签约信息。</p>
        </section>
      );
    }
    return (<>
      <section className="subscription-empty" aria-labelledby="subscription-empty-title">
        <span aria-hidden="true">{refreshError ? <CircleAlert size={27} /> : <Link2 size={27} />}</span>
        <h2 id="subscription-empty-title">{refreshError ? "暂时无法读取自动续费" : connectedCount && !hasAutopayAccess ? "还需要自动续费读取授权" : hasAutopayAccess ? "暂无已签约自动续费" : "还没有可识别的订阅"}</h2>
        <p role={refreshError ? "alert" : undefined}>{refreshError
          ? `${refreshError} 读取失败不代表没有订阅。`
          : connectedCount && !hasAutopayAccess
            ? "目前的账单授权不能读取自动续费签约。可补充授权；账单中的周期扣费线索仍可单独核对。"
          : hasAutopayAccess
            ? "已授权的账户暂未返回有效续费签约。其他平台或尚未授权的签约不会显示在这里。"
          : "连接微信支付和支付宝后，知银会自动整理各平台的续费项。"}</p>
        <Button onClick={(refreshError || hasAutopayAccess) && onRefresh ? onRefresh : onConnect}>
          {(refreshError || hasAutopayAccess) && onRefresh ? "重新同步" : connectedCount ? "管理读取授权" : "连接微信支付或支付宝"}
        </Button>
        {lookupError && <p role="alert">{lookupError}</p>}
      </section>
      {recurringSection}
    </>);
  }

  return (
    <div className="subscription-center">
      {lookupError && <div className="subscription-sync-warning" role="alert"><CircleAlert size={19} aria-hidden="true" /><div><strong>未找到这项续费</strong><span>{lookupError}</span></div>{onRefresh && <button disabled={refreshing} onClick={() => { setLookupError(""); onRefresh(); }}>{refreshing ? "同步中…" : "重新同步"}</button>}</div>}
      {onDuplicatePreference && subscriptionGroups(insights.items).filter(group => duplicatePreferences[duplicateGroupKey(group)]?.decision === 'keep').map(group => (
        <section className="duplicate-choice" key={duplicateGroupKey(group)} aria-label="已保留的同类订阅">
          <p>{group.map(item => item.title).join('、')} · 已按你的选择全部保留</p>
          <p>不再提示这一组重复，续费提醒不变。</p>
          <button disabled={refreshing || Boolean(refreshError)} onClick={() => onDuplicatePreference(duplicateGroupKey(group), 'review')}>重新评估这组订阅</button>
        </section>
      ))}
      <section className="subscription-summary" aria-label="自动续费概览">
        <div className="subscription-summary-copy">
          <span className="subscription-spark" aria-hidden="true"><Sparkles size={21} /></span>
          <div>
            <span>已为你整理</span>
            <h2>已识别 {insights.items.length} 项自动续费</h2>
            <p>来自已授权的{recognizedSources}账户</p>
          </div>
        </div>
        <div className="subscription-metrics">
          <div>
            <span>{RENEWAL_REMINDER_WINDOW_DAYS} 天内续费</span>
            <strong>{insights.upcoming.length} 项</strong>
          </div>
          <div>
            <span>预计扣款</span>
            <strong>{formatCny(insights.upcomingAmount)}</strong>
          </div>
          <div>
            <span>可能重复</span>
            <strong>{insights.possibleDuplicateCount} 项</strong>
          </div>
        </div>
      </section>

      {refreshError && (
        <div className="subscription-sync-warning" role="alert">
          <CircleAlert size={19} aria-hidden="true" />
          <div><strong>部分数据可能不是最新</strong><span>{refreshError}</span></div>
          {onRefresh && <button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "同步中…" : "重新同步"}
          </button>}
        </div>
      )}

      {enabledUpcoming.length > 0 && (
        <section className="renewal-reminder" aria-labelledby="renewal-reminder-title">
          <BellRing size={21} aria-hidden="true" />
          <div>
            <h2 id="renewal-reminder-title">续费提醒</h2>
            <p>
              {enabledUpcoming[0].title}
              {enabledUpcoming[0].nextChargeAt! < now
                ? " 已到预计扣费时间，请核对平台结果"
                : enabledUpcoming[0].daysUntilCharge === 0 ? " 预计今天扣费"
                : ` 距离扣费还有 ${enabledUpcoming[0].daysUntilCharge} 天`}
              {enabledUpcoming.length > 1 ? `，另有 ${enabledUpcoming.length - 1} 项即将续费。` : "。"}
            </p>
          </div>
        </section>
      )}

      <div className="subscription-section-heading">
        <div><h2>全部自动续费</h2><p>关闭提醒只停止知银内的提示；停止扣费请取消自动续费。</p></div>
        <span><ShieldCheck size={15} />取消需你确认</span>
      </div>

      <div className="subscription-list">
        {insights.items.map(item => {
          const reminderEnabled = !disabledReminders.includes(item.key);
          return (
            <article className={`subscription-item${focusedKey === item.key ? " subscription-item-located" : ""}`} key={item.key} tabIndex={-1} aria-label={`${item.title}订阅详情`} ref={element => { if (element) subscriptionItems.current.set(item.key, element); else subscriptionItems.current.delete(item.key); }}>
              {focusedKey === item.key && <p className="subscription-located-note"><CalendarClock size={15} aria-hidden="true" />日程中的这项续费</p>}
              <div className="subscription-item-main">
                <span className={`subscription-provider ${providerTone[item.provider]}`} aria-hidden="true">
                  {item.provider === "wechat_pay" ? "微" : "支"}
                </span>
                <div className="subscription-item-copy">
                  <div className="subscription-title-line">
                    <h3>{item.title}</h3>
                    {item.flags.includes("possible_duplicate") && <span className="subscription-flag">可能重复</span>}
                  </div>
                  <p>{item.merchant || item.providerName} · {item.providerName}</p>
                </div>
                <div className="subscription-price">
                  <strong>{formatCny(item.amount)}</strong>
                  <span>/ {item.cycle}</span>
                </div>
              </div>
              <div className="subscription-schedule">
                <CalendarClock size={17} aria-hidden="true" />
                <div>
                  <strong>{item.nextChargeAt !== undefined && item.nextChargeAt < now ? "已到预计扣费时间" : renewalTimingLabel(item)}</strong>
                  <span>{dateLabel(item.nextChargeAt)}</span>
                </div>
                <span className={`renewal-urgency ${item.urgency}`}>
                  {item.daysUntilCharge === null ? "日期待核对" : item.nextChargeAt! < now ? "结果待核对" : item.urgency === "urgent" ? "近期扣费" : item.urgency === "upcoming" ? "即将续费" : "已排期"}
                </span>
              </div>
              <div className="subscription-actions">
                <label>
                  <span><BellRing size={15} />续费前提醒</span>
                  <Switch
                    checked={reminderEnabled}
                    onCheckedChange={enabled => onToggleReminder(item.key, enabled)}
                    label={`${item.title}续费提醒`}
                  />
                </label>
                <button
                  className="subscription-cancel-link"
                  aria-label={`取消${item.title}自动续费`}
                  onClick={() => { setError(""); setSelected(item); }}
                >
                  取消自动续费<ChevronRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {recurringSection}
      <p className="subscription-footnote">
        <CheckCircle2 size={15} />
        识别结果来自你授权的自动扣费数据。知银不会在未经确认时修改任何签约。
      </p>

      <Dialog
        open={selected !== null}
        onOpenChange={open => { if (!open && !cancelling) setSelected(null); }}
        title="取消自动续费"
        description="确认后，知银将通过合作接口把取消结果同步到签约平台。"
        className="subscription-cancel-sheet"
      >
        {selected && (
          <>
            <div className="cancel-subscription-card">
              <span className={`subscription-provider ${providerTone[selected.provider]}`} aria-hidden="true">
                {selected.provider === "wechat_pay" ? "微" : "支"}
              </span>
              <div>
                <strong>{selected.title}</strong>
                <span>{selected.providerName} · {formatCny(selected.amount)} / {selected.cycle}</span>
              </div>
            </div>
            <div className="cancel-consequence">
              <XCircle size={19} aria-hidden="true" />
              <p>取消后不再自动扣费；当前权益是否保留到期，以签约平台规则为准。</p>
            </div>
            {error && <p className="connection-error" role="alert">{error}</p>}
            <Button className="full-width" variant="danger" disabled={cancelling} onClick={confirmCancellation}>
              {cancelling ? <><RefreshCw className="spin" size={17} />正在同步取消结果…</> : "确认取消自动续费"}
            </Button>
            <Button className="full-width spaced-compact" variant="secondary" disabled={cancelling} onClick={() => setSelected(null)}>
              暂不取消
            </Button>
          </>
        )}
      </Dialog>
    </div>
  );
}
