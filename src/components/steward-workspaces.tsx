import {useCallback,useEffect,useRef,useState,type ComponentProps} from 'react';
import {StewardChatHome,readConversationSnapshot} from './steward-chat-home';
import {emptyWorkspaces,validWorkspaces,type WorkspaceOperation} from '../lib/workspaces';
import {workspaceRequest,routeWorkspacePrompt} from '../lib/workspace-service';
import {messageStateRequest,messageReplyRequest,type MessageClientOperation} from '../lib/message-service';
import {taskContinuation,readTaskProgress,type TaskProgress} from '../lib/task-progress';
import type {StewardChatMessage,StewardReplyRequest} from '../lib/steward-chat';
import {subscriptionFingerprint} from '../lib/subscription-access';
import type {ConversationEntry,MessageOperation} from '../lib/message-flow';
import {WECHAT_SHARE_PREFIX} from '../lib/wechat-message-share';
import {useSceneContinuation} from '../lib/use-scene-continuation';
import type {SceneNext} from '../lib/scene-flow';
import {foodOrderRequest} from '../lib/food-order-bridge';
import {occasionFoodRequest} from '../lib/occasion-food-bridge';
import './steward-workspaces.css';
type Props=ComponentProps<typeof StewardChatHome>&{route?:typeof routeWorkspacePrompt};
type Queued={id:string;text:string;token:string;messageId:string;replyId:string;sourceText:string};
const TURN_SAVED='zhiyin-workspace-turn-saved';
/** Server owns originals, jobs and transcript. This view only claims the next
 * read/prepare task and supplies browser-authorized sandbox data. */
export function StewardWorkspaces({route,...props}:Props){
 const [state,setState]=useState(emptyWorkspaces),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const [active,setActive]=useState(()=>localStorage.getItem('zhiyin-workspace-active')||'');
 const [selectedConversationId,setSelectedConversationId]=useState(()=>localStorage.getItem('zhiyin-conversation-selected')||'');
 const [sessionOpen,setSessionOpen]=useState(false),[sessionQuery,setSessionQuery]=useState(''),[sessionFilter,setSessionFilter]=useState<'active'|'archived'>('active');
 const [editingTitle,setEditingTitle]=useState<{id:string;value:string}>(),[deleteId,setDeleteId]=useState('');
 const [claimAttempt,setClaimAttempt]=useState(0);
 const owner=useRef(crypto.randomUUID()),claiming=useRef(false),saveTail=useRef<Promise<unknown>>(Promise.resolve());
 const currentState=useRef(state);currentState.current=state;
 const acknowledgedEntries=useRef(new Set<string>());
 for(const entry of state.conversation||[])acknowledgedEntries.current.add(entry.id);
 const receiptOwner=useRef(localStorage.getItem('zhiyin-transfer-workspace')||'');
 const activeRun=state.runs?.find(r=>['routing','ready','processing'].includes(r.status));
 const job=activeRun?.jobs.find(j=>j.status==='claimed'&&j.owner===owner.current);
 const injected:Queued|undefined=job&&activeRun?{id:job.taskId,text:job.text,token:job.id,messageId:activeRun.id,replyId:job.replyId,sourceText:activeRun.prompt}:undefined;
 const executing=useRef<Queued>();if(injected)executing.current=injected;
 const busy=Boolean(activeRun);
 const phase=activeRun?.trace.at(-1)?.stage;
 const work=state.items.find(w=>w.id===(job?.taskId||active)&&w.status==='active');
 const sessions=[...state.items].sort((a,b)=>b.updatedAt-a.updatedAt);
 const selectedConversation=state.items.find(w=>w.id===selectedConversationId)||state.items.find(w=>w.title.startsWith('赛题验收·'));
 const managedConversation=selectedConversation?.status==='active'&&(selectedConversationId||selectedConversation.title.startsWith('赛题验收·'))?selectedConversation:null;
 const latestConversationRun=managedConversation?[...(state.runs||[])].reverse().find(run=>run.currentId===managedConversation.id):undefined;
 const conversationFeedback=latestConversationRun&&['waiting_user','failed','interrupted'].includes(latestConversationRun.status)?latestConversationRun:undefined;
 const visibleSessions=sessions.filter(item=>item.status===sessionFilter&&item.title.toLowerCase().includes(sessionQuery.trim().toLowerCase()));
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
  function selectConversation(id:string){
    setSelectedConversationId(id);
    localStorage.setItem('zhiyin-conversation-selected',id);
    if(state.items.some(item=>item.id===id&&item.status==='active')){setActive(id);localStorage.setItem('zhiyin-workspace-active',id);}
    setSessionOpen(false);
  }
  async function createConversation(){
    const id=crypto.randomUUID();
    try{await save({type:'create',id,title:'新对话',kind:'general'});selectConversation(id);setActive(id);localStorage.setItem('zhiyin-workspace-active',id);setError('');}
    catch(e){setError(e instanceof Error?e.message:'无法新建对话');}
  }
  async function renameConversation(){
    if(!editingTitle)return;
    try{await save({type:'rename',id:editingTitle.id,title:editingTitle.value});setEditingTitle(undefined);setError('');}
    catch(e){setError(e instanceof Error?e.message:'无法重命名对话');}
  }
  async function statusConversation(id:string,status:'active'|'archived'){
    try{await save({type:'status',id,status});if(status==='archived'&&active===id){setActive('');localStorage.removeItem('zhiyin-workspace-active');}setError('');}
    catch(e){setError(e instanceof Error?e.message:'无法更改对话状态');}
  }
  async function deleteConversation(){
    const id=deleteId;if(!id)return;
    try{await save({type:'delete',id});if(active===id){setActive('');localStorage.removeItem('zhiyin-workspace-active');}if(selectedConversationId===id){setSelectedConversationId('');localStorage.removeItem('zhiyin-conversation-selected');}setDeleteId('');setError('');}
    catch(e){setError(e instanceof Error?e.message:'无法删除对话');setDeleteId('');}
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
  void request({type:'claim',id:activeRun.id,jobId:next.id,owner:owner.current}).then(result=>{setActive(next.taskId);localStorage.setItem('zhiyin-workspace-active',next.taskId);if(managedConversation){setSelectedConversationId(next.taskId);localStorage.setItem('zhiyin-conversation-selected',next.taskId);}accept(result);setError('');}).catch(cause=>{setError(cause instanceof Error?cause.message:'这条消息暂时未能领取');}).finally(()=>{claiming.current=false;});
 },[loaded,activeRun,route,accept,claimAttempt]);
 async function arrange(text:string,recent:StewardChatMessage[]=[],knownBillTaskId?:string,meta?:{messageId:string;displayText?:string}){
  if(!loaded)throw new Error('消息记录尚未载入，请稍后重试');
  const id=meta?.messageId||crypto.randomUUID();const refreshed=props.memory?await props.memory.refresh():null;const revision=refreshed?.revision??props.memory?.current.current.revision??0;
  try{
   const last=currentState.current.runs?.filter(r=>r.status==='waiting_user'&&r.currentId===(managedConversation?.id||work?.id||'')).at(-1);
   const source=route&&last?`${last.prompt}；补充：${text}`:text;
   let next=await request({type:'submit',id,text:source,displayText:meta?.displayText||text,currentId:managedConversation?.id||work?.id||'',memoryRevision:revision,...(knownBillTaskId?{knownTaskId:knownBillTaskId}:{})});accept(next);
   if(route){
    const tasks=next.items.map(t=>({...t,progress:t.memoryRevision===revision?t.progress:undefined,memoryRevision:revision,messages:t.messages.filter(m=>m.memoryRevision===revision)}));
    const known=knownBillTaskId?tasks.find(t=>t.id===knownBillTaskId):undefined;
    const result=known?{parts:[{taskId:known.id,kind:known.kind,title:known.title,text:source}]}:(!last&&!text.startsWith(WECHAT_SHARE_PREFIX)?taskContinuation(text,tasks,managedConversation?.id||work?.id||''):null)||await route(source,tasks,managedConversation?.id||work?.id||'','',recent);
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
 async function serverReply(context:StewardReplyRequest){
  const item=injected||executing.current;if(!item)throw new Error('消息任务尚未准备好');
  const version=subscriptionFingerprint(props.getCurrentConnections?.()||props.connections);
  const result=await messageReplyRequest({id:item.messageId,jobId:item.token,owner:owner.current,request:context});
  const question=context.messages.filter(message=>message.role==='user').at(-1)?.content||'';
  if(/自动续费|订阅|签约/.test(question)&&props.getCurrentConnections&&version!==subscriptionFingerprint(props.getCurrentConnections()))throw new Error('授权或订阅已变化，本次结果已作废，请重新查询。');
  accept(result.state);return result.reply;
 }
 const persistEntries=useCallback(async(entries:ConversationEntry[])=>{
  if(!loaded)return;
  const added=entries.filter(m=>!acknowledgedEntries.current.has(m.id));if(!added.length)return;
  for(const entry of added)acknowledgedEntries.current.add(entry.id);
  try{if(route)await save({type:'conversation-append',id:crypto.randomUUID(),messages:added});else accept(await messageStateRequest({type:'append',id:crypto.randomUUID(),messages:added}));}catch(cause){for(const entry of added)acknowledgedEntries.current.delete(entry.id);setError(cause instanceof Error?cause.message:'聊天记录尚未保存');}
 },[loaded,route,accept]);
  return <div className="steward-workspaces">
    {error&&<div className="workspace-feedback" role="alert">{error}{!loaded&&<button onClick={()=>void load()}>重新载入</button>}</div>}
    <div className="conversation-toolbar">
      <button type="button" onClick={()=>setSessionOpen(true)} aria-label="打开会话列表">☰ 会话 {state.items.some(item=>item.status==='active')&&<span>{state.items.filter(item=>item.status==='active').length}</span>}</button>
      <strong>{selectedConversation?.title||'与宁宁对话'}</strong>
      <button type="button" onClick={()=>void createConversation()} disabled={!loaded||busy}>＋ 新对话</button>
    </div>
    {sessionOpen&&<div className="conversation-sheet-backdrop" onClick={()=>setSessionOpen(false)}>
      <aside className="conversation-sheet" role="dialog" aria-modal="true" aria-label="会话管理" onClick={event=>event.stopPropagation()}>
        <div className="conversation-sheet-head"><strong>会话</strong><button type="button" onClick={()=>setSessionOpen(false)} aria-label="关闭会话列表">×</button></div>
        <button type="button" className="conversation-sheet-new" onClick={()=>void createConversation()} disabled={busy}>＋ 新对话</button>
        <label className="conversation-search">搜索会话<input value={sessionQuery} onChange={event=>setSessionQuery(event.target.value)} placeholder="搜索标题"/></label>
        <div className="conversation-filter"><button type="button" aria-pressed={sessionFilter==='active'} onClick={()=>setSessionFilter('active')}>最近对话</button><button type="button" aria-pressed={sessionFilter==='archived'} onClick={()=>setSessionFilter('archived')}>已归档</button></div>
        <div className="conversation-sheet-list">{visibleSessions.length?visibleSessions.map(item=><div className="conversation-list-item" key={item.id}>
          <button type="button" className="conversation-list-select" aria-current={item.id===selectedConversation?.id?'page':undefined} onClick={()=>selectConversation(item.id)}><strong>{item.title}</strong><span>{item.messages.length/2} 轮 · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span></button>
          <div className="conversation-list-actions"><button type="button" onClick={()=>setEditingTitle({id:item.id,value:item.title})}>重命名</button><button type="button" onClick={()=>void statusConversation(item.id,item.status==='active'?'archived':'active')}>{item.status==='active'?'归档':'恢复'}</button><button type="button" onClick={()=>setDeleteId(item.id)}>删除</button></div>
        </div>):<p className="conversation-list-empty">这里还没有对话。</p>}</div>
      </aside>
    </div>}
    {editingTitle&&<div className="conversation-modal-backdrop"><div role="dialog" aria-modal="true" aria-label="重命名会话" className="conversation-modal"><strong>重命名会话</strong><input aria-label="会话标题" maxLength={60} value={editingTitle.value} onChange={event=>setEditingTitle({...editingTitle,value:event.target.value})} onKeyDown={event=>{if(event.key==='Enter')void renameConversation();}}/><div><button type="button" onClick={()=>setEditingTitle(undefined)}>取消</button><button type="button" disabled={!editingTitle.value.trim()} onClick={()=>void renameConversation()}>保存</button></div></div></div>}
    {deleteId&&<div className="conversation-modal-backdrop"><div role="alertdialog" aria-modal="true" aria-label="确认删除会话" className="conversation-modal"><strong>删除这段对话？</strong><p>这会删除此会话的历史消息。资金操作记录仍以业务账本为准。</p><div><button type="button" onClick={()=>setDeleteId('')}>取消</button><button type="button" className="conversation-danger" onClick={()=>void deleteConversation()}>确认删除</button></div></div></div>}
    {selectedConversation&&!managedConversation&&<section className="scenario-conversations" aria-label="当前会话记录">
      <div className="scenario-conversations-heading"><strong>{selectedConversation.title}</strong><span>{Math.floor(selectedConversation.messages.length/2)} 轮对话</span></div>
      <div className="scenario-conversation" role="log" aria-label={selectedConversation.title}>
        {selectedConversation.messages.length?selectedConversation.messages.map(message=><p key={message.id} className={`scenario-message ${message.role}`}>
          <b>{message.role==='user'?'用户':'宁宁'}</b><span>{message.content}</span>
        </p>):<p className="scenario-conversation-empty">这里还没有消息，和宁宁说点什么吧。</p>}
        <small>本区展示模型对话记录；资金和设置变更以业务回执为准。</small>
      </div>
    </section>}
    {conversationFeedback&&<section role="log" aria-label="宁宁需要补充的信息" className="scenario-conversation">
      <p className="scenario-message user"><b>你</b><span>{conversationFeedback.displayText}</span></p>
      <p className="scenario-message assistant"><b>宁宁</b><span>{conversationFeedback.clarification||`这条消息未完成：${conversationFeedback.error||'请重新说明本次请求'}。尚未执行资金操作。`}</span></p>
    </section>}
    <StewardChatHome key={managedConversation?.id||'frontstage'} {...props}
      seamless={!managedConversation}
      fullSession={Boolean(managedConversation)}
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
      workspace={managedConversation || work || null}
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
