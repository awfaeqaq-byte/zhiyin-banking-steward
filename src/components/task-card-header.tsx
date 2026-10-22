import {useLayoutEffect, useRef, type ReactNode} from 'react';
import './task-card-header.css';

export type TaskCardTone='neutral'|'attention'|'success'|'warning'|'danger';

type TaskCardHeaderProps={
 title:string;
 icon:ReactNode;
 status:string;
 tone?:TaskCardTone;
 meta?:ReactNode;
};

/** Keep task progress in the status; sources and scope belong in metadata. */
export function TaskCardHeader({title,icon,status,tone='neutral',meta}:TaskCardHeaderProps){
 const statusElement=useRef<HTMLSpanElement>(null);
 const previousStatus=useRef(status);
 useLayoutEffect(()=>{
  const changed=previousStatus.current!==status;
  previousStatus.current=status;
  const element=statusElement.current;
  const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if(!changed||!element?.animate||!element.getClientRects().length||document.hidden||preference?.matches)return;
  const animation=element.animate([
   {opacity:0.55,translate:'0 4px'},
   {opacity:1,translate:'none'},
  ],{duration:240,easing:'cubic-bezier(0.16, 1, 0.3, 1)'});
  const stop=()=>animation.cancel();
  const stopWhenHidden=()=>{if(document.hidden)stop();};
  preference?.addEventListener('change',stop);
  document.addEventListener('visibilitychange',stopWhenHidden);
  return ()=>{stop();preference?.removeEventListener('change',stop);document.removeEventListener('visibilitychange',stopWhenHidden);};
 },[status]);
 return <header className="task-card-header">
  <div className="task-card-heading-row">
   <div className="task-card-heading"><span className="task-card-heading-icon" aria-hidden="true">{icon}</span><h2>{title}</h2></div>
   <span ref={statusElement} className="task-card-status" data-tone={tone}>{status}</span>
  </div>
  {meta&&<div className="task-card-meta">{meta}</div>}
 </header>;
}
