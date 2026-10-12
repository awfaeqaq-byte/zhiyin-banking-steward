import {validateRoutes,type Workspace,type WorkspaceRoute} from './workspaces';
import {WECHAT_SHARE_PREFIX,sharedTextPreview} from './wechat-message-share';
export type RoutingSegment={id:number;start:number;end:number;text:string};
export function routingSegments(prompt:string):RoutingSegment[]{
 if(prompt.startsWith(WECHAT_SHARE_PREFIX))return [{id:0,start:0,end:prompt.length,text:prompt}];
 const result:RoutingSegment[]=[];const pattern=/[^，,；;\n]+/g;
 for(const match of prompt.matchAll(pattern)){const text=match[0].trim();if(text){const start=match.index!+match[0].indexOf(text);result.push({id:result.length,start,end:start+text.length,text});}}
 return result;
}
/** Only the system reconstructs text. The classifier cannot replace amounts,
 * quote envelopes or instructions with text recalled from earlier turns. */
export function materializeRoutes(value:unknown,prompt:string,tasks:Workspace[]):{parts:WorkspaceRoute[];clarification?:string}{
 const data=value as {parts?:Array<{taskId:string|null;kind:WorkspaceRoute['kind'];title:string;segmentIds?:number[]}>;clarification?:string};
 if(!data||!Array.isArray(data.parts)||!data.parts.length&& !data.clarification)return validateRoutes(value,prompt,tasks);
 if(data.clarification)return validateRoutes(value,prompt,tasks);
 const segments=routingSegments(prompt);if(!segments.length)throw new Error('消息内容不能为空');
 if(prompt.startsWith(WECHAT_SHARE_PREFIX)&&(!sharedTextPreview(prompt)||data.parts.length!==1))throw new Error('微信分享材料必须完整处理，请先说明本次的一件事');
 if(data.parts.length===1){
  const ids=data.parts[0]?.segmentIds;if(ids!==undefined&&(!Array.isArray(ids)||ids.length!==segments.length||ids.some((id,index)=>id!==index)))throw new Error('分类未覆盖全部消息片段，需重新理解');
  return validateRoutes({parts:[{...data.parts[0],text:prompt}]},prompt,tasks);
 }
 let cursor=0;
 const parts=data.parts.map(part=>{
  const ids=part.segmentIds;
  if(!Array.isArray(ids)||!ids.length||ids.some((id,index)=>!Number.isSafeInteger(id)||id!==cursor+index)||ids.at(-1)!>=segments.length)throw new Error('分类片段编号无效，需重新理解这几件事');
  const start=segments[ids[0]].start,end=segments[ids.at(-1)!].end;cursor+=ids.length;
  return {...part,text:prompt.slice(start,end)};
 });
 if(cursor!==segments.length)throw new Error('分类未覆盖全部消息片段，需重新理解');
 return validateRoutes({parts},prompt,tasks);
}
export function conversationRoute(prompt:string,tasks:Workspace[],currentId:string):{parts:WorkspaceRoute[];clarification?:string}|null{
 const current=tasks.find(t=>t.id===currentId&&t.status==='active');
 const greeting=/^(?:你好(?:呀|啊|宁宁|阿衡)?|您好|嗨|哈喽|hello|hi|早上好|下午好|晚上好|早安|晚安|谢谢(?:你)?|在吗|你在吗|你说话啊|说话呀)[，。！!？?\s]*$/i.test(prompt.trim());
 const answer=Boolean(current?.progress?.waitingFor)&&/^(?:对|对的|是|是的|没错|嗯|嗯嗯|好的|好|可以|继续|不要|不用|不需要|不是|不对)[。！!\s]*$/.test(prompt.trim());
 const memoryAnswer=current?.kind==='general'&&/^(?:记忆|记住|帮我记住|记下来|帮我记下来|记录到日历|记到日历)[。！!\s]*$/.test(prompt.trim())&&current.messages.some(m=>m.role==='user'&&sharedTextPreview(m.content)?.messages.some(source=>/我(?:的)?生日/.test(source.原文)));
 if(!greeting&&!answer&&!memoryAnswer)return null;
 const task=answer||memoryAnswer?current:current?.kind==='general'?current:tasks.filter(t=>t.kind==='general'&&t.status==='active').at(-1);
 return {parts:[{taskId:task?.id??null,kind:task?.kind??'general',title:task?.title??'日常交流',text:prompt}]};
}
