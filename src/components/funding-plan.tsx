import { useMemo, useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Link2, RefreshCw, Wallet } from "lucide-react";
import { formatCny, type ConnectedFinancialSource, type ExternalFinancialProvider } from "../lib/financial-connections";
import { buildFundingForecast, fundingReferenceTime, type FundingAccountForecast, type FundingHorizonDays } from "../lib/funding-forecast";
import { Button } from "./ui/button";
import "./funding-plan.css";

type Props = {
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
  now?: number;
  refreshing?: boolean;
  refreshError?: string;
  onRefresh: () => void;
  onConnect: () => void;
  onOpenSubscriptions: () => void;
};

const date = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "long", day: "numeric",
}).format(timestamp);
const signedMoney = (amount: number) => amount < 0 ? `-${formatCny(-amount)}` : formatCny(amount);

/** Extend the existing Operate surface: explain per-account capacity before offering next steps. */
export function FundingPlan({ connections, now, refreshing = false, refreshError = "", onRefresh, onConnect, onOpenSubscriptions }: Props) {
  const [horizon, setHorizon] = useState<FundingHorizonDays>(7);
  const referenceTime = now ?? fundingReferenceTime(connections);
  const forecast = useMemo(() => buildFundingForecast(connections, referenceTime, horizon), [connections, referenceTime, horizon]);
  const shortageAccounts = forecast.accounts.filter(account => account.status === "shortfall");
  const hasOverdue = (account: FundingAccountForecast) => account.charges.some(charge => charge.chargeAt < forecast.from);
  const needsSettlementCheck = shortageAccounts.some(hasOverdue);
  const deficitLabel = (account: FundingAccountForecast) => hasOverdue(account) ? "待核实差额" : account.warnings.length ? "至少需补足" : "需补足";
  const stale = Boolean(refreshing || refreshError);
  const hasCharges = forecast.accounts.some(account => account.charges.length > 0);
  const status = refreshing ? "正在核对账户数据"
    : refreshError ? "暂不能给出最新资金结论"
    : needsSettlementCheck ? "到期扣费还需核实"
    : shortageAccounts.length ? `有 ${shortageAccounts.length} 个账户需要补足余额`
    : forecast.coverageIncomplete ? "还有信息需要补齐"
    : hasCharges ? "已知续费可由各自余额覆盖" : "本窗口内暂无已知续费";

  if (!forecast.accounts.length && !refreshing && !refreshError) return (
    <section className="funding-empty" aria-label="资金安排尚未连接">
      <Link2 size={28} aria-hidden="true" />
      <h2>先连接你的支付账户</h2>
      <p>经你和支付平台双方授权后，用账户余额和自动续费签约核对近期资金。没有授权的数据，不会参与测算。</p>
      <Button onClick={onConnect}>管理数据连接</Button>
    </section>
  );

  return (
    <div className="funding-plan">
      <div className="funding-toolbar">
        <div className="funding-horizon" role="radiogroup" aria-label="选择资金测算窗口">
          {([7, 14, 30] as const).map(days => <label key={days}>
            <input className="sr-only" type="radio" name="funding-horizon" checked={horizon === days} onChange={() => setHorizon(days)} />
            <span>未来 {days} 天</span>
          </label>)}
        </div>
        <button className="funding-refresh" onClick={onRefresh} disabled={refreshing} aria-label="重新核对资金">
          <RefreshCw size={17} className={refreshing ? "spin" : ""} aria-hidden="true" /><span>重新核对</span>
        </button>
      </div>
      {refreshError && <p className="funding-error" role="alert"><CircleAlert size={18} aria-hidden="true" />{refreshError} 下方为上次数据，请重新核对。</p>}
      <section className={`funding-verdict ${!stale && shortageAccounts.length ? "needs-funding" : ""}`} role="status" aria-live="polite">
        {stale || forecast.coverageIncomplete || shortageAccounts.length ? <CircleAlert size={22} aria-hidden="true" /> : <CircleCheck size={22} aria-hidden="true" />}
        <div><h2>{status}</h2><p>{stale ? "数据更新完成前，不据此安排资金。"
          : shortageAccounts.length ? `${shortageAccounts.map(account => hasOverdue(account)
            ? `${account.providerName}若到期款项仍需支付，测算差额为 ${formatCny(account.shortfall || 0)}`
            : `${account.providerName}${deficitLabel(account)} ${formatCny(account.shortfall || 0)}`).join("；")}。${needsSettlementCheck ? "先确认是否已支付，避免重复付款。" : "请先核实扣款渠道和账户余额。"}`
          : forecast.coverageIncomplete ? "缺少余额、签约权限或完整扣费信息时，不能判断是否足够。"
          : "这是已知续费的测算，不代表全部生活支出都已覆盖。"}</p></div>
      </section>
      <div className="funding-overview">
        <div><span>已授权可见余额</span><strong>{forecast.accounts.some(account => account.balance !== null) ? formatCny(forecast.knownBalanceTotal) : "暂未提供"}</strong></div>
        <div><span>窗口内已知续费</span><strong>{formatCny(forecast.upcomingTotal)}</strong></div>
      </div>
      <p className="funding-scope">{date(forecast.from)}—{date(forecast.to)} · 各平台余额分别测算，不互相抵扣。</p>
      <div className="funding-accounts">
        {forecast.accounts.map(account => (
          <section className="funding-account" key={account.provider} aria-label={`${account.providerName}资金测算`}>
            <div className="funding-account-heading">
              <h2><Wallet size={20} aria-hidden="true" />{account.providerName}</h2>
              <span className={!stale && account.status === "shortfall" ? "funding-shortfall" : ""}>
                {stale ? "待核对" : account.status === "unknown" ? "信息不完整" : account.status === "shortfall" ? `${deficitLabel(account)} ${formatCny(account.shortfall || 0)}` : "已知续费可覆盖"}
              </span>
            </div>
            <dl className="funding-account-numbers">
              <div><dt>平台余额</dt><dd>{account.balance === null ? "未授权或未提供" : formatCny(account.balance)}</dd></div>
              <div><dt>预计续费</dt><dd>{formatCny(account.upcomingTotal)}</dd></div>
              <div><dt>扣费后测算余额</dt><dd>{account.balance === null ? "暂不能计算" : account.warnings.length ? "暂不能完整计算" : signedMoney(account.balance - account.upcomingTotal)}</dd></div>
            </dl>
            {!stale && account.firstShortfallAt !== null && <p className="funding-deficit-copy">
              {hasOverdue(account)
                ? "测算暂按到期款项仍需支付计算；先确认是否已支付，避免重复付款。"
                : `按当前余额，${date(account.firstShortfallAt)}起可能不足。可先补足该平台余额，或核对不再需要的订阅。`}知银不会替你调拨资金。
            </p>}
            {account.warnings.length > 0 && <ul className="funding-warnings">{account.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            {account.charges.length > 0 ? <details className="funding-charges">
              <summary>查看 {account.charges.length} 笔预计扣费</summary>
              <table><caption className="sr-only">{account.providerName}按日期排列的续费与余额</caption>
                <thead><tr><th scope="col">日期／服务</th><th scope="col">预计扣费</th><th scope="col">扣费后</th></tr></thead>
                <tbody>{account.charges.map(charge => <tr key={charge.id}>
                  <th scope="row"><span>{date(charge.chargeAt)}{charge.chargeAt < forecast.from ? " · 已到期" : ""}</span><strong>{charge.title}</strong></th>
                  <td>{formatCny(charge.amount)}</td><td>{charge.projectedBalance === null ? "未知" : signedMoney(charge.projectedBalance)}</td>
                </tr>)}</tbody>
              </table>
            </details> : <p className="funding-no-charges">{account.status === "unknown" ? "暂无可纳入本窗口的完整扣费记录。" : "这个窗口内，没有已知的下一笔续费。"}</p>}
          </section>
        ))}
      </div>
      <div className="funding-actions">
        <Button onClick={onOpenSubscriptions}>核对订阅与续费<ArrowRight size={16} aria-hidden="true" /></Button>
        <Button variant="secondary" onClick={onConnect}>管理数据连接</Button>
      </div>
      <p className="funding-footnote">按已授权平台余额测算，实际扣款渠道请核实。每项签约仅计下一笔已知扣费，不包含日常消费、未来收入、疑似订阅或未授权账户。这里的安排不会冻结或移动资金。</p>
    </div>
  );
}
