import {bankRecipients,splitAA,transferImpact,type TransferIntent,type AAIntent,type AARequest,type BankDraft,type BankSnapshot,type BankSchedule,type BankRecipientId} from '../src/lib/bank-transfer';

export type SmartState=BankSnapshot & {drafts:BankDraft[];received:Record<string,number>;participantBalances?:Record<string,number>};
export function checkExecution(s:SmartState,amount:number){
 if(amount>s.balance || amount>s.limit)throw new Error('余额或限额不足');
 if(s.transactions.length>=5000)throw new Error('沙箱账本已满');
}
export function checkTransferBudget(s:SmartState,intent:TransferIntent,excludeId?:string){
 const impact=transferImpact(s,intent,excludeId);
 if(impact.remaining<0)throw new Error(`扣除其他预约及需保留金额后，最多可转${(impact.available/100).toFixed(2)}元。请调整转账金额或核对保留金额。`);
 return impact;
}
export function authorizeSchedule(s:SmartState,id:string,now:number):BankSchedule{
 const existing=s.schedules?.find(item=>item.id===id);if(existing)return existing;
 const draft=s.drafts.find(item=>item.id===id);
 if(!draft || !draft.executeAt || draft.executeAt<=now || draft.expiresAt<=now)throw new Error('预约时间或方案已过期，请重新核对');
 if(draft.revision!==s.revision)throw new Error('账户已变化，请重新核对');
 checkExecution(s,draft.amount);
 checkTransferBudget(s,draft);
 if((s.schedules?.length??0)>=1000)throw new Error('预约数量已达上限');
 const schedule:BankSchedule={id,recipientId:draft.recipientId,amount:draft.amount,executeAt:draft.executeAt,...(draft.protectedAmount===undefined?{}:{protectedAmount:draft.protectedAmount}),createdAt:now,status:'pending'};
 (s.schedules??=[]).push(schedule);s.drafts=s.drafts.filter(d=>d.id!==id);s.revision++;
 return schedule;
}
export function executeDue(s:SmartState,now:number,guard:(s:SmartState,now:number)=>void){
 const due=(s.schedules??[]).filter(item=>item.status==='pending' && item.executeAt<=now).sort((a,b)=>a.executeAt-b.executeAt || a.createdAt-b.createdAt);
 for(const item of due){
  try{
   guard(s,now);checkExecution(s,item.amount);checkTransferBudget(s,item,item.id);
   s.balance-=item.amount;s.received[item.recipientId]=(s.received[item.recipientId]??0)+item.amount;
   s.transactions.push({id:item.id,recipientId:item.recipientId,amount:item.amount,executeAt:item.executeAt,...(item.protectedAmount===undefined?{}:{protectedAmount:item.protectedAmount}),completedAt:now,balanceAfter:s.balance});
   item.status='completed';
  }catch(error){item.status='failed';item.error=error instanceof Error?error.message:'预约执行失败';}
  s.revision++;
 }
 return due;
}
export function createAA(s:SmartState,input:AAIntent & {requestId:string;title:string},now:number):AARequest{
 if(!input || typeof input.requestId!=='string' || !/^[\w-]{1,80}$/.test(input.requestId) || typeof input.title!=='string' || !input.title.trim() || input.title.length>60 || typeof input.includeSelf!=='boolean' || !Array.isArray(input.recipientIds))throw new Error('AA收款信息无效');
 const shares=splitAA(input.amount,input.recipientIds,input.includeSelf);
 const existing=s.aaRequests?.find(item=>item.id===input.requestId);
 if(existing){
  if(existing.amount!==input.amount || existing.title!==input.title.trim() || existing.includeSelf!==input.includeSelf || existing.recipientIds.join()!==input.recipientIds.join())throw new Error('同一收款请求内容发生变化');
  return existing;
 }
 if((s.aaRequests?.length??0)>=1000)throw new Error('AA收款数量已达上限');
 const request:AARequest={id:input.requestId,title:input.title.trim(),amount:input.amount,recipientIds:[...input.recipientIds],includeSelf:input.includeSelf,createdAt:now,status:'pending',shares};
 (s.aaRequests??=[]).push(request);s.revision++;return request;
}
export function settleAA(s:SmartState,id:string,recipientId:BankRecipientId,now:number){
 const request=s.aaRequests?.find(item=>item.id===id),share=request?.shares.find(item=>item.recipientId===recipientId);
 if(!request || !share || !bankRecipients.some(r=>r.id===recipientId))throw new Error('未找到这笔应收款');
 const existing=s.collections?.find(item=>item.requestId===id && item.recipientId===recipientId);if(existing)return existing;
 if(request.status!=='pending')throw new Error('收款已结束');
 if((s.collections?.length??0)>=5000)throw new Error('收款账本已满');
 const balances=s.participantBalances??={};
 // Separate bank sandbox payer accounts, never use WeChat/Alipay wallets implicitly.
 const balance=balances[recipientId]??1000000;
 if(balance<share.amount)throw new Error('对方银行沙箱余额不足');
 balances[recipientId]=balance-share.amount;s.balance+=share.amount;s.revision++;
 share.paidAt=now;
 const receipt={id:`aa:${id}:${recipientId}`,requestId:id,recipientId,amount:share.amount,completedAt:now,balanceAfter:s.balance};
 (s.collections??=[]).push(receipt);
 if(request.shares.every(item=>item.recipientId==='self' || item.paidAt!==undefined))request.status='completed';
 return receipt;
}
