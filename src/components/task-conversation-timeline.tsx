import {useEffect,useState,type ReactNode} from 'react';

type Message={id:string;role:'user'|'assistant';workspaceId?:string};
export type ConversationTaskPanel={id:string;title:string;active:boolean;disabled?:boolean;pendingMessageId?:string;node:ReactNode};
function TaskPanel({panel,anchored}:{panel:ConversationTaskPanel;anchored:boolean}){
 const [expanded,setExpanded]=useState(panel.active);
 useEffect(()=>{setExpanded(panel.active);},[panel.active]);
 return <section className="conversation-task-panel" hidden={!anchored} aria-label={`${panel.title}方案与进度`}>
  {!panel.active&&<button className="conversation-task-summary" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起':'查看'}{panel.title}方案与进度</button>}
  <div hidden={!panel.active&&!expanded}><fieldset className="conversation-task-controls" disabled={panel.disabled}>{panel.node}</fieldset></div>
 </section>;
}
/** Keep every task in one keyed sibling list: moving its anchor must not remount its draft or replay a prompt. */
export function TaskConversationTimeline<M extends Message>({messages,panels,renderMessage}:{messages:M[];panels:ConversationTaskPanel[];renderMessage:(message:M)=>ReactNode}){
 const anchors=new Map<string,string>();
 for(const panel of panels){
  const reply=messages.filter(m=>m.workspaceId===panel.id&&m.role==='assistant').at(-1);
  const pending=panel.pendingMessageId?messages.find(m=>m.id===`user-${panel.pendingMessageId}`):undefined;
  const fallback=messages.filter(m=>m.workspaceId===panel.id).at(-1);
  const anchor=reply??pending??fallback;
  if(anchor)anchors.set(panel.id,anchor.id);
 }
 const rows:ReactNode[]=[];
 for(const message of messages){
  const rendered=renderMessage(message);
  rows.push(...(Array.isArray(rendered)?rendered:[rendered]));
  for(const panel of panels)if(anchors.get(panel.id)===message.id)rows.push(<TaskPanel key={`task:${panel.id}`} panel={panel} anchored/>);
 }
 // First-time tasks may need to initialize before their first reply. Keep them mounted but never append visible orphan cards.
 for(const panel of panels)if(!anchors.has(panel.id))rows.push(<TaskPanel key={`task:${panel.id}`} panel={panel} anchored={false}/>);
 return rows;
}
