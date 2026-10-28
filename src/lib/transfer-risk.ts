import type {BankRecipientId,BankSnapshot,TransferIntent} from './bank-transfer';

export const transferRiskPolicy={windowMs:10*60*1000,largeAmount:500000,maxDifference:10000} as const;
export type TransferRiskMatch={id:string;kind:'completed'|'pending';recipientId:BankRecipientId;amount:number;at:number;executeAt?:number};
export type TransferRisk={large:boolean;matches:TransferRiskMatch[]};
export type TransferReview=TransferRisk & {token:string};

/** Same account (the bank ledger), explicit task and recipient. Titles and model text are not evidence. */
export function assessTransferRisk(state:Pick<BankSnapshot,'transactions'|'schedules'>,intent:TransferIntent,now:number,options:{excludeId?:string;completedOnly?:boolean}={}):TransferRisk {
 const matches:TransferRiskMatch[]=[];
 const similar=(record:TransferIntent,id:string,at:number)=>id!==options.excludeId
  && record.workspaceId===intent.workspaceId && record.recipientId===intent.recipientId
  && at<=now && now-at<=transferRiskPolicy.windowMs
  && Math.abs(record.amount-intent.amount)<=Math.min(Math.floor(record.amount/100),transferRiskPolicy.maxDifference);
 for(const receipt of state.transactions){
  if(similar(receipt,receipt.id,receipt.completedAt))matches.push({id:receipt.id,kind:'completed',recipientId:receipt.recipientId,amount:receipt.amount,at:receipt.completedAt,...(receipt.executeAt?{executeAt:receipt.executeAt}:{})});
 }
 if(!options.completedOnly)for(const schedule of state.schedules??[]){
  if(schedule.status==='pending'&&similar(schedule,schedule.id,schedule.createdAt))matches.push({id:schedule.id,kind:'pending',recipientId:schedule.recipientId,amount:schedule.amount,at:schedule.createdAt,executeAt:schedule.executeAt});
 }
 matches.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
 return {large:intent.amount>=transferRiskPolicy.largeAmount,matches};
}

export function validTransferReview(value:unknown):value is TransferReview {
 if(!value||typeof value!=='object')return false;
 const r=value as TransferReview;
 return typeof r.token==='string'&&/^[\w-]{1,80}$/.test(r.token)&&typeof r.large==='boolean'
  &&Array.isArray(r.matches)&&r.matches.length<=6000&&r.matches.every(m=>m&&typeof m.id==='string'&&m.id.length<=80
   &&['completed','pending'].includes(m.kind)&&['mom','dad','zhangsan','lisi','wangwu'].includes(m.recipientId)
   &&Number.isSafeInteger(m.amount)&&m.amount>0&&Number.isFinite(m.at)&&(m.executeAt===undefined||Number.isFinite(m.executeAt)))
  &&(r.large||r.matches.length>0);
}
