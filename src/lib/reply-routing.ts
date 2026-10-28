import type {Workspace,WorkspaceRoute} from './workspaces';
import type {StewardChatMessage} from './steward-chat';
import {recentConversation} from './conversation-context';
import {materializeRoutes} from './route-decision';
import {resolvedMessagePrompt,type MessageRun} from './message-flow';

type ReplyRoute={parts:WorkspaceRoute[];clarification?:string};
const shortAnswer=/^(?:对|对的|是|是的|没错|嗯|嗯嗯|好的|好|可以|继续|不要|不用|不需要|不是|不对|都执行|两笔都执行|都保留|两笔都保留|都要)[。！!\s]*$/;
const pluralAnswer=/^(?:都执行|两笔都执行|都保留|两笔都保留|都要)[。！!\s]*$/;
const pluralQuestion=/(?:两笔|这几笔|两件|这几件|两个|这几个|以上).{0,12}(?:都|一起)|(?:都|一起).{0,8}(?:执行|保留|安排|办理)/;
const questionText=(text:string)=>/[？?]/.test(text)||/(?:对吗|是否|要不要|需不需要|还是)/.test(text);
const ask=():ReplyRoute=>({parts:[],clarification:'你是在确认哪件事？请告诉我事项名称，或说明要继续哪一笔安排。'});

/** Resolve the question's owner, never turn a short answer into payment permission. */
export function shortReplyRoute(prompt:string,tasks:Workspace[],currentId:string,recent:StewardChatMessage[]):ReplyRoute|null {
 if(!shortAnswer.test(prompt.trim()))return null;
 const active=tasks.filter(task=>task.status==='active');
 const lastReply=(task:Workspace)=>task.messages.filter(m=>m.memoryRevision===task.memoryRevision).at(-1);
 let owner:Workspace|undefined;
 if(recent.length){
  const latest=recent.at(-1)!;
  if(latest.role!=='assistant')return ask();
  const candidates=active.filter(task=>{
   const last=lastReply(task);
   return last?.role==='assistant'&&recentConversation([last])[0]?.content===recentConversation([latest])[0]?.content;
  });
  if(candidates.length!==1)return ask();
  owner=candidates[0];
 }else owner=active.find(task=>task.id===currentId);
 if(!owner)return ask();
 const last=lastReply(owner);
 if(last&&last.role!=='assistant')return ask();
 const question=owner.progress?.waitingFor?.question||(last?.role==='assistant'&&questionText(last.content)?last.content:'');
 if(!question||pluralAnswer.test(prompt.trim())&&!pluralQuestion.test(question))return ask();
 return {parts:[{taskId:owner.id,kind:owner.kind,title:owner.title,text:prompt}]};
}

/** A single provisional classification can bind the answer to the ORIGINAL
 * request. Referenced older tasks stay untouched; the caller still queues normal
 * preparation and all transaction authorizations remain in the business layer. */
export function clarifiedReplyRoute(previous:MessageRun,answer:string,tasks:Workspace[]):ReplyRoute|null {
 if(!shortAnswer.test(answer.trim())||!previous.clarification||!previous.decision)return null;
 const question=previous.clarification;
 if(pluralAnswer.test(answer.trim())?!pluralQuestion.test(question):!questionText(question)||/还是|或是|或者/.test(question))return null;
 let part:Record<string,unknown>;
 try{
  const data=JSON.parse(previous.decision);
  if(!Array.isArray(data.parts)||data.parts.length!==1||!data.parts[0]||typeof data.parts[0]!=='object')return null;
  // A clarification's provisional segment list was never validated. Rebuild the
  // complete original span ourselves rather than trusting its copied text/IDs.
  part={...data.parts[0]};delete part.segmentIds;delete part.text;
  materializeRoutes({parts:[part]},previous.sourcePrompt||previous.prompt,tasks);
 }catch{return null;}
 const source=resolvedMessagePrompt(previous,answer);
 return materializeRoutes({parts:[part]},source,tasks);
}
