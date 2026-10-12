import { ArrowRight, CircleAlert, PieChart, Sparkles, Wallet } from "lucide-react";
import { buildBillAnalysis, billReferenceTime } from "../lib/bill-analysis";
import type { ConnectedFinancialSource, ExternalFinancialProvider } from "../lib/financial-connections";
import { formatCny } from "../lib/financial-connections";
import { fundingReferenceTime } from "../lib/funding-forecast";

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
  const previous = buildBillAnalysis(connections, "分析上个月支出", billTime);
  const reference = new Date(billTime);
  const elapsed = Math.max(1, reference.getDate());
  const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  const projectedExpense = Math.round((current.expense * daysInMonth) / elapsed);
  const projectedSurplus = current.income - projectedExpense;
  const previousCategories = new Map(previous.categories.map((item) => [item.name, item.amount]));
  const category = current.categories
    .map((item) => ({ ...item, increase: item.amount - (previousCategories.get(item.name) || 0) }))
    .sort((a, b) => b.increase - a.increase)[0] || current.categories[0];
  const change = category
    ? category.increase > 0
      ? `${category.name}支出较上月增加 ${formatCny(category.increase)}`
      : `${category.name}是本月主要支出，已记录 ${formatCny(category.amount)}`
    : current.sources.length
      ? "本月暂时没有可归类的消费记录"
      : "连接账单后，我会在这里解释资金变化";

  return (
    <section className="funding-insights" aria-labelledby="funding-insights-title">
      <header>
        <div>
          <span>{stewardName}为你整理</span>
          <h2 id="funding-insights-title">资金观察</h2>
        </div>
        <small>{current.sources.length ? `依据：${current.sources.join("、")}` : "等待账单数据"}</small>
      </header>
      <div className="funding-insight-grid">
        <button type="button" onClick={() => onAsk("详细解释一下最近支出的变化")}>
          <span><PieChart size={18} /></span>
          <small>消费变化</small>
          <strong>{change}</strong>
          <em>问{stewardName}为什么 <ArrowRight size={14} /></em>
        </button>
        <button type="button" onClick={() => onAsk("按我现在的收支，帮我计算每月能存多少钱")}>
          <span><Wallet size={18} /></span>
          <small>结余估算</small>
          <strong>{current.income ? `本月预计可结余 ${formatCny(projectedSurplus)}` : "收入数据齐全后可预测结余"}</strong>
          <em>继续做资金规划 <ArrowRight size={14} /></em>
        </button>
        {automationAttention ? (
          <button type="button" className="needs-confirmation" onClick={onOpenAutomations}>
            <span><CircleAlert size={18} /></span>
            <small>需要你确认</small>
            <strong>{automationAttention.count} 条账单线索等待核对</strong>
            <em>查看任务结果 <ArrowRight size={14} /></em>
          </button>
        ) : (
          <button type="button" onClick={() => onAsk("结合我的账单，告诉我当前最值得关注的资金问题")}>
            <span><Sparkles size={18} /></span>
            <small>管家建议</small>
            <strong>{current.sources.length ? `${stewardName}会结合账单变化持续更新建议` : "接入账单后生成个性化资金建议"}</strong>
            <em>和{stewardName}聊一聊 <ArrowRight size={14} /></em>
          </button>
        )}
      </div>
    </section>
  );
}
