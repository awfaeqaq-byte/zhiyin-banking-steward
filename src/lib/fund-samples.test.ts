import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {createFundSamplesService} from '../../server/fund-samples';
import {validFundSamples,type FundSamples} from './fund-samples';

let directory='';
afterEach(()=>{if(directory)rmSync(directory,{recursive:true,force:true});directory='';});
const records:FundSamples['records']=[
  {code:'110006',metric:'per_10k_income',status:'ready',date:'2026-10-08',value:0.2437,sevenDayAnnualizedPct:1.002,source:'https://www.efunds.com.cn/fund/110006.shtml',crossCheck:'issuer_only'},
  {code:'026197',metric:'unit_nav',status:'ready',date:'2026-10-08',value:0.9852,changePct:-0.36,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'matched'},
  {code:'510330',metric:'unit_nav',status:'ready',date:'2026-10-08',value:4.5699,changePct:-1.1,source:'https://www.chinaamc.com/fund/510330/index.shtml',crossCheck:'matched'},
];
const instant=Date.UTC(2026,9,9,8);
const cache=()=>{directory=mkdtempSync(join(tmpdir(),'fund-samples-'));return join(directory,'cache.json');};

describe('发行方基金披露与交叉核对',()=>{
  it('限制代码、口径、发行方 URL 和货币基金两项指标',()=>{
    expect(validFundSamples({provider:'issuer_akshare',message:'ok',records})).toBe(true);
    expect(validFundSamples({provider:'issuer_akshare',message:'ok',records:[{...records[0],sevenDayAnnualizedPct:undefined}]})).toBe(false);
    expect(validFundSamples({provider:'issuer_akshare',message:'ok',records:[{...records[1],source:'https://example.com/fund'}]})).toBe(false);
    expect(validFundSamples({provider:'issuer_akshare',message:'ok',records:[{...records[2],metric:'per_10k_income'}]})).toBe(false);
  });
  it('单个来源失败时保留前次数据并标旧样本',async()=>{
    let calls=0;
    const service=createFundSamplesService({cacheFile:cache(),now:()=>instant,runner:async()=>({provider:'issuer_akshare',records:++calls===1?records:records.map(item=>item.code==='026197'?{code:'026197',metric:'unit_nav',status:'unavailable',message:'发行方页面故障'}:item) as FundSamples['records']})});
    expect(service.get().records).toHaveLength(0);
    expect((await service.refresh()).records.find(item=>item.code==='110006')).toMatchObject({value:0.2437,sevenDayAnnualizedPct:1.002});
    const second=await service.refresh();
    expect(second.records.find(item=>item.code==='026197')).toMatchObject({value:0.9852,stale:true});
    expect(service.get().records.find(item=>item.code==='026197')?.stale).toBe(true);
  });
  it('同日交叉核对冲突时停止展示旧值',async()=>{
    let calls=0;
    const service=createFundSamplesService({cacheFile:cache(),now:()=>instant,runner:async()=>({provider:'issuer_akshare',records:++calls===1?records:records.map(item=>item.code==='510330'?{code:'510330',metric:'unit_nav',status:'conflict',message:'同日净值冲突'}:item) as FundSamples['records']})});
    await service.refresh();
    const second=await service.refresh();
    expect(second.records.find(item=>item.code==='510330')).toEqual({code:'510330',metric:'unit_nav',status:'conflict',message:'同日净值冲突'});
    expect(service.get().records.find(item=>item.code==='510330')?.value).toBeUndefined();
  });
  it('即使刚刷新，发行方披露日过旧仍标记为旧样本',async()=>{
    const old=records.map(item=>({...item,date:'2026-09-25'}));
    const service=createFundSamplesService({cacheFile:cache(),now:()=>instant,runner:async()=>({provider:'issuer_akshare',records:old})});
    expect((await service.refresh()).records.every(item=>item.stale)).toBe(true);
  });
});
