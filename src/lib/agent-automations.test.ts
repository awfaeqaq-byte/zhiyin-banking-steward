import {describe,expect,it} from 'vitest';
import {billAutomationResult,createAgentAutomation,nextAutomationRun,wealthAutomationResult} from './agent-automations';
import type {ConnectedFinancialSource} from './financial-connections';

const wechat:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'叶先生',scopes:['transactions'],syncedAt:'2026-09-30',autopays:[],transactions:[
  {id:'1',title:'餐饮',amount:-3600,category:'餐饮',kind:'payment',occurredAt:'2026-09-30'},
  {id:'2',title:'转账',amount:-10000,category:'转账',kind:'transfer',occurredAt:'2026-09-30'},
]};

describe('AI 自动任务',()=>{
  it('月报与周检使用未来计划时间',()=>{
    const now=Date.parse('2026-10-01T10:00:00+08:00');
    expect(new Date(nextAutomationRun(createAgentAutomation('monthly_bill_review',now),now)).getMonth()).toBe(10);
    expect(nextAutomationRun(createAgentAutomation('weekly_wealth_check',now),now)).toBeGreaterThan(now);
    expect(nextAutomationRun(createAgentAutomation('anomaly_bill_review',now),now)).toBeGreaterThan(now);
  });
  it('账单任务只计算授权消费并排除转账',()=>{
    expect(billAutomationResult({wechat_pay:wechat})).toContain('¥36.00');
    expect(billAutomationResult({})).toContain('没有获得账单读取授权');
  });
  it('理财周检说明余额与不自动操作边界',()=>{
    const result=wealthAutomationResult(4030000,null);
    expect(result).toContain('¥40,300.00');
    expect(result).toContain('不会自动申购或赎回');
  });
});
