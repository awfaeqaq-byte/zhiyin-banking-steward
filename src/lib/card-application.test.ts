import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
let directory='';afterEach(()=>{if(directory)rmSync(directory,{recursive:true,force:true});directory='';});
function store(){directory=mkdtempSync(join(tmpdir(),'card-flow-'));return createBankStore(join(directory,'bank.json'));}

describe('卡片申请及安全交错场景',()=>{
 it('取消不提交；同一申请幂等，旧版本或变更卡种拒绝',()=>{
  const bank=store();expect(bank.get().cardApplications).toEqual([]);
  const first=bank.applyCard({id:'application-1',productId:'standard-debit',revision:0},100);
  expect(first.status).toBe('submitted');
  expect(bank.applyCard({id:'application-1',productId:'standard-debit',revision:0},101)).toEqual(first);
  expect(bank.get().cardApplications).toHaveLength(1);
  expect(()=>bank.applyCard({id:'application-1',productId:'safety-debit',revision:1},102)).toThrow(/卡种已变化/);
  expect(()=>bank.applyCard({id:'application-2',productId:'safety-debit',revision:0},102)).toThrow(/账户已变化/);
 });
 it('挂失、超限和余额检查拦截沙箱付款，恢复后仅允许合规支付',()=>{
  const bank=store();bank.configure({revision:0,frozen:true});
  expect(()=>bank.pay({id:'order-1',channel:'wechat',merchant:'店铺',amount:10000},Date.parse('2026-10-08T12:00:00+08:00'))).toThrow(/挂失/);
  bank.configure({revision:1,frozen:false,limit:10000});
  expect(()=>bank.pay({id:'order-2',channel:'wechat',merchant:'店铺',amount:10001},Date.parse('2026-10-08T12:00:00+08:00'))).toThrow(/限额/);
  const receipt=bank.pay({id:'order-3',channel:'wechat',merchant:'店铺',amount:10000},Date.parse('2026-10-08T12:00:00+08:00'));
  expect(bank.pay({id:'order-3',channel:'wechat',merchant:'店铺',amount:10000},Date.parse('2026-10-08T12:00:00+08:00'))).toEqual(receipt);
  expect(bank.get().balance).toBe(4220000);
 });
 it('关闭无卡支付会拦截跨平台银行卡付款，重新开启后可执行',()=>{
  const bank=store();const now=Date.parse('2026-10-08T12:00:00+08:00');
  bank.configure({revision:0,controls:{overseas:false,contactless:false,night:true}});
  expect(()=>bank.pay({id:'cardless-1',channel:'alipay',merchant:'店铺',amount:100},now)).toThrow(/无卡支付已关闭/);
  expect(bank.get().balance).toBe(4230000);
  bank.configure({revision:1,controls:{overseas:false,contactless:true,night:true}});
  bank.pay({id:'cardless-1',channel:'alipay',merchant:'店铺',amount:100},now);
  expect(bank.get().balance).toBe(4229900);
 });
});
