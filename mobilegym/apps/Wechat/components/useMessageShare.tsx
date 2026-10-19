import {useEffect,useRef,useState,type HTMLAttributes} from 'react';
import {useLocation} from 'react-router-dom';
import * as TimeService from '@/os/TimeService';
import {useWechatStrings} from '../hooks/useWechatStrings';
import {useWechatGestures} from '../hooks/useWechatGestures';
import {buildWechatShare,sharePrompt,type WechatShare,type SharedWechatMessage} from '../../../../src/lib/wechat-message-share';
import './message-share.css';

/** Only text bodies opt into selection; media and payment gestures stay intact. */
export function useMessageShare(chat:WechatShare['chat'],messages:SharedWechatMessage[]){
 const t=useWechatStrings(),{bindLongPress,bindTap,bindBack,go,back}=useWechatGestures();
 const location=useLocation(),sharing=new URLSearchParams(location.search).get('share');
 const [selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<WechatShare>(),[note,setNote]=useState(''),[error,setError]=useState('');
 const dialog=useRef<HTMLDivElement>(null),lock=useRef(false);
 const suppressedClick=useRef<string|null>(null),pointer=useRef<{x:number;y:number}|undefined>(undefined);
 const close=()=>{setPreview(undefined);setSelected([]);setNote('');setError('');};
 useEffect(()=>{close();},[chat.id]);
 useEffect(()=>{if(!sharing)close();},[sharing]);
 useEffect(()=>{if(sharing==='preview')dialog.current?.focus();},[sharing]);
 const enter=(id:string,suppress=false)=>{
  if(suppress)suppressedClick.current=id;
  setSelected([id]);setError('');
  if(chat.kind==='group')go('groupAA.messageShare.select',{groupId:chat.id});else go('chat.messageShare.select',{id:chat.id});
 };
 function toggle(id:string){
  setError('');
  if(selected.includes(id))setSelected(selected.filter(x=>x!==id));
  else if(selected.length>=5)setError(t.zhiyin_share_limits);
  else setSelected([...selected,id]);
 }
 function review(){try{const value=buildWechatShare(chat,messages,selected,'',crypto.randomUUID());sharePrompt(value);setPreview(value);setNote('');setError('');if(chat.kind==='group')go('groupAA.messageShare.preview',{groupId:chat.id});else go('chat.messageShare.preview',{id:chat.id});}catch{setError(t.zhiyin_share_limits);}}
 function submit(){
  if(!preview||lock.current)return;
  lock.current=true;
  try{
   const value=buildWechatShare(chat,messages,preview.messages.map(m=>m.id),note,preview.id);sharePrompt(value);
   if(!window.__OS__?.startActivity('zhiyin',{action:'ACTION_SEND',type:'text/plain',data:{wechatShare:value}},{newTask:true}))throw new Error(t.zhiyin_share_open_error);
   const base=chat.kind==='group'?`/group-aa/${encodeURIComponent(chat.id)}`:`/chat/${encodeURIComponent(chat.id)}`;
   if(chat.kind==='group')go('groupAA.messageShare.finish',{groupId:chat.id},{popTo:base,mode:'replace'});else go('chat.messageShare.finish',{id:chat.id},{popTo:base,mode:'replace'});
   close();
  }catch{setError(t.zhiyin_share_open_error);}finally{lock.current=false;}
 }
 function bindMessage(id:string):HTMLAttributes<HTMLDivElement>&{'data-share-selected'?:string}{
  const message=messages.find(m=>m.id===id);if(!message)return {};
  const gesture=sharing==='select'
     ?chat.kind==='group'?bindTap<HTMLDivElement>({kind:'action',id:'groupAA.messageShare.toggle'},{params:{messageId:id},onTrigger:()=>toggle(id)}):bindTap<HTMLDivElement>({kind:'action',id:'chat.messageShare.toggle'},{params:{messageId:id},onTrigger:()=>toggle(id)})
     :chat.kind==='group'?bindLongPress<HTMLDivElement>('groupAA.messageShare.select',{params:{groupId:chat.id},onTrigger:()=>enter(id,true)}):bindLongPress<HTMLDivElement>('chat.messageShare.select',{params:{id:chat.id},onTrigger:()=>enter(id,true)});
  return {
   ...gesture,
   onPointerDown:e=>{suppressedClick.current=null;pointer.current={x:e.clientX,y:e.clientY};gesture.onPointerDown?.(e);},
   onPointerMove:e=>{if(pointer.current&&Math.hypot(e.clientX-pointer.current.x,e.clientY-pointer.current.y)>10)gesture.onPointerCancel?.(e);},
   onClickCapture:e=>{if(suppressedClick.current===id){suppressedClick.current=null;e.preventDefault();e.stopPropagation();}else gesture.onClickCapture?.(e);},
   role:'button',tabIndex:0,'aria-label':`${t.zhiyin_share_select}: ${message.text}`,'aria-pressed':selected.includes(id),
   'data-share-selected':selected.includes(id)?'true':undefined,
   onContextMenu:e=>{e.preventDefault();if(!sharing)enter(id);},
   onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(sharing==='select')toggle(id);else if(!sharing)enter(id);}},
  };
 }
 const overlay=<>
  {sharing==='select'&&<section className="wx-message-share-bar" aria-label={t.zhiyin_share_selection}>
   <span>{t.zhiyin_share_selected.replace('{count}',String(selected.length))}</span>
   <button {...bindBack()}>{t.share_cancel}</button>
   <button disabled={!selected.length} className="wx-message-share-primary" {...(chat.kind==='group'?bindTap('groupAA.messageShare.preview',{params:{groupId:chat.id},onTrigger:review}):bindTap('chat.messageShare.preview',{params:{id:chat.id},onTrigger:review}))}>{t.zhiyin_share_title}</button>
   {error&&<p role="alert">{error}</p>}
  </section>}
  {sharing==='preview'&&preview&&<div className="wx-message-share-backdrop">
   <div ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-label={t.zhiyin_share_title} className="wx-message-share-dialog" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();back();}
    if(e.key==='Tab'){
     const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('textarea,button')??[]);
     const first=controls[0],last=controls.at(-1);
     if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
   }}>
    <h2>{t.zhiyin_share_title}</h2><p className="wx-message-share-source">{chat.name}</p>
    <ol>{preview.messages.map(m=><li key={m.id}><span>{m.sender} · {TimeService.fromTimestamp(m.sentAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</span><p>{m.text}</p></li>)}</ol>
    <label>{t.zhiyin_share_note}<textarea data-action={chat.kind==='group'?'groupAA.messageShare.note':'chat.messageShare.note'} maxLength={200} value={note} placeholder={t.zhiyin_share_note_hint} onChange={e=>setNote(e.target.value)}/></label>
    <p className="wx-message-share-hint">{t.zhiyin_share_disclosure}</p>
    {error&&<p role="alert">{error}</p>}
    <div className="wx-message-share-actions"><button {...bindBack()}>{t.zhiyin_share_back}</button><button className="wx-message-share-primary" {...(chat.kind==='group'?bindTap({kind:'action',id:'groupAA.messageShare.send'},{onTrigger:submit}):bindTap({kind:'action',id:'chat.messageShare.send'},{onTrigger:submit}))}>{t.zhiyin_share_open}</button></div>
   </div>
  </div>}
 </>;
 return {bindMessage,overlay,selectMessage:enter};
}
