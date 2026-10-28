import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {occasionTotals, requestOccasionAdvice, type OccasionDraft} from './occasion-plans';

const now=Date.parse('2026-10-15T12:00:00+08:00');
const draft:OccasionDraft={title:'王芳生日筹备',recipient:'王芳',budget:80000,prepareAt:now+86400000,deliverAt:now+3*86400000,address:'江湾路 8 号',contact:'王芳 13800001234',note:'低甜',productIds:['cake-light','flowers-roses']};
const dirs:string[]=[];
function setup(){const dir=mkdtempSync(join(tmpdir(),'occasion-amend-'));dirs.push(dir);const file=join(dir,'bank.json');const bank=createBankStore(file);bank.saveOccasion({id:'birthday',revision:0,draft},now);bank.reserveOccasion('birthday',1,now);const order=bank.prepareOccasionOrder('birthday','cake-light',2,now);bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,channel:'wechat',merchant:order.merchant},now);return {bank,file,order};}
afterEach(()=>{vi.unstubAllGlobals();dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}));});
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
  const {bank}=setup();const scheduled=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:0,executeAt:now+100000},now);bank.schedule(scheduled.id,now,scheduled.review?.token);
  bank.pay({id:'other',amount:2000000,channel:'wechat',merchant:'其他消费'},now);
  expect(()=>bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,budget:300000},authorized:true},now)).toThrow(/预约|不足/);
  expect(bank.get().occasions![0].budget).toBe(80000);
  const amended=bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,budget:230000},authorized:true},now);
  expect(occasionTotals(amended.occasions![0],amended).held).toBe(209400);
 });
 it('原单真实退款后可移除商品并保留历史，重新加入同商品仍不能重复扣款',()=>{
  const {bank,file,order}=setup();bank.refundPayment(order.paymentId,now+1);
  bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft,budget:30000,productIds:['flowers-roses']},authorized:true},now+2);
  const plan=createBankStore(file).get().occasions![0];expect(plan.orders).toEqual([order]);expect(occasionTotals(plan,bank.get())).toMatchObject({spent:0,refunded:20600,held:30000});
  const flower=bank.prepareOccasionOrder('birthday','flowers-roses',bank.get().revision,now+3);bank.pay({id:flower.paymentId,occasionId:'birthday',amount:flower.amount,merchant:flower.merchant,channel:'wechat'},now+3);
  bank.saveOccasion({id:'birthday',revision:bank.get().revision,draft:{...draft},authorized:true},now+3);
  expect(()=>bank.prepareOccasionOrder('birthday','cake-light',bank.get().revision,now+4)).toThrow(/退款|原订单/);
  expect(()=>bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,channel:'wechat',merchant:order.merchant},now+4)).toThrow(/退款/);
 });
});

it('共享事项资料包含来源、生日边界，并与长草案和历史一起限制在代理请求大小内',async()=>{
 const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(init.body as string);expect(Buffer.byteLength(init.body as string)).toBeLessThan(32768);expect(body.input.every((message:{content:string})=>message.content.length<=2000)).toBe(true);
  expect(body.input.map((message:{content:string})=>message.content).join('')).toContain('birthdayDate');
  return {ok:true,json:async()=>({output_text:'{"text":"请核对来源冲突"}'})};
 });vi.stubGlobal('fetch',fetcher);
 await requestOccasionAdvice('准备'.repeat(1000),{...draft,title:'名'.repeat(60),recipient:'人'.repeat(60),address:'地'.repeat(200),contact:'电'.repeat(80),note:'偏'.repeat(500)},'忆'.repeat(1500),Array.from({length:8},()=>({role:'user',content:'史'.repeat(300)})),{version:1,sceneId:'birthday',workspaceIds:['birthday'],authorization:'none',facts:Array.from({length:30},(_,index)=>({field:'address',value:'地'.repeat(200),source:{kind:'occasion',id:`source-${index}`,workspaceId:'birthday',label:'标'.repeat(120)}})),conflicts:[],evidence:[]});
});
