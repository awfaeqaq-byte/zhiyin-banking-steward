import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {findBankRecipients,splitAA} from '../../src/lib/bank-transfer';
import {parseStewardReply,buildStewardInstructions} from '../../src/lib/steward-chat';
const dirs:string[]=[];
afterEach(()=>{dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
const now=Date.parse('2026-09-28T10:00:00+08:00');
function setup(){const dir=mkdtempSync(join(tmpdir(),'smart-bank-'));dirs.push(dir);return createBankStore(join(dir,'bank.json'));}
it('姓名、完整手机号、备注都能查找；不随意选定模糊对象',()=>{
 expect(findBankRecipients('妈妈')[0].id).toBe('mom');
 expect(findBankRecipients('+86 138 0000 6621')[0].id).toBe('mom');
 expect(findBankRecipients('母亲')[0].id).toBe('mom');
 expect(findBankRecipients('同事').length).toBeGreaterThan(1);
 expect(findBankRecipients('不存在')).toEqual([]);
});
it('预约授权后不扣款；到期一次执行，重试确认及调度不重复',()=>{
 const bank=setup(),before=bank.get().balance;
 const d=bank.prepare({recipientId:'mom',amount:20000,executeAt:now+60000},now);
 const s=bank.schedule(d.id,now+1);
 expect(bank.schedule(d.id,now+2)).toEqual(s);
 expect(bank.get().balance).toBe(before);
 bank.runDue(now+59999);expect(bank.get().transactions).toHaveLength(0);
 bank.runDue(now+60000);bank.runDue(now+70000);
 expect(bank.get().balance).toBe(before-20000);
 expect(bank.get().transactions).toHaveLength(1);
 expect(bank.get().schedules?.[0].status).toBe('completed');
});
it('预约可以撤销；冻结、余额和限额在执行时再次检查，失败不扣款',()=>{
 const bank=setup();
 const a=bank.prepare({recipientId:'dad',amount:100,executeAt:now+60000},now);bank.schedule(a.id,now+1);bank.cancelSchedule(a.id);bank.runDue(now+60000);
 expect(bank.get().schedules?.[0].status).toBe('cancelled');
 const b=bank.prepare({recipientId:'mom',amount:100,executeAt:now+120000},now);bank.schedule(b.id,now+1);
 bank.configure({revision:bank.get().revision,frozen:true});expect(bank.schedule(b.id,now+2).status).toBe('pending');bank.runDue(now+120000);
 expect(bank.get().schedules?.[1].status).toBe('failed');expect(bank.get().transactions).toHaveLength(0);
 expect(()=>bank.prepare({recipientId:'mom',amount:100,executeAt:now-1},now)).toThrow();
});
it('AA包含自己时100元三人合计精确到分；不包含自己时全额待收',()=>{
 expect(splitAA(10000,['mom','dad'],true).map(s=>s.amount)).toEqual([3334,3333,3333]);
 expect(splitAA(10000,['mom','dad'],false).map(s=>s.amount)).toEqual([5000,5000]);
 expect(()=>splitAA(1,['mom','dad'],true)).toThrow();
 expect(()=>splitAA(100,['mom','mom'],false)).toThrow();
});
it('AA发起不入账；对方沙箱付款后入账，重复付款幂等，取消后拒收',()=>{
 const bank=setup(),before=bank.get().balance;
 const aa=bank.createAA({requestId:'aa-test',title:'聚餐',amount:10000,recipientIds:['mom','dad'],includeSelf:true},now);
 expect(bank.get().balance).toBe(before);
 bank.settleAA(aa.id,'mom',now+1);bank.settleAA(aa.id,'mom',now+2);
 expect(bank.get().balance).toBe(before+3333);
 expect(bank.get().collections).toHaveLength(1);
 bank.cancelAA(aa.id);expect(()=>bank.settleAA(aa.id,'dad',now+3)).toThrow();
 expect(bank.get().balance).toBe(before+3333);
});
it('大模型可准备预约与AA，但不直接执行扣款',()=>{
 expect(parseStewardReply('[ZHIYIN_ACTION:PREPARE_TRANSFER|mom|20000|2026-09-30T10:00:00+08:00]',[]).action).toMatchObject({type:'prepare_transfer',executeAt:Date.parse('2026-09-30T10:00:00+08:00')});
 expect(parseStewardReply('[ZHIYIN_ACTION:PREPARE_AA|10000|mom,dad|true]',[]).action).toMatchObject({type:'prepare_aa',amount:10000,recipientIds:['mom','dad'],includeSelf:true});
});
it('聚餐花费加AA意图不会误入账单解读',()=>{
 expect(buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'今天聚餐花了100，和妈妈爸爸三个人AA，包含我'}]})).toContain('PREPARE_AA');
 for(const marker of ['PREPARE_AA|100|mom,mom|false','PREPARE_AA|100|unknown|true','PREPARE_AA|1|mom,dad|true','PREPARE_TRANSFER|mom|100|nonsense'])expect(parseStewardReply(`[ZHIYIN_ACTION:${marker}]`,[]).action).toBeUndefined();
});
it('AA收齐、重复发起与重启恢复，非法输入不可创建或偷改原单',()=>{
 const bank=setup(),input={requestId:'persist',title:'聚餐',amount:200,recipientIds:['mom','dad'] as const,includeSelf:false};
 const valid={...input,recipientIds:[...input.recipientIds]};
 const aa=bank.createAA(valid,now);expect(bank.createAA(valid,now+1)).toEqual(aa);
 expect(()=>bank.createAA({...valid,amount:300},now)).toThrow(/变化/);
 expect(()=>bank.createAA({...valid,title:''},now)).toThrow();
 expect(()=>bank.settleAA('unknown','mom',now)).toThrow();
 bank.settleAA(aa.id,'mom',now+1);bank.settleAA(aa.id,'dad',now+2);
 expect(bank.get().aaRequests?.[0].status).toBe('completed');
 expect(()=>bank.cancelAA(aa.id)).toThrow(/结束/);
 expect(()=>bank.cancelAA('unknown')).toThrow();
 const restored=createBankStore(join(dirs.at(-1)!,'bank.json'));
 expect(restored.get()).toEqual(bank.get());
 expect(restored.settleAA(aa.id,'dad',now+3).amount).toBe(100);
});
it('预约不能用立即确认执行、不能撤销已完成交易，过期方案不可授权',()=>{
 const bank=setup();
 const d=bank.prepare({recipientId:'mom',amount:100,executeAt:now+600000},now);
 expect(()=>bank.confirm(d.id,now+1)).toThrow(/预约/);
 expect(()=>bank.schedule(d.id,now+300001)).toThrow(/过期/);
 expect(()=>bank.cancelSchedule('unknown')).toThrow();
 const a=bank.prepare({recipientId:'mom',amount:100,executeAt:now+60000},now);
 bank.schedule(a.id,now+1);bank.runDue(now+60000);
 expect(()=>bank.cancelSchedule(a.id)).toThrow(/结束/);
 expect(bank.status(a.id).schedule?.status).toBe('completed');
});
