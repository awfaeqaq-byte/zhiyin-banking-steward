import type {ReactNode} from 'react';
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
 return <header className="task-card-header">
  <div className="task-card-heading-row">
   <div className="task-card-heading"><span className="task-card-heading-icon" aria-hidden="true">{icon}</span><h2>{title}</h2></div>
   <span className="task-card-status" data-tone={tone}>{status}</span>
  </div>
  {meta&&<div className="task-card-meta">{meta}</div>}
 </header>;
}
