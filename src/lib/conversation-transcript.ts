import type {ConversationEntry,MessageRun} from './message-flow';

/** Presentation only. Keep stored history intact; use explicit turn IDs, never similar wording, to pair replies. */
export function conversationTranscript<T extends ConversationEntry>(messages:T[],runs:MessageRun[]=[]):T[]{
 const status=new Map(runs.map(run=>[run.id,run.status]));
 const lastFailure=new Map<string,string>();
 const failure=(message:T)=>message.role==='assistant'&&message.messageId&&message.content.startsWith('这条消息未完成：');
 for(const message of messages)if(failure(message))lastFailure.set(message.messageId!,message.id);
 const visible=messages.filter(message=>{
  if(!failure(message))return true;
  const phase=status.get(message.messageId!);
  return (!phase||phase==='failed'||phase==='interrupted')&&lastFailure.get(message.messageId!)===message.id;
 });
 const turn=(message:T)=>message.messageId||(message.role==='user'&&message.id.startsWith('user-')?message.id.slice(5):undefined);
 const originals=new Set(visible.filter(m=>m.role==='user').map(turn).filter(Boolean));
 const answers=new Map<string,T[]>();
 for(const message of visible)if(message.role==='assistant'&&message.messageId&&originals.has(message.messageId)){
  answers.set(message.messageId,[...(answers.get(message.messageId)||[]),message]);
 }
 return visible.flatMap(message=>{
  if(message.role==='assistant'&&message.messageId&&originals.has(message.messageId))return [];
  return [message,...(message.role==='user'?answers.get(turn(message)||'')||[]:[])];
 });
}
