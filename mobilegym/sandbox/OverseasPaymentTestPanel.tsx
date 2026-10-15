import React, { useEffect, useRef, useState } from 'react';
import { bankRequest, validBankSnapshot, type BankPaymentReceipt, type BankSnapshot } from '../../src/lib/bank-transfer';
import { consoleStrings } from './res/strings';

const s = consoleStrings.overseas;
const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);

function refreshZhiyinFrames() {
  // Reuse the phone bridge's origin/source validation. Never reload an active conversation.
  document.querySelectorAll<HTMLIFrameElement>('iframe.zhiyin-phone-frame').forEach(frame => {
    try {
      if (new URL(frame.src, window.location.href).origin !== window.location.origin) return;
      frame.contentWindow?.postMessage({ channel: 'zhiyin-phone', version: 1, type: 'bank-updated' }, window.location.origin);
    } catch { /* The app will read the current bank state when next opened. */ }
  });
}

export function OverseasPaymentTestPanel({ active, disabled = false, onBusyChange }: {
  active: boolean; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [bank, setBank] = useState<BankSnapshot>();
  const [pendingId, setPendingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<BankPaymentReceipt>();
  const running = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);

  async function loadBank() {
    const value = await bankRequest<unknown>();
    if (!validBankSnapshot(value)) throw new Error(s.invalidBank);
    return value;
  }
  useEffect(() => {
    const current = ++generation.current;
    if (!active) return;
    setLoading(true);
    void loadBank().then(value => {
      if (generation.current === current) { setBank(value); setError(''); }
    }).catch(cause => {
      if (generation.current === current) { setBank(undefined); setError(cause instanceof Error ? cause.message : s.loadFailed); }
    }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [active]);
  useEffect(() => { if (pendingId && active) confirmation.current?.focus(); }, [pendingId, active]);

  function request() {
    if (disabled || busy || !bank || !active) return;
    setError(''); setReceipt(undefined); setUncertain(false);
    setPendingId(`overseas:${crypto.randomUUID()}`);
  }
  function cancel() {
    if (busy || uncertain) return;
    setPendingId(undefined); setError('');
    window.requestAnimationFrame(() => trigger.current?.focus());
  }
  async function pay() {
    if (!pendingId || running.current || disabled || !active) return;
    running.current = true; setBusy(true); setError(''); setUncertain(true); onBusyChange?.(true);
    try {
      const result = await bankRequest<BankPaymentReceipt>({ type: 'payment', authorized: true, payment: {
        id: pendingId, channel: 'overseas', amount: 100, merchant: s.merchant,
      } });
      if (!result || result.id !== pendingId || result.channel !== 'overseas' || result.amount !== 100 || result.merchant !== s.merchant ||
        !Number.isSafeInteger(result.balanceAfter) || result.balanceAfter < 0 || !Number.isFinite(result.completedAt)) throw new Error(s.invalidReceipt);
      setReceipt(result); setPendingId(undefined); setUncertain(false);
      refreshZhiyinFrames();
      // A confirmed payment remains successful even if the following read fails.
      try { setBank(await loadBank()); }
      catch { setBank(undefined); setError(s.refreshFailed); }
      window.requestAnimationFrame(() => trigger.current?.focus());
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'BankRejection') setUncertain(false);
      setError(cause instanceof Error ? cause.message : s.failed);
    } finally { running.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return <section className="sandbox-console-section sandbox-overseas-test" aria-label={s.title}>
    <div className="sandbox-console-operation">
      <div className="sandbox-console-operation-copy"><strong>{s.title}</strong><p>{s.description}</p>
        {loading && <p>{s.loading}</p>}
        {bank && <p>{s.account(bank.controls.overseas, bank.frozen, money(bank.balance))}</p>}
      </div>
      {!pendingId && <button type="button" ref={trigger} className="sandbox-console-action" disabled={!active || !bank || loading || disabled || busy} onClick={request}>{s.test}</button>}
      {pendingId && <div className="sandbox-console-confirmation" role="alertdialog" aria-labelledby="overseas-test-title" aria-describedby="overseas-test-description" tabIndex={-1} ref={confirmation}>
        <div><h3 id="overseas-test-title">{s.confirmTitle}</h3><p id="overseas-test-description">{s.confirmDescription}</p><p>{s.merchant} · ¥1.00 · {s.control(bank?.controls.overseas === true)}</p>
          {uncertain && <p>{s.uncertain}</p>}
        </div>
        <div className="sandbox-console-confirmation-actions">
          <button type="button" disabled={busy || uncertain} onClick={cancel}>{consoleStrings.cancel}</button>
          <button type="button" disabled={!active || disabled || busy} onClick={() => void pay()}>{busy ? s.running : uncertain ? s.check : s.confirm}</button>
        </div>
      </div>}
      {receipt && <div className="sandbox-console-result" role="status"><div><strong>{s.success}</strong><p>{s.receipt(receipt.id, money(receipt.balanceAfter))}</p></div></div>}
      {error && <div className="sandbox-console-error" role="alert"><p>{error}</p></div>}
    </div>
  </section>;
}
