import {useEffect,useState} from 'react';
import {CalendarDays,ArrowRight} from 'lucide-react';
import {taskRequest,type Reminder} from '../lib/task-calendar';
export function TaskDueNotice({onOpen,onAttention}:{onOpen:(date?:number)=>void;onAttention:(value:boolean)=>void}){
 const [due,setDue]=useState<Reminder[]>([]);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const state=await taskRequest();if(active){const tasks=state.tasks.filter(t=>t.status==='pending'&&t.dueAt<=Date.now());setDue(tasks);onAttention(tasks.length>0);}}catch{if(active){setDue([]);onAttention(false);}}};void refresh();const timer=setInterval(()=>void refresh(),30000);window.addEventListener('zhiyin-tasks-updated',refresh);window.addEventListener('zhiyin-phone-foreground',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('zhiyin-tasks-updated',refresh);window.removeEventListener('zhiyin-phone-foreground',refresh);};},[onAttention]);
 if(!due.length)return null;
 return <button className="task-due-notice" onClick={()=>onOpen(due[0].dueAt)}><CalendarDays size={19}/><span><strong>{due[0].title}</strong><small>{due.length>1?`有 ${due.length} 项提醒到时间了`:'到你安排的时间了'}</small></span><ArrowRight size={17}/></button>;
}
