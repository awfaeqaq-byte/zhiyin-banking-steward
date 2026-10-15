import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {occasionTotals, type OccasionDraft} from './occasion-plans';

const now=Date.parse('2026-10-15T12:00:00+08:00');
const draft:OccasionDraft={title:'王芳生日筹备',recipient:'王芳',budget:80000,prepareAt:now+86400000,deliverAt:now+3*86400000,address:'江湾路 8 号',contact:'王芳 13800001234',note:'低甜',productIds:['cake-light','flowers-roses']};
const dirs:string[]=[];
function setup(){const dir=mkdtempSync(join(tmpdir(),'occasion-amend-'));dirs.push(dir);const file=join(dir,'bank.json');const bank=createBankStore(file);bank.saveOccasion({id:'birthday',revision:0,draft},now);bank.reserveOccasion('birthday',1,now);const order=bank.prepareOccasionOrder('birthday','cake-light',2,now);bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,channel:'wechat',merchant:order.merchant},now);return {bank,file,order};}
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));
describe('同一筹备事项的局部变更',()=>{
 it('本人确认移除未下单鲜花和降预算，保留已付蛋糕、同一任务和付款事实',()=>{
  const {bank,file,order}=setup();const before=bank.get();
  const next=bank.saveOccasion({id:'birthday',revision:before.revision,draft:{...draft,budget:30000,productIds:['cake-light']},authorized:true},now+1);
  const plan=next.occasions![0];
  expect(plan.id).toBe('birthday');expect(plan.orders).toEqual([order]);expect(next.payments).toEqual(before.payments);expect(next.balance).toBe(before.balance);
  expect(occasionTotals(plan,next)).toMatchObject({spent:20600,held:9400,quote:20600});
  expect(createBankStore(file).get().occasions![0]).toEqual(plan);
 });
 it('已预留的方案变化必须明确确认，旧账户版本不能授权新方案',()=>{
  const {bank}=setup();const revision=bank.get().revision;
  expect(()=>bank.saveOccasion({id:'birthday',revision,draft:{...draft,budget:100000}},now)).toThrow(/确认/);
  bank.pay({id:'intervening',amount:100,channel:'alipay',merchant:'其他支出'},now);
  expect(()=>bank.saveOccasion({id:'birthday',revision,draft:{...draft,budget:100000},authorized:true},now)).toThrow(/变化/);
  expect(bank.get().occasions![0].budget).toBe(80000);
 });
 it('涉及已下单商品或配送信息的变更必须先处理原单，不能顺带改动订单',()=>{
  const {bank,order}=setup();
  for(const patch of [{productIds:['flowers-roses']},{deliverAt:draft.deliverAt+86400000},{address:'另一个地址'},{contact:'李娜'},{note:'不要奶油'},{recipient:'李娜'}]){
   expect(()=>bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,...patch},authorized:true},now)).toThrow(/原订单|原单/);
   expect(bank.get().occasions![0].orders).toEqual([order]);
  }
 });
 it('重算剩余预留时扣除已支付金额，同时继续保护其他预约和预留',()=>{
  const {bank}=setup();const scheduled=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:0,executeAt:now+100000},now);bank.schedule(scheduled.id,now);
  bank.pay({id:'other',amount:2000000,channel:'wechat',merchant:'其他消费'},now);
  expect(()=>bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,budget:300000},authorized:true},now)).toThrow(/预约|不足/);
  expect(bank.get().occasions![0].budget).toBe(80000);
 });
 it('原单真实退款后可移除商品并保留历史，重新加入同商品仍不能重复扣款',()=>{
  const {bank,file,order}=setup();bank.refundPayment(order.paymentId,now+1);
  bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,budget:30000,productIds:['flowers-roses']},authorized:true},now+2);
  const plan=createBankStore(file).get().occasions![0];expect(plan.orders).toEqual([order]);expect(occasionTotals(plan,bank.get())).toMatchObject({spent:0,refunded:20600,held:30000});
  bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft},authorized:true},now+3);
  expect(()=>bank.prepareOccasionOrder('birthday','cake-light',bank.get().revision,now+4)).toThrow(/退款|原订单/);
  expect(()=>bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,channel:'wechat',merchant:order.merchant},now+4)).toThrow(/退款/);
 });
});
