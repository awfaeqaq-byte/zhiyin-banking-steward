import React, { useEffect, useRef, useState } from 'react';
import { Clock3, Undo2 } from 'lucide-react';
import * as TimeService from '../os/TimeService';
import { useWechatStore } from '../apps/Wechat/state';
import { useAlipayStore } from '../apps/Alipay/state';
import { financeTestController, readFinanceTestSnapshot } from './finance-runtime';
import { parseTestMoney, type FinanceTestCommand, type TestScenario } from './finance-testing';
import { consoleStrings as s } from './res/strings';

const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const date = (at: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
type Pending = { title: string; description: string; command?: FinanceTestCommand };
type Log = { title: string; detail: string; at: number };

export function FinanceTestPanel({ active, disabled = false }: { active: boolean; disabled?: boolean }) {
  const wallet = useWechatStore(state => state.wallet);
  const wxSubscriptions = useWechatStore(state => state.subscriptions);
  const aliBalance = useAlipayStore(state => state.balance);
  const aliSubscriptions = useAlipayStore(state => state.subscriptions);
  // Subscribe to bills as well so an undo conflict is reflected without waiting for a clock tick.
  useWechatStore(state => state.payLedger);
  useAlipayStore(state => state.transferRecords);
  const [now, setNow] = useState(TimeService.now);
  const [wechat, setWechat] = useState(String(wallet.balanceCents / 100));
  const [alipay, setAlipay] = useState(String(aliBalance.total));
  const [scenario, setScenario] = useState<TestScenario>('renewal');
  const [days, setDays] = useState('1');
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const executing = useRef(false);
  const [revision, setRevision] = useState(0);
  const chosen = s.scenario[scenario];
  const canUndo = financeTestController.canUndo();

  function fillCurrent() {
    const snapshot = readFinanceTestSnapshot();
    setWechat(String(snapshot.wechat.wallet.balanceCents / 100));
    setAlipay(String(snapshot.alipay.balance.total));
  }
  useEffect(() => {
    if (!active) { setPending(undefined); return; }
    fillCurrent();
    setNow(TimeService.now());
    const timer = window.setInterval(() => setNow(TimeService.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (pending) { confirmationRef.current?.focus(); return; }
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (!active) return;
    // Wait until React has re-enabled the fieldset before restoring keyboard focus.
    const origin = originRef.current;
    const target = origin?.isConnected && !origin.matches(':disabled')
      ? origin : panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
    target?.focus();
  }, [pending, active]);

  function request(next: Pending) {
    originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(''); setPending(next);
  }
  function dismiss() { restoreFocus.current = true; setPending(undefined); }
  function confirm() {
    if (!pending || executing.current || disabled) return;
    executing.current = true;
    try {
      const result = pending.command ? financeTestController.execute(pending.command) : (financeTestController.undo(), undefined);
      const detail = result && !result.reversible
        ? `成功扣费 ${result.charged} 笔 · ${money(result.amountCents)}；余额不足 ${result.failed} 笔。`
        : pending.command ? s.updated : s.undone;
      setLogs(current => [{ title: pending.title, detail, at: TimeService.now() }, ...current].slice(0, 10));
      fillCurrent(); setNow(TimeService.now()); setRevision(revision + 1); dismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : s.missing);
      dismiss();
    } finally { executing.current = false; }
  }
  function requestBalance(event: React.FormEvent) {
    event.preventDefault();
    try {
      const wx = parseTestMoney(wechat), ali = parseTestMoney(alipay);
      request({ title: s.applyBalance, description: `${s.wechat}：${money(wallet.balanceCents)} → ${money(wx)}；${s.alipay}：${money(Math.round(aliBalance.total * 100))} → ${money(ali)}。${s.balanceHelp}`, command: { type: 'balance', wechat, alipay } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : s.missing); }
  }

  return <div ref={panelRef} className="sandbox-finance" data-revision={revision}>
    <section className="sandbox-console-section" aria-labelledby="sandbox-finance-current">
      <h2 id="sandbox-finance-current">{s.current}</h2>
      <div className="sandbox-finance-balances">
        <div><span>{s.wechat}</span><strong>{money(wallet.balanceCents)}</strong><small>{wxSubscriptions.filter(item => item.autoRenew).length} {s.contracts}</small></div>
        <div><span>{s.alipay}</span><strong>{money(Math.round(aliBalance.total * 100))}</strong><small>{aliSubscriptions.filter(item => item.autoRenew).length} {s.contracts}</small></div>
      </div>
      <p className="sandbox-finance-hint">{s.access}</p>
      {error && <p className="sandbox-finance-error" role="alert">{s.error}：{error}</p>}
      {pending && <div ref={confirmationRef} tabIndex={-1} className="sandbox-finance-confirm" role="group" aria-labelledby="sandbox-finance-confirm-title">
        <h3 id="sandbox-finance-confirm-title">{s.preview} · {pending.title}</h3>
        <p>{pending.description}</p>
        <div className="sandbox-finance-actions"><button type="button" onClick={dismiss}>{s.cancel}</button><button type="button" className="is-primary" disabled={disabled} onClick={confirm}>{s.confirm}</button></div>
      </div>}
      {logs[0] && <div className="sandbox-finance-feedback" role="status"><strong>{logs[0].title}</strong><p>{logs[0].detail}</p></div>}
    </section>

    <fieldset className="sandbox-finance-controls" disabled={disabled || Boolean(pending)}>
      <section className="sandbox-console-section" aria-labelledby="sandbox-finance-scenarios">
        <h2 id="sandbox-finance-scenarios">{s.scenarios}</h2>
        <label className="sandbox-finance-field">{s.scenarioLabel}<select value={scenario} onChange={event => setScenario(event.target.value as TestScenario)}>
          {(Object.keys(s.scenario) as TestScenario[]).map(key => <option key={key} value={key}>{s.scenario[key].title}</option>)}
        </select></label>
        <p className="sandbox-finance-description">{chosen.description}</p>
        <button type="button" className="sandbox-finance-primary" onClick={() => request({ title: chosen.title, description: `${chosen.description} ${s.settingsHelp}`, command: { type: 'scenario', scenario } })}>{s.prepare}</button>
        <div className="sandbox-finance-guide"><h3>{s.expectation}</h3><p>“{chosen.prompt}”</p><p>{chosen.expected}</p></div>
      </section>

      <section className="sandbox-console-section">
        <details><summary>{s.balance}</summary>
          <form onSubmit={requestBalance}>
            <div className="sandbox-finance-inputs">
              <label className="sandbox-finance-field">{s.wechat}（{s.currency}）<input inputMode="decimal" value={wechat} onChange={event => setWechat(event.target.value)} maxLength={12} /></label>
              <label className="sandbox-finance-field">{s.alipay}（{s.currency}）<input inputMode="decimal" value={alipay} onChange={event => setAlipay(event.target.value)} maxLength={12} /></label>
            </div>
            <p className="sandbox-finance-hint">{s.balanceHelp}</p>
            <div className="sandbox-finance-actions"><button type="button" onClick={fillCurrent}>{s.useCurrent}</button><button type="submit">{s.applyBalance}</button></div>
          </form>
        </details>
      </section>

      <section className="sandbox-console-section" aria-labelledby="sandbox-finance-time">
        <h2 id="sandbox-finance-time">{s.time}</h2>
        <p className="sandbox-finance-clock"><Clock3 size={16} aria-hidden="true" /><time>{date(now)}</time><span>{TimeService.getTimeConfig().mode === 'simulated' && TimeService.getTimeConfig().flowing === false ? s.frozen : s.flowing}</span></p>
        <div className="sandbox-finance-time-actions">
          <label className="sandbox-finance-field">{s.days}<select value={days} onChange={event => setDays(event.target.value)}><option value="1">1 天</option><option value="3">3 天</option><option value="7">7 天</option><option value="30">30 天</option></select></label>
          <button type="button" onClick={() => request({ title: `${s.advance} ${days} 天`, description: `${date(now)} → ${date(now + Number(days) * 86400000)}。${s.advanceHelp}`, command: { type: 'advance', days: Number(days) } })}>{s.advance}</button>
        </div>
        <button type="button" className="sandbox-finance-wide" onClick={() => request({ title: s.settle, description: s.settleHelp, command: { type: 'settle' } })}>{s.settle}</button>
        <p className="sandbox-finance-hint">{s.timeHelp}</p>
      </section>

      <section className="sandbox-console-section">
        <button type="button" className="sandbox-finance-wide" disabled={!canUndo} onClick={() => request({ title: s.undo, description: s.undoConfirm })}><Undo2 size={16} aria-hidden="true" />{s.undo}</button>
        <p className="sandbox-finance-hint">{s.undoHelp}</p>
      </section>
    </fieldset>
    <section className="sandbox-console-section">
      <details><summary>{s.history}{logs.length > 0 ? ` · ${logs.length}` : ''}</summary>
        <p className="sandbox-finance-hint">{s.historyHint}</p>
        {logs.length ? <ol className="sandbox-finance-log">{logs.map((log, i) => <li key={`${log.at}-${i}`}><strong>{log.title}</strong><time>{date(log.at)}</time><p>{log.detail}</p></li>)}</ol> : <p className="sandbox-finance-hint">{s.historyEmpty}</p>}
      </details>
    </section>
  </div>;
}
