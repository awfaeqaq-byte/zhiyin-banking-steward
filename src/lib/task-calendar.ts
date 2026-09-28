import {bankRecipients,type BankSchedule} from './bank-transfer';
import type {ConnectedFinancialSource} from './financial-connections';

export type ReminderDraft={title:string;dueAt:number;note?:string};
export type Reminder=ReminderDraft&{id:string;status:'pending'|'completed'|'cancelled';createdAt:number;updatedAt:number};
export type TaskState={revision:number;tasks:Reminder[]};
export type TaskCommand={revision:number;id:string}&({type:'save'}&ReminderDraft|{type:'status';status:Reminder['status']});
export type CalendarEvent={id:string;title:string;dueAt:number;kind:'reminder'|'transfer'|'renewal';status:string;note?:string;amount?:number;source?:string;sourceId?:string};
export const dayKey=(time:number)=>new Date(time+8*3600000).toISOString().slice(0,10);
export const timeLabel=(time:number)=>new Date(time+8*3600000).toISOString().slice(11,16);
export const localTaskTime=(time:number)=>`${dayKey(time)}T${timeLabel(time)}`;
export function calendarDays(month:string){
 const start=new Date(`${month}-01T00:00:00Z`);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 const offset=(start.getUTCDay()+6)%7;const count=Math.ceil((offset+end.getUTCDate())/7)*7;
 return Array.from({length:count},(_,i)=>new Date(start.getTime()+(i-offset)*86400000).toISOString().slice(0,10));
}
export function validReminderDraft(value:unknown):value is ReminderDraft{
 if(!value || typeof value!=='object')return false;
 const v=value as ReminderDraft;
 return typeof v.title==='string' && v.title.trim().length>0 && v.title.length<=80 && ![...v.title].some(c=>c.charCodeAt(0)<32||'|[]'.includes(c)) && Number.isSafeInteger(v.dueAt) && v.dueAt>0 && v.dueAt<4102444800000 && (v.note===undefined || typeof v.note==='string'&&v.note.length<=500);
}
export function validTaskState(value:unknown):value is TaskState{
 if(!value || typeof value!=='object')return false;const s=value as TaskState;
 return Number.isSafeInteger(s.revision)&&s.revision>=0&&Array.isArray(s.tasks)&&s.tasks.length<=1000&&new Set(s.tasks.map(t=>t?.id)).size===s.tasks.length&&s.tasks.every(t=>validReminderDraft(t)&&typeof t.id==='string'&&['pending','completed','cancelled'].includes(t.status)&&Number.isSafeInteger(t.createdAt)&&Number.isSafeInteger(t.updatedAt));
}
export function updateTasks(state:TaskState,command:TaskCommand,now=Date.now()):TaskState{
 if(!command || command.revision!==state.revision)throw new Error('日程已变化，请刷新后重试');
 if(typeof command.id!=='string'||!/^[\w-]{1,80}$/.test(command.id))throw new Error('任务编号无效');
 const existing=state.tasks.find(t=>t.id===command.id);let next:Reminder;
 if(command.type==='save'){
  if(!validReminderDraft(command)||command.dueAt<=now)throw new Error('请填写任务名称和未来的提醒时间');
  if(existing&&existing.status!=='pending')throw new Error('已结束的任务不能修改，请新建提醒');
  if(!existing&&state.tasks.length>=1000)throw new Error('日程数量已达上限');
  next={id:command.id,title:command.title.trim(),dueAt:command.dueAt,note:command.note?.trim()||'',status:'pending',createdAt:existing?.createdAt??now,updatedAt:now};
 }else if(command.type==='status'&&['completed','cancelled'].includes(command.status)){
  if(!existing||existing.status!=='pending')throw new Error('任务不存在或已经结束');
  next={...existing,status:command.status,updatedAt:now};
 }else throw new Error('不支持的日程操作');
 return {revision:state.revision+1,tasks:existing?state.tasks.map(t=>t.id===next.id?next:t):[...state.tasks,next]};
}
export function calendarEvents(tasks:Reminder[],schedules:BankSchedule[],sources:ConnectedFinancialSource[]):CalendarEvent[]{
 return [
  ...tasks.map(t=>({...t,kind:'reminder' as const})),
  ...schedules.map(t=>({id:`transfer:${t.id}`,sourceId:t.id,title:`转账给${bankRecipients.find(r=>r.id===t.recipientId)?.name??'收款人'}`,dueAt:t.executeAt,kind:'transfer' as const,status:t.status,amount:t.amount,note:t.error||'预约转账会由银行系统到期执行；此处展示最新状态。'})),
  ...sources.filter(s=>s.scopes.includes('autopay')).flatMap(s=>s.autopays.filter(a=>Number.isSafeInteger(a.nextChargeAt)&&a.nextChargeAt!>0&&a.nextChargeAt!<4102444800000&&!s.cancelledAutopayIds?.includes(a.id)).map(a=>({id:`renewal:${s.provider}:${a.id}`,sourceId:a.id,source:s.provider,title:a.title,dueAt:a.nextChargeAt!,kind:'renewal' as const,status:'pending',amount:a.amount,note:`${s.displayName} · 下次预计扣费，实际结果以平台账单为准。`}))),
 ].sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id));
}
export async function taskRequest(command?:TaskCommand):Promise<TaskState>{
 const res=await fetch('/api/zhiyin/tasks',{method:command?'POST':'GET',headers:command?{'Content-Type':'application/json','X-Zhiyin-Tasks':'1'}:undefined,body:command?JSON.stringify(command):undefined,signal:AbortSignal.timeout(8000)});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'日程暂时不可用，请重试');if(!validTaskState(data))throw new Error('日程数据无效');return data;
}
