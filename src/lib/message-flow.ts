import {changeWorkspaces,validateRoutes,type WorkspaceState,type WorkspaceRoute,type WorkspaceOperation} from './workspaces';
import {advanceTaskProgress,clearBillIntent,readTaskProgress,type TaskProgress} from './task-progress';
import {readonlyWechatShare,sharedTextPreview} from './wechat-message-share';
export type ConversationEntry={id:string;role:'user'|'assistant';content:string;messageId?:string;workspaceId?:string;retryPrompt?:string;memoryRevision?:number};
export type MessageJob={id:string;taskId:string;text:string;replyId:string;status:'queued'|'claimed'|'completed'|'failed';owner?:string;leaseUntil?:number};
export type MessageRun={id:string;prompt:string;displayText:string;currentId:string;knownTaskId?:string;memoryRevision:number;status:'routing'|'ready'|'processing'|'waiting_user'|'completed'|'failed'|'interrupted';jobs:MessageJob[];trace:Array<{stage:string;at:number;detail?:string}>;createdAt:number;updatedAt:number;error?:string;clarification?:string;decision?:string};
export type MessageOperation=
 |{type:'conversation-import';id:string;messages:ConversationEntry[]}
 |{type:'conversation-append';id:string;messages:ConversationEntry[]}
 |{type:'message-submit';id:string;text:string;displayText?:string;currentId:string;memoryRevision:number;knownTaskId?:string}
 |{type:'message-routed';id:string;parts:WorkspaceRoute[];clarification?:string;decision?:string}
 |{type:'message-claim';id:string;jobId:string;owner:string}
 |{type:'message-stage';id:string;jobId:string;owner:string;stage:'gathering'|'replying'}
 |{type:'message-complete';id:string;jobId:string;owner:string;assistant:string;memoryRevision:number;failed:boolean;progress?:TaskProgress}
 |{type:'message-fail';id:string;error:string;stage:string;interrupted?:boolean;decision?:string};
const idOk=(x:unknown):x is string=>typeof x==='string'&&/^[\w-]{1,82}$/.test(x);
const textOk=(x:unknown,max:number):x is string=>typeof x==='string'&&!!x.trim()&&x.length<=max;
export function validConversationEntry(x:ConversationEntry):boolean{return !!x&&idOk(x.id)&&['user','assistant'].includes(x.role)&&textOk(x.content,12000)&&(x.messageId===undefined||idOk(x.messageId))&&(x.workspaceId===undefined||idOk(x.workspaceId))&&(x.retryPrompt===undefined||textOk(x.retryPrompt,2000))&&(x.memoryRevision===undefined||Number.isSafeInteger(x.memoryRevision)&&x.memoryRevision>=0);}
export function validMessageRun(x:MessageRun):boolean{return !!x&&idOk(x.id)&&textOk(x.prompt,2000)&&textOk(x.displayText,2000)&&typeof x.currentId==='string'&&(!x.currentId||idOk(x.currentId))&&(x.knownTaskId===undefined||idOk(x.knownTaskId))&&Number.isSafeInteger(x.memoryRevision)&&x.memoryRevision>=0&&['routing','ready','processing','waiting_user','completed','failed','interrupted'].includes(x.status)&&Number.isFinite(x.createdAt)&&Number.isFinite(x.updatedAt)&&Array.isArray(x.jobs)&&x.jobs.length<=4&&x.jobs.every(j=>j&&idOk(j.id)&&idOk(j.taskId)&&idOk(j.replyId)&&textOk(j.text,2000)&&['queued','claimed','completed','failed'].includes(j.status)&&(j.owner===undefined||idOk(j.owner))&&(j.leaseUntil===undefined||Number.isFinite(j.leaseUntil)))&&Array.isArray(x.trace)&&x.trace.length<=30&&x.trace.every(t=>t&&textOk(t.stage,80)&&Number.isFinite(t.at)&&(t.detail===undefined||typeof t.detail==='string'&&t.detail.length<=1000))&&(x.error===undefined||textOk(x.error,1000))&&(x.clarification===undefined||textOk(x.clarification,300))&&(x.decision===undefined||typeof x.decision==='string'&&x.decision.length<=6000);}
export function changeMessageState(state:WorkspaceState,operation:MessageOperation):WorkspaceState{
 let next=structuredClone(state);const now=Date.now();next.runs??=[];next.conversation??=[];
 const append=(entry:ConversationEntry)=>{if(!next.conversation!.some(m=>m.id===entry.id))next.conversation=[...next.conversation!,entry].slice(-100);};
 if(operation.type==='conversation-import'){
  if(state.conversation===undefined){if(!Array.isArray(operation.messages)||operation.messages.length>100||!operation.messages.every(validConversationEntry))throw new Error('历史消息无效');next.conversation=structuredClone(operation.messages);}
  return next;
 }
 if(operation.type==='conversation-append'){
  if(!Array.isArray(operation.messages)||operation.messages.length>100||!operation.messages.every(validConversationEntry))throw new Error('历史消息无效');
  for(const entry of operation.messages)append(entry);return next;
 }
 const existing=next.runs.find(r=>r.id===operation.id);
 if(operation.type==='message-submit'){
  if(existing){if(existing.prompt!==operation.text)throw new Error('消息ID对应的原文不能修改');return next;}
  if(!textOk(operation.text,2000)||!Number.isSafeInteger(operation.memoryRevision)||operation.memoryRevision<0||typeof operation.currentId!=='string'||operation.currentId&&!idOk(operation.currentId)||operation.displayText!==undefined&&!textOk(operation.displayText,2000)||operation.knownTaskId!==undefined&&!idOk(operation.knownTaskId))throw new Error('消息格式无效');
  next.runs=next.runs.filter(r=>['routing','ready','processing'].includes(r.status)||next.runs!.slice(-40).includes(r));
  if(next.runs.length>=50)throw new Error('待处理消息过多，请先处理已有消息');
  const run:MessageRun={id:operation.id,prompt:operation.text,displayText:operation.displayText||operation.text,currentId:operation.currentId,...(operation.knownTaskId?{knownTaskId:operation.knownTaskId}:{}),memoryRevision:operation.memoryRevision,status:'routing',jobs:[],trace:[{stage:'received',at:now},{stage:'routing',at:now}],createdAt:now,updatedAt:now};
  next.runs.push(run);append({id:`user-${run.id}`,role:'user',content:run.displayText,messageId:run.id,memoryRevision:run.memoryRevision});return next;
 }
 if(!existing)throw new Error('消息不存在');
 const run=existing;
 const trace=(stage:string,detail?:string)=>{run.trace=[...run.trace,{stage,at:now,...(detail?{detail}: {})}].slice(-30);run.updatedAt=now;};
 const apply=(op:WorkspaceOperation)=>{next=changeWorkspaces(next,{...op,revision:next.revision,requestId:crypto.randomUUID()});};
 if(operation.type==='message-routed'){
  if(run.status!=='routing')throw new Error('消息已离开分流阶段');
  if(operation.decision!==undefined){if(typeof operation.decision!=='string'||operation.decision.length>6000)throw new Error('分类记录无效');run.decision=operation.decision;}
  const result=validateRoutes({parts:operation.parts,clarification:operation.clarification},run.prompt,next.items);
  if(result.clarification){run.status='waiting_user';run.clarification=result.clarification;append({id:`question-${run.id}`,role:'assistant',content:result.clarification,messageId:run.id});trace('waiting_user');return next;}
  for(const part of result.parts){
   const taskId=part.taskId||crypto.randomUUID(),readonly=readonlyWechatShare(part.text);
   const kind=readonly?'general':part.kind==='general'&&clearBillIntent(part.text)?'bills':part.kind;
   if(!part.taskId)apply({type:'create',id:taskId,kind,title:part.title});
   const task=next.items.find(t=>t.id===taskId)!;
   const progress=readonly?{goal:sharedTextPreview(part.text)!.instruction,stage:'collecting' as const}:advanceTaskProgress(part.kind==='food'?{...task,kind:'food'}:task,part.text);
   const repair=task.kind==='general'&&progress.food?{kind:'food' as const}:task.kind==='general'&&progress.bill?{kind:'bills' as const}:{};
   apply({type:'progress',id:taskId,progress,memoryRevision:run.memoryRevision,...repair});
   const jobId=crypto.randomUUID();apply({type:'enqueue',id:taskId,token:jobId,text:part.text});
   run.jobs.push({id:jobId,replyId:`assistant-${jobId}`,taskId,text:part.text,status:'queued'});
  }
  // Nested task operations clone state; reattach the updated run atomically.
  next.runs=next.runs!.map(r=>r.id===run.id?run:r);run.status='ready';trace('queued');return next;
 }
 if(operation.type==='message-fail'){
  if(['completed','waiting_user','failed','interrupted'].includes(run.status))return next;
  if(!textOk(operation.error,1000)||!textOk(operation.stage,80))throw new Error('失败记录无效');
  run.status=operation.interrupted?'interrupted':'failed';run.error=operation.error;trace(run.status,`${operation.stage}: ${operation.error}`);
  if(operation.decision!==undefined){if(typeof operation.decision!=='string'||operation.decision.length>6000)throw new Error('分类记录无效');run.decision=operation.decision;}
  for(const job of run.jobs)if(job.status!=='completed')job.status='failed';
  next.runs=next.runs!.map(r=>r.id===run.id?run:r);
  append({id:`error-${run.id}`,role:'assistant',content:`这条消息未完成：${operation.error}。可以重试，资金操作没有自动执行。`,messageId:run.id,retryPrompt:run.prompt});return next;
 }
 const job=run.jobs.find(j=>j.id===operation.jobId);if(!job)throw new Error('消息任务不存在');
 if(operation.type==='message-claim'){
  if(!idOk(operation.owner))throw new Error('处理归属无效');
  if(job.status==='claimed'&&job.owner===operation.owner)return next;
  const active=next.runs.find(r=>['routing','ready','processing'].includes(r.status));
  if(active?.id!==run.id||run.jobs.find(j=>j.status!=='completed')?.id!==job.id||job.status!=='queued')throw new Error('任务尚未轮到处理或已被领取');
  job.status='claimed';job.owner=operation.owner;job.leaseUntil=now+120000;run.status='processing';trace('gathering');return next;
 }
 if(job.status==='completed'&&operation.type==='message-complete'){if(job.owner!==operation.owner)throw new Error('消息处理归属已变化');return next;}
 if(!idOk(operation.owner)||job.owner!==operation.owner||job.status!=='claimed'||run.status!=='processing')throw new Error('消息处理归属已变化');
 if(operation.type==='message-stage'){job.leaseUntil=now+120000;trace(operation.stage);return next;}
 if(!textOk(operation.assistant,12000)||!Number.isSafeInteger(operation.memoryRevision)||operation.memoryRevision!==run.memoryRevision||typeof operation.failed!=='boolean')throw new Error('消息结果或上下文版本无效');
 apply({type:'turn',id:job.taskId,user:job.text,assistant:operation.assistant,memoryRevision:operation.memoryRevision,...(!operation.failed?{token:job.id}:{}),...(operation.progress?{progress:operation.progress}:{})});
 job.status=operation.failed?'failed':'completed';
 append({id:job.replyId,role:'assistant',content:operation.failed&&!operation.assistant.startsWith('这条消息未完成')?`这条消息未完成：${operation.assistant}。可以重试。`:operation.assistant,workspaceId:job.taskId,messageId:run.id,memoryRevision:run.memoryRevision,...(operation.failed?{retryPrompt:run.prompt}:{})});
 run.status=operation.failed?'failed':run.jobs.every(j=>j.status==='completed')?'completed':'ready';
 if(operation.failed)for(const later of run.jobs)if(later.status==='queued')later.status='failed';
 next.runs=next.runs!.map(r=>r.id===run.id?run:r);trace(operation.failed?'failed':run.status==='completed'?'completed':'queued');return next;
}
