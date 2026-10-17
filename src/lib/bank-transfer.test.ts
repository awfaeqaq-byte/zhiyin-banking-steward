import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore,bankMiddleware} from '../../server/bank-store';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function setup(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-bank-test-'));dirs.push(dir);return createBankStore(join(dir,'bank.json'));}
it('挂失和限额持久化，旧方案不能绕过新的用卡设置',()=>{
 const bank=setup();const draft=bank.prepare({recipientId:'mom',amount:200000},100);
 bank.configure({revision:0,frozen:true});expect(bank.get().frozen).toBe(true);
 expect(()=>bank.confirm(draft.id,101)).toThrow();expect(()=>bank.prepare({recipientId:'mom',amount:100},102)).toThrow(/挂失/);
 bank.configure({revision:1,frozen:false,limit:10000});expect(bank.get().limit).toBe(10000);
 expect(()=>bank.prepare({recipientId:'mom',amount:10001},103)).toThrow(/限额/);
 expect(()=>bank.configure({revision:1,limit:50000})).toThrow(/变化/);
 expect(()=>bank.configure({revision:2,limit:-1})).toThrow();
});
it('核对不扣钱，确认原子更新余额与账单，重试不重复扣款',()=>{
 const bank=setup(),initial=bank.get();
 const draft=bank.prepare({recipientId:'mom',amount:200000},100);
 expect(bank.get().balance).toBe(initial.balance);
 const receipt=bank.confirm(draft.id,101);
 expect(bank.get().balance).toBe(initial.balance-200000);
 expect(bank.get().transactions).toHaveLength(1);
 expect(bank.confirm(draft.id,102)).toEqual(receipt);
 expect(bank.get().transactions).toHaveLength(1);
});
it('付款账户和备注随服务端回执保存，历史可按同一路径核对',()=>{
 const bank=setup();const draft=bank.prepare({recipientId:'mom',amount:10000,sourceAccountId:'demo-8888',remark:'生活费'},Date.parse('2026-10-17T12:00:00+08:00'));
 expect(draft.remark).toBe('生活费');expect(bank.get().transactions).toHaveLength(0);
 const receipt=bank.confirm(draft.id,Date.parse('2026-10-17T12:00:01+08:00'));
 expect(receipt).toMatchObject({sourceAccountId:'demo-8888',remark:'生活费',balanceAfter:4220000});
 expect(bank.get().transactions.filter(item=>item.recipientId==='mom')).toEqual([receipt]);
 expect(()=>bank.prepare({recipientId:'mom',amount:100,sourceAccountId:'other' as 'demo-8888'},Date.parse('2026-10-17T12:01:00+08:00'))).toThrow();
});
it('余额变化或超时需要重新核对；非法金额与收款人被后端拒绝',()=>{
 const bank=setup();
 for(const amount of [0,-1,1.1,Infinity,2000001])expect(()=>bank.prepare({recipientId:'mom',amount},100)).toThrow();
 expect(()=>bank.prepare({recipientId:'unknown',amount:1},100)).toThrow();
 const first=bank.prepare({recipientId:'mom',amount:2000000},100),second=bank.prepare({recipientId:'dad',amount:2000000},100);
 bank.confirm(first.id,101);
 expect(()=>bank.confirm(second.id,102)).toThrow(/变化/);
 const late=bank.prepare({recipientId:'dad',amount:100},100);
 expect(()=>bank.confirm(late.id,400001)).toThrow(/过期/);
 const third=bank.prepare({recipientId:'mom',amount:2000000},102);bank.confirm(third.id,103);
 expect(()=>bank.prepare({recipientId:'mom',amount:300000},104)).toThrow(/余额/);
 expect(()=>bank.confirm('made-up',105)).toThrow();
});
it('账本重启保持收付款平衡，损坏或写锁不静默重置',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-bank-test-'));dirs.push(dir);const file=join(dir,'bank.json');
 const bank=createBankStore(file),d=bank.prepare({recipientId:'dad',amount:100},100);bank.confirm(d.id,101);
 const saved=JSON.parse(readFileSync(file,'utf8'));expect(saved.received.dad).toBe(100);expect(saved.balance+saved.received.dad+saved.received.mom).toBe(4230000);
 expect(createBankStore(file).status(d.id).receipt?.amount).toBe(100);
 writeFileSync(file+'.lock','test');expect(()=>bank.prepare({recipientId:'mom',amount:1},103)).toThrow(/正在处理/);
 writeFileSync(file,'bad-json');expect(()=>bank.get()).toThrow();expect(readFileSync(file,'utf8')).toBe('bad-json');
});
it('夜间保护按北京时间拦截，可经用户设置关闭',()=>{
 const bank=setup(),night=Date.parse('2026-09-25T00:10:00+08:00');
 expect(()=>bank.prepare({recipientId:'mom',amount:100},night)).toThrow(/夜间/);
 bank.configure({revision:0,controls:{overseas:false,contactless:true,night:false}});
 const draft=bank.prepare({recipientId:'mom',amount:100},night);expect(bank.confirm(draft.id,night+1).amount).toBe(100);
});
it('HTTP接口强制同源、显式确认，服务器回执可查询',async()=>{
 const bank=setup();bank.configure({revision:0,controls:{overseas:false,contactless:true,night:false}});
 const server=createServer(bankMiddleware(bank));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();if(!a || typeof a==='string')throw Error('address');
 const url=`http://127.0.0.1:${a.port}`,headers={'Content-Type':'application/json','X-Zhiyin-Bank':'1'};
 const post=(body:object)=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
 try{
  expect((await fetch(url)).status).toBe(200);expect((await fetch(url,{method:'POST'})).status).toBe(403);expect((await fetch(url,{headers:{Origin:'https://invalid.example'}})).status).toBe(403);expect((await fetch(url,{method:'DELETE'})).status).toBe(405);
  const draft=await (await post({type:'prepare',recipientId:'mom',amount:101})).json();
  expect((await post({type:'confirm',draftId:draft.id})).status).toBe(400);
  const receipt=await (await post({type:'confirm',draftId:draft.id,authorized:true})).json();expect(receipt.amount).toBe(101);
  expect((await (await post({type:'status',draftId:draft.id})).json()).receipt).toEqual(receipt);
  expect((await post({type:'settings',revision:bank.get().revision,limit:50000})).status).toBe(200);
  expect((await post({type:'prepare',recipientId:'mom',amount:0})).status).toBe(400);
  expect((await post({text:'x'.repeat(2050)})).status).toBe(413);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
