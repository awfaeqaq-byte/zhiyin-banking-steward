import {useCallback,useEffect,useRef,useState,type ComponentProps} from 'react';
import {StewardChatHome,readConversationSnapshot} from './steward-chat-home';
import {emptyWorkspaces,validWorkspaces,type WorkspaceOperation} from '../lib/workspaces';
import {workspaceRequest,routeWorkspacePrompt} from '../lib/workspace-service';
import {messageStateRequest,messageReplyRequest,type MessageClientOperation} from '../lib/message-service';
import {taskContinuation,readTaskProgress,type TaskProgress} from '../lib/task-progress';
import type {StewardChatMessage,StewardReplyRequest} from '../lib/steward-chat';
import type {ConversationEntry,MessageOperation} from '../lib/message-flow';
import {WECHAT_SHARE_PREFIX} from '../lib/wechat-message-share';
import {useSceneContinuation} from '../lib/use-scene-continuation';
import type {SceneNext} from '../lib/scene-flow';
import {foodOrderRequest} from '../lib/food-order-bridge';
import {occasionFoodRequest} from '../lib/occasion-food-bridge';
import './steward-workspaces.css';
type Props=ComponentProps<typeof StewardChatHome>&{route?:typeof routeWorkspacePrompt};
type Queued={id:string;text:string;token:string;messageId:string;replyId:string};
const TURN_SAVED='zhiyin-workspace-turn-saved';
/** Server owns originals, jobs and transcript. This view only claims the next
 * read/prepare task and supplies browser-authorized sandbox data. */
export function StewardWorkspaces({route,...props}:Props){
 const [state,setState]=useState(emptyWorkspaces),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const [active,setActive]=useState(()=>localStorage.getItem('zhiyin-workspace-active')||'');
 const [claimAttempt,setClaimAttempt]=useState(0);
 const owner=useRef(crypto.randomUUID()),claiming=useRef(false),saveTail=useRef<Promise<unknown>>(Promise.resolve());
 const currentState=useRef(state);currentState.current=state;
 const receiptOwner=useRef(localStorage.getItem('zhiyin-transfer-workspace')||'');
 const activeRun=state.runs?.find(r=>['routing','ready','processing'].includes(r.status));
 const job=activeRun?.jobs.find(j=>j.status==='claimed'&&j.owner===owner.current);
 const injected:Queued|undefined=job&&activeRun?{id:job.taskId,text:job.text,token:job.id,messageId:activeRun.id,replyId:job.replyId}:undefined;
 const executing=useRef<Queued>();if(injected)executing.current=injected;
 const busy=Boolean(activeRun);
 const phase=activeRun?.trace.at(-1)?.stage;
 const work=state.items.find(w=>w.id===(job?.taskId||active)&&w.status==='active');
 const accept=useCallback((next:ReturnType<typeof emptyWorkspaces>)=>{setState(current=>next.revision>current.revision?next:current);},[]);
 useSceneContinuation(loaded&&!route,accept,JSON.stringify({items:state.items.map(t=>({id:t.id,status:t.status,sceneId:t.sceneId,book:t.expenseBookId,food:t.progress?.food?.orderId})),runs:state.runs?.map(r=>({id:r.id,status:r.status}))}));
 async function resumeScene(next:SceneNext){
  setActive(next.workspaceId);localStorage.setItem('zhiyin-workspace-active',next.workspaceId);
  try{if(next.kind==='food'){if(next.channel==='occasion')await occasionFoodRequest('open',{planId:next.workspaceId,orderId:next.id});else await foodOrderRequest('open',{taskId:next.workspaceId,orderId:next.id});}
   else if(next.kind==='occasion')props.onOpenOccasions?.(undefined,next.id);else if(next.kind==='calendar')props.onOpenTasks?.(next.date);else if(next.kind==='bank')props.onPrepareTransfer?.({kind:'records'});
  }catch(cause){setError(cause instanceof Error?cause.message:'原事项暂未打开');}
 }
 async function save(operation:WorkspaceOperation|((latest:ReturnType<typeof emptyWorkspaces>)=>WorkspaceOperation)){
  const result=saveTail.current.then(async()=>{
   for(let attempt=0;attempt<3;attempt++){
    const latest=await workspaceRequest();
    try{const next=await workspaceRequest(typeof operation==='function'?operation(latest):operation,latest.revision);accept(next);window.dispatchEvent(new CustomEvent(TURN_SAVED,{detail:next}));return next;}
    catch(cause){if(attempt===2||!(cause instanceof Error)||!cause.message.includes('已变化'))throw cause;}
   }
   throw new Error('任务正在保存，请重试');
  });saveTail.current=result.catch(()=>undefined);return result;
 }
 // Explicit route injection is used by isolated component tests. Production
 // classification always runs in the server worker; both paths use its reducer.
 async function request(operation?:MessageClientOperation){
  if(!route)return messageStateRequest(operation);
  if(!operation)return workspaceRequest();
  if(operation.type==='submit')return save({...operation,type:'message-submit'} as unknown as MessageOperation);
  if(operation.type==='claim')return save({type:'message-claim',id:operation.id,jobId:operation.jobId,owner:operation.owner});
  if(operation.type==='complete')return save({...operation,type:'message-complete'});
  return save({type:operation.type==='import'?'conversation-import':'conversation-append',id:operation.id,messages:operation.messages});
 }
 const load=useCallback(async()=>{
  try{
   let next=await (route?workspaceRequest():messageStateRequest());
   if(next.conversation===undefined){const messages=readConversationSnapshot(next.items);next=route?await save({type:'conversation-import',id:crypto.randomUUID(),messages}):await messageStateRequest({type:'import',id:crypto.randomUUID(),messages});}
   accept(next);setLoaded(true);setError('');
  }catch(cause){setError(cause instanceof Error?cause.message:'之前的消息暂时无法载入');}
 },[route,accept]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{const receive=(event:Event)=>{const next=(event as CustomEvent).detail;if(validWorkspaces(next))accept(next);};window.addEventListener(TURN_SAVED,receive);return()=>window.removeEventListener(TURN_SAVED,receive);},[accept]);
 useEffect(()=>{
  if(!loaded||!busy)return;
  let live=true;
  const poll=async()=>{try{const next=await request();if(live){accept(next);if(!claiming.current&&next.runs?.find(r=>['routing','ready','processing'].includes(r.status))?.status==='ready')setClaimAttempt(attempt=>attempt+1);}}catch(cause){if(live)setError(cause instanceof Error?cause.message:'消息状态暂时未能更新');}};
  const timer=window.setInterval(()=>void poll(),500);return()=>{live=false;window.clearInterval(timer);};
 },[loaded,busy,route,accept]);
 useEffect(()=>{
  if(!loaded||!activeRun||activeRun.status!=='ready'||claiming.current)return;
  const next=activeRun.jobs.find(j=>j.status==='queued');if(!next)return;
  claiming.current=true;
  void request({type:'claim',id:activeRun.id,jobId:next.id,owner:owner.current}).then(result=>{setActive(next.taskId);localStorage.setItem('zhiyin-workspace-active',next.taskId);accept(result);setError('');}).catch(cause=>{setError(cause instanceof Error?cause.message:'这条消息暂时未能领取');}).finally(()=>{claiming.current=false;});
 },[loaded,activeRun,route,accept,claimAttempt]);
 async function arrange(text:string,recent:StewardChatMessage[]=[],knownBillTaskId?:string,meta?:{messageId:string;displayText?:string}){
  if(!loaded)throw new Error('消息记录尚未载入，请稍后重试');
  const id=meta?.messageId||crypto.randomUUID();const refreshed=props.memory?await props.memory.refresh():null;const revision=refreshed?.revision??props.memory?.current.current.revision??0;
  try{
   const last=currentState.current.runs?.filter(r=>r.status==='waiting_user').at(-1);
   const source=route&&last?`${last.prompt}；补充：${text}`:text;
   let next=await request({type:'submit',id,text:source,displayText:meta?.displayText||text,currentId:work?.id||'',memoryRevision:revision,...(knownBillTaskId?{knownTaskId:knownBillTaskId}:{})});accept(next);
   if(route){
    const tasks=next.items.map(t=>({...t,progress:t.memoryRevision===revision?t.progress:undefined,memoryRevision:revision,messages:t.messages.filter(m=>m.memoryRevision===revision)}));
    const known=knownBillTaskId?tasks.find(t=>t.id===knownBillTaskId):undefined;
    const result=known?{parts:[{taskId:known.id,kind:known.kind,title:known.title,text:source}]}:(!last&&!text.startsWith(WECHAT_SHARE_PREFIX)?taskContinuation(text,tasks,work?.id||''):null)||await route(source,tasks,work?.id||'','',recent);
    next=await save({type:'message-routed',id,...result});accept(next);
   }
   setError('');
  }catch(cause){
   if(route){try{accept(await save({type:'message-fail',id,error:cause instanceof Error?cause.message:'暂时未能理解这条消息',stage:'routing'}));}catch{/* Preserve the first error. */}}
   else setError(cause instanceof Error?cause.message:'这条消息暂时未能提交');
   throw cause;
  }
 }
 async function completed(_user:string,assistant:string,revision:number,failed:boolean,progress?:TaskProgress){
  const item=injected||executing.current;if(!item)return;
  try{
   const latest=await request(),run=latest.runs?.find(r=>r.id===item.messageId),current=run?.jobs.find(j=>j.id===item.token);
   if(current?.status==='claimed')accept(await request({type:'complete',id:item.messageId,jobId:item.token,owner:owner.current,assistant,memoryRevision:revision,failed,...(progress?{progress}:{})}));else accept(latest);
   if(executing.current?.token===item.token)executing.current=undefined;
  }catch(cause){setError(cause instanceof Error?cause.message:'回复保存状态尚未核实，请勿重复资金操作');}
 }
 async function serverReply(context:StewardReplyRequest){const item=injected||executing.current;if(!item)throw new Error('消息任务尚未准备好');const result=await messageReplyRequest({id:item.messageId,jobId:item.token,owner:owner.current,request:context});accept(result.state);return result.reply;}
 const persistEntries=useCallback(async(entries:ConversationEntry[])=>{
  if(!loaded)return;
  const known=new Set(currentState.current.conversation?.map(m=>m.id));const added=entries.filter(m=>!known.has(m.id));if(!added.length)return;
  try{if(route)await save({type:'conversation-append',id:crypto.randomUUID(),messages:added});else accept(await messageStateRequest({type:'append',id:crypto.randomUUID(),messages:added}));}catch(cause){setError(cause instanceof Error?cause.message:'聊天记录尚未保存');}
 },[loaded,route,accept]);
  return <div className="steward-workspaces">
    {error&&<div className="workspace-feedback" role="alert">{error}{!loaded&&<button onClick={()=>void load()}>重新载入</button>}</div>}
    <StewardChatHome {...props}
      seamless
      sceneFlows={state.scenes}
      onResumeScene={resumeScene}
      conversationMessages={state.conversation}
      onConversationEntries={persistEntries}
      processingPhase={phase}
      reply={props.reply||serverReply}
      contextWorkspaces={state.items}
      onBackgroundBook={async(id,expenseBookId)=>{await save({type:'link',id,expenseBookId});}}
      onBackgroundProgress={async(id,progress,memoryRevision)=>{await save(latest=>{const task=latest.items.find(t=>t.id===id&&t.status==='active');if(!task||task.memoryRevision!==memoryRevision||(props.memory?.current.current.revision??0)!==memoryRevision)throw new Error('任务上下文已变化，请重新交代');return {type:'progress',id,progress,memoryRevision};});}}
      onBackgroundTurn={async(id,user,assistant,memoryRevision)=>{await save({type:'turn',id,user,assistant,memoryRevision});}}
      bankReceipt={props.bankReceipt}
      onPrepareTransfer={props.onPrepareTransfer ? (intent,workspaceId)=>{
        receiptOwner.current=workspaceId || work?.id || "";
        localStorage.setItem("zhiyin-transfer-workspace",receiptOwner.current);
        props.onPrepareTransfer?.('kind' in intent&&intent.kind==='records'?intent:{...intent,workspaceId:receiptOwner.current||undefined});
      }:undefined}
      workspace={work || null}
      onBillViewChange={async(id,view)=>{
        await save(latest=>{
          const task=latest.items.find(t=>t.id===id&&t.status==='active');
          const revision=props.memory?.current.current.revision??0;
          if(!task||task.memoryRevision!==revision)throw new Error('这份账单任务已变化，请重新交代查看范围。');
          const progress=readTaskProgress(task);
          if(!progress.bill)throw new Error('原账单任务不可用，请重新交代查看范围。');
          return {type:'progress',id,memoryRevision:revision,progress:{...progress,bill:{...progress.bill,provider:view.provider||'all'}}};
        });
      }}
      onRoutePrompt={arrange}
      externalBusy={busy || !loaded}
      injectedPrompt={injected}
      onTurnComplete={completed}
      onWorkspaceBook={async expenseBookId=>{if(work)await save({type:"link",id:work.id,expenseBookId});}}
    />
  </div>;
}
