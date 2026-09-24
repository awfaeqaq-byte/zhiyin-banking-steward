import { describe, expect, it } from 'vitest';
import { buildBillAnalysis, isBillQuestion, billInstructions, billQuestionForMessages, billReferenceTime } from './bill-analysis';
import type { ConnectedFinancialSource } from './financial-connections';
const now = Date.parse('2026-09-24T09:00:00+08:00');
const source: ConnectedFinancialSource = {provider:'wechat_pay', displayName:'微信支付', accountMasked:'测试', scopes:['transactions'], syncedAt:'', autopays:[], transactions:[
  {id:'1',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'},
  {id:'2',title:'工资',amount:100000,category:'收入',occurredAt:'2026-09-01',kind:'income'},
  {id:'3',title:'退货',amount:500,category:'购物',occurredAt:'2026-09-21',kind:'refund'},
  {id:'4',title:'转给朋友',amount:-1000,category:'转账',occurredAt:'2026-09-22',kind:'transfer'},
  {id:'5',title:'旧消费',amount:-9999,category:'购物',occurredAt:'2026-08-20'},
]};
describe('账单分析',()=>{
  it('仅授权账单时也跟随沙箱日期',()=>{
    expect(billReferenceTime({wechat_pay:{...source,syncedAt:'2026-10-02T10:00:00+08:00'}},now)).toBe(Date.parse('2026-10-02T10:00:00+08:00'));
    expect(billReferenceTime({},now)).toBe(now);
  });
  it('连续追问维持账单语境，明确问续费则切回',()=>{
    expect(billQuestionForMessages([{role:'user',content:'本月账单'}, {role:'user',content:'那上个月呢'}])).toBe('那上个月呢');
    expect(billQuestionForMessages([{role:'user',content:'本月账单'}, {role:'user',content:'哪些会员快续费'}])).toBeNull();
    expect(billQuestionForMessages([{role:'user',content:'你好'}])).toBeNull();
    expect(buildBillAnalysis({},'钱花到哪了',now).needsClarification).toBe(false);
    expect(billQuestionForMessages([{role:'user',content:'8月微信账单'},{role:'user',content:'最大一笔呢'}])).toContain('8月微信账单');
    expect(buildBillAnalysis({},'下个月支出',now).needsClarification).toBe(true);
  });
  it('大数据上下文不超过接口上限，保留代码总额',()=>{
    const rows=Array.from({length:40},(_,i)=>({...source.transactions[0],id:String(i),title:'商'.repeat(80),category:'类'.repeat(80)+i}));
    const context=billInstructions('宁宁',buildBillAnalysis({wechat_pay:{...source,transactions:rows}},'账单',now));
    expect(context.length).toBeLessThanOrEqual(4000);
    expect(context).toContain('100000');
  });
  it('支持今天/30天并单列转入；不支持的范围需要澄清',()=>{
    const rows=[{...source.transactions[0],id:'transfer',kind:'transfer' as const,amount:2000}, {...source.transactions[0],id:'badDate',occurredAt:'wrong'}];
    expect(buildBillAnalysis({wechat_pay:{...source,transactions:rows}},'账单',now).transferIn).toBe(2000);
    expect(buildBillAnalysis({},'今天账单',now).from).toBe('2026-09-24');
    expect(buildBillAnalysis({},'最近30天账单',now).from).toBe('2026-08-26');
    for(const q of ['最近15天账单','2026年13月账单','2027年1月账单','历史账单','8月1日至8月20日账单']) expect(buildBillAnalysis({},q,now).needsClarification).toBe(true);
    expect(billInstructions('宁宁')).toContain('null');
  });
  it('按分计算本月消费、收入、退款、转账并保留来源',()=>{
    const result=buildBillAnalysis({wechat_pay:source},'这个月账单情况',now);
    expect(result).toMatchObject({expense:2500,income:100000,refund:500,transferOut:1000,transferIn:0,from:'2026-09-01',to:'2026-09-24',count:4});
    expect(result.categories).toEqual([{name:'餐饮',amount:2500}]);
    expect(result.largest[0]).toMatchObject({title:'午餐',providerName:'微信支付'});
  });
  it('未授权账单不读取，空记录不声称完整',()=>{
    expect(buildBillAnalysis({wechat_pay:{...source,scopes:['balance']}},'账单',now).sources).toEqual([]);
    expect(buildBillAnalysis({},'账单',now).coverage).toContain('不代表全部');
  });
  it('支持上月、近七天、昨天、指定月份及平台',()=>{
    expect(buildBillAnalysis({wechat_pay:source},'上个月消费',now).expense).toBe(9999);
    expect(buildBillAnalysis({wechat_pay:source},'最近7天支出',now).from).toBe('2026-09-18');
    expect(buildBillAnalysis({wechat_pay:source},'昨天消费',now).from).toBe('2026-09-23');
    expect(buildBillAnalysis({wechat_pay:source},'2026年8月账单',now).expense).toBe(9999);
    expect(buildBillAnalysis({wechat_pay:source},'支付宝账单',now).count).toBe(0);
  });
  it('去重并忽略无效金额、未来记录，退款不重复抵扣',()=>{
    const result=buildBillAnalysis({wechat_pay:{...source,transactions:[...source.transactions, source.transactions[0], {...source.transactions[0],id:'bad',amount:NaN}, {...source.transactions[0],id:'future',occurredAt:'2026-09-30'}]}},'账单',now);
    expect(result.expense).toBe(2500);
    expect(result.count).toBe(4);
  });
  it('账单意图独立于续费，无法解析时间先澄清',()=>{
    expect(isBillQuestion('我的钱花在哪了')).toBe(true);
    expect(isBillQuestion('帮我取消自动续费')).toBe(false);
    expect(buildBillAnalysis({},'去年第三季度账单',now).needsClarification).toBe(true);
  });
});
