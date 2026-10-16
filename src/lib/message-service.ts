import {validWorkspaces,type WorkspaceState} from './workspaces';
import type {StewardReply,StewardReplyRequest} from './steward-chat';
import type {ConversationEntry} from './message-flow';
export type MessageClientOperation=
 |{type:'submit';id:string;text:string;displayText?:string;currentId:string;memoryRevision:number;knownTaskId?:string}
 |{type:'retry';id:string;retryId:string;memoryRevision:number}
 |{type:'claim';id:string;jobId:string;owner:string}
 |{type:'complete';id:string;jobId:string;owner:string;assistant:string;memoryRevision:number;failed:boolean;progress?:import('./task-progress').TaskProgress}
 |{type:'import'|'append';id:string;messages:ConversationEntry[]};
function headers(){let scope=localStorage.getItem('zhiyin-expense-scope');if(!scope){scope=crypto.randomUUID();localStorage.setItem('zhiyin-expense-scope',scope);}return {'Content-Type':'application/json','X-Zhiyin-Messages':'1','X-Zhiyin-Expense-Scope':scope};}
async function perform(body?:object){
 const init:RequestInit={method:body?'POST':'GET',headers:headers(),...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body&&'type' in body&&body.type==='reply'?60000:15000)};
 let response:Response;try{response=await fetch('/api/zhiyin/messages',init);}catch(error){if(!body)throw error;response=await fetch('/api/zhiyin/messages',init);}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'消息暂时未能保存，请重试');return data;
}
export async function messageStateRequest(operation?:MessageClientOperation):Promise<WorkspaceState>{const state=await perform(operation);if(!validWorkspaces(state))throw new Error('消息记录格式无效，原记录已保留');return state;}
export async function messageReplyRequest(input:{id:string;jobId:string;owner:string;request:StewardReplyRequest}):Promise<{reply:StewardReply;state:WorkspaceState}>{
 const data=await perform({type:'reply',...input});if(!validWorkspaces(data.state)||!data.reply||typeof data.reply.text!=='string')throw new Error('回复结果格式无效');return data;
}
