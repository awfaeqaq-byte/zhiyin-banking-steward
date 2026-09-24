import { CalendarClock, CheckCircle2, FileSearch } from "lucide-react";
import { formatCny } from "../lib/financial-connections";
import type { RecurringCandidate } from "../lib/recurring-payments";
import "./recurring-subscription-review.css";

export type RecurringReviewStatus = "pending" | "confirmed" | "dismissed";
export type RecurringReviews = Record<string, RecurringReviewStatus>;

type Props = {
  candidates: RecurringCandidate[];
  reviews: RecurringReviews;
  onReview: (key: string, status: RecurringReviewStatus) => void;
};

export function RecurringSubscriptionReview({ candidates, reviews, onReview }: Props) {
  if (!candidates.length) return null;
  const visible = candidates.filter(item => reviews[item.key] !== "dismissed");
  const ignored = candidates.filter(item => reviews[item.key] === "dismissed");
  return (
    <section className="recurring-review" aria-label="账单中的周期扣费">
      <div className="recurring-heading">
        <FileSearch size={22} aria-hidden="true" />
        <div><h2>账单中的周期扣费</h2><p>这些付款有规律，但还不能确定是否会自动续费。</p></div>
      </div>
      {visible.map(item => {
        const confirmed = reviews[item.key] === "confirmed";
        return (
          <article className="recurring-item" key={item.key} aria-label={item.title}>
            <div className="recurring-item-heading">
              <div><span className={`recurring-status ${confirmed ? "confirmed" : ""}`}>
                {confirmed ? <CheckCircle2 size={14} aria-hidden="true" /> : <FileSearch size={14} aria-hidden="true" />}
                {confirmed ? "你已确认是订阅" : "疑似订阅"}
              </span><h3>{item.title}</h3><p>{item.providerName} · 最近一期金额</p></div>
              <strong>{formatCny(item.amount)}<small>/ {item.cycle}</small></strong>
            </div>
            <p className="recurring-reason">{item.evidenceSummary}</p>
            <div className="recurring-estimate"><CalendarClock size={16} aria-hidden="true" />
              按历史规律推测，下次可能在 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }).format(item.estimatedNextChargeAt)}
            </div>
            <details className="recurring-evidence">
              <summary>查看 {item.evidence.length} 笔扣费依据</summary>
              <table><caption className="sr-only">{item.title}的历史扣费</caption>
                <thead><tr><th scope="col">扣费日期</th><th scope="col">支出</th></tr></thead>
                <tbody>{item.evidence.map(row => <tr key={row.id}>
                  <td>{row.occurredAt.slice(0, 10)}</td><td>{formatCny(Math.abs(row.amount))}</td>
                </tr>)}</tbody>
              </table>
            </details>
            {confirmed && <p className="recurring-boundary">尚未取得该服务的签约信息，请到对应平台核实续费方式。这里的确认仅用于订阅管理，不会开通或取消扣费。</p>}
            <div className="recurring-actions">
              {confirmed ? <button onClick={() => onReview(item.key, "pending")}>重新判断</button> : <>
                <button className="recurring-confirm" onClick={() => onReview(item.key, "confirmed")}>这是订阅</button>
                <button onClick={() => onReview(item.key, "dismissed")}>不是订阅</button>
              </>}
            </div>
          </article>
        );
      })}
      {ignored.length > 0 && <details className="recurring-ignored">
        <summary>已忽略 {ignored.length} 项</summary>
        <p>忽略只影响知银的识别结果，不会删除账单或取消付款。</p>
        {ignored.map(item => <div key={item.key}><span>{item.title}</span>
          <button aria-label={`重新核对${item.title}`} onClick={() => onReview(item.key, "pending")}>重新核对</button>
        </div>)}
      </details>}
    </section>
  );
}
