import {Check,NotebookPen} from 'lucide-react';
import {readVoiceExpenseRecord,type VoiceExpenseRecord as Record} from '../lib/voice-expense-record';
import {voiceMoney} from '../lib/voice-wealth-review';

export function VoiceExpenseRecord({record}:{record:Record}) {
  const detail=readVoiceExpenseRecord(record);
  if(!detail) return null;
  const {book,entry,members,payer,equal}=detail;
  const count=members.length===4?'四':String(members.length);
  return <section className="voice-wealth-review" data-stage="done" aria-label="已记账消费">
    <div className="voice-wealth-heading"><span className="voice-wealth-icon"><NotebookPen size={18}/></span><strong>{entry.title}</strong><span className="voice-wealth-badge"><Check size={12}/> 已记账</span></div>
    <div className="voice-wealth-amount">{voiceMoney(entry.amount)}<small>{equal?`${count}人均摊`:'按约定分摊'}</small></div>
    <dl className="voice-wealth-facts">{members.map(member=><div key={member.id}><dt>{member.self?'你':member.name}</dt><dd>{voiceMoney(member.amount)}</dd></div>)}</dl>
    <div className="voice-wealth-protected"><Check size={17}/><div><strong>{payer.self?'你':payer.name}先垫付</strong><span>已记入{book.title}，回程再一起结算</span></div></div>
  </section>;
}
