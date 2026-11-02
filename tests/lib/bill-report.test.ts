import {describe,expect,it} from 'vitest';
import {availableBillMonths,buildAnnualBillReport,buildMonthlyBillReport} from '../../src/lib/bill-report';
import type {ConnectedFinancialSource} from '../../src/lib/financial-connections';
const source=(provider:'wechat_pay'|'alipay',rows:ConnectedFinancialSource['transactions'],complete=true):ConnectedFinancialSource=>({provider,displayName:provider==='wechat_pay'?'微信支付':'支付宝',accountMasked:'***',transactions:rows,autopays:[],syncedAt:'2026-10-08T12:00:00+08:00',scopes:['transactions'],transactionCoverage:{total:rows.length,returned:rows.length,invalid:0,complete}});
const row=(id:string,at:string,amount:number,category='餐饮',kind:'payment'|'refund'|'income'|'transfer'='payment')=>({id,title:id,amount,category,occurredAt:at,kind});

describe('账单报告复杂数据场景',()=>{
 it('跨平台同额保留、同平台重复去重，退款和转账不冲减消费，月年总额一致',()=>{
  const connections={wechat_pay:source('wechat_pay',[row('a','2026-08-20',-5000),row('b','2026-09-01',-10000),row('b','2026-09-01',-10000),row('refund','2026-09-02',5000,'餐饮','refund'),row('transfer','2026-09-03',-20000,'转账','transfer')]),alipay:source('alipay',[row('b','2026-09-01',-10000),row('c','2026-09-10',-3000,'购物')])};
  const september=buildMonthlyBillReport(connections,'2026-09')!;
  expect(september.expense).toBe(23000);
  expect(september.refund).toBe(5000);
  expect(september.transferOut).toBe(20000);
  expect(september.diagnosis.quality.duplicates).toBe(1);
  expect(september.transactions.map(item=>`${item.providerName}:${item.id}`)).toContain('支付宝:b');
  const annual=buildAnnualBillReport(connections,2026)!;
  expect(annual.months).toHaveLength(2);
  expect(annual.expense).toBe(28000);
  expect(annual.categories.reduce((sum,item)=>sum+item.amount,0)).toBe(annual.expense);
  expect(annual.months.reduce((sum,item)=>sum+item.expense,0)).toBe(annual.expense);
 });
 it('无授权不生成报告，有记录但来源不完整时标记小计，缺失月份不当零',()=>{
  expect(availableBillMonths({})).toEqual([]);
  expect(buildAnnualBillReport({},2026)).toBeNull();
  const connections={wechat_pay:source('wechat_pay',[row('a','2026-09-01',-2000)],false)};
  const annual=buildAnnualBillReport(connections,2026)!;
  expect(annual.months).toHaveLength(1);
  expect(annual.incomplete).toBe(true);
  expect(annual.months[0].coverageIncomplete).toBe(true);
 });
});
