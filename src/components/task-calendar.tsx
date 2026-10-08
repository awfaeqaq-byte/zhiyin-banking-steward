/* Existing-world extension: a compact month above a day agenda, teal selection and real task states.
 * Selecting a day reveals its arrangements; reminders never authorize payments. */
import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Plus,Check,ArrowUpRight,Clock3,X} from 'lucide-react';
import {calendarDays,calendarEvents,dayKey,timeLabel,localTaskTime,taskRequest,type CalendarEvent,type ReminderDraft,type TaskState,type TaskCommand} from '../lib/task-calendar';
import type {BankSchedule} from '../lib/bank-transfer';
import type {OccasionPlan} from '../lib/occasion-plans';
import {formatCny,type ConnectedFinancialSource} from '../lib/financial-connections';
import './task-calendar.css';

type Props={schedules:BankSchedule[];sources:ConnectedFinancialSource[];occasions?:OccasionPlan[];onOpenOccasion?:(id:string)=>void;bankError?:string;sourceError?:string;draft?:ReminderDraft|null;initialDate?:number;onDraftConsumed:()=>void;onOpenTransfers:()=>void;onOpenSubscription:(source:string,id:string)=>void};
const statuses:Record<string,string>={pending:'待处理',completed:'已完成',cancelled:'已取消',failed:'执行失败'};
const kinds={reminder:'提醒',transfer:'银行预约',renewal:'订阅续费',occasion:'生活筹备'};
export function TaskCalendar({schedules,sources,occasions,onOpenOccasion,bankError,sourceError,draft,initialDate,onDraftConsumed,onOpenTransfers,onOpenSubscription}:Props){
 const [selected,setSelected]=useState(dayKey(draft?.dueAt??initialDate??Date.now()));
 const [month,setMonth]=useState(selected.slice(0,7));
 const [state,setState]=useState<TaskState|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<string|null>(draft?'new':null);const [title,setTitle]=useState(draft?.title??'');const [when,setWhen]=useState(draft?localTaskTime(draft.dueAt):'');const [note,setNote]=useState(draft?.note??'');
 const [detail,setDetail]=useState<string|null>(null);const [cancelId,setCancelId]=useState<string|null>(null);
 const newId=useRef(crypto.randomUUID());
 async function refresh(){try{const next=await taskRequest();setState(prev=>prev&&prev.revision>next.revision?prev:next);setError('');}catch(e){setError(e instanceof Error?e.message:'加载失败，请重试');}}
 useEffect(()=>{void refresh();const refreshOnFocus=()=>void refresh();window.addEventListener('focus',refreshOnFocus);window.addEventListener('zhiyin-phone-foreground',refreshOnFocus);return()=>{window.removeEventListener('focus',refreshOnFocus);window.removeEventListener('zhiyin-phone-foreground',refreshOnFocus);};},[]);
 const events=useMemo(()=>calendarEvents(state?.tasks??[],schedules,sources,occasions),[state,schedules,sources,occasions]);
 const dayEvents=events.filter(e=>dayKey(e.dueAt)===selected);
 const today=dayKey(Date.now());
 function pickDay(day:string){setSelected(day);setMonth(day.slice(0,7));setDetail(null);}
 function moveMonth(delta:number){const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);pickDay(date.toISOString().slice(0,10));}
 function startEdit(event?:CalendarEvent){if(!event)newId.current=crypto.randomUUID();setEditing(event?.id??'new');setTitle(event?.title??'');setNote(event?.note??'');setWhen(event?localTaskTime(event.dueAt):selected===today?localTaskTime(Date.now()+3600000):`${selected}T09:00`);setError('');}
 async function change(command:TaskCommand){setBusy(true);setError('');try{const next=await taskRequest(command);setState(next);setEditing(null);setCancelId(null);onDraftConsumed();window.dispatchEvent(new Event('zhiyin-tasks-updated'));return true;}catch(e){setError(e instanceof Error?e.message:'保存失败，请重试');try{setState(await taskRequest());}catch{/* Keep the user's form when offline. */}return false;}finally{setBusy(false);}}
 async function save(){if(!state||busy)return;const dueAt=Date.parse(`${when}:00+08:00`);if(await change({type:'save',revision:state.revision,id:editing==='new'?newId.current:editing!,title,note,dueAt}))pickDay(dayKey(dueAt));}
 function status(id:string,status:'completed'|'cancelled'){if(state)void change({type:'status',revision:state.revision,id,status});}
 return <section className="task-calendar" aria-label="任务日历">
  <div className="task-toolbar"><p>让安排有迹可循</p><button className="task-primary" disabled={!state||busy} onClick={()=>startEdit()}><Plus size={17}/>添加提醒</button></div>
  {(error||bankError||sourceError)&&<div className="task-error" role="alert">{error||'部分业务日程暂时无法更新，请稍后再试。'}{error&&<button onClick={()=>void refresh()}>重新加载</button>}</div>}
  <div className="task-calendar-layout">
   <div className="task-month">
    <div className="task-month-nav"><h2>{Number(month.slice(0,4))}年 {Number(month.slice(5))}月</h2><div><button aria-label="上个月" onClick={()=>moveMonth(-1)}><ChevronLeft size={20}/></button><button onClick={()=>pickDay(today)}>今天</button><button aria-label="下个月" onClick={()=>moveMonth(1)}><ChevronRight size={20}/></button></div></div>
    <div className="task-weekdays" aria-hidden="true">{['一','二','三','四','五','六','日'].map(d=><span key={d}>{d}</span>)}</div>
    <div className="task-days">{calendarDays(month).map(day=>{const items=events.filter(e=>dayKey(e.dueAt)===day&&e.status!=='cancelled');return <button key={day} aria-label={`${day}${items.length?`，${items.length}项安排`:''}`} aria-pressed={day===selected} aria-current={day===today?'date':undefined} className={`${day.slice(0,7)!==month?'outside':''} ${day===selected?'selected':''} ${day===today?'today':''}`} onClick={()=>pickDay(day)}><span>{Number(day.slice(8))}</span><span className="task-dots">{[...new Set(items.map(e=>e.kind))].map(kind=><i key={kind} className={kind}/>)}</span></button>;})}</div>
    <div className="task-legend">{Object.entries(kinds).map(([kind,label])=><span key={kind}><i className={kind}/>{label}</span>)}</div>
   </div>
   <div className="task-agenda">
    <div className="task-agenda-heading"><h2>{selected===today?'今天':`${Number(selected.slice(5,7))}月${Number(selected.slice(8))}日`}</h2><span>{dayEvents.length?`${dayEvents.length} 项安排`:'暂无安排'}</span></div>
    {!state&&!error&&<p role="status">正在加载日程…</p>}
    {state&&!dayEvents.length&&<div className="task-empty"><CalendarDays size={28}/><p>这一天，暂时没有安排。</p><button onClick={()=>startEdit()}>记下一件要做的事<Plus size={16}/></button></div>}
    {dayEvents.map(event=><article className={`task-event ${event.status}`} key={event.id}>
     <button className="task-event-summary" aria-expanded={detail===event.id} onClick={()=>setDetail(detail===event.id?null:event.id)}><time>{timeLabel(event.dueAt)}</time><span><strong>{event.title}</strong><small>{kinds[event.kind]} · {event.kind==='renewal'&&event.dueAt<Date.now()?'扣费结果待核实':event.status==='pending'&&event.dueAt<Date.now()&&event.kind==='reminder'?'待你处理':event.kind==='transfer'&&event.status==='pending'?'等待执行':statuses[event.status]}</small></span><span className="task-event-end">{event.amount!==undefined?formatCny(event.amount):<Clock3 size={17}/>}<ChevronRight size={16}/></span></button>
     {detail===event.id&&<div className="task-event-detail"><p>{event.note||'到时在知银内提醒你，不会自动执行资金操作。'}</p>{event.kind==='reminder'&&event.status==='pending'&&<div className="task-actions"><button disabled={busy} onClick={()=>status(event.id,'completed')}><Check size={16}/>标记完成</button><button disabled={busy} onClick={()=>startEdit(event)}>修改</button><button disabled={busy} onClick={()=>setCancelId(event.id)}>取消提醒</button></div>}{event.kind==='transfer'&&<button onClick={onOpenTransfers}>管理预约转账<ArrowUpRight size={16}/></button>}{event.kind==='renewal'&&<button onClick={()=>onOpenSubscription(event.source!,event.sourceId!)}>查看订阅<ArrowUpRight size={16}/></button>}{cancelId===event.id&&<div className="task-cancel">取消后将不再提醒。<button disabled={busy} onClick={()=>status(event.id,'cancelled')}>确认取消</button><button disabled={busy} onClick={()=>setCancelId(null)}>保留</button></div>}</div>}
     {detail===event.id&&event.kind==='occasion'&&onOpenOccasion&&<div className="task-event-detail"><button onClick={()=>onOpenOccasion(event.sourceId!)}>核对筹备安排<ArrowUpRight size={16}/></button></div>}
    </article>)}
   </div>
  </div>
  {editing&&<form className="task-editor" onSubmit={e=>{e.preventDefault();void save();}}><div className="task-agenda-heading"><h2>{editing==='new'?'添加提醒':'修改提醒'}</h2><button type="button" aria-label="关闭提醒编辑" disabled={busy} onClick={()=>{setEditing(null);onDraftConsumed();}}><X size={20}/></button></div><label>要做什么<input autoFocus required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：核对这个月的信用卡账单"/></label><label>提醒时间（北京时间）<input required type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label><label>补充说明（选填）<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)} rows={2}/></label><p>保存为知银内的提醒，不会自动转账或扣费。</p><button className="task-primary" disabled={busy||!state}>{busy?'正在保存…':'确认保存提醒'}</button></form>}
  <p className="task-footnote">北京时间 · 仅显示已知安排。提醒在知银内查看，暂不发送系统推送。</p>
 </section>;
}
