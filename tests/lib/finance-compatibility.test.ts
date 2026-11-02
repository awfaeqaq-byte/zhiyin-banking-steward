import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {heldOccasionBudget,type OccasionDraft} from '../../src/lib/occasion-plans';

const now=Date.parse('2026-10-12T12:00:00+08:00');
const dirs:string[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'finance-compat-'));dirs.push(dir);return createBankStore(join(dir,'bank.json'));}
const occasion:OccasionDraft={title:'爱人生日',recipient:'爱人',budget:4000000,prepareAt:now+86400000,deliverAt:now+3*86400000,address:'测试地址',contact:'测试联系人',note:'低甜',productIds:['cake-light']};
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));

it('统一理财扣款不能挪用生日预算，失败保持余额与安排不变',()=>{
 const bank=fixture();bank.saveOccasion({id:'birthday',revision:0,draft:occasion},now);bank.reserveOccasion('birthday',1,now);
 const before=bank.get();
 expect(()=>bank.wealthMutate(book=>{book.cashBalance-=300000;})).toThrow(/预留|资金不足/);
 expect(bank.get()).toEqual(before);expect(heldOccasionBudget(bank.get())).toBe(4000000);
});
it('统一理财扣款保护已预约转账及其还款预算',()=>{
 const bank=fixture();const transfer=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:2000000,executeAt:now+86400000},now);bank.schedule(transfer.id,now,transfer.review?.token);
 const before=bank.get();expect(()=>bank.wealthMutate(book=>{book.cashBalance-=300000;})).toThrow(/预约|资金不足/);
 expect(bank.get()).toEqual(before);
});
it('理财与卡申请共享余额，但保留原生日安排、付款回执和退款入口',()=>{
 const bank=fixture();bank.saveOccasion({id:'birthday',revision:0,draft:{...occasion,budget:100000}},now);bank.reserveOccasion('birthday',1,now);
 bank.wealthMutate(book=>{book.cashBalance-=100000;});
 const snapshot=bank.get();expect(snapshot.balance).toBe(4130000);expect(snapshot.occasions?.[0].status).toBe('reserved');
 bank.applyCard({id:'card-request',productId:'standard-debit',revision:snapshot.revision},now);
 expect(bank.get().cardApplications).toHaveLength(1);expect(bank.get().occasions).toHaveLength(1);
 const order=bank.prepareOccasionOrder('birthday','cake-light',bank.get().revision,now);
 bank.pay({id:order.paymentId,amount:order.amount,merchant:order.merchant,occasionId:'birthday',channel:'wechat'},now);
 bank.refundPayment(order.paymentId,now+1);expect(bank.get().balance).toBe(4130000);expect(bank.wealthRead().cashBalance).toBe(4130000);
});
