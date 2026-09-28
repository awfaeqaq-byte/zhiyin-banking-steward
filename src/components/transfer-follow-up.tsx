import {useEffect,useState} from 'react';
import {useBankAccount} from '../lib/use-bank-account';
import {bankRecipients} from '../lib/bank-transfer';
import {money} from '../lib/native-banking';

const key='zhiyin-transfer-notices-seen-v1';
function readSeen():string[]{
 try{const value:unknown=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string').slice(-200):[];}catch{return [];}
}

export function TransferFollowUp({onOpen,onAttention}:{onOpen:()=>void;onAttention?:(active:boolean)=>void}){
 const bank=useBankAccount();
 const [seen,setSeen]=useState(readSeen);
 const now=Date.now();
 const state=bank.state;
 const events=(bank.error?[]:state?.schedules??[]).flatMap(item=>{
  const receipt=state?.transactions.find(r=>r.id===item.id);
  const due=item.status==='pending' && item.executeAt>now && item.executeAt-now<=86400000;
  if(item.status!=='failed' && !(item.status==='completed' && receipt && receipt.completedAt>=now-86400000) && !due)return [];
  const eventId=`${item.id}:${item.status}`;
  if(seen.includes(eventId))return [];
  return [{item,eventId}];
 }).sort((a,b)=>Number(b.item.status==='failed')-Number(a.item.status==='failed') || b.item.createdAt-a.item.createdAt);
 const event=events[0];
 const hasAttention=Boolean(event);
 useEffect(()=>{onAttention?.(hasAttention);return()=>onAttention?.(false);},[hasAttention,onAttention]);
 if(!event)return null;
 const {item,eventId}=event;
 const person=bankRecipients.find(r=>r.id===item.recipientId)?.name??'收款人';
 function dismiss(){const next=[...seen,eventId].slice(-200);setSeen(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Keep acknowledgement for this session. */}}
 return <section className="transfer-follow-up" aria-label="转账进展">
  <p><strong>{item.status==='failed'?'有一笔预约需要你处理':item.status==='completed'?'你安排的转账已完成':'有一笔转账将在24小时内执行'}</strong></p>
  <p>{person} · {money(item.amount)} · {new Date(item.executeAt).toLocaleString('zh-CN')}</p>
  {item.status==='failed'?<p>{item.error||'执行条件不满足'}。未扣款，可在记录中重新安排。</p>:item.status==='pending'?<p>到期前会再次核对余额与保留金额，你仍可撤销。</p>:<p>已收到银行回执，可查看这笔转账的记录。</p>}
  <div className="steward-reply-choices"><button onClick={onOpen}>查看安排{events.length>1?`（${events.length}）`:''}</button><button onClick={dismiss}>知道了</button></div>
 </section>;
}
