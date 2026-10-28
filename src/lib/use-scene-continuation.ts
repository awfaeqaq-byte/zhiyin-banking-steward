import {groupAAAuthorizedEvent} from './group-aa-authorization';
import {useEffect,useRef} from 'react';
import {reconcileSceneSources} from './scene-service';
import type {WorkspaceState} from './workspaces';
/** This worker lives with the app, independently of the visible page. */
export function useSceneContinuation(enabled:boolean,accept:(state:WorkspaceState)=>void,sourceKey:string){
 const previousSource=useRef(sourceKey);
 const trigger=useRef<()=>void>(()=>{}),callbacks=useRef(accept);callbacks.current=accept;
 useEffect(()=>{
  if(!enabled)return;let live=true,running=false,queued=false;const retryBooks=new Set<string>();
  const run=async()=>{if(running){queued=true;return;}running=true;
   do{queued=false;const retryExpenseBookIds=[...retryBooks];retryBooks.clear();try{const state=await reconcileSceneSources(undefined,{retryExpenseBookIds});if(live)callbacks.current(state);}catch{retryExpenseBookIds.forEach(id=>retryBooks.add(id));/* Retain a successful reauthorization if the state save was interrupted. */}}while(live&&queued);
   running=false;
  };
  const refresh=()=>{if(live)void run();};trigger.current=refresh;
  const authorized=(event:Event)=>{const bookId=(event as CustomEvent<{bookId?:string}>).detail?.bookId;if(typeof bookId!=='string')return;retryBooks.add(bookId);refresh();};
  window.addEventListener(groupAAAuthorizedEvent,authorized);
  const foreground=()=>{if(document.visibilityState==='visible')refresh();};
  const events=['zhiyin-phone-foreground','zhiyin-bank-updated','zhiyin-tasks-updated','zhiyin-expenses-updated','focus'];
  events.forEach(e=>window.addEventListener(e,refresh));document.addEventListener('visibilitychange',foreground);
  const timer=window.setInterval(refresh,15000);refresh();
  return()=>{live=false;window.removeEventListener(groupAAAuthorizedEvent,authorized);trigger.current=()=>{};window.clearInterval(timer);events.forEach(e=>window.removeEventListener(e,refresh));document.removeEventListener('visibilitychange',foreground);};
 },[enabled]);
 useEffect(()=>{if(previousSource.current!==sourceKey){previousSource.current=sourceKey;if(enabled)trigger.current();}},[enabled,sourceKey]);
}
