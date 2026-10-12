import type {BankSnapshot} from './bank-transfer';
import type {WealthHolding} from './wealth-operation';
import {heldOccasionBudget} from './occasion-plans';

// Contract rates are sandbox fixtures, not live bank offers.
export const depositProducts=[
  {months:3,label:'3个月',rateBps:110},
  {months:6,label:'6个月',rateBps:130},
  {months:12,label:'1年',rateBps:150},
] as const;
export const earlyDepositRateBps=20;
export type TermDeposit={id:string;amount:number;months:number;rateBps:number;openedAt:number;maturesAt:number;closedAt?:number;interest?:number;withdrawalId?:string;withdrawalBalanceAfter?:number};
export type DepositDraft={id:string;amount:number;months:number;rateBps:number;revision:number;balance:number;createdAt:number;maturesAt:number;expiresAt:number};
export type DepositWithdrawalDraft={id:string;depositId:string;amount:number;interest:number;rateBps:number;early:boolean;revision:number;createdAt:number;expiresAt:number};
export type DepositWithdrawalReceipt={id:string;depositId:string;amount:number;interest:number;completedAt:number;balanceAfter:number};
export type BankAssetSummary={cash:number;availableCash:number;reservedCash:number;wealth:number;deposits:number;total:number;holdingCount:number;depositCount:number};
const cents=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,80}$/.test(value);
export function validDepositDraft(value:unknown):value is DepositDraft {
  if(!value||typeof value!=='object')return false;
  const d=value as DepositDraft;
  return identifier(d.id)&&cents(d.amount)&&d.amount>=10000&&d.amount<=100000000&&depositProducts.some(p=>p.months===d.months&&p.rateBps===d.rateBps)
    &&cents(d.revision)&&cents(d.balance)&&d.balance>=d.amount&&Number.isSafeInteger(d.createdAt)&&d.createdAt>0
    &&d.expiresAt===d.createdAt+300000&&d.maturesAt===depositMaturity(d.createdAt,d.months);
}
export function validDepositWithdrawalDraft(value:unknown):value is DepositWithdrawalDraft {
  if(!value||typeof value!=='object')return false;
  const d=value as DepositWithdrawalDraft;
  return identifier(d.id)&&identifier(d.depositId)&&cents(d.amount)&&d.amount>=10000&&cents(d.interest)&&cents(d.amount+d.interest)
    &&cents(d.revision)&&typeof d.early==='boolean'&&Number.isSafeInteger(d.rateBps)&&d.rateBps>=0&&d.rateBps<=10000
    &&Number.isSafeInteger(d.createdAt)&&d.createdAt>0&&d.expiresAt===d.createdAt+300000;
}
export const assetMoney=(amount:number)=>`¥${(amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function depositRequestForMessages(messages:Array<{role:string;content:string}>):string|null {
  const users=messages.filter(m=>m.role==='user'),latest=users.at(-1)?.content??'';
  if(/定期|定存/.test(latest))return latest;
  if(!/^(?:改成|改为|换成|就存|存|半年|一年|[三六]个月|\d+个?月)/.test(latest))return null;
  const previous=users.slice(-4,-1).reverse().find(m=>/定期|定存/.test(m.content));
  return previous?`${previous.content}，${latest}`:null;
}
export function parseDepositRequest(text:string):{amount:string;months:number|null} {
  const amounts=[...text.matchAll(/(?:存入?|改成|改为|就存)\s*(\d+(?:\.\d{1,2})?)(?![\d.])\s*(万)?|(?<![\d.-])(\d+(?:\.\d{1,2})?)(?![\d.])\s*(万)?元/g)];
  const match=amounts.at(-1),value=match?Number(match[1]??match[3])*(match[2]||match[4]?10000:1):null;
  const terms=[...text.matchAll(/(?<!\d)(3|6|12)\s*个?月|([三六])个月|(半年|一年)/g)],last=terms.at(-1);
  const months=last?(last[1]?Number(last[1]):last[2]?last[2]==='三'?3:6:last[3]==='半年'?6:12):null;
  return {amount:value!==null&&Number.isFinite(value)?String(value):'',months};
}
export function validTermDeposit(value:unknown):value is TermDeposit {
  if(!value||typeof value!=='object')return false;
  const d=value as TermDeposit;
  return typeof d.id==='string'&&/^[\w-]{1,80}$/.test(d.id)&&cents(d.amount)&&d.amount>=10000
    &&depositProducts.some(p=>p.months===d.months)&&Number.isSafeInteger(d.rateBps)&&d.rateBps>=0&&d.rateBps<=10000
    &&Number.isSafeInteger(d.openedAt)&&d.openedAt>0&&Number.isSafeInteger(d.maturesAt)&&d.maturesAt>d.openedAt
    &&(d.closedAt===undefined?d.interest===undefined&&d.withdrawalId===undefined:
      Number.isSafeInteger(d.closedAt)&&d.closedAt>=d.openedAt&&cents(d.interest)&&cents(d.withdrawalBalanceAfter)&&typeof d.withdrawalId==='string'&&/^[\w-]{1,80}$/.test(d.withdrawalId));
}
export function validAssetSummary(value:unknown):value is BankAssetSummary {
  if(!value||typeof value!=='object')return false;
  const s=value as BankAssetSummary;
  return ['cash','availableCash','reservedCash','wealth','deposits','total','holdingCount','depositCount'].every(key=>cents(s[key as keyof BankAssetSummary]))
    &&s.total===s.cash+s.wealth+s.deposits&&s.availableCash+s.reservedCash===s.cash;
}
export function buildBankAssetSummary(bank:Pick<BankSnapshot,'balance'|'schedules'|'occasions'>,holdings:WealthHolding[]=[],deposits:TermDeposit[]=[]):BankAssetSummary {
  const activeHoldings=holdings.filter(h=>h.redeemedAt===undefined),activeDeposits=deposits.filter(d=>d.closedAt===undefined);
  const pending=(bank.schedules??[]).filter(s=>s.status==='pending');
  const reserved=Math.min(bank.balance,heldOccasionBudget(bank)+pending.reduce((sum,s)=>sum+s.amount,0)+Math.max(0,...pending.map(s=>s.protectedAmount??0)));
  const wealth=activeHoldings.reduce((sum,h)=>sum+h.principal,0),term=activeDeposits.reduce((sum,d)=>sum+d.amount,0);
  const summary={cash:bank.balance,availableCash:bank.balance-reserved,reservedCash:reserved,wealth,deposits:term,total:bank.balance+wealth+term,holdingCount:activeHoldings.length,depositCount:activeDeposits.length};
  if(!validAssetSummary(summary))throw new Error('资产汇总无法核对，请保留账本检查');
  return summary;
}
export function depositMaturity(now:number,months:number) {
  const d=new Date(now+8*3600000),year=d.getUTCFullYear(),month=d.getUTCMonth()+months;
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return Date.UTC(year,month,Math.min(d.getUTCDate(),last),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds())-8*3600000;
}
export function depositInterest(deposit:TermDeposit,now:number) {
  if(!Number.isSafeInteger(now)||now<deposit.openedAt)throw new Error('银行沙箱时间早于存入时间，请重新核对');
  const early=now<deposit.maturesAt,rateBps=early?earlyDepositRateBps:deposit.rateBps;
  const days=Math.floor((Math.min(now,deposit.maturesAt)-deposit.openedAt)/86400000);
  const denominator=365n*10000n;
  const interest=Number((BigInt(deposit.amount)*BigInt(rateBps)*BigInt(days)+denominator/2n)/denominator);
  if(!cents(interest)||!cents(deposit.amount+interest))throw new Error('计息金额超出范围');
  return {early,rateBps,interest};
}
