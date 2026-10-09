import React, { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { resetSteward, type StewardResetResult } from './steward-reset';
import { consoleStrings } from './res/strings';

export function StewardResetPanel({ disabled = false, onBusyChange }: { disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'running' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<StewardResetResult>();
  const [error, setError] = useState('');
  const running = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const s = consoleStrings.steward;
  async function confirm() {
    if (running.current || disabled) return;
    running.current = true; onBusyChange?.(true); setPhase('running'); setError('');
    try { setResult(await resetSteward()); setPhase('success'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : s.failed); setPhase('error'); }
    finally { running.current = false; onBusyChange?.(false); }
  }
  function requestReset() {
    setPhase('confirming'); setError('');
    window.requestAnimationFrame(() => confirmation.current?.focus());
  }
  return <section className="sandbox-console-section sandbox-steward-reset" aria-label={s.title}>
    <div className="sandbox-console-operation">
      <div className="sandbox-console-operation-main"><div className="sandbox-console-operation-copy"><strong>{s.title}</strong><p>{s.description}</p></div></div>
      {phase !== 'confirming' && phase !== 'running' && <button className="sandbox-console-action" type="button" disabled={disabled} onClick={requestReset}><RotateCcw size={17} aria-hidden="true" />{s.reset}</button>}
      {(phase === 'confirming' || phase === 'running') && <div className="sandbox-console-confirmation" ref={confirmation} tabIndex={-1} role="alertdialog" aria-labelledby="steward-reset-title" aria-describedby="steward-reset-description">
        <div><h3 id="steward-reset-title">{s.confirmTitle}</h3><p id="steward-reset-description">{s.clear}</p><p>{s.keep}</p><p>{s.backup}</p></div>
        <div className="sandbox-console-confirmation-actions">
          <button type="button" disabled={phase === 'running'} onClick={() => setPhase(result ? 'success' : 'idle')}>{consoleStrings.cancel}</button>
          <button type="button" className="is-danger" disabled={disabled || phase === 'running'} onClick={() => void confirm()}>{phase === 'running' ? s.running : s.confirm}</button>
        </div>
      </div>}
      {phase === 'success' && result && <div className="sandbox-console-result" role="status"><div><strong>{s.success}</strong><p>{s.next}</p></div></div>}
      {phase === 'error' && <div className="sandbox-console-error" role="alert"><strong>{s.failed}</strong><p>{error}</p><p>{s.retry}</p></div>}
    </div>
  </section>;
}
