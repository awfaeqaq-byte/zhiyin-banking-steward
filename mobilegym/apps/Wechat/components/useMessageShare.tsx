import {useEffect,useRef,useState,type HTMLAttributes} from 'react';
import {BackDispatcher} from '@/os/BackDispatcher';
import * as TimeService from '@/os/TimeService';
import {useWechatStrings} from '../hooks/useWechatStrings';
import {useWechatGestures} from '../hooks/useWechatGestures';
import {buildWechatShare,sharePrompt,type WechatShare,type SharedWechatMessage} from '../../../../src/lib/wechat-message-share';
import './message-share.css';

/** Only text bodies opt into selection; media and payment gestures stay intact. */
export function useMessageShare(chat:WechatShare['chat'],messages:SharedWechatMessage[]){
 const t=useWechatStrings(),{bindLongPress,bindTap}=useWechatGestures();
 const [selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<WechatShare>(),[note,setNote]=useState(''),[error,setError]=useState('');
 const dialog=useRef<HTMLDivElement>(null),lock=useRef(false);
 const close=()=>{setPreview(undefined);setSelected([]);setNote('');setError('');};
 useEffect(()=>{close();},[chat.id]);
 useEffect(()=>{
  if(!selected.length&&!preview)return;
  return BackDispatcher.register('wechat.messageShare.dismiss',()=>{close();return true;},90);
 },[selected.length,preview]);
 useEffect(()=>{if(preview)dialog.current?.querySelector('textarea')?.focus();},[preview]);
 function toggle(id:string){
  setError('');
  if(selected.includes(id))setSelected(selected.filter(x=>x!==id));
  else if(selected.length>=5)setError(t.zhiyin_share_limits);
  else setSelected([...selected,id]);
 }
 function review(){try{const value=buildWechatShare(chat,messages,selected,'',crypto.randomUUID());sharePrompt(value);setPreview(value);setNote('');setError('');}catch{setError(t.zhiyin_share_limits);}}
 function submit(){
  if(!preview||lock.current)return;
  lock.current=true;
  try{
   const value=buildWechatShare(chat,messages,preview.messages.map(m=>m.id),note,preview.id);sharePrompt(value);
   if(!window.__OS__?.startActivity('zhiyin',{action:'ACTION_SEND',type:'text/plain',data:{wechatShare:value}},{newTask:true}))throw new Error(t.zhiyin_share_open_error);
   close();
  }catch{setError(t.zhiyin_share_open_error);}finally{lock.current=false;}
 }
 function bindMessage(id:string):HTMLAttributes<HTMLDivElement>{
  const message=messages.find(m=>m.id===id);if(!message)return {};
  return {
   ...bindLongPress<HTMLDivElement>({kind:'action',id:'wechat.messageShare.select'},{params:{messageId:id},onTrigger:()=>{setSelected([id]);setError('');}}),
   role:'button',tabIndex:0,'aria-label':`${t.zhiyin_share_select}: ${message.text}`,'aria-pressed':selected.includes(id),
   'data-share-selected':selected.includes(id)?'true':undefined,
   onClick:()=>{if(selected.length)toggle(id);},
   onContextMenu:e=>{e.preventDefault();setSelected([id]);setError('');},
   onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(id);}},
  } as HTMLAttributes<HTMLDivElement>;
 }
 const overlay=<>
  {selected.length>0&&!preview&&<section className="wx-message-share-bar" aria-label={t.zhiyin_share_selection}>
   <span>{t.zhiyin_share_selected.replace('{count}',String(selected.length))}</span>
   <button {...bindTap({kind:'action',id:'wechat.messageShare.cancel'},{onTrigger:close})}>{t.share_cancel}</button>
   <button className="wx-message-share-primary" {...bindTap({kind:'action',id:'wechat.messageShare.preview'},{onTrigger:review})}>{t.zhiyin_share_title}</button>
   {error&&<p role="alert">{error}</p>}
  </section>}
  {preview&&<div className="wx-message-share-backdrop">
   <div ref={dialog} role="dialog" aria-modal="true" aria-label={t.zhiyin_share_title} className="wx-message-share-dialog" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();setPreview(undefined);}
    if(e.key==='Tab'){
     const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('textarea,button')??[]);
     const first=controls[0],last=controls.at(-1);
     if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
   }}>
    <h2>{t.zhiyin_share_title}</h2><p className="wx-message-share-source">{chat.name}</p>
    <ol>{preview.messages.map(m=><li key={m.id}><span>{m.sender} · {TimeService.fromTimestamp(m.sentAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</span><p>{m.text}</p></li>)}</ol>
    <label>{t.zhiyin_share_note}<textarea maxLength={200} value={note} placeholder={t.zhiyin_share_note_hint} onChange={e=>setNote(e.target.value)}/></label>
    <p className="wx-message-share-hint">{t.zhiyin_share_disclosure}</p>
    {error&&<p role="alert">{error}</p>}
    <div className="wx-message-share-actions"><button {...bindTap({kind:'action',id:'wechat.messageShare.back'},{onTrigger:()=>setPreview(undefined)})}>{t.zhiyin_share_back}</button><button className="wx-message-share-primary" {...bindTap({kind:'action',id:'wechat.messageShare.send'},{onTrigger:submit})}>{t.zhiyin_share_open}</button></div>
   </div>
  </div>}
 </>;
 return {bindMessage,overlay};
}
