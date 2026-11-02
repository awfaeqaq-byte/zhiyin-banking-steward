import { describe, expect, it } from 'vitest';
import { buildBillAnalysis, billInstructions } from '../../src/lib/bill-analysis';
import type { ConnectedFinancialSource, FinancialTransaction } from '../../src/lib/financial-connections';

const now = Date.parse('2026-09-24T12:00:00+08:00');
const row = (id:string, amount:number, date='2026-09-20', title='午餐'):FinancialTransaction => ({id,amount,occurredAt:date,title,category:'餐饮美食'});
const analyze = (transactions:FinancialTransaction[]) => buildBillAnalysis({wechat_pay:{provider:'wechat_pay',displayName:'微信支付',scopes:['transactions'],syncedAt:'',autopays:[],accountMasked:'测试',transactions} satisfies ConnectedFinancialSource},'这个月支出有没有问题',now);

describe('支出诊断证据',()=>{
  it('记录清洗计数并统一分类，不删除不同交易ID的相似付款',()=>{
    const result=analyze([row('a',-1000),row('a',-1000),row('b',-1000),row('bad',NaN)]);
    expect(result.diagnosis.quality).toMatchObject({duplicates:1,invalid:1});
    expect(result.expense).toBe(2000);
    expect(result.categories[0].name).toBe('餐饮');
    expect(result.diagnosis.trend).toBeNull();
  });
  it('大额只标为待核对；同日同商户频次有实际交易证据',()=>{
    const result=analyze([row('1',-1000),row('2',-1200),row('3',-900),row('4',-1100),row('5',-200000,'2026-09-21','商场')]);
    expect(result.diagnosis.findings.map(x=>x.kind)).toEqual(expect.arrayContaining(['amount','frequency']));
    expect(result.diagnosis.findings.every(x=>x.evidence.length>0)).toBe(true);
    expect(result.diagnosis.findings.find(x=>x.kind==='amount')?.detail).toContain('不代表异常');
  });
  it('对比相同天数的前期返回记录，周期线索需要三笔，转账不当消费',()=>{
    const result=analyze([row('j',-2500,'2026-07-20','音乐'),row('a',-2500,'2026-08-20','音乐'),row('s',-2500,'2026-09-20','音乐'),{...row('t',-900000),kind:'transfer'}]);
    expect(result.diagnosis.findings.some(x=>x.kind==='periodic')).toBe(true);
    expect(result.diagnosis.trend).toMatchObject({previousExpense:2500,changePercent:0});
    expect(result.expense).toBe(2500);
  });
  it('没有足够样本时不声称安全，提示词禁止重复数字和表格',()=>{
    const result=analyze([row('1',-1000)]);
    expect(result.diagnosis.limitations.join('')).toContain('不足');
    expect(result.diagnosis.findings).toHaveLength(0);
    expect(billInstructions('宁宁',result)).toContain('不要输出表格');
    expect(billInstructions('宁宁',result)).toContain('不要重复');
  });
});
