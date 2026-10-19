import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,it,expect} from 'vitest';
import {createBankStore} from '../../server/bank-store';
const dirs:string[]=[];const now=Date.parse('2026-10-19T12:00:00+08:00');
function setup(){const dir=mkdtempSync(join(tmpdir(),'transfer-risk-'));dirs.push(dir);return createBankStore(join(dir,'bank.json'));}
afterEach(()=>dirs.splice(0).forEach(p=>rmSync(p,{recursive:true,force:true})));
const input={workspaceId:'dinner',recipientId:'mom' as const,amount:100000};
it('重复转账必须核对服务器签发的本方案提醒，允许有意的第二笔且保持幂等',()=>{
 const bank=setup(),first=bank.prepare(input,now);bank.confirm(first.id,now);
 const next=bank.prepare(input,now+1);
 expect(next.review?.matches).toMatchObject([{id:first.id,kind:'completed'}]);
 expect(()=>bank.confirm(next.id,now+2)).toThrow(/核对/);
 expect(()=>bank.confirm(next.id,now+2,'invented')).toThrow(/核对/);
 const paid=bank.confirm(next.id,now+2,next.review?.token);
 expect(bank.confirm(next.id,now+3)).toEqual(paid);
 expect(bank.get().transactions).toHaveLength(2);
});
it('大额与相近金额都不能绕过核对，令牌不能用于另一方案',()=>{
 const bank=setup(),first=bank.prepare({...input,amount:500000},now);
 expect(first.review?.large).toBe(true);
 expect(()=>bank.confirm(first.id,now)).toThrow(/核对/);
 const other=bank.prepare({...input,amount:500000},now);
 expect(()=>bank.confirm(other.id,now,first.review?.token)).toThrow(/核对/);
 bank.confirm(first.id,now,first.review?.token);
 const near=bank.prepare({...input,amount:499999},now+1);
 expect(near.review?.matches).toHaveLength(1);
 expect(()=>bank.confirm(near.id,now+2)).toThrow(/核对/);
});
it('新交易让旧方案失效，不能沿用旧勾选放行',()=>{
 const bank=setup(),a=bank.prepare(input,now),b=bank.prepare(input,now);
 bank.confirm(a.id,now+1);
 expect(()=>bank.confirm(b.id,now+2)).toThrow(/变化/);
 expect(bank.prepare(input,now+3).review?.matches).toHaveLength(1);
});
it('预约创建也必须复核，已核对的重复预约可执行',()=>{
 const bank=setup(),a=bank.prepare({...input,executeAt:now+60000},now);bank.schedule(a.id,now);
 const b=bank.prepare({...input,executeAt:now+60000},now+1);
 expect(b.review?.matches).toMatchObject([{id:a.id,kind:'pending'}]);
 expect(()=>bank.schedule(b.id,now+2)).toThrow(/核对/);
 bank.schedule(b.id,now+2,b.review?.token);
 expect(bank.runDue(now+60000).map(x=>x.status)).toEqual(['completed','completed']);
});
it('预约到期前发生新的同事项付款，暂停该预约并要求重新安排，不自动扣第二次',()=>{
 const bank=setup(),a=bank.prepare({...input,executeAt:now+60000},now);bank.schedule(a.id,now);
 const b=bank.prepare(input,now+1000);bank.confirm(b.id,now+1000,b.review?.token);
 const results=bank.runDue(now+60000);
 expect(results[0]).toMatchObject({status:'failed',error:expect.stringMatching(/重复|相近/)});
 expect(bank.get().transactions).toHaveLength(1);
});
it('伪造输入风险资料不能取消服务器判定',()=>{
 const bank=setup(),draft=bank.prepare({...input,amount:500000,review:{large:false,matches:[],token:'client'}},now);
 expect(draft.review?.large).toBe(true);
 expect(draft.review?.token).not.toBe('client');
});
