import {validExpenseState,settlementPlan,entryAllocations,type ExpenseBook} from './expense-notebook';
import {calculateGroupAA} from './group-aa';
import {buildRecurringCandidates} from './recurring-payments';
import type {ConnectedFinancialSource} from './financial-connections';
export type VoiceTripReport={kind:'trip_report';stage:'review'|'done';book:ExpenseBook;entryIds:string[];source:ConnectedFinancialSource;subscriptionId:string;asOf:number;batchId?:string};
export function readVoiceTripReport(value:unknown){
 try{
  const r=value as VoiceTripReport;
  if(!r||r.kind!=='trip_report'||!['review','done'].includes(r.stage)||!Number.isSafeInteger(r.asOf)||r.asOf<=0||!validExpenseState({revision:0,books:[r.book],applied:[]})||!Array.isArray(r.entryIds)||!r.entryIds.length||new Set(r.entryIds).size!==r.entryIds.length)return null;
  const source=r.source;if(source?.provider!=='wechat_pay'||!source.scopes.includes('transactions')||!source.scopes.includes('autopay'))return null;
  const agreement=source.autopays.find(a=>a.id===r.subscriptionId);if(!agreement)return null;
  // Identify the historical pattern independently before matching a known agreement.
  const candidate=buildRecurringCandidates({wechat_pay:{...source,scopes:['transactions'],autopays:[]}},r.asOf).find(c=>c.title===agreement.title&&c.amount===agreement.amount);if(!candidate)return null;
  const cancelled=source.cancelledAutopayIds?.includes(agreement.id)===true;
  if(r.stage==='review'&&(cancelled||!Number.isSafeInteger(agreement.nextChargeAt)||agreement.nextChargeAt!<=r.asOf))return null;
  const batch=r.book.batches.find(b=>b.id===r.batchId);
  if(r.stage==='done'&&(!batch||batch.status!=='prepared'||JSON.stringify([...batch.entryIds].sort())!==JSON.stringify([...r.entryIds].sort())||!cancelled||agreement.nextChargeAt!==undefined))return null;
  const entries=r.entryIds.map(id=>r.book.entries.find(e=>e.id===id));if(entries.some(e=>!e||batch&&e.batchId!==batch.id))return null;
  const plan=settlementPlan({...r.book,entries:r.book.entries.map(e=>r.entryIds.includes(e.id)?{...e,batchId:undefined}:e)},r.entryIds);
  if(batch&&JSON.stringify(batch.plan)!==JSON.stringify(plan))return null;
  const allocation=calculateGroupAA(r.book.group,plan);
  const personal=r.book.entries.filter(e=>!r.entryIds.includes(e.id)&&entryAllocations(r.book.group,e).every(m=>m.self||m.amount===0));
  const days=new Map<string,{date:string;count:number;amount:number}>();
  for(const entry of entries){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(entry!.at).slice(5);const d=days.get(date)??{date,count:0,amount:0};d.count++;d.amount+=entry!.amount;days.set(date,d);}
  return {...allocation,entries:entries.map(e=>e!),personal,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),candidate,agreement,cancelled,stage:r.stage};
 }catch{return null;}
}
