import {entryAllocations,validExpenseState,type ExpenseBook} from './expense-notebook';

export type VoiceExpenseRecord = {kind:'expense_record';book:ExpenseBook;entryId:string};
/** Display a stored entry with allocations computed from its actual rules. */
export function readVoiceExpenseRecord(value:unknown) {
  const r=value as VoiceExpenseRecord | undefined;
  if(!r || r.kind!=='expense_record' || typeof r.entryId!=='string'
    || !validExpenseState({revision:0,books:[r.book],applied:[]})) return null;
  const entry=r.book.entries.find(e=>e.id===r.entryId);
  if(!entry || entry.batchId) return null;
  const included=new Set([...entry.fixed,...entry.shares].map(s=>s.memberId));
  const members=entryAllocations(r.book.group,entry).filter(m=>included.has(m.id));
  const payer=r.book.group.members.find(m=>m.id===entry.payerId)!;
  const equal=entry.fixed.length===0 && entry.shares.every(s=>s.weight===entry.shares[0].weight);
  return {book:r.book,entry,members,payer,equal};
}
