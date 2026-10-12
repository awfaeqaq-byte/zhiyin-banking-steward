import {depositProducts,depositMaturity,depositInterest,type TermDeposit,type DepositDraft,type DepositWithdrawalDraft,type DepositWithdrawalReceipt} from '../src/lib/bank-assets';
type Account={revision:number;balance:number;termDeposits?:TermDeposit[];depositDrafts?:DepositDraft[];depositWithdrawalDrafts?:DepositWithdrawalDraft[]};
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id);
function checkRevision(s:Account,revision:number){if(s.revision!==revision)throw new Error('账户已变化，请重新核对定存方案');}
export function prepareTermDeposit(s:Account,input:{amount:number;months:number},available:number,now:number):DepositDraft {
  const product=depositProducts.find(p=>p.months===input.months);
  if(!product||!Number.isSafeInteger(input.amount)||input.amount<10000||input.amount>100000000)throw new Error('请核对金额（100—1,000,000元）与期限（3、6或12个月）');
  if(input.amount>available)throw new Error('扣除已有预约和预留后，可用资金不足');
  if((s.termDeposits?.length??0)>=1000)throw new Error('定存记录已满');
  const quote:DepositDraft={id:crypto.randomUUID(),amount:input.amount,months:product.months,rateBps:product.rateBps,revision:s.revision,balance:s.balance,createdAt:now,maturesAt:depositMaturity(now,product.months),expiresAt:now+300000};
  s.depositDrafts=[...(s.depositDrafts??[]).filter(d=>d.expiresAt>now).slice(-19),quote];return quote;
}
export function confirmTermDeposit(s:Account,id:string,available:number,now:number):TermDeposit {
  if(!validId(id))throw new Error('定存方案编号无效');
  const existing=s.termDeposits?.find(d=>d.id===id);if(existing)return existing;
  const draft=s.depositDrafts?.find(d=>d.id===id);if(!draft||draft.expiresAt<=now)throw new Error('定存方案不存在或已过期，请重新核对');
  checkRevision(s,draft.revision);
  if(s.balance!==draft.balance||draft.amount>available)throw new Error('资金已变化，请重新核对');
  const product=depositProducts.find(p=>p.months===draft.months&&p.rateBps===draft.rateBps);if(!product)throw new Error('定存条款已变化，请重新核对');
  if((s.termDeposits?.length??0)>=1000)throw new Error('定存记录已满');
  const deposit:TermDeposit={id,amount:draft.amount,months:draft.months,rateBps:draft.rateBps,openedAt:now,maturesAt:depositMaturity(now,draft.months)};
  s.balance-=deposit.amount;(s.termDeposits??=[]).push(deposit);s.revision++;
  s.depositDrafts=s.depositDrafts?.filter(d=>d.id!==id);return deposit;
}
export function prepareTermWithdrawal(s:Account,id:string,now:number):DepositWithdrawalDraft {
  if(!validId(id))throw new Error('定存编号无效');
  const deposit=s.termDeposits?.find(d=>d.id===id&&d.closedAt===undefined);if(!deposit)throw new Error('没有可支取的定存');
  const quote:DepositWithdrawalDraft={id:crypto.randomUUID(),depositId:id,amount:deposit.amount,...depositInterest(deposit,now),revision:s.revision,createdAt:now,expiresAt:now+300000};
  s.depositWithdrawalDrafts=[...(s.depositWithdrawalDrafts??[]).filter(d=>d.expiresAt>now).slice(-19),quote];return quote;
}
export function confirmTermWithdrawal(s:Account,id:string,now:number):DepositWithdrawalReceipt {
  if(!validId(id))throw new Error('支取方案编号无效');
  const existing=s.termDeposits?.find(d=>d.withdrawalId===id);
  if(existing)return {id,depositId:existing.id,amount:existing.amount,interest:existing.interest!,completedAt:existing.closedAt!,balanceAfter:existing.withdrawalBalanceAfter!};
  const draft=s.depositWithdrawalDrafts?.find(d=>d.id===id);if(!draft||draft.expiresAt<=now)throw new Error('支取方案不存在或已过期，请重新核对');
  checkRevision(s,draft.revision);
  const deposit=s.termDeposits?.find(d=>d.id===draft.depositId&&d.closedAt===undefined);if(!deposit)throw new Error('定存状态已变化，请重新核对');
  const terms=depositInterest(deposit,now);
  if(terms.interest!==draft.interest||terms.early!==draft.early||terms.rateBps!==draft.rateBps)throw new Error('计息结果已变化，请重新核对');
  const balance=s.balance+deposit.amount+terms.interest;if(!Number.isSafeInteger(balance))throw new Error('账户余额超出范围');
  s.balance=balance;s.revision++;deposit.closedAt=now;deposit.interest=terms.interest;deposit.withdrawalId=id;deposit.withdrawalBalanceAfter=balance;
  s.depositWithdrawalDrafts=s.depositWithdrawalDrafts?.filter(d=>d.id!==id);
  return {id,depositId:deposit.id,amount:deposit.amount,interest:terms.interest,completedAt:now,balanceAfter:balance};
}
