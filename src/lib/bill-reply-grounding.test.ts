import {expect,it} from 'vitest';
import {buildBillAnalysis} from './bill-analysis';
import {billReplyFacts,billReplyIssues,groundedBillReply} from './bill-reply-grounding';
import type {ConnectedFinancialSource} from './financial-connections';
const source:ConnectedFinancialSource={provider:'alipay',displayName:'支付宝',scopes:['transactions'],accountMasked:'测试',autopays:[],syncedAt:'2026-10-13',transactions:[{id:'a',title:'午餐',amount:-4200,category:'餐饮',occurredAt:'2026-10-12'},{id:'b',title:'生活',amount:-5800,category:'生活',occurredAt:'2026-10-12'}]};
const bill=buildBillAnalysis({alipay:source},'本月支出',Date.parse('2026-10-13'));
it('单平台与百分比声明用当前账本校验，引用过去的错误不当成新事实',()=>{
 expect(billReplyIssues('已返回全部平台账单，餐饮占43%，生活不足五成。',bill)).toHaveLength(3);
 expect(billReplyIssues('已按支付宝账单返回，餐饮占42%，生活高于五成。',bill)).toEqual([]);
 expect(billReplyIssues('普通入账不包含转账。此前“收入200元含转账”没有依据。',bill)).toEqual([]);
});
it('无记录、缺少授权、含糊日期不冒充有效零支出分析',()=>{
 for(const empty of [buildBillAnalysis({},'本月支出'),buildBillAnalysis({alipay:{...source,transactions:[]}},'本月支出'),buildBillAnalysis({alipay:source},'最近支出')]){
  expect(billReplyIssues('收入错了，已返回全部平台',empty,true)).toEqual([]);
 }
 expect(billReplyFacts(buildBillAnalysis({},'本月支出')).topCategories.percent).toBe(0);
});
it('降级说明保留不完整范围和已返回前期对照的限制',()=>{
 const incomplete=buildBillAnalysis({alipay:{...source,transactionCoverage:{total:10,returned:3,invalid:0,complete:false},transactions:[...source.transactions,{id:'past',title:'之前消费',amount:-5000,category:'生活',occurredAt:'2026-09-20'}]}},'本月支出',Date.parse('2026-10-13'));
 expect(groundedBillReply(incomplete)).toContain('记录不完整');
 expect(groundedBillReply(incomplete)).toContain('等长时段');
 expect(groundedBillReply({...bill,categories:[]})).toContain('记录不足');
 expect(groundedBillReply({...bill,categories:bill.categories.slice(0,1)})).toContain('这一类');
});
