import {heldOccasionBudget, validOccasionPlan, validOccasionId} from './occasion-plans';
import {validAssetSummary,validTermDeposit,type BankAssetSummary,type TermDeposit} from './bank-assets';
export const bankRecipients=[
 {id:'mom',name:'妈妈',accountLast4:'6621',phone:'13800006621',remark:'母亲 家人'},
 {id:'dad',name:'爸爸',accountLast4:'7316',phone:'13800007316',remark:'父亲 家人'},
 {id:'zhangsan',name:'张三',accountLast4:'8000',phone:'13800138000',remark:'同事 产品经理'},
 {id:'lisi',name:'李四',accountLast4:'1111',phone:'15600001111',remark:'同事'},
 {id:'wangwu',name:'王五',accountLast4:'5678',phone:'13912345678',remark:'朋友'},
] as const;
export function findBankRecipients(query:string){
 const text=query.trim().toLowerCase(),digits=text.replace(/[\s+-]/g,'').replace(/^86(?=1\d{10}$)/,'');
 return bankRecipients.filter(r=>`${r.name} ${r.remark}`.toLowerCase().includes(text) || (/^\d+$/.test(digits) && r.phone.includes(digits)));
}
export type BankRecipientId=typeof bankRecipients[number]['id'];
export type TransferIntent={workspaceId?:string;recipientId:BankRecipientId;amount:number;executeAt?:number;protectedAmount?:number;remark?:string;sourceAccountId?:'demo-8888'};
export type BankSchedule=TransferIntent & {id:string;executeAt:number;createdAt:number;status:'pending'|'completed'|'cancelled'|'failed';error?:string};
export type AAIntent={workspaceId?:string;title?:string;amount:number;recipientIds:BankRecipientId[];includeSelf:boolean};
export type AAShare={recipientId:BankRecipientId|'self';amount:number;paidAt?:number};
export type AARequest=AAIntent & {id:string;title:string;createdAt:number;status:'pending'|'completed'|'cancelled';shares:AAShare[]};
export type AACollection={id:string;requestId:string;recipientId:BankRecipientId;amount:number;completedAt:number;balanceAfter:number};
export function splitAA(amount:number,recipientIds:readonly string[],includeSelf:boolean):AAShare[]{
 if(!Number.isSafeInteger(amount) || amount>5000000 || !recipientIds.length || recipientIds.length>20 || new Set(recipientIds).size!==recipientIds.length || recipientIds.some(id=>!bankRecipients.some(r=>r.id===id)))throw new Error('请核对AA金额与参与人');
 const ids: Array<BankRecipientId|'self'>=[...(includeSelf?['self' as const]:[]),...recipientIds as BankRecipientId[]];
 if(amount<ids.length)throw new Error('每人至少分摊1分');
 return ids.map((recipientId,i)=>({recipientId,amount:Math.floor(amount/ids.length)+(i<amount%ids.length?1:0)}));
}
export type TransferImpact={pendingTotal:number;protectedAmount:number;available:number;remaining:number};
export function transferImpact(s:BankSnapshot,intent:TransferIntent,excludeId?:string):TransferImpact{
 const pending=(s.schedules??[]).filter(item=>item.status==='pending' && item.id!==excludeId);
 const pendingTotal=pending.reduce((sum,item)=>sum+item.amount,0);
 const protectedAmount=Math.max(intent.protectedAmount??0,...pending.map(item=>item.protectedAmount??0));
 const held=heldOccasionBudget(s);
 const available=Math.max(0,Math.min(s.limit,s.balance-held-pendingTotal-protectedAmount));
 return {pendingTotal,protectedAmount,available,remaining:s.balance-held-pendingTotal-protectedAmount-intent.amount};
}
export type BankDraft=TransferIntent & {id:string;revision:number;balance:number;createdAt:number;expiresAt:number;impact?:TransferImpact};
export type BankReceipt=TransferIntent & {id:string;completedAt:number;balanceAfter:number};
export type BankControls={overseas:boolean;contactless:boolean;night:boolean};
export const cardProducts=[
 {id:'standard-debit',name:'标准借记卡',annualFee:0,benefit:'日常转账与支付',condition:'持有演示沙箱账户',materials:'无需提交真实身份资料'},
 {id:'safety-debit',name:'安心借记卡',annualFee:0,benefit:'默认开启夜间保护',condition:'持有演示沙箱账户',materials:'无需提交真实身份资料'},
] as const;
export type CardApplication={id:string;productId:string;createdAt:number;status:'submitted'};
export type ManagedCard={id:string;label:string;last4:string;createdAt:number;status:'demo-only'};
export type BankPayment={id:string;channel:'wechat'|'alipay'|'overseas';amount:number;merchant:string;occasionId?:string};
export type BankPaymentReceipt=BankPayment & {completedAt:number;balanceAfter:number;refundedAt?:number;refundBalanceAfter?:number};
export type BankSnapshot={revision:number;balance:number;limit:number;frozen:boolean;controls:BankControls;transactions:BankReceipt[];payments?:BankPaymentReceipt[];schedules?:BankSchedule[];aaRequests?:AARequest[];collections?:AACollection[];cardApplications?:CardApplication[];managedCards?:ManagedCard[];occasions?:import('./occasion-plans').OccasionPlan[];assetSummary?:BankAssetSummary;termDeposits?:TermDeposit[];asOf?:number};
export function validBankPayment(value:unknown):value is BankPayment {
 if(!value || typeof value!=='object')return false;
 const p=value as BankPayment;
 return typeof p.id==='string' && /^[\w:-]{1,180}$/.test(p.id) && ['wechat','alipay','overseas'].includes(p.channel) && Number.isSafeInteger(p.amount) && p.amount>0 && typeof p.merchant==='string' && p.merchant.trim().length>0 && p.merchant.length<=100 && (p.occasionId===undefined||validOccasionId(p.occasionId));
}
export type BankSettings={revision:number;limit?:number;frozen?:boolean;controls?:BankControls};
export function validBankSnapshot(v:unknown):v is BankSnapshot {
 if(!v || typeof v!=='object')return false;
 const s=v as BankSnapshot;
 if(s.assetSummary!==undefined&&(!validAssetSummary(s.assetSummary)||s.assetSummary.cash!==s.balance))return false;
 if(s.termDeposits!==undefined&&(!Array.isArray(s.termDeposits)||s.termDeposits.length>1000||!s.termDeposits.every(validTermDeposit)||new Set(s.termDeposits.map(d=>d.id)).size!==s.termDeposits.length))return false;
 if(s.asOf!==undefined&&(!Number.isSafeInteger(s.asOf)||s.asOf<=0))return false;
 if(s.occasions!==undefined&&(!Array.isArray(s.occasions)||s.occasions.length>100||new Set(s.occasions.map(p=>p.id)).size!==s.occasions.length||!s.occasions.every(validOccasionPlan)))return false;
 if(s.payments!==undefined && (!Array.isArray(s.payments) || !s.payments.every(p=>validBankPayment(p) && Number.isFinite(p.completedAt) && Number.isSafeInteger(p.balanceAfter) && (p.refundedAt===undefined || (Number.isFinite(p.refundedAt) && Number.isSafeInteger(p.refundBalanceAfter))))))return false;
  if(s.cardApplications!==undefined && (!Array.isArray(s.cardApplications)||!s.cardApplications.every(item=>typeof item.id==='string'&&/^[\w-]{1,80}$/.test(item.id)&&cardProducts.some(product=>product.id===item.productId)&&Number.isFinite(item.createdAt)&&item.status==='submitted')))return false;
  if(s.managedCards!==undefined && (!Array.isArray(s.managedCards)||s.managedCards.length>20||!s.managedCards.every(item=>typeof item.id==='string'&&/^[\w-]{1,80}$/.test(item.id)&&typeof item.label==='string'&&item.label.length>0&&item.label.length<=24&&!/\d{8,}|卡号|卡密|密码|安全码|验证码/.test(item.label)&&/^\d{4}$/.test(item.last4)&&Number.isFinite(item.createdAt)&&item.status==='demo-only')))return false;
 return Number.isSafeInteger(s.revision) && s.revision>=0 && Number.isSafeInteger(s.balance) && s.balance>=0 && Number.isSafeInteger(s.limit) && s.limit>=10000 && s.limit<=5000000 && typeof s.frozen==='boolean' && !!s.controls && ['overseas','contactless','night'].every(k=>typeof s.controls[k as keyof BankControls]==='boolean') && Array.isArray(s.transactions) && s.transactions.every(r=>validTransfer(r) && typeof r.id==='string' && Number.isFinite(r.completedAt) && Number.isSafeInteger(r.balanceAfter));
}
export function validTransfer(value:unknown):value is TransferIntent {
 if(!value || typeof value!=='object')return false;
 const v=value as TransferIntent;
 return (v.workspaceId===undefined||typeof v.workspaceId==='string'&&/^[\w-]{1,80}$/.test(v.workspaceId))&&bankRecipients.some(r=>r.id===v.recipientId) && Number.isSafeInteger(v.amount) && v.amount>0 && (v.executeAt===undefined || (Number.isSafeInteger(v.executeAt) && v.executeAt>0)) && (v.protectedAmount===undefined || (Number.isSafeInteger(v.protectedAmount) && v.protectedAmount>=0)) && (v.sourceAccountId===undefined||v.sourceAccountId==='demo-8888') && (v.remark===undefined||typeof v.remark==='string'&&v.remark.length<=80&&!/[\r\n[\]<>]/.test(v.remark));
}
export async function bankRequest<T>(body?:object):Promise<T> {
 const response=await fetch('/api/zhiyin/bank',{cache:'no-store',signal:AbortSignal.timeout(8000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error || '银行沙箱暂时不可用');error.name=response.status===400?'BankRejection':'BankUnavailable';throw error;}
 return data as T;
}
