import {useState,type ReactNode} from 'react';
import {Bell,Cake,CalendarCheck,ChevronDown,ChevronLeft,ChevronRight,Repeat2,ArrowUpRight,Check,ArrowLeftRight} from 'lucide-react';
import {calendarDays,dayKey,timeLabel,type CalendarEvent} from '../lib/task-calendar';
import {formatCny} from '../lib/financial-connections';

export const calendarKinds={reminder:'提醒',birthday:'生日',transfer:'银行预约',renewal:'订阅续费',occasion:'生活筹备'};
const icons={reminder:Bell,birthday:Cake,transfer:ArrowLeftRight,renewal:Repeat2,occasion:CalendarCheck};
const statuses:Record<string,string>={pending:'待处理',completed:'已完成',cancelled:'已取消',failed:'执行失败'};
export const calendarDateLabel=(day:string)=>`${Number(day.slice(5,7))}月${Number(day.slice(8))}日`;
export function calendarStatus(event:CalendarEvent){
 if(event.status!=='pending')return statuses[event.status]??'状态待核对';
 if(event.kind==='birthday')return '每年公历';
 if(event.kind==='renewal')return event.dueAt<Date.now()?'扣费结果待核实':'预计续费';
 if(event.kind==='transfer')return '等待执行';
 return event.kind==='reminder'&&event.dueAt<Date.now()?'待你处理':'待处理';
}

export function CalendarDatePicker({month,selected,today,events,onPick,onMove}:{month:string;selected:string;today:string;events:CalendarEvent[];onPick:(day:string)=>void;onMove:(delta:number)=>void}){
 const [expanded,setExpanded]=useState(true);
 const days=calendarDays(month),weekStart=Math.floor(days.indexOf(selected)/7)*7;
 const shown=expanded?days:days.slice(weekStart,weekStart+7);
 return <div className="task-month">
  <div className="task-month-nav"><h2>{Number(month.slice(0,4))}年 <strong>{Number(month.slice(5))}月</strong></h2><div><button type="button" aria-label="上个月" onClick={()=>onMove(-1)}><ChevronLeft size={18} aria-hidden="true"/></button><button type="button" onClick={()=>onPick(today)}>今天</button><button type="button" aria-label="下个月" onClick={()=>onMove(1)}><ChevronRight size={18} aria-hidden="true"/></button></div></div>
  <div className="task-weekdays" aria-hidden="true">{['一','二','三','四','五','六','日'].map(d=><span key={d}>{d}</span>)}</div>
  <div className="task-days" role="group" aria-label="选择日期">{shown.map(day=>{
   const items=events.filter(e=>dayKey(e.dueAt)===day&&e.status!=='cancelled');
   return <button type="button" key={day} aria-label={`${day}${items.length?`，${items.length}项安排`:''}`} aria-pressed={day===selected} aria-current={day===today?'date':undefined} className={`${day.slice(0,7)!==month?'outside':''} ${day===selected?'selected':''} ${day===today?'today':''}`} onClick={()=>onPick(day)}><span>{Number(day.slice(8))}</span><span className="task-dots" aria-hidden="true">{[...new Set(items.map(e=>e.kind))].slice(0,3).map(kind=><i key={kind} className={kind}/>)}</span></button>;
  })}</div>
  <button type="button" className="task-month-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起月历':'展开月历'}<ChevronDown size={14} aria-hidden="true"/></button>
 </div>;
}

type EventProps={event:CalendarEvent;expanded:boolean;busy:boolean;confirmCancel:boolean;onToggle:()=>void;onEdit:()=>void;onComplete:()=>void;onCancel:()=>void;onConfirmCancel:()=>void;onKeep:()=>void;onOpen?:()=>void};
export function CalendarEventCard({event,expanded,busy,confirmCancel,onToggle,onEdit,onComplete,onCancel,onConfirmCancel,onKeep,onOpen}:EventProps){
 const Icon=icons[event.kind],status=calendarStatus(event);
 const action=event.kind==='transfer'?'管理预约转账':event.kind==='renewal'?'查看订阅':'核对筹备安排';
 const source=event.kind==='renewal'?(event.source==='wechat_pay'?'微信支付':event.source==='alipay'?'支付宝':'已授权平台'):event.kind==='transfer'?'银行预约记录':event.kind==='occasion'?'生活筹备方案':'知银日历';
 return <article className={`task-event ${event.status} kind-${event.kind}`}>
  <button type="button" className="task-event-summary" aria-expanded={expanded} onClick={onToggle}>
   <time dateTime={new Date(event.dueAt).toISOString()}>{event.allDay?'全天':timeLabel(event.dueAt)}</time>
   <span className="task-event-content"><strong>{event.title}</strong><small><Icon size={13} aria-hidden="true"/>{calendarKinds[event.kind]}<span className="task-event-status">{status}</span></small>{event.amount!==undefined&&<span className="task-event-amount">{formatCny(event.amount)}<span>{event.kind==='renewal'?'预计扣费':'预约金额'}</span></span>}</span>
   <ChevronDown className="task-event-chevron" size={17} aria-hidden="true"/>
  </button>
  {expanded&&<div className="task-event-detail">
   <dl><div><dt>时间</dt><dd>{dayKey(event.dueAt)} {event.allDay?'全天':`${timeLabel(event.dueAt)} · 北京时间`}</dd></div><div><dt>来源</dt><dd>{source}{event.kind==='birthday'?' · 每年重复':''}</dd></div></dl>
   <p>{event.note||(event.kind==='birthday'?'每年按公历日期保留这份生日安排。':'到时在知银内提醒你，不会自动执行资金操作。')}</p>
   {(event.kind==='reminder'||event.kind==='birthday')&&event.status==='pending'&&<div className="task-actions">{event.kind==='reminder'&&<button type="button" disabled={busy} onClick={onComplete}><Check size={16} aria-hidden="true"/>标记完成</button>}<button type="button" disabled={busy} onClick={onEdit}>修改</button><button type="button" className="task-cancel-action" disabled={busy} onClick={onCancel}>{event.kind==='birthday'?'取消生日记录':'取消提醒'}</button></div>}
   {onOpen&&<button type="button" className="task-business-action" onClick={onOpen}>{action}<ArrowUpRight size={16} aria-hidden="true"/></button>}
   {confirmCancel&&event.status==='pending'&&(event.kind==='reminder'||event.kind==='birthday')&&<div className="task-cancel"><p>{event.kind==='birthday'?'取消后不再列入每年的生日安排。':'取消后将不再提醒。'}</p><button type="button" disabled={busy} onClick={onConfirmCancel}>确认取消</button><button type="button" disabled={busy} onClick={onKeep}>保留</button></div>}
  </div>}
 </article>;
}

export function CalendarAgendaGroup({day,children}:{day:string;children:ReactNode}){return <section className="task-agenda-group" aria-label={`${calendarDateLabel(day)}安排`}><h3>{calendarDateLabel(day)}<span>{['周日','周一','周二','周三','周四','周五','周六'][new Date(`${day}T00:00:00Z`).getUTCDay()]}</span></h3>{children}</section>;}
