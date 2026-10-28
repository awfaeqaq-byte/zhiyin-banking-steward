import { ArrowRight, CircleAlert, PieChart, Sparkles, Wallet } from "lucide-react";
import { buildBillAnalysis, billReferenceTime } from "../lib/bill-analysis";
import type { ConnectedFinancialSource, ExternalFinancialProvider } from "../lib/financial-connections";
import { formatCny } from "../lib/financial-connections";
import { fundingReferenceTime } from "../lib/funding-forecast";
import "./funding-insights.css";

type Props = {
  stewardName: string;
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
  automationAttention?: { count: number; summary: string };
  onAsk: (prompt: string) => void;
  onOpenAutomations: () => void;
};

export function FundingInsights({
  stewardName,
  connections,
  automationAttention,
  onAsk,
  onOpenAutomations,
}: Props) {
  const referenceTime = fundingReferenceTime(connections);
  const billTime = billReferenceTime(connections, referenceTime);
  const current = buildBillAnalysis(connections, "分析本月支出", billTime);
  const category = current.categories[0];
  const change = category
    ? `已返回记录中，${category.name}消费最多：${formatCny(category.amount)}`
    : current.sources.length
      ? "当前范围暂无已返回的消费记录"
      : "连接账单后，查看消费去向";
  const hasRecords = current.count > 0;

  return (
    <section className="funding-insights funding-insights-facts" aria-labelledby="funding-insights-title">
      <header>
        <div>
          <h2 id="funding-insights-title">资金观察</h2>
          <p>{current.from}—{current.to} · 已返回账单</p>
        </div>
        <small>{current.sources.length ? current.sources.join("、") : "尚未连接账单"}</small>
      </header>
      {hasRecords ? <dl className="funding-observed-totals" aria-label="已返回账单小计">
        <div><dt>已记录收入</dt><dd>{formatCny(current.income)}</dd></div>
        <div><dt>已记录消费</dt><dd>{formatCny(current.expense)}</dd></div>
      </dl> : <p className="funding-insights-empty">{current.sources.length ? "当前范围尚无可汇总的账单记录，可让管家帮你核对读取范围。" : "先让管家帮你连接账单，再了解收支。"}</p>}
      <p className="funding-insights-scope">{current.coverageIncomplete ? current.coverage : "仅汇总已授权平台返回的记录；转账、退款单列。"}这是收支记录，不是可支配余额，也不据此预测月末结余。</p>
      <div className="funding-insight-grid">
        <button type="button" onClick={() => onAsk("详细解释一下最近支出的变化")}>
          <span><PieChart size={18} aria-hidden="true" /></span>
          <small>消费去向</small>
          <strong>{change}</strong>
          <em>查看账单依据 <ArrowRight size={14} aria-hidden="true" /></em>
        </button>
        <button type="button" onClick={() => onAsk("我想做储蓄计划，请先和我核对稳定收入、固定支出和需要预留的钱")}>
          <span><Wallet size={18} aria-hidden="true" /></span>
          <small>储蓄安排</small>
          <strong>先核对收入、固定支出和预留，再决定存多少</strong>
          <em>和{stewardName}一起规划 <ArrowRight size={14} aria-hidden="true" /></em>
        </button>
        {automationAttention ? (
          <button type="button" className="needs-confirmation" onClick={onOpenAutomations}>
            <span><CircleAlert size={18} aria-hidden="true" /></span>
            <small>需要你确认</small>
            <strong>{automationAttention.count} 条账单线索等待核对</strong>
            <em>核对账单线索 <ArrowRight size={14} aria-hidden="true" /></em>
          </button>
        ) : (
          <button type="button" onClick={() => onAsk("结合我的账单，告诉我当前最值得关注的资金问题")}>
            <span><Sparkles size={18} aria-hidden="true" /></span>
            <small>一起核对</small>
            <strong>最近的收支，有什么需要留意</strong>
            <em>问问{stewardName} <ArrowRight size={14} aria-hidden="true" /></em>
          </button>
        )}
      </div>
    </section>
  );
}
