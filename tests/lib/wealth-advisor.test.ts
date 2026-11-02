import {describe,expect,it} from 'vitest';
import {buildStewardInstructions,parseStewardReply} from '../../src/lib/steward-chat';
import type {MarketContext} from '../../src/lib/market-context';

const market:MarketContext={provider:'akshare',status:'ready',fetchedAt:Date.parse('2026-10-09'),stale:false,message:'已更新',indicators:[{key:'csi300',label:'沪深300',date:'20261008',value:4310.28,unit:'point',change:-1.0864},{key:'shibor_3m',label:'Shibor 3个月',date:'20261008',value:1.43,unit:'percent'}],capabilities:[]};
const prompt=(question:string,extra:Partial<Parameters<typeof buildStewardInstructions>[0]>={})=>buildStewardInstructions({...extra,stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:question}]});
const assessed=()=>({version:1 as const,receipts:[],holdings:[],redemptions:[],assessment:{version:1 as const,risk:'low' as const,assessedAt:Date.now()-1000,expiresAt:Date.now()+86400000,answers:{experience:0 as const,loss:0 as const,term:0 as const,liquidity:0 as const,income:0 as const}}});

describe('产品比较与推荐的 LLM 数据边界',()=>{
  it('只接受白名单视图标记，不渲染模型生成的任意界面',()=>{
    expect(parseStewardReply('先比较费用。\n[ZHIYIN_VIEW:WEALTH_COMPARE]',[])).toMatchObject({text:'先比较费用。',view:'wealth_compare'});
    expect(parseStewardReply('继续说明。\n[ZHIYIN_VIEW:RUN_SCRIPT]',[])).toEqual({text:'继续说明。'});
  });
  it('无测评时只引导测评，不向模型提供产品和市场样本',()=>{
    const text=prompt('给我推荐理财产品',{marketContext:market,fundSamples:{provider:'issuer_akshare',message:'3 项有数据',records:[{code:'110006',metric:'per_10k_income',status:'ready',date:'2026-10-08',value:0.2437,sevenDayAnnualizedPct:1.002,source:'https://www.efunds.com.cn/fund/110006.shtml',crossCheck:'issuer_only'},{code:'026197',metric:'unit_nav',status:'ready',date:'2026-10-08',value:0.9852,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'matched'},{code:'510330',metric:'unit_nav',status:'ready',date:'2026-10-08',value:4.5699,source:'https://www.chinaamc.com/fund/510330/index.shtml',crossCheck:'matched'}]}});
    expect(text).toContain('风险测评未完成、过期或不可读取时，产品推荐和比较必须先完成测评');
    expect(text).toContain('products 是可在本机沙箱操作的演示产品');
    expect(text).toContain('"products":[]');
    expect(text).toContain('"market":null');
    expect(text).toContain('不能拿指数涨跌、Shibor');
    expect(text).not.toContain('"code":"510330"');
    expect(text).not.toContain('"kind":"演示产品"');
    expect(text).not.toContain('"value":4310.28');
    expect(text).toContain('口径不同');
    expect(text.length).toBeLessThanOrEqual(6000);
  });
  it('有测评和银行余额时提供已核验边界，不让模型绕过服务端',()=>{
    const text=prompt('比较这几款基金',{bank:{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:false},transactions:[]},wealthSnapshot:assessed()});
    expect(text).toContain('"bankBalanceCents":4230000');
    expect(text).toContain('"id":"medical"');
    expect(text).toContain('汇添富纳斯达克生物科技ETF发起式联接A');
    expect(text).toContain('selectionFunds');
    expect(text).toContain('"risk":"low","valid":true');
    expect(text).toContain('具体适当性仍由服务端');
    expect(text).toContain('申购、赎回只在独立核对页由用户确认');
    expect(text.length).toBeLessThanOrEqual(6000);
  });
  it('旧样本和来源冲突的数值不进入模型上下文',()=>{
    const text=prompt('看看基金数据',{wealthSnapshot:assessed(),fundSamples:{provider:'issuer_akshare',message:'样本',records:[{code:'026197',metric:'unit_nav',status:'ready',date:'2026-09-25',value:0.9852,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'issuer_only',stale:true},{code:'510330',metric:'unit_nav',status:'conflict',message:'同日净值冲突'}]}});
    expect(text).toContain('"stale":true');
    expect(text).toContain('"status":"conflict"');
    expect(text).not.toContain('"value":0.9852');
  });
});

it('完整选基目录与450字记忆同时保留在6000字预算内',()=>{
 const text=prompt('推荐医疗主题的基金',{wealthSnapshot:assessed(),marketContext:market,memoryContext:'记'.repeat(450),bank:{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:false},transactions:[],assetSummary:{cash:4230000,availableCash:4230000,reservedCash:0,wealth:3000000,deposits:5000000,total:12230000,holdingCount:1,depositCount:5},termDeposits:Array.from({length:5},(_,index)=>({id:`deposit-${index}`,amount:1000000,months:12,rateBps:150,openedAt:1700000000000,maturesAt:1731600000000}))},savedGoal:{name:'出行准备',target:20000,months:12,current:3000,savedAt:Date.now()},fundSamples:{provider:'issuer_akshare',message:'样本',records:[{code:'110006',metric:'per_10k_income',status:'ready',date:'2026-10-08',value:0.2437,sevenDayAnnualizedPct:1.002,source:'https://www.efunds.com.cn/fund/110006.shtml',crossCheck:'issuer_only'},{code:'026197',metric:'unit_nav',status:'ready',date:'2026-10-08',value:0.9852,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'matched'},{code:'510330',metric:'unit_nav',status:'ready',date:'2026-10-08',value:4.5699,source:'https://www.chinaamc.com/fund/510330/index.shtml',crossCheck:'matched'}]}});
 expect(text).toContain('"id":"medical"');expect(text).toContain('"id":"csi"');expect(text).toContain('风险等级、费用、流动性和在售状态未知');expect(text.length).toBeLessThanOrEqual(6000);
});
