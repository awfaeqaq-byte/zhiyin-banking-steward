import {createMerchantStore} from './merchant';
import {merchantAnswer} from '../src/lib/merchant-assistant';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createSceneService} from './scene-service';
import {createWorkspaceStore} from './workspace-store';
import {createMemoryStore} from './memory-store';
import {clarifiedReplyRoute} from '../src/lib/reply-routing';
import {createBankStore} from './bank-store';
import {routeWorkspacePrompt} from '../src/lib/workspace-service';
import {memoryContext} from '../src/lib/steward-memory';
import {parseImpression} from '../src/lib/steward-profile';
import {settleTaskProgress,readTaskProgress} from '../src/lib/task-progress';
import {requestStewardReplyWithModel,type StewardReply,type StewardReplyRequest,type StewardModelCall} from '../src/lib/steward-chat';
import {recentConversation} from '../src/lib/conversation-context';
import {messageHistory,messageClarification,resolvedMessagePrompt,type MessageOperation,type MessageRun} from '../src/lib/message-flow';
const terminal=(run:MessageRun)=>!['routing','ready','processing'].includes(run.status);
export function createMessageService(directory:string,model:StewardModelCall){
 const routing=new Map<string,Promise<void>>(),replies=new Map<string,Promise<StewardReply>>();
 const store=(scope:string)=>{if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope))throw new Error('任务空间标识无效');return createWorkspaceStore(join(directory,`.zhiyin-workspaces-${scope}.local.json`));};
 const sceneService=createSceneService(directory);
 const memory=createMemoryStore(join(directory,'.zhiyin-memory.local.json'));
 const apply=(scope:string,operation:MessageOperation)=>{const storage=store(scope);return storage.change({...operation,revision:storage.get().revision,requestId:randomUUID()});};
 function get(scope:string){
  let state=store(scope).get();
  for(const run of state.runs||[]){
   const job=run.jobs.find(j=>j.status==='claimed');
   if(run.status==='routing'&&!routing.has(scope)||run.status==='processing'&&job&&job.leaseUntil!<Date.now()&&!replies.has(job.id)){
    state=apply(scope,{type:'message-fail',id:run.id,error:'上次处理已中断，请重试这条消息',stage:run.status,interrupted:true});
   }
  }
  return state;
 }
 function pump(scope:string){
  if(routing.has(scope))return;
  // Register before scheduling so a simultaneous GET cannot mistake the run for
  // a crashed worker. Each scope has one classifier; execution remains ordered.
  const work=Promise.resolve().then(async()=>{
   while(true){
    const state=store(scope).get(),run=state.runs?.find(r=>r.status==='routing');if(!run)return;
    let decision='',sourcePrompt:string|undefined,clarificationOf:string|undefined;
    try{
     const currentMemory=memory.get();
     if(run.memoryRevision!==currentMemory.revision)throw new Error('记忆上下文已变化，请重新交代');
     const tasks=state.items.map(task=>({...task,progress:task.memoryRevision===run.memoryRevision?task.progress:undefined,memoryRevision:run.memoryRevision,messages:task.messages.filter(m=>m.memoryRevision===run.memoryRevision)}));
     const previous=messageClarification(state,run);
     const clarification=previous?JSON.stringify({original:previous.sourcePrompt||previous.prompt,question:previous.clarification}):'';
     const known=run.knownTaskId?tasks.find(t=>t.id===run.knownTaskId&&t.status==='active'&&(t.kind==='bills'||t.kind==='general'&&readTaskProgress(t).bill)):undefined;
     if(run.knownTaskId&&!known)throw new Error('这份账单事项已变化，请重新选择范围');
     // A saved arrangement has a business ID, independent of a chat's title.
     // Resolve against current records before a classifier can create an empty copy.
     const occasionRequest=/计划|筹备|生日|预算/.test(run.prompt)||Boolean(clarification&&/计划|筹备|生日|预算/.test(previous?.sourcePrompt||previous?.prompt||''));
     const plans=occasionRequest?(createBankStore(join(directory,'.zhiyin-bank.local.json')).forCard('primary').get().occasions??[]):[];
     const mentioned=plans.filter(p=>run.prompt.includes(p.title)&&!run.prompt.includes(p.title+'不要动')&&!run.prompt.includes(p.title+'不动'));
     let planRoute:Awaited<ReturnType<typeof routeWorkspacePrompt>>|undefined;
     if(occasionRequest&&mentioned.length){
      if(mentioned.length>1)planRoute={parts:[],clarification:`要修改哪一份安排：${mentioned.map(p=>p.title).join('、')}？已给的修改内容会保留，尚未修改任何计划。`};
      else {const plan=mentioned[0],storage=store(scope);if(!tasks.some(t=>t.id===plan.id))storage.change({type:'create',id:plan.id,title:plan.title,kind:'occasion',revision:storage.get().revision,requestId:randomUUID()});if(clarification&&previous?.clarification)storage.change({type:'turn',id:plan.id,user:previous.prompt,assistant:previous.clarification,memoryRevision:run.memoryRevision,revision:storage.get().revision,requestId:randomUUID()});planRoute={parts:[{taskId:plan.id,kind:'occasion',title:plan.title,text:run.prompt}]};}
     }
     const bound=previous?clarifiedReplyRoute(previous,run.prompt,tasks):null;
     if(bound&&previous){sourcePrompt=resolvedMessagePrompt(previous,run.prompt);clarificationOf=previous.id;}
     let result=bound||planRoute||(known?{parts:[{taskId:known.id,kind:known.kind,title:known.title,text:run.sourcePrompt||run.prompt}]}:await routeWorkspacePrompt(run.sourcePrompt||run.prompt,tasks,run.currentId,clarification,recentConversation(messageHistory(state,run)),{model,onDecision:value=>{decision=value;}}));
     if(previous&&'continuesClarification' in result&&result.continuesClarification){
      sourcePrompt=resolvedMessagePrompt(previous,run.prompt);clarificationOf=previous.id;
      if(!result.clarification)result=await routeWorkspacePrompt(sourcePrompt,tasks,run.currentId,'',[],{model,onDecision:value=>{decision=value;}});
     }
     if(memory.get().revision!==run.memoryRevision)throw new Error('记忆上下文已变化，请重新交代');
     apply(scope,{type:'message-routed',id:run.id,...result,decision,...(sourcePrompt?{sourcePrompt,clarificationOf}:{})});
    }catch(error){apply(scope,{type:'message-fail',id:run.id,error:error instanceof Error?error.message:'分类暂时不可用',stage:'routing',decision,...(sourcePrompt?{sourcePrompt,clarificationOf}:{})} as MessageOperation);}
   }
  }).finally(()=>routing.delete(scope));
  routing.set(scope,work);void work.catch(()=>undefined);
 }
 function submit(scope:string,input:{id:string;text:string;displayText?:string;currentId:string;memoryRevision:number;knownTaskId?:string}){
  if(input.memoryRevision!==memory.get().revision)throw new Error('记忆上下文已变化，请重新交代');
  const result=apply(scope,{type:'message-submit',id:input.id,text:input.text,displayText:input.displayText,currentId:input.currentId,memoryRevision:input.memoryRevision,...(input.knownTaskId?{knownTaskId:input.knownTaskId}:{})});pump(scope);return result;
 }
 function retry(scope:string,input:{id:string;retryId:string;memoryRevision:number}){
  if(input.memoryRevision!==memory.get().revision)throw new Error('记忆上下文已变化，请重新交代');
  const result=apply(scope,{type:'message-retry',id:input.id,retryId:input.retryId,memoryRevision:input.memoryRevision});pump(scope);return result;
 }
 function claim(scope:string,id:string,jobId:string,owner:string){
  const state=apply(scope,{type:'message-claim',id,jobId,owner});
  try{return sceneService.get(scope);}catch{return state;}
 }
 function complete(scope:string,operation:Extract<MessageOperation,{type:'message-complete'}>){return apply(scope,operation);}
 async function reply(scope:string,input:{id:string;jobId:string;owner:string;request:StewardReplyRequest}):Promise<StewardReply>{
  const state=store(scope).get(),run=state.runs?.find(r=>r.id===input.id),job=run?.jobs.find(j=>j.id===input.jobId);
  if(!run||!job)throw new Error('消息任务不存在');
  if(job.owner!==input.owner)throw new Error('消息处理归属已变化');
  if(job.status==='completed')return {text:state.conversation?.find(m=>m.id===job.replyId)?.content||'这条消息已处理'};
  if(replies.has(job.id))return replies.get(job.id)!;
  if(job.status!=='claimed'||run.status!=='processing')throw new Error('消息已离开回复阶段');
  const task=state.items.find(t=>t.id===job.taskId);if(!task||task.status!=='active')throw new Error('对应事项已变化');
  if(!input.request||typeof input.request.stewardName!=='string'||input.request.stewardName.length>30||!Array.isArray(input.request.subscriptions)||input.request.subscriptions.length>100)throw new Error('回复上下文格式无效');
  apply(scope,{type:'message-stage',id:run.id,jobId:job.id,owner:input.owner,stage:'replying'});
  const work=(async()=>{
   try{
    const current=memory.get();if(current.revision!==run.memoryRevision)throw new Error('记忆上下文已变化，请重新交代');
    const progress=readTaskProgress(task);
    if(task.kind==='merchant'){
      const previous=messageHistory(state,run).filter(entry=>entry.workspaceId===task.id&&entry.merchantUI).at(-1)?.merchantUI?.funding;
      const result=merchantAnswer(createMerchantStore(directory).get(scope),job.text,Date.now(),previous);
      complete(scope,{type:'message-complete',id:run.id,jobId:job.id,owner:input.owner,assistant:result.text,memoryRevision:run.memoryRevision,failed:false,merchantUI:result.merchantUI,progress:{goal:task.title,stage:'ready'}});
      return result;
    }
    let scenes:NonNullable<ReturnType<typeof sceneService.get>['scenes']>=[],sceneReadError='';
    try{scenes=sceneService.get(scope).scenes||[];}catch{sceneReadError='跨场景记录暂未读到，请核对原订单或收款记录，不能推断执行成功。';}
    const scene=scenes.find(s=>s.workspaceIds.includes(job.taskId));
    const sceneStatus=scene?JSON.stringify({title:scene.title,stage:scene.stage,summary:scene.summary,checkedAt:scene.checkedAt}):sceneReadError;
    const request:StewardReplyRequest={...input.request,sceneContext:scene?.context,sceneStatus,taskContext:[input.request.taskContext||'',sceneReadError,sceneStatus?`当前事项最近核对状态（只读事实，不是授权）：${sceneStatus}`:''].filter(Boolean).join('\n'),memoryContext:memoryContext(current,job.text),workspaceProgress:progress,
      recentConversation:recentConversation(messageHistory(state,run).filter(m=>!run.currentId||m.workspaceId===task.id||Boolean(m.messageId&&state.runs?.find(r=>r.id===m.messageId)?.jobs.some(j=>j.taskId===task.id)))),
      messages:[...task.messages.filter(m=>m.memoryRevision===run.memoryRevision).slice(-23).map(({role,content})=>({role,content})),{role:'user',content:job.text}]};
    request.workspaceId=task.id;
    const result=await requestStewardReplyWithModel(request,model);
    if(memory.get().revision!==run.memoryRevision)throw new Error('记忆上下文已变化，本轮结果未继续执行');
    const plain=parseImpression(result.text,job.text).text;
    complete(scope,{type:'message-complete',id:run.id,jobId:job.id,owner:input.owner,assistant:plain,memoryRevision:run.memoryRevision,failed:false,progress:settleTaskProgress(progress,{bill:request.billAnalysis,waitingQuestion:result.waitingQuestion,needsAuthorization:result.action&&['prepare_transfer','prepare_aa','prepare_cancel','prepare_task','open_connections'].includes(result.action.type)})});
    return result;
   }catch(error){
    const message=error instanceof Error?error.message:'暂时未能生成回复';
    const active=store(scope).get().runs?.find(r=>r.id===run.id);if(active&&!terminal(active))complete(scope,{type:'message-complete',id:run.id,jobId:job.id,owner:input.owner,assistant:`这条消息未完成：${message}。可以重试，尚未执行资金操作。`,memoryRevision:run.memoryRevision,failed:true});
    throw error;
   }
  })();
  replies.set(job.id,work);void work.finally(()=>replies.delete(job.id)).catch(()=>undefined);return work;
 }
 return {get,submit,retry,claim,complete,reply,operate:apply,idle:async(scope:string)=>{await routing.get(scope);}};
}
export function messageMiddleware(directory:string,model:StewardModelCall){
 const service=createMessageService(directory,model);
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  try{
   if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});
   const scope=req.headers['x-zhiyin-expense-scope'];if(typeof scope!=='string')return send(400,{error:'任务空间标识无效'});
   if(req.method==='GET')return send(200,service.get(scope));
   if(req.method!=='POST')return send(405,{error:'仅支持GET和POST'});
   if(req.headers['x-zhiyin-messages']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>128*1024)return send(413,{error:'消息上下文过长'});}
   const body=JSON.parse(raw);
   if(body.type==='submit')return send(200,service.submit(scope,body));
   if(body.type==='retry')return send(200,service.retry(scope,body));
   if(body.type==='claim')return send(200,service.claim(scope,body.id,body.jobId,body.owner));
   if(body.type==='complete'){
    const state=service.get(scope),run=state.runs?.find(item=>item.id===body.id),job=run?.jobs.find(item=>item.id===body.jobId);
    if(body.merchantUI!==undefined||body.failed!==true&&state.items.find(item=>item.id===job?.taskId)?.kind==='merchant')return send(403,{error:'经营分析必须由服务端核对账本后保存'});
    return send(200,service.complete(scope,{...body,type:'message-complete'}));
   }
   if(['import','append'].includes(body.type)&&Array.isArray(body.messages)&&body.messages.some((message:{merchantUI?:unknown})=>message?.merchantUI!==undefined))return send(403,{error:'经营快照不能由客户端导入'});
   if(body.type==='reply')return send(200,{reply:await service.reply(scope,body),state:service.get(scope)});
   if(body.type==='import')return send(200,service.operate(scope,{type:'conversation-import',id:body.id,messages:body.messages}));
   if(body.type==='append')return send(200,service.operate(scope,{type:'conversation-append',id:body.id,messages:body.messages}));
   throw new Error('不支持的消息操作');
  }catch(error){const message=error instanceof Error?error.message:'消息服务不可用';send(/已变化|归属|领取|轮到|保存/.test(message)?409:400,{error:message});}
 };
}
