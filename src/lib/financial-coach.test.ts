import {describe,expect,it} from 'vitest';
import {buildStewardInstructions} from './steward-chat';
import {isFinancialCoachingQuestion} from './financial-coach';
import {detectStewardTaskKind} from './steward-agent';
import {buildBillAnalysis} from './bill-analysis';
import type {ConnectedFinancialSource} from './financial-connections';
import {readSavedWealthGoal,WEALTH_GOAL_KEY} from './wealth-goal';

const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'演示',scopes:['transactions'],syncedAt:'2026-09-30',autopays:[],transactions:[
  {id:'food',title:'餐厅',amount:-3600,category:'餐饮',kind:'payment',occurredAt:'2026-09-20'},
  {id:'transfer',title:'转账',amount:-10000,category:'转账',kind:'transfer',occurredAt:'2026-09-21'},
]};
const bill=buildBillAnalysis({wechat_pay:source},'本月支出',Date.parse('2026-09-30T12:00:00+08:00'));

describe('LLM 财务教练提示词',()=>{
  it.each([
    '帮我规划多元收入','我该如何还债','找出我的支出漏洞','做一个不焦虑的预算','帮我准备加薪谈判',
    '我总是冲动消费','我该先存应急金还是开始理财','评估我的副业想法','想看个人财务仪表盘','改善我的财务习惯',
    '我的钱应该怎么分配？','如何理财','生活费怎么安排','信用卡欠款怎么还',
  ])('让模型探索 %s，而不是掉进订阅固定流程',question=>{
    expect(isFinancialCoachingQuestion(question)).toBe(true);
    expect(detectStewardTaskKind(question)).toBe('financial_coaching');
    const prompt=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:question}]});
    expect(prompt).toContain('财务规划对话教练');
    expect(prompt).toContain('最多问一个问题');
    expect(prompt).not.toContain('已授权自动续费清单');
    expect(prompt.length).toBeLessThanOrEqual(4000);
  });
  it('只提供可核验的局部数据和缺口，不把单月入账、平台余额或固定比例当成完整画像',()=>{
    const prompt=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'我的钱应该怎么分配？'}],billAnalysis:bill,
      bank:{revision:1,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:false},transactions:[]},
      wealthSnapshot:{version:1,receipts:[],holdings:[],redemptions:[]},savedGoal:{name:'旅行基金',target:50000,current:10000,months:12,savedAt:1000},
      memoryContext:'用户自己说想保留旅行预算。'});
    expect(prompt).toContain('"expenseCents":3600');
    expect(prompt).toContain('"transferOutCents":10000');
    expect(prompt).toContain('"availableCents":4230000');
    expect(prompt).toContain('稳定月收入与固定支出');
    expect(prompt).toContain('不能当作人人适用的推荐比例');
    expect(prompt).toContain('用户自己说想保留旅行预算');
    expect(prompt).toContain('"name":"旅行基金"');
    expect(prompt).toContain('已准备金额未与银行余额核对');
    expect(prompt.length).toBeLessThanOrEqual(4000);
  });
  it('只读取结构有效的用户已保存目标',()=>{
    const storage={getItem:(key:string)=>key===WEALTH_GOAL_KEY?JSON.stringify({name:'旅行基金',target:'50000',current:'10000',months:'12',savedAt:1000}):null};
    expect(readSavedWealthGoal(storage)).toMatchObject({name:'旅行基金',target:50000,current:10000,months:12});
    expect(readSavedWealthGoal({getItem:()=>'{bad'})).toBeNull();
    expect(readSavedWealthGoal({getItem:()=>JSON.stringify({name:'旅行基金',target:null,current:0,months:12,savedAt:1000})})).toBeNull();
  });
  it('明确的交易操作与单月账单查询仍走原有校验路径',()=>{
    expect(isFinancialCoachingQuestion('给妈妈转200元')).toBe(false);
    expect(detectStewardTaskKind('给妈妈转200元')).toBe('transfer');
    const prompt=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'这个月消费账单情况'}],billAnalysis:bill});
    expect(prompt).toContain('授权账单分析');
  });
});
