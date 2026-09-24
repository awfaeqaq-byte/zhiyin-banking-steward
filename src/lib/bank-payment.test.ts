import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {bankMiddleware} from '../../server/bank-store';
import {createServer} from 'node:http';

it('平台付款共用银行余额，幂等冲突拒绝，冻结后仍可原路退款且只退一次',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bank-payment-'));
 try {
  const bank=createBankStore(join(dir,'bank.json'));
  const payment={id:'food:one',channel:'wechat' as const,amount:2500,merchant:'测试餐厅'};
  const receipt=bank.pay(payment,100);
  expect(bank.get().balance).toBe(4227500);
  expect(bank.pay(payment,101)).toEqual(receipt);
  expect(()=>bank.pay({...payment,amount:2600},102)).toThrow(/不一致/);
  expect(()=>bank.pay({...payment,channel:'alipay'},102)).toThrow(/不一致/);
  bank.pay({...payment,id:'food:two',channel:'alipay'},103);
  expect(bank.get().balance).toBe(4225000);
  bank.configure({revision:2,frozen:true});
  expect(()=>bank.pay({...payment,id:'food:three'},104)).toThrow(/挂失/);
  bank.refundPayment(payment.id,105);
  bank.refundPayment(payment.id,106);
  expect(bank.get().balance).toBe(4227500);
  expect(createBankStore(join(dir,'bank.json')).get().payments).toHaveLength(2);
  expect(()=>bank.refundPayment('missing',107)).toThrow();
 } finally {rmSync(dir,{recursive:true,force:true});}
});

it('平台扣款校验金额、限额、夜间保护，不接受任意输入',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bank-payment-'));
 try {
  const bank=createBankStore(join(dir,'bank.json'));
  const payment={id:'one',channel:'alipay' as const,amount:2500,merchant:'商家'};
  for(const amount of [0,-1,1.2,NaN,2000001])expect(()=>bank.pay({...payment,amount},100)).toThrow();
  expect(()=>bank.pay({...payment,channel:'unknown'} as never,100)).toThrow();
  expect(()=>bank.pay(payment,Date.parse('2026-09-24T16:00:00Z'))).toThrow(/夜间/);
  expect(bank.get().balance).toBe(4230000);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

it('HTTP付款和退款持久化，缺授权或跨站请求不能扣款',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bank-payment-'));
 const bank=createBankStore(join(dir,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const server=createServer(bankMiddleware(bank));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as {port:number};
 const url=`http://127.0.0.1:${address.port}`;
 const post=(body:object,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1',...headers},body:JSON.stringify(body)});
 try {
  const payment={id:'http:one',channel:'alipay',merchant:'测试店',amount:100};
  expect((await post({type:'payment',payment})).status).toBe(400);
  expect((await post({type:'payment',payment,authorized:true},{Origin:'https://example.org'})).status).toBe(403);
  expect((await post({type:'payment',payment,authorized:true})).status).toBe(200);
  expect((await post({type:'payment',payment,authorized:true})).status).toBe(200);
  expect(bank.get().balance).toBe(4229900);
  expect((await post({type:'refund-payment',paymentId:payment.id,authorized:true})).status).toBe(200);
  expect(bank.get().balance).toBe(4230000);
 } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));rmSync(dir,{recursive:true,force:true});}
});
