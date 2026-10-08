import {useEffect,useState} from 'react';
import {CalendarDays,ArrowRight} from 'lucide-react';
import {taskRequest,type Reminder} from '../lib/task-calendar';
import type {OccasionPlan} from '../lib/occasion-plans';
export function TaskDueNotice({onOpen,onAttention,occasions=[],onOccasion}:{onOpen:(date?:number)=>void;onAttention:(value:boolean)=>void;occasions?:OccasionPlan[];onOccasion?:(id:string)=>void}){
 const [due,setDue]=useState<Reminder[]>([]);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const state=await taskRequest();if(active){setDue(state.tasks.filter(t=>t.status==='pending'&&t.dueAt<=Date.now()));}}catch{if(active)setDue([]);}};void refresh();const timer=setInterval(()=>void refresh(),30000);window.addEventListener('zhiyin-tasks-updated',refresh);window.addEventListener('zhiyin-phone-foreground',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('zhiyin-tasks-updated',refresh);window.removeEventListener('zhiyin-phone-foreground',refresh);};},[]);
 const occasion=onOccasion?occasions.filter(p=>p.status==='reserved'&&p.prepareAt<=Date.now()).sort((a,b)=>a.prepareAt-b.prepareAt)[0]:undefined;
 const hasAttention=!!due.length||!!occasion;
 useEffect(()=>onAttention(hasAttention),[onAttention,hasAttention]);
 if(!due.length&&occasion)return <button className="task-due-notice" onClick={()=>onOccasion?.(occasion.id)}><CalendarDays size={19}/><span><strong>{occasion.title}</strong><small>{occasion.deliverAt<=Date.now()?'送达时间已到，核对订单情况':'到筹备时间了，核对商品与订单'}</small></span><ArrowRight size={17}/></button>;
 if(!due.length)return null;
 return <button className="task-due-notice" onClick={()=>onOpen(due[0].dueAt)}><CalendarDays size={19}/><span><strong>{due[0].title}</strong><small>{due.length>1?`有 ${due.length} 项提醒到时间了`:'到你安排的时间了'}</small></span><ArrowRight size={17}/></button>;
}
