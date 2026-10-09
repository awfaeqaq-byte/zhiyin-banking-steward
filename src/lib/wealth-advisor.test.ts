import {describe,expect,it} from 'vitest';
import {buildStewardInstructions,parseStewardReply} from './steward-chat';
import type {MarketContext} from './market-context';

const market:MarketContext={provider:'akshare',status:'ready',fetchedAt:Date.parse('2026-10-09'),stale:false,message:'已更新',indicators:[{key:'csi300',label:'沪深300',date:'20261008',value:4310.28,unit:'point',change:-1.0864},{key:'shibor_3m',label:'Shibor 3个月',date:'20261008',value:1.43,unit:'percent'}],capabilities:[]};
const prompt=(question:string,extra:Partial<Parameters<typeof buildStewardInstructions>[0]>={})=>buildStewardInstructions({...extra,stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:question}]});

describe('产品比较与推荐的 LLM 数据边界',()=>{
  it('只接受白名单视图标记，不渲染模型生成的任意界面',()=>{
    expect(parseStewardReply('先比较费用。\n[ZHIYIN_VIEW:WEALTH_COMPARE]',[])).toMatchObject({text:'先比较费用。',view:'wealth_compare'});
    expect(parseStewardReply('继续说明。\n[ZHIYIN_VIEW:RUN_SCRIPT]',[])).toEqual({text:'继续说明。'});
  });
  it('无测评时只能条件比较，不把真实指数当演示产品收益',()=>{
    const text=prompt('给我推荐理财产品',{marketContext:market,fundSamples:{provider:'issuer_akshare',message:'3 项有数据',records:[{code:'110006',metric:'per_10k_income',status:'ready',date:'2026-10-08',value:0.2437,sevenDayAnnualizedPct:1.002,source:'https://www.efunds.com.cn/fund/110006.shtml',crossCheck:'issuer_only'},{code:'026197',metric:'unit_nav',status:'ready',date:'2026-10-08',value:0.9852,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'matched'},{code:'510330',metric:'unit_nav',status:'ready',date:'2026-10-08',value:4.5699,source:'https://www.chinaamc.com/fund/510330/index.shtml',crossCheck:'matched'}]}});
    expect(text).toContain('风险测评未完成或过期时，不得点名某产品为“适合你”');
    expect(text).toContain('products 是可在本机沙箱操作的演示产品');
    expect(text).toContain('"value":4310.28');
    expect(text).toContain('"kind":"演示产品"');
    expect(text).toContain('不能拿指数涨跌、Shibor');
    expect(text).toContain('"code":"510330"');
    expect(text).toContain('只读资料样本，不可在本应用申购');
    expect(text).toContain('"metric":"per_10k_income"');
    expect(text).toContain('"sevenDayAnnualizedPct":1.002');
    expect(text).toContain('口径不同');
    expect(text.length).toBeLessThanOrEqual(6000);
  });
  it('有测评和银行余额时提供已核验边界，不让模型绕过服务端',()=>{
    const text=prompt('比较这几款基金',{bank:{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:false},transactions:[]},wealthSnapshot:{version:1,receipts:[],holdings:[],redemptions:[],assessment:{version:1,risk:'low',assessedAt:Date.now()-1000,expiresAt:Date.now()+86400000,answers:{experience:0,loss:0,term:0,liquidity:0,income:0}}}});
    expect(text).toContain('"bankBalanceCents":4230000');
    expect(text).toContain('"risk":"low","valid":true');
    expect(text).toContain('具体适当性仍由服务端');
    expect(text).toContain('申购、赎回只在独立核对页由用户确认');
    expect(text.length).toBeLessThanOrEqual(6000);
  });
  it('旧样本和来源冲突的数值不进入模型上下文',()=>{
    const text=prompt('看看基金数据',{fundSamples:{provider:'issuer_akshare',message:'样本',records:[{code:'026197',metric:'unit_nav',status:'ready',date:'2026-09-25',value:0.9852,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'issuer_only',stale:true},{code:'510330',metric:'unit_nav',status:'conflict',message:'同日净值冲突'}]}});
    expect(text).toContain('"stale":true');
    expect(text).toContain('"status":"conflict"');
    expect(text).not.toContain('"value":0.9852');
  });
});
