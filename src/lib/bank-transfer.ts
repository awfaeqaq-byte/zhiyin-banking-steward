export const bankRecipients=[{id:'mom',name:'妈妈',accountLast4:'6621'},{id:'dad',name:'爸爸',accountLast4:'7316'}] as const;
export type BankRecipientId=typeof bankRecipients[number]['id'];
export type TransferIntent={recipientId:BankRecipientId;amount:number};
export type BankDraft=TransferIntent & {id:string;revision:number;balance:number;createdAt:number;expiresAt:number};
export type BankReceipt=TransferIntent & {id:string;completedAt:number;balanceAfter:number};
export type BankControls={overseas:boolean;contactless:boolean;night:boolean};
export type BankPayment={id:string;channel:'wechat'|'alipay';amount:number;merchant:string};
export type BankPaymentReceipt=BankPayment & {completedAt:number;balanceAfter:number;refundedAt?:number;refundBalanceAfter?:number};
export type BankSnapshot={revision:number;balance:number;limit:number;frozen:boolean;controls:BankControls;transactions:BankReceipt[];payments?:BankPaymentReceipt[]};
export function validBankPayment(value:unknown):value is BankPayment {
 if(!value || typeof value!=='object')return false;
 const p=value as BankPayment;
 return typeof p.id==='string' && /^[\w:-]{1,180}$/.test(p.id) && ['wechat','alipay'].includes(p.channel) && Number.isSafeInteger(p.amount) && p.amount>0 && typeof p.merchant==='string' && p.merchant.trim().length>0 && p.merchant.length<=100;
}
export type BankSettings={revision:number;limit?:number;frozen?:boolean;controls?:BankControls};
export function validBankSnapshot(v:unknown):v is BankSnapshot {
 if(!v || typeof v!=='object')return false;
 const s=v as BankSnapshot;
 if(s.payments!==undefined && (!Array.isArray(s.payments) || !s.payments.every(p=>validBankPayment(p) && Number.isFinite(p.completedAt) && Number.isSafeInteger(p.balanceAfter) && (p.refundedAt===undefined || (Number.isFinite(p.refundedAt) && Number.isSafeInteger(p.refundBalanceAfter))))))return false;
 return Number.isSafeInteger(s.revision) && s.revision>=0 && Number.isSafeInteger(s.balance) && s.balance>=0 && Number.isSafeInteger(s.limit) && s.limit>=10000 && s.limit<=5000000 && typeof s.frozen==='boolean' && !!s.controls && ['overseas','contactless','night'].every(k=>typeof s.controls[k as keyof BankControls]==='boolean') && Array.isArray(s.transactions) && s.transactions.every(r=>validTransfer(r) && typeof r.id==='string' && Number.isFinite(r.completedAt) && Number.isSafeInteger(r.balanceAfter));
}
export function validTransfer(value:unknown):value is TransferIntent {
 if(!value || typeof value!=='object')return false;
 const v=value as TransferIntent;
 return bankRecipients.some(r=>r.id===v.recipientId) && Number.isSafeInteger(v.amount) && v.amount>0;
}
export async function bankRequest<T>(body?:object):Promise<T> {
 const response=await fetch('/api/zhiyin/bank',{cache:'no-store',signal:AbortSignal.timeout(8000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error || '银行沙箱暂时不可用');error.name=response.status===400?'BankRejection':'BankUnavailable';throw error;}
 return data as T;
}
