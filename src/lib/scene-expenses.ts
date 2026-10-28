import {entryAllocations,validExpenseState,type ExpenseEntry,type ExpenseState} from './expense-notebook';

/** Payment facts come from a verified platform receipt, never from a model's amount. */
export type SceneExpenseSource={id:string;workspaceId:string;orderId:string;paymentId:string;kind:'occasion'|'food';title:string;merchant:string;paidAmount:number;refundedAmount:number;paidAt:number;checkedAt:number};
export type SceneExpenseReference=Pick<SceneExpenseSource,'id'|'paidAmount'|'refundedAmount'>;
export type SceneExpenseImport={bookId:string;references:SceneExpenseReference[];revision:number;requestId?:string};
export type SceneExpenseResult={sources:SceneExpenseSource[];state:ExpenseState};
const text=(value:unknown,max=180):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max;
export function validSceneExpenseSource(value:unknown):value is SceneExpenseSource {
 const s=value as SceneExpenseSource;
 return !!s&&text(s.id)&&text(s.workspaceId,80)&&text(s.orderId)&&text(s.paymentId)&&['occasion','food'].includes(s.kind)&&text(s.title,60)&&text(s.merchant,100)&&Number.isSafeInteger(s.paidAmount)&&s.paidAmount>0&&s.paidAmount<=10000000&&Number.isSafeInteger(s.refundedAmount)&&s.refundedAmount>=0&&s.refundedAmount<=s.paidAmount&&Number.isSafeInteger(s.paidAt)&&s.paidAt>0&&Number.isSafeInteger(s.checkedAt)&&s.checkedAt>=s.paidAt;
}
function assertSources(sources:SceneExpenseSource[]){
 if(!Array.isArray(sources)||sources.length>200||!sources.every(validSceneExpenseSource)||new Set(sources.map(s=>s.id)).size!==sources.length||new Set(sources.map(s=>s.paymentId)).size!==sources.length)throw new Error('订单付款来源无法核对');
}
const sameSource=(a:SceneExpenseSource,b:SceneExpenseSource)=>a.id===b.id||a.paymentId===b.paymentId;
export const sourceExpenseNet=(source:SceneExpenseSource)=>source.paidAmount-source.refundedAmount;
export function sourceExpenseIssue(entry:ExpenseEntry):string|undefined {
 if(!entry.source)return;
 const net=sourceExpenseNet(entry.source);
 if(net===0)return '该订单已全额退款，不再收取费用';
 if(net!==entry.amount)return entry.batchId?'原订单已退款，已发布或待核对的分摊存在差额':'退款后金额已变化，请重新核对分摊规则';
}
export function sourceExpenseAdjustment(entry:ExpenseEntry){return entry.source?Math.max(0,entry.amount-sourceExpenseNet(entry.source)):0;}
export function sceneExpenseCandidates(state:ExpenseState,sources:SceneExpenseSource[]){
 assertSources(sources);
 return sources.filter(s=>sourceExpenseNet(s)>0&&!state.books.some(b=>b.entries.some(e=>e.source&&sameSource(e.source,s))));
}
export function syncSceneExpenses(state:ExpenseState,sources:SceneExpenseSource[]):ExpenseState {
 assertSources(sources);const next=structuredClone(state);let changed=false;
 for(const book of next.books)for(const entry of book.entries){
  const previous=entry.source;if(!previous)continue;
  const incoming=sources.find(s=>sameSource(s,previous));if(!incoming)continue;
  if(incoming.id!==previous.id||incoming.paymentId!==previous.paymentId||incoming.orderId!==previous.orderId||incoming.workspaceId!==previous.workspaceId||incoming.kind!==previous.kind||incoming.paidAmount!==previous.paidAmount||incoming.paidAt!==previous.paidAt||incoming.merchant!==previous.merchant)throw new Error('同一订单付款来源不一致');
  if(incoming.checkedAt<previous.checkedAt||incoming.refundedAmount<=previous.refundedAmount)continue;
  entry.source={...incoming};changed=true;
  if(entry.batchId){const batch=book.batches.find(b=>b.id===entry.batchId);if(batch)batch.sourceChanged=true;}
  else reconcileUnbatchedSource(entry,book.group);
 }
 if(!changed)return state;
 next.revision++;return next;
}
/** Keep fixed allocations intact when a refund makes them impossible; ask the user. */
export function reconcileUnbatchedSource(entry:ExpenseEntry,group:Parameters<typeof entryAllocations>[0]){
 if(!entry.source||entry.batchId)return;
 const net=sourceExpenseNet(entry.source);if(net<=0)return;
 try{entryAllocations(group,{...entry,amount:net});entry.amount=net;}catch{/* Existing rules remain visible until explicitly revised. */}
}
export function importSceneExpenses(state:ExpenseState,bookId:string,sources:SceneExpenseSource[],at=Date.now()):ExpenseState {
 assertSources(sources);const book=state.books.find(b=>b.id===bookId);if(!book)throw new Error('活动不存在');
 if(!sources.length)throw new Error('请选择要记入的实付订单');
 const synced=syncSceneExpenses(state,sources),next=structuredClone(synced),target=next.books.find(b=>b.id===bookId)!;let changed=false;
 for(const source of sources){
  const owner=next.books.find(b=>b.entries.some(e=>e.source&&sameSource(e.source,source)));
  if(owner){if(owner.id!==bookId)throw new Error('这笔订单已记入另一个活动，不能重复分摊');continue;}
  if(sourceExpenseNet(source)<=0)throw new Error('订单已全额退款，不能记入待收费用');
  if(target.entries.length>=300)throw new Error('活动记录过多，请先处理现有费用');
  const self=target.group.members.find(m=>m.self);if(!self||target.defaultPayerId!==self.id)throw new Error('订单为本人实付，请核对本活动垫付人');
  const entry:ExpenseEntry={id:crypto.randomUUID(),title:source.title,amount:sourceExpenseNet(source),payerId:self.id,fixed:[],shares:target.participants.map(memberId=>({memberId,weight:1})),source:{...source},at};
  entryAllocations(target.group,entry);target.entries.push(entry);changed=true;
 }
 if(!changed)return synced;
 next.revision++;return next;
}
export async function sceneExpenseRequest(workspaceId:string,operation?:SceneExpenseImport):Promise<SceneExpenseResult>{
 let scope=localStorage.getItem('zhiyin-expense-scope');if(!scope){scope=crypto.randomUUID();localStorage.setItem('zhiyin-expense-scope',scope);}
 const response=await fetch(`/api/zhiyin/scene-expenses?workspaceId=${encodeURIComponent(workspaceId)}`,{method:operation?'POST':'GET',headers:{'Content-Type':'application/json','X-Zhiyin-Scene-Expenses':'1','X-Zhiyin-Expense-Scope':scope},...(operation?{body:JSON.stringify({...operation,workspaceId,requestId:operation.requestId||crypto.randomUUID()})}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'订单实付暂未核对');
 if(!data||!validExpenseState(data.state)||!Array.isArray(data.sources)||!data.sources.every(validSceneExpenseSource))throw new Error('订单实付来源格式无效');
 if(operation)window.dispatchEvent(new Event('zhiyin-expenses-updated'));
 return data;
}
