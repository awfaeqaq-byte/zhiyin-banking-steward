import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createBankStore, bankMiddleware} from '../../server/bank-store';
import {availableBankFunds, heldOccasionBudget, occasionTotals, requestOccasionAdvice, type OccasionDraft} from './occasion-plans';

const now=Date.parse('2026-10-08T10:00:00+08:00');
const draft:OccasionDraft={title:'爱人生日',recipient:'爱人',budget:100000,prepareAt:Date.parse('2026-10-18T10:00:00+08:00'),deliverAt:Date.parse('2026-10-20T18:00:00+08:00'),address:'江湾金融中心 A 座',contact:'叶先生 13800001234',note:'蛋糕不要太甜',productIds:['cake-light','flowers-roses']};
const dirs:string[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'occasion-test-'));dirs.push(dir);const file=join(dir,'bank.json');return {bank:createBankStore(file),file};}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
describe('筹备任务与真实预留预算',()=>{
 it('草稿不占资金；确认后保护预算；其他付款、即时和预约转账不能花掉它',()=>{
  const {bank}=fixture();bank.saveOccasion({id:'birthday',revision:0,draft},now);
  expect(heldOccasionBudget(bank.get())).toBe(0);
  bank.reserveOccasion('birthday',1,now);
  expect(bank.get().balance).toBe(4230000);
  expect(availableBankFunds(bank.get())).toBe(4130000);
  bank.pay({id:'other',channel:'wechat',merchant:'其他消费',amount:2000000},now);
  bank.pay({id:'other-two',channel:'alipay',merchant:'其他消费',amount:2000000},now);
  expect(()=>bank.pay({id:'other-three',channel:'wechat',merchant:'其他消费',amount:130001},now)).toThrow(/预留|可用/);
  expect(()=>bank.prepare({recipientId:'mom',amount:130001},now)).toThrow();
  expect(()=>bank.prepare({recipientId:'mom',amount:130001,executeAt:now+100000},now)).toThrow();
  bank.cancelOccasion('birthday',bank.get().revision,now);
  expect(heldOccasionBudget(bank.get())).toBe(0);
  expect(availableBankFunds(bank.get())).toBe(230000);
 });
 it('订单绑定真实商品金额，幂等扣款；退款恢复预留；取消后释放余款且旧订单不能付款',()=>{
  const {bank,file}=fixture();bank.saveOccasion({id:'one',revision:0,draft},now);bank.reserveOccasion('one',1,now);
  const order=bank.prepareOccasionOrder('one','cake-light',2,now);
  expect(bank.prepareOccasionOrder('one','cake-light',bank.get().revision,now)).toEqual(order);
  const input={id:order.paymentId,channel:'wechat' as const,merchant:order.merchant,amount:order.amount,occasionId:'one'};
  expect(()=>bank.pay({...input,amount:order.amount+1},now)).toThrow(/不一致/);
  expect(()=>bank.pay({...input,occasionId:'missing'},now)).toThrow();
  expect(()=>bank.pay({...input,occasionId:undefined},now)).toThrow();
  bank.pay(input,now);bank.pay(input,now);
  expect(bank.get().balance).toBe(4230000-order.amount);
  expect(occasionTotals(bank.get().occasions![0],bank.get()).spent).toBe(order.amount);
  expect(heldOccasionBudget(bank.get())).toBe(100000-order.amount);
  bank.refundPayment(order.paymentId,now+1);bank.refundPayment(order.paymentId,now+2);
  expect(bank.get().balance).toBe(4230000);
  expect(heldOccasionBudget(bank.get())).toBe(100000);
  expect(()=>bank.pay(input,now+3)).toThrow(/退款/);
  const second=bank.prepareOccasionOrder('one','flowers-roses',bank.get().revision,now);
  bank.cancelOccasion('one',bank.get().revision,now);
  expect(()=>bank.pay({id:second.paymentId,channel:'alipay',merchant:second.merchant,amount:second.amount,occasionId:'one'},now)).toThrow(/结束|取消/);
  expect(createBankStore(file).get().occasions![0].status).toBe('cancelled');
 });
 it('拒绝超预算、非法日期、过期版本；预留考虑已有预约，编辑有订单的安排需重新核对',()=>{
  const {bank}=fixture();
  expect(()=>bank.saveOccasion({id:'bad',revision:0,draft:{...draft,budget:100}},now)).toThrow(/预算/);
  expect(()=>bank.saveOccasion({id:'bad',revision:0,draft:{...draft,prepareAt:draft.deliverAt+1}},now)).toThrow(/时间/);
  expect(()=>bank.saveOccasion({id:'bad',revision:0,draft:{...draft,productIds:['made-up']}},now)).toThrow(/商品/);
  bank.saveOccasion({id:'one',revision:0,draft},now);
  expect(()=>bank.reserveOccasion('one',0,now)).toThrow(/变化/);
  const scheduled=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:2200000,executeAt:now+10000},now);bank.schedule(scheduled.id,now);
  expect(()=>bank.reserveOccasion('one',bank.get().revision,now)).toThrow(/预约|不足/);
  bank.cancelSchedule(scheduled.id);bank.reserveOccasion('one',bank.get().revision,now);
  bank.prepareOccasionOrder('one','cake-light',bank.get().revision,now);
  expect(()=>bank.saveOccasion({id:'one',revision:bank.get().revision,draft:{...draft,budget:120000}},now)).toThrow(/订单/);
 });
 it('HTTP必须明确确认才能预留，读取可用资金和任务，过大或跨站输入被拒绝',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  const {bank}=fixture();const server=createServer(bankMiddleware(bank));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post=(data:object,origin?:string)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  try{
   expect((await post({type:'save-occasion',id:'one',revision:0,draft:{...draft,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000}})).status).toBe(200);
   expect((await post({type:'reserve-occasion',id:'one',revision:1})).status).toBe(400);
   expect((await post({type:'reserve-occasion',id:'one',revision:1,authorized:true},'https://evil.example')).status).toBe(403);
   expect((await post({type:'reserve-occasion',id:'one',revision:1,authorized:true})).status).toBe(200);
   const snapshot=await (await fetch(url)).json();expect(snapshot.occasions[0].title).toBe('爱人生日');expect(availableBankFunds(snapshot)).toBe(4130000);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('模型只提出字段与商品建议，读取当前任务和记忆；无效商品不进入方案',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({output_text:JSON.stringify({text:'建议低糖蛋糕配玫瑰。',patch:{budget:100000,productIds:['cake-light','flowers-roses']}})})});vi.stubGlobal('fetch',fetchMock);
  const advice=await requestOccasionAdvice('预算1000，蛋糕别太甜',draft,'用户喜欢简洁表达');expect(advice.patch?.productIds).toEqual(draft.productIds);
  const body=JSON.parse(fetchMock.mock.calls[0][1].body);expect(body.instructions).toContain('不能');expect(body.input.map((m:{content:string})=>m.content).join('')).toContain('用户喜欢简洁表达');
  fetchMock.mockResolvedValue({ok:true,json:async()=>({output_text:'{"text":"已付款","patch":{"productIds":["invented"]}}'})});await expect(requestOccasionAdvice('帮我选',draft,'')).rejects.toThrow(/商品/);
 });
 it('记忆和较长建议按代理限制分段，总请求仍在32KiB以内',async()=>{
  const mock=vi.fn(async(_url:string,init:RequestInit)=>{
   const body=JSON.parse(init.body as string);expect(body.input.every((m:{content:string})=>m.content.length<=2000)).toBe(true);expect(Buffer.byteLength(init.body as string)).toBeLessThan(32768);
   return {ok:true,json:async()=>({output_text:'{"text":"请核对日期"}'})};
  });vi.stubGlobal('fetch',mock);
  await requestOccasionAdvice('生日'.repeat(1000),{...draft,note:'甜'.repeat(500)},'偏好'.repeat(2500),Array.from({length:8},(_,i)=>({role:i%2?'assistant' as const:'user' as const,content:'筹备'.repeat(1500)})));
 });
 it('模型填写北京时间日期由程序转换，拒绝过去送达、日期溢出及倒序安排',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({output_text:JSON.stringify({text:'10月20日送达',patch:{prepareAt:'2026-10-18T10:00',deliverAt:'2026-10-20T18:00'}})})});vi.stubGlobal('fetch',mock);
  const result=await requestOccasionAdvice('10月20日生日，提前两天准备',{},'');expect(result.patch).toEqual({prepareAt:draft.prepareAt,deliverAt:draft.deliverAt});
  for(const patch of [{deliverAt:1737302400000},{deliverAt:'2026-02-30T18:00'},{prepareAt:'2026-10-21T10:00',deliverAt:'2026-10-20T18:00'},{deliverAt:'2028-10-20T18:00'}]){
   mock.mockResolvedValue({ok:true,json:async()=>({output_text:JSON.stringify({text:'方案好了',patch})})});
   await expect(requestOccasionAdvice('帮我安排',draft,'')).rejects.toThrow(/日期|时间/);
  }
 });
});
