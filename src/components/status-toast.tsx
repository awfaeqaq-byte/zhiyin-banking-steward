import {useLayoutEffect, useState} from 'react';
import {Check, X} from 'lucide-react';
import {MotionPresence} from './motion-presence';
import './status-toast.css';

type StatusToastProps={message:string;onDismiss:()=>void};

/** Keep the last message visible during exit, but stop announcements and input immediately. */
export function StatusToast({message,onDismiss}:StatusToastProps){
 const [retainedMessage,setRetainedMessage]=useState(message);
 useLayoutEffect(()=>{if(message)setRetainedMessage(message);},[message]);
 const open=Boolean(message);
 return <MotionPresence open={open} className="toast status-toast" role="status"
  aria-live={open?'polite':'off'} aria-atomic="true">
  <Check size={18} aria-hidden="true"/>
  <span>{message||retainedMessage}</span>
  <button type="button" className="icon-control" aria-label="关闭提示" disabled={!open} onClick={onDismiss}>
   <X size={15} aria-hidden="true"/>
  </button>
 </MotionPresence>;
}
