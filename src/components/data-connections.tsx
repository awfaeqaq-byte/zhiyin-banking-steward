import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unlink,
  WalletCards,
} from "lucide-react";
import {
  aggregateFinancialSources,
  createDemoBankSource,
  formatCny,
  type ConnectedFinancialSource,
  type ExternalFinancialProvider,
  type FinancialScope,
} from "../lib/financial-connections";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import "./data-connections.css";

type Props = {
  initialProvider?:ExternalFinancialProvider;
  onEntryConsumed?:()=>void;
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
  onConnect: (provider: ExternalFinancialProvider, scopes: FinancialScope[]) => Promise<void>;
  onDisconnect: (provider: ExternalFinancialProvider) => Promise<void>;
};

const providers: Array<{
  id: ExternalFinancialProvider;
  name: string;
  description: string;
  color: string;
  monogram: string;
}> = [
  { id: "wechat_pay", name: "微信支付", description: "零钱、支付账单与自动扣费", color: "#07c160", monogram: "微" },
  { id: "alipay", name: "支付宝", description: "余额、交易账单与自动扣费", color: "#1677ff", monogram: "支" },
];

const scopeOptions: Array<{ id: FinancialScope; title: string; description: string }> = [
  { id: "balance", title: "读取账户余额", description: "用于计算当前可支配资金" },
  { id: "transactions", title: "读取交易账单", description: "用于消费归类、跨平台去重和历史周期扣费识别" },
  { id: "autopay", title: "读取自动扣费", description: "用于识别未来确定支出" },
];

export function DataConnections({ connections, onConnect, onDisconnect,initialProvider,onEntryConsumed }: Props) {
  const [active, setActive] = useState<ExternalFinancialProvider | null>(initialProvider??null);
  const [selectedScopes, setSelectedScopes] = useState<FinancialScope[]>(initialProvider?["transactions"]:["balance", "transactions", "autopay"]);
  useEffect(()=>{if(initialProvider)onEntryConsumed?.();},[initialProvider,onEntryConsumed]);
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<ExternalFinancialProvider | null>(null);
  const [error, setError] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  const connected = providers.flatMap(provider => connections[provider.id] ? [connections[provider.id]!] : []);
  const summary = useMemo(
    () => aggregateFinancialSources([createDemoBankSource(), ...connected]),
    [connected],
  );
  const activeProvider = providers.find(provider => provider.id === active);

  const openConnection = (provider: ExternalFinancialProvider) => {
    setActive(provider);
    setSelectedScopes(connections[provider]?.scopes || ["balance", "transactions", "autopay"]);
    setError("");
  };

  const submit = async () => {
    if (!active || !selectedScopes.length) return;
    setSubmitting(true);
    setError("");
    try {
      await onConnect(active, selectedScopes);
      setActive(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async (provider: ExternalFinancialProvider) => {
    setDisconnecting(provider);
    setDisconnectError("");
    try {
      await onDisconnect(provider);
    } catch (cause) {
      setDisconnectError(cause instanceof Error ? cause.message : "断开失败，连接仍然保留。");
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="connections-layout">
      <section className="connection-overview" aria-label="资金数据概览">
        <div className="connection-overview-copy">
          <span className="connection-knot" aria-hidden="true"><Link2 size={21} /></span>
          <div>
            <strong>{connected.length ? `已汇总 ${connected.length + 1} 个资金来源` : "先连接常用支付账户"}</strong>
            <p>{connected.length ? "知银账户与已授权平台统一分析，重复流水只计算一次。" : "连接后，知银才能看见分散在不同平台里的钱。"}</p>
          </div>
        </div>
        {connected.length > 0 && (
          <div className="connection-metrics">
            <div><span>可见余额</span><strong>{formatCny(summary.totalBalance)}</strong></div>
            <div><span>已识别消费</span><strong>{formatCny(summary.spending)}</strong></div>
            <div><span>避免重复计算</span><strong>{summary.duplicateCount} 笔</strong></div>
          </div>
        )}
      </section>

      <div className="connection-section-heading">
        <div><h2>可连接账户</h2><p>每个数据范围都由你单独决定。</p></div>
        <span><ShieldCheck size={16} aria-hidden="true" />只读连接</span>
      </div>

      <div className="connection-source-list">
        {providers.map((provider) => {
          const item = connections[provider.id];
          return (
            <section className="connection-source" key={provider.id}>
              <div className="connection-source-main">
                <span className="provider-mark" style={{ backgroundColor: provider.color }} aria-hidden="true">{provider.monogram}</span>
                <div className="connection-source-copy">
                  <div className="connection-source-title">
                    <h3>{provider.name}</h3>
                    {item && <span className="connection-status"><Check size={14} aria-hidden="true" />已连接</span>}
                  </div>
                  <p>{item ? `${item.accountMasked} · 已授权 ${item.scopes.length} 项` : provider.description}</p>
                  {item?.transactionCoverage && (
                    <p className={`connection-coverage ${item.transactionCoverage.complete ? "is-complete" : "is-incomplete"}`}>
                      账单覆盖 {item.transactionCoverage.returned}/{item.transactionCoverage.total} 笔
                      {item.transactionCoverage.invalid ? ` · ${item.transactionCoverage.invalid} 笔格式无效` : ""}
                      {item.transactionCoverage.complete ? " · 已完整同步" : " · 数据不完整"}
                    </p>
                  )}
                </div>
                {item?.balance !== undefined && (
                  <div className="source-balance">
                    <span>已授权余额</span>
                    <strong>{formatCny(item.balance)}</strong>
                  </div>
                )}
              </div>
              {item ? (
                <div className="connection-source-actions">
                  <button aria-label={`重新授权${provider.name}`} onClick={() => openConnection(provider.id)}>
                    <RefreshCw size={16} aria-hidden="true" />重新授权
                  </button>
                  <button
                    aria-label={`断开${provider.name}`}
                    disabled={disconnecting !== null}
                    onClick={() => void disconnect(provider.id)}
                  >
                    {disconnecting === provider.id ? <RefreshCw className="spin" size={16} aria-hidden="true" /> : <Unlink size={16} aria-hidden="true" />}
                    {disconnecting === provider.id ? "正在断开…" : "断开连接"}
                  </button>
                </div>
              ) : (
                <button className="connect-account-button" aria-label={`连接${provider.name}`} onClick={() => openConnection(provider.id)}>
                  查看授权范围<ChevronRight size={18} aria-hidden="true" />
                </button>
              )}
            </section>
          );
        })}
      </div>

      {disconnectError && <p className="connection-error" role="alert">{disconnectError}</p>}

      {connected.length > 0 && (
        <section className="connection-proof" aria-label="账单处理说明">
          <WalletCards size={22} aria-hidden="true" />
          <div>
            <strong>账单已经统一口径</strong>
            <p>已排除 {summary.excludedCount} 笔退款、收入或账户互转，并识别 {summary.duplicateCount} 笔银行卡渠道重复记录。</p>
          </div>
        </section>
      )}

      <p className="connection-footnote">演示数据仅保存在当前浏览器中。连接只用于读取和分析，不包含付款、转账或修改第三方账户的权限。</p>

      <Dialog
        open={active !== null}
        onOpenChange={(open) => { if (!open && !submitting) setActive(null); }}
        title={`连接${activeProvider?.name || "账户"}`}
        description="先在知银确认用途，再由合作方确认授权。两边同意后才会建立连接。"
        className="connection-consent-sheet"
      >
        <div className="consent-account">
          <span className="provider-mark" style={{ backgroundColor: activeProvider?.color }} aria-hidden="true">{activeProvider?.monogram}</span>
          <div className="consent-account-copy"><strong>{activeProvider?.name}</strong><span>第一步：同意知银使用这些数据</span></div>
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="consent-progress" aria-label="双重授权进度">
          <span className="active" aria-current="step"><i>1</i>知银确认</span>
          <ChevronRight size={15} aria-hidden="true" />
          <span><i>2</i>{activeProvider?.name}确认</span>
        </div>
        <fieldset className="consent-scopes">
          <legend>允许读取<span>已选 {selectedScopes.length} 项</span></legend>
          {scopeOptions.map(option => (
            <label key={option.id}>
              <input
                type="checkbox"
                checked={selectedScopes.includes(option.id)}
                disabled={submitting}
                onChange={(event) => setSelectedScopes(current => event.target.checked
                  ? [...current, option.id]
                  : current.filter(scope => scope !== option.id))}
              />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
              <span className="scope-check" aria-hidden="true"><Check size={14} /></span>
            </label>
          ))}
        </fieldset>
        <div className="consent-actions">
          {error && <p className="connection-error" role="alert">{error}</p>}
          {!selectedScopes.length && <p className="consent-selection-note" role="status">至少选择一项数据范围后再继续。</p>}
          <Button className="full-width" disabled={submitting || !selectedScopes.length} onClick={submit}>
            {submitting ? <><RefreshCw className="spin" size={17} aria-hidden="true" />等待{activeProvider?.name}确认…</> : <>继续到{activeProvider?.name || "合作方"}确认<ChevronRight size={17} aria-hidden="true" /></>}
          </Button>
          <p className="consent-permission-note">合作方确认后，将通过合作接口向知银提供你勾选的只读数据；不包含支付、转账或账户修改权限。</p>
        </div>
      </Dialog>
    </div>
  );
}
