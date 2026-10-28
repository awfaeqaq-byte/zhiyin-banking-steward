import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {buildStewardInstructions,parseStewardReply,isBankRequest} from './steward-chat';
const now=Date.parse('2026-09-28T10:00:00+08:00');
const dirs:string[]=[];
function setup(){const dir=mkdtempSync(join(tmpdir(),'transfer-steward-'));dirs.push(dir);return createBankStore(join(dir,'bank.json'));}
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));

it('保留金额进入真实草稿和回执；不足时不能办理而非口头提醒',()=>{
 const bank=setup();
 expect(()=>bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:3000000},now)).toThrow(/保留/);
 const draft=bank.prepare({recipientId:'mom',amount:200000,protectedAmount:1200000},now);
 expect(draft).toMatchObject({protectedAmount:1200000});
 expect(bank.confirm(draft.id,now+1)).toMatchObject({protectedAmount:1200000,balanceAfter:4030000});
});
it('考虑其他待执行预约，避免重复使用同一笔可安排资金',()=>{
 const bank=setup();
 const a=bank.prepare({recipientId:'dad',amount:2000000,executeAt:now+60000},now);bank.schedule(a.id,now+1,a.review?.token);
 expect(()=>bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:1000000},now+2)).toThrow(/保留|预约/);
 bank.cancelSchedule(a.id);
 expect(()=>bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:1000000},now+3)).not.toThrow();
});
it('预约到期重新检查保留金额，其他消费后资金不足就不扣款',()=>{
 const bank=setup();
 const a=bank.prepare({recipientId:'mom',amount:2000000,executeAt:now+60000,protectedAmount:2000000},now);
 bank.schedule(a.id,now+1,a.review?.token);
 bank.pay({id:'expense',channel:'wechat',merchant:'测试消费',amount:300000},now+2);
 const before=bank.get().balance;bank.runDue(now+60000);
 expect(bank.get().schedules?.[0]).toMatchObject({status:'failed',protectedAmount:2000000});
 expect(bank.get().schedules?.[0].error).toContain('保留');
 expect(bank.get().balance).toBe(before);expect(bank.get().transactions).toHaveLength(0);
});
it('非法保留金额不得被悄悄忽略',()=>{
 const bank=setup();
 for(const protectedAmount of [-1,1.5,'200',Number.MAX_SAFE_INTEGER+1]){
  expect(()=>bank.prepare({recipientId:'mom',amount:100,protectedAmount},now)).toThrow();
 }
});
it('接受带资金约束的模型方案；拒绝非法参数；提供查询记录动作',()=>{
 expect(parseStewardReply('[ZHIYIN_ACTION:PREPARE_GUARDED_TRANSFER|mom|200000|now|1200000]',[]).action)
  .toEqual({type:'prepare_transfer',recipientId:'mom',amount:200000,protectedAmount:1200000});
 expect(parseStewardReply('[ZHIYIN_ACTION:PREPARE_GUARDED_TRANSFER|dad|200000|2026-09-30T10:00:00+08:00|1200000]',[]).action)
  .toMatchObject({executeAt:Date.parse('2026-09-30T10:00:00+08:00'),protectedAmount:1200000});
 for(const marker of ['mom|100|now|-1','mom|100|tomorrow|100','unknown|100|now|100'])
  expect(parseStewardReply(`[ZHIYIN_ACTION:PREPARE_GUARDED_TRANSFER|${marker}]`,[]).action).toBeUndefined();
 expect(parseStewardReply('[ZHIYIN_ACTION:OPEN_TRANSFER_RECORDS]',[]).action).toEqual({type:'open_transfer_records'});
 expect(isBankRequest([{role:'user',content:'之前安排给妈妈的那笔钱怎么样了'}])).toBe(true);
 expect(isBankRequest([{role:'user',content:'之前安排给妈妈的钱怎么样了'}])).toBe(true);
});
it('转账规划使用续费测算，同时明确还款数据缺失以及账户不混算',()=>{
 const text=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转2000，帮我留够还款和续费'}],
  fundingForecast:{horizonDays:7,from:now,to:now+7*86400000,knownBalanceTotal:50000,upcomingTotal:1800,shortfallTotal:0,coverageIncomplete:true,
   accounts:[{provider:'wechat_pay',providerName:'微信支付',balance:50000,upcomingTotal:1800,shortfall:0,firstShortfallAt:null,status:'covered',warnings:[],charges:[{id:'cloud',title:'云盘会员',amount:1800,chargeAt:now+86400000,projectedBalance:48200}]}]}});
 expect(text).toContain('云盘会员');expect(text).toContain('PREPARE_GUARDED_TRANSFER');
 expect(text).toContain('没有信用卡应还账单');expect(text).toContain('不能自动从银行卡扣减');
 expect(text.length).toBeLessThanOrEqual(4000);
});
