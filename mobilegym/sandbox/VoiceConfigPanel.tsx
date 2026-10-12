import React,{useEffect,useState} from 'react';
import {consoleStrings} from './res/strings';
type Config={configured:boolean;region:'beijing'|'singapore';workspaceId:string;model:string;ningningVoice:string;ahengVoice:string};
const endpoint='/api/sandbox/voice-config';
export function VoiceConfigPanel({active}:{active:boolean}){
 const s=consoleStrings.voice;
 const [config,setConfig]=useState<Config>(),[draft,setDraft]=useState<Config>(),[key,setKey]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function apply(value:Config){setConfig(value);setDraft(value);setKey('');}
 useEffect(()=>{
  if(!active){setKey('');return;}const abort=new AbortController();setLoading(true);setError('');setNotice('');setConfig(undefined);setDraft(undefined);
  void fetch(endpoint,{signal:abort.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok||data.error)throw new Error(data.error||s.loadError);if(typeof data.configured!=='boolean')throw new Error(s.loadError);if(!abort.signal.aborted)apply(data);}).catch(cause=>{if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:s.loadError);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[active,s.loadError]);
 async function save(event:React.FormEvent){event.preventDefault();if(!draft||saving)return;setSaving(true);setError('');setNotice('');
  try{const {configured:_ready,...settings}=draft;void _ready;const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-Config':'1'},body:JSON.stringify({...settings,apiKey:key})});const data=await r.json();if(!r.ok)throw new Error(data.error||s.saveError);apply(data);setNotice(s.saved);}catch(cause){setError(cause instanceof Error?cause.message:s.saveError);}finally{setSaving(false);setKey('');}
 }
 const change=(field:keyof Config,value:string)=>setDraft(d=>d?{...d,[field]:value}:d);
 return <section className="sandbox-model sandbox-console-section" aria-label={s.title}>
  <p className="sandbox-finance-hint">{s.description}</p>
  {loading&&<p role="status">{s.loading}</p>}
  {config&&<p className="sandbox-model-current">{config.configured?s.ready:s.missing}<br/>{s.model}: <strong>{config.model}</strong></p>}
  <form onSubmit={save} autoComplete="off"><fieldset disabled={loading||saving||!draft}>
   <label>{s.region}<select value={draft?.region||'beijing'} onChange={e=>change('region',e.target.value)}><option value="beijing">{s.beijing}</option><option value="singapore">{s.singapore}</option></select></label>
   <label>{s.workspace}<input value={draft?.workspaceId||''} required maxLength={80} spellCheck={false} placeholder="ws-…" onChange={e=>change('workspaceId',e.target.value)}/></label>
   <label>{s.key}<input type="password" value={key} autoComplete="new-password" maxLength={500} spellCheck={false} placeholder={config?.configured?s.keepKey:s.enterKey} onChange={e=>setKey(e.target.value)}/></label>
   <details><summary>{s.voices}</summary><label>{s.ningning}<select value={draft?.ningningVoice||'longanlingxin'} onChange={e=>change('ningningVoice',e.target.value)}><option value="longanlingxin">{s.lingxin}</option><option value="Tina">Tina</option><option value="Katerina">Katerina</option></select></label><label>{s.aheng}<select value={draft?.ahengVoice||'Zane'} onChange={e=>change('ahengVoice',e.target.value)}><option value="Zane">Zane</option><option value="Raymond">Raymond</option><option value="Ryan">Ryan</option></select></label></details>
   <p className="sandbox-finance-hint">{s.keyHelp}</p><button type="submit" className="sandbox-console-action">{saving?s.saving:s.save}</button>
  </fieldset></form>
  {notice&&<p className="sandbox-model-feedback" role="status">{notice}</p>}{error&&<p className="sandbox-model-error" role="alert">{error}</p>}
  <p className="sandbox-finance-hint">{s.phoneHelp}</p>
 </section>;
}
