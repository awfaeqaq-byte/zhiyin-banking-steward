import React, {useEffect,useRef,useState} from 'react';
import {getLocalBillReplayStatus,loadLocalWechatBillFixture,restoreLocalWechatLedger,type LocalBillReplayStatus} from '../apps/Wechat/pay-ledger/localFixtureBootstrap';
import {consoleStrings} from './res/strings';

export function LocalBillReplayPanel({active,disabled=false,onBusyChange}:{active:boolean;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [status,setStatus]=useState<LocalBillReplayStatus>();
  const [action,setAction]=useState<'load'|'restore'>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
  const running=useRef(false),confirmation=useRef<HTMLDivElement>(null);
  const s=consoleStrings.replay;
  useEffect(()=>{
    if(!active)return;
    let cancelled=false;
    void getLocalBillReplayStatus().then(value=>{if(!cancelled){setStatus(value);setError('');}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:s.failed);});
    return()=>{cancelled=true;};
  },[active,s.failed]);
  function request(next:'load'|'restore') {
    setAction(next);setError('');setResult('');
    window.requestAnimationFrame(()=>confirmation.current?.focus());
  }
  async function confirm() {
    if(running.current||disabled||!action)return;
    running.current=true;setBusy(true);onBusyChange?.(true);
    try {
      if(action==='load') {
        const report=await loadLocalWechatBillFixture({confirmed:true});
        if(!report)throw new Error(s.failed);
        setResult(s.loaded(report.importedRows,report.quarantinedRows));
      } else {
        if(!await restoreLocalWechatLedger({confirmed:true}))throw new Error(s.noBackup);
        setResult(s.restored);
      }
      setAction(undefined);
      try{setStatus(await getLocalBillReplayStatus());}catch{setError(s.statusFailed);}
    } catch(cause){setError(cause instanceof Error?cause.message:s.failed);}
    finally{running.current=false;setBusy(false);onBusyChange?.(false);}
  }
  return <section className="sandbox-console-section" aria-label={s.title}>
    <div className="sandbox-console-operation">
      <div className="sandbox-console-operation-copy"><strong>{s.title}</strong><p>{s.description}</p><p>{status ? status.enabled?s.enabled:status.configured?s.ready:s.missing : s.loading}</p></div>
      {!action && <div className="sandbox-console-confirmation-actions">
        <button type="button" className="sandbox-console-action" disabled={disabled||busy||!status?.configured} onClick={()=>request('load')}>{s.load}</button>
        <button type="button" className="sandbox-console-action" disabled={disabled||busy||!status?.hasBackup} onClick={()=>request('restore')}>{s.restore}</button>
      </div>}
      {action && <div className="sandbox-console-confirmation" role="alertdialog" aria-labelledby="replay-confirm-title" aria-describedby="replay-confirm-description" tabIndex={-1} ref={confirmation}>
        <div><h3 id="replay-confirm-title">{action==='load'?s.loadConfirm:s.restoreConfirm}</h3><p id="replay-confirm-description">{action==='load'?s.loadHelp:s.restoreHelp}</p><p>{s.access}</p></div>
        <div className="sandbox-console-confirmation-actions">
          <button type="button" disabled={busy} onClick={()=>setAction(undefined)}>{consoleStrings.cancel}</button>
          <button type="button" disabled={disabled||busy} onClick={()=>void confirm()}>{busy?s.running:action==='load'?s.confirmLoad:s.confirmRestore}</button>
        </div>
      </div>}
      {result && <div className="sandbox-console-result" role="status"><div><p>{result}</p></div></div>}
      {error && <div className="sandbox-console-error" role="alert"><p>{error}</p></div>}
    </div>
  </section>;
}
