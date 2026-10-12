import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff,PhoneOff,Volume2,X,LoaderCircle} from 'lucide-react';
import {createVoiceConnection} from '../lib/voice-connection';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
import './steward-voice.css';
// Operate: extend the quiet teal homepage. One mic opens a compact, in-place
// call strip; the conversation and financial review controls remain visible.
export function StewardVoice({stewardName,stewardImage,onRequest,disabled=false,onActiveChange}:{stewardName:string;stewardImage:string;onRequest:VoiceBusiness;disabled?:boolean;onActiveChange?:(active:boolean)=>void}){
 const [open,setOpen]=useState(false),[state,setState]=useState(initialVoiceState);
 const connection=useRef<ReturnType<typeof createVoiceConnection>>(),request=useRef(onRequest);request.current=onRequest;
 const active=state.phase!=='idle'&&state.phase!=='error';
 useEffect(()=>{const current=createVoiceConnection({stewardName,business:(...args)=>request.current(...args),onState:setState});connection.current=current;
  const stop=()=>current.stop('已退出收音，原有事项保留在首页。');
  const hidden=()=>{if(document.visibilityState==='hidden')stop();};
  const background=(event:MessageEvent)=>{if(event.source===window.parent&&event.origin===window.location.origin&&event.data?.type==='zhiyin-voice-stop')stop();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('message',background);window.addEventListener('zhiyin-memory-context-reset',stop);
  return()=>{current.stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('message',background);window.removeEventListener('zhiyin-memory-context-reset',stop);};
 },[stewardName]);
 useEffect(()=>{onActiveChange?.(active);return()=>onActiveChange?.(false);},[active,onActiveChange]);
 const status=state.phase==='connecting'?'正在连接…':state.phase==='working'?`${stewardName}正在处理，暂时暂停收音`:state.muted?'麦克风已静音':state.phase==='speaking'?`${stewardName}正在回应`:'正在聆听';
 function close(){connection.current?.stop();setOpen(false);}
 return <div className={`steward-voice${open?' is-open':''}`}>
  <button type="button" className="voice-entry" aria-label={`和${stewardName}语音对话`} aria-expanded={open} disabled={disabled&&!open} onClick={()=>open?close():setOpen(true)}><Mic size={20} aria-hidden="true"/></button>
  {open&&<section className="voice-strip" role="region" aria-label="语音对话">
   <header><img src={stewardImage} alt=""/><div><strong>和{stewardName}说说</strong><span role="status">{active?status:'直接说，随时可以打断'}</span></div><button type="button" aria-label="收起语音面板" onClick={close}><X size={18}/></button></header>
   {!active&&<p className="voice-consent">开启后，麦克风音频会发送至阿里云百炼处理。退出或离开知银即停止收音，不保存原始录音。</p>}
   {state.heard&&<p className="voice-caption"><span>你说</span>{state.heard}</p>}
   {state.answer&&active&&<p className="voice-caption"><span>{stewardName}</span>{state.answer}</p>}
   {state.error&&<p className="voice-error" role="alert">{state.error}</p>}
   {state.notice&&<p className="voice-notice" role="status">{state.notice}</p>}
   <div className="voice-controls">
    {active?<><button type="button" aria-label={state.muted?'恢复麦克风':'静音麦克风'} onClick={()=>connection.current?.setMuted(!state.muted)}>{state.muted?<MicOff size={18}/>:<Mic size={18}/>}<span>{state.muted?'恢复收音':'静音'}</span></button><button type="button" className="voice-end" onClick={()=>connection.current?.stop('语音已结束，可以继续打字。')}><PhoneOff size={18}/>结束对话</button></>:<button type="button" className="voice-start" disabled={disabled} onClick={()=>void connection.current?.start()}><Mic size={18}/>开始语音对话</button>}
    {state.notice.includes('声音')&&<button type="button" onClick={()=>void connection.current?.play()}><Volume2 size={18}/>播放声音</button>}
    {state.phase==='connecting'&&<LoaderCircle className="spin" size={16} aria-hidden="true"/>}
   </div>
   <small>方案与依据留在首页，资金操作仍由你核对确认。</small>
  </section>}
 </div>;
}
