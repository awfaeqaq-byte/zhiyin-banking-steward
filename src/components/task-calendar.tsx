/* 日程组件扩展：沿用首页浅蓝白、墨蓝与青绿。月历定位，议程看状态，详情按需展开。
 * 提醒与生日写入日历；银行、续费和生活筹备沿用原业务核对，不在日历执行付款。 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Plus,MessageCircle,ArrowRight,X,Bell,Cake} from 'lucide-react';
import {calendarEvents,calendarDays,dayKey,localTaskTime,taskRequest,type CalendarEvent,type ReminderDraft,type TaskState,type TaskCommand} from '../lib/task-calendar';
import type {BankCardId,BankSchedule} from '../lib/bank-transfer';
import type {OccasionPlan} from '../lib/occasion-plans';
import type {ConnectedFinancialSource} from '../lib/financial-connections';
import {CalendarDatePicker,CalendarEventCard,CalendarAgendaGroup,calendarKinds,calendarDateLabel} from './calendar-components';
import './task-calendar.css';

type Props={schedules:(BankSchedule & {cardId?:BankCardId})[];sources:ConnectedFinancialSource[];occasions?:OccasionPlan[];onOpenOccasion?:(id:string)=>void;bankError?:string;sourceError?:string;draft?:ReminderDraft|null;initialDate?:number;onDraftConsumed:()=>void;onOpenTransfers:(cardId?:BankCardId)=>void;onOpenSubscription:(source:string,id:string)=>void;stewardName?:string;onDiscuss?:(prompt:string)=>void};
export function TaskCalendar({schedules,sources,occasions,onOpenOccasion,bankError,sourceError,draft,initialDate,onDraftConsumed,onOpenTransfers,onOpenSubscription,stewardName='管家',onDiscuss}:Props){
 const [selected,setSelected]=useState(dayKey(draft?.dueAt??initialDate??Date.now()));
 const [month,setMonth]=useState(selected.slice(0,7));
 const [state,setState]=useState<TaskState|null>(null);const [loadError,setLoadError]=useState('');const [actionError,setActionError]=useState('');const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<string|null>(draft?'new':null);const [title,setTitle]=useState(draft?.title??'');const [when,setWhen]=useState(draft?localTaskTime(draft.dueAt):'');const [note,setNote]=useState(draft?.note??'');
 const [calendarSpec,setCalendarSpec]=useState<Pick<ReminderDraft,'workspaceId'|'allDay'|'repeat'>>({workspaceId:draft?.workspaceId,allDay:draft?.allDay,repeat:draft?.repeat});
 const [detail,setDetail]=useState<string|null>(null);const [cancelId,setCancelId]=useState<string|null>(null);
 const [view,setView]=useState<'day'|'upcoming'>('day');const [filter,setFilter]=useState('all');
 const newId=useRef(crypto.randomUUID());const addButton=useRef<HTMLButtonElement>(null);
 async function refresh(){try{const next=await taskRequest();setState(prev=>prev&&prev.revision>next.revision?prev:next);setLoadError('');}catch(e){setLoadError(e instanceof Error?e.message:'加载失败，请重试');}}
 useEffect(()=>{void refresh();const refreshOnFocus=()=>void refresh();window.addEventListener('focus',refreshOnFocus);window.addEventListener('zhiyin-phone-foreground',refreshOnFocus);window.addEventListener('zhiyin-tasks-updated',refreshOnFocus);return()=>{window.removeEventListener('focus',refreshOnFocus);window.removeEventListener('zhiyin-phone-foreground',refreshOnFocus);window.removeEventListener('zhiyin-tasks-updated',refreshOnFocus);};},[]);
 const events=useMemo(()=>{
  const grid=calendarDays(month),startYear=Number(grid[0].slice(0,4)),endYear=Number(dayKey(Date.parse(`${selected}T00:00:00+08:00`)+30*86400000).slice(0,4));
  const years=new Set([startYear,Number(month.slice(0,4)),Number(grid.at(-1)!.slice(0,4)),endYear]);
  return [...years].flatMap((year,index)=>calendarEvents(state?.tasks??[],schedules,sources,occasions,year).filter(event=>index===0||event.kind==='birthday')).sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id));
 },[state,schedules,sources,occasions,month,selected]);
 const rangeStart=Date.parse(`${selected}T00:00:00+08:00`),rangeEnd=rangeStart+(view==='day'?1:30)*86400000;
 const shown=events.filter(e=>e.dueAt>=rangeStart&&e.dueAt<rangeEnd&&(filter==='all'||e.kind===filter));
 const active=shown.filter(e=>e.status!=='completed'&&e.status!=='cancelled'),ended=shown.filter(e=>e.status==='completed'||e.status==='cancelled');
 const groups=[...new Set(active.map(e=>dayKey(e.dueAt)))];const today=dayKey(Date.now());
 const incomplete=!!(loadError||bankError||sourceError)||!state;
 function pickDay(day:string){setSelected(day);setMonth(day.slice(0,7));setDetail(null);setCancelId(null);}
 function moveMonth(delta:number){const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);pickDay(date.toISOString().slice(0,10));}
 function startEdit(event?:CalendarEvent){setCalendarSpec({...event?.workspaceId?{workspaceId:event.workspaceId}:{},...event?.kind==='birthday'?{allDay:true,repeat:'yearly' as const}:{}});if(!event)newId.current=crypto.randomUUID();setEditing(event?.id??'new');setTitle(event?.title??'');setNote(event?.note??'');setWhen(event?localTaskTime(event.dueAt):selected===today?localTaskTime(Date.now()+3600000):`${selected}T09:00`);setActionError('');}
 function closeEdit(){setEditing(null);setActionError('');onDraftConsumed();addButton.current?.focus();}
 async function change(command:TaskCommand){if(busy)return false;setBusy(true);setActionError('');try{const next=await taskRequest(command);setState(next);setEditing(null);setCancelId(null);onDraftConsumed();window.dispatchEvent(new Event('zhiyin-tasks-updated'));return true;}catch(e){setActionError(e instanceof Error?e.message:'保存失败，请重试');try{const next=await taskRequest();setState(prev=>prev&&prev.revision>next.revision?prev:next);}catch{/* 保留用户输入，允许重试。 */}return false;}finally{setBusy(false);}}
 async function save(){if(!state||busy)return;const dueAt=Date.parse(`${when}:00+08:00`);if(await change({type:'save',revision:state.revision,id:editing==='new'?newId.current:editing!,title,note,dueAt,...calendarSpec})){pickDay(dayKey(dueAt));setFilter('all');setView('day');addButton.current?.focus();}}
 function status(id:string,status:'completed'|'cancelled'){if(state)void change({type:'status',revision:state.revision,id,status});}
 function renderEvent(event:CalendarEvent){const open=event.kind==='transfer'?()=>onOpenTransfers(event.cardId):event.kind==='renewal'?()=>onOpenSubscription(event.source!,event.sourceId!):event.kind==='occasion'&&onOpenOccasion?()=>onOpenOccasion(event.sourceId!):undefined;return <CalendarEventCard key={`${event.id}:${event.dueAt}`} event={event} busy={busy} expanded={detail===event.id} confirmCancel={cancelId===event.id} onToggle={()=>{setDetail(detail===event.id?null:event.id);setCancelId(null);}} onEdit={()=>startEdit(event)} onComplete={()=>status(event.id,'completed')} onCancel={()=>setCancelId(event.id)} onConfirmCancel={()=>status(event.id,'cancelled')} onKeep={()=>setCancelId(null)} onOpen={open}/>;}
 return <section className="task-calendar" aria-label="任务日历">
  <div className="task-toolbar"><p>提醒、续费与预约，按日期查看</p><button ref={addButton} className="task-primary" disabled={!state||busy} onClick={()=>startEdit()}><Plus size={16} aria-hidden="true"/>添加提醒</button></div>
  {onDiscuss&&<button className="task-steward-entry" onClick={()=>onDiscuss(`我想安排${selected}的日程：`)}><MessageCircle size={19} aria-hidden="true"/><span><strong>和{stewardName}安排日程</strong><small>说说要记的事，一起核对时间</small></span><ArrowRight size={17} aria-hidden="true"/></button>}
  <p className="task-scope-note">添加提醒只记录待办；银行预约和平台续费仍按原授权执行。</p>
  {(loadError||bankError||sourceError)&&<div className="task-error" role="alert"><p>{loadError}{bankError&&<span>银行安排暂未更新，请到银行记录核对。</span>}{sourceError&&<span>平台续费暂未更新，请到订阅页核对。</span>}</p>{loadError&&<button onClick={()=>void refresh()}>重新加载</button>}</div>}
  {actionError&&!editing&&<div className="task-error" role="alert">{actionError} 请在对应日程中重试。</div>}
  {editing&&<form className="task-editor" aria-label="编辑日程" onSubmit={e=>{e.preventDefault();void save();}}><div className="task-agenda-heading"><h2>{calendarSpec.repeat==='yearly'?(editing==='new'?'记录生日':'修改生日'):(editing==='new'?'添加提醒':'修改提醒')}</h2><button type="button" aria-label="关闭提醒编辑" disabled={busy} onClick={closeEdit}><X size={20} aria-hidden="true"/></button></div>
   {editing==='new'&&!draft&&<div className="task-editor-types" role="group" aria-label="记录类型"><button type="button" aria-pressed={!calendarSpec.repeat} onClick={()=>{setCalendarSpec({});setWhen(`${when.slice(0,10)}T09:00`);}}><Bell size={15} aria-hidden="true"/>提醒</button><button type="button" aria-pressed={calendarSpec.repeat==='yearly'} onClick={()=>{setCalendarSpec({allDay:true,repeat:'yearly'});setWhen(`${when.slice(0,10)}T00:00`);}}><Cake size={15} aria-hidden="true"/>生日</button></div>}
   <label>要做什么<input autoFocus required disabled={busy} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder={calendarSpec.repeat?'例如：妈妈的生日':'例如：核对信用卡账单'}/></label>{calendarSpec.allDay?<label>生日日期（公历）<input required disabled={busy} type="date" value={when.slice(0,10)} onChange={e=>setWhen(`${e.target.value}T00:00`)}/></label>:<label>提醒时间（北京时间）<input required disabled={busy} type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>}<label>补充说明（选填）<textarea disabled={busy} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} rows={2}/></label><p>{calendarSpec.repeat==='yearly'?'保存为每年重复的全天生日记录，在日历查看。':'保存为知银内的提醒，不会自动转账或扣费。'}</p>{actionError&&<p className="task-save-error" role="alert">{actionError} 输入已保留，请核对后重新保存。</p>}<button className="task-primary" disabled={busy||!state}>{busy?'正在保存…':calendarSpec.repeat==='yearly'?'确认保存生日':'确认保存提醒'}</button></form>}
  <div className="task-calendar-layout">
   <CalendarDatePicker month={month} selected={selected} today={today} events={events} onPick={pickDay} onMove={moveMonth}/>
   <div className="task-agenda">
    <div className="task-agenda-controls"><div className="task-view-switch" role="group" aria-label="日程范围"><button aria-pressed={view==='day'} onClick={()=>{setView('day');setDetail(null);}}>当天</button><button aria-pressed={view==='upcoming'} onClick={()=>{setView('upcoming');setDetail(null);}}>近期</button></div><label className="task-filter"><span className="sr-only">筛选日程类型</span><select value={filter} onChange={e=>{setFilter(e.target.value);setDetail(null);}}><option value="all">全部类型</option>{Object.entries(calendarKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    <div className="task-agenda-heading"><h2>{view==='day'?(selected===today?'今天':calendarDateLabel(selected)):'近期安排'}</h2>{active.length>0&&<span>{active.length} 项待关注</span>}</div>
    {view==='upcoming'&&<p className="task-range-note">从{calendarDateLabel(selected)}起的 30 天</p>}
    {!state&&!loadError&&<p className="task-loading" role="status">正在加载日程…</p>}
    {active.length===0&&state&&<div className="task-empty"><CalendarDays size={25} aria-hidden="true"/><p>{incomplete?'当前未返回待处理安排':filter!=='all'?'这个范围内暂无此类安排':view==='upcoming'?'近期还没有待处理安排':ended.length?'这一天的安排已结束':'这一天，暂时没有安排。'}</p><span>{incomplete?'部分来源未能更新，请先核对上方提示。':filter!=='all'?'可以切回全部类型，查看当前范围的其他安排。':'可以记下重要的事，再慢慢安排。'}</span>{!incomplete&&(filter!=='all'?<button onClick={()=>setFilter('all')}>查看全部类型</button>:<button disabled={busy} onClick={()=>startEdit()}>记下一件要做的事<Plus size={15} aria-hidden="true"/></button>)}</div>}
    {view==='day'?active.map(renderEvent):groups.map(day=><CalendarAgendaGroup key={day} day={day}>{active.filter(e=>dayKey(e.dueAt)===day).map(renderEvent)}</CalendarAgendaGroup>)}
    {ended.length>0&&<details className="task-ended"><summary>已结束的安排（{ended.length}）</summary>{view==='day'?ended.map(renderEvent):[...new Set(ended.map(e=>dayKey(e.dueAt)))].map(day=><CalendarAgendaGroup key={day} day={day}>{ended.filter(e=>dayKey(e.dueAt)===day).map(renderEvent)}</CalendarAgendaGroup>)}</details>}
   </div>
  </div>
  <p className="task-footnote">北京时间 · 仅显示已知安排<br/>提醒在知银内查看，暂不发送系统推送。</p>
 </section>;
}
