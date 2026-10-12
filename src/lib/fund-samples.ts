export type FundSampleCode='110006'|'026197'|'510330';
export type FundSampleMetric='per_10k_income'|'unit_nav';
export type FundSampleRecord={
  code:FundSampleCode;
  metric:FundSampleMetric;
  status:'ready'|'unavailable'|'conflict';
  date?:string;
  value?:number;
  changePct?:number;
  sevenDayAnnualizedPct?:number;
  source?:string;
  crossCheck?:'matched'|'issuer_only';
  retrievedAt?:number;
  stale?:boolean;
  message?:string;
};
export type FundSamples={provider:'issuer_akshare';fetchedAt?:number;message:string;records:FundSampleRecord[]};

const codeMetrics:Record<FundSampleCode,FundSampleMetric[]>={
  '110006':['per_10k_income'],'026197':['unit_nav'],'510330':['unit_nav'],
};
const issuerSources:Record<FundSampleCode,string>={
  '110006':'https://www.efunds.com.cn/fund/110006.shtml',
  '026197':'https://www.efunds.com.cn/fund/026197.shtml',
  '510330':'https://www.chinaamc.com/fund/510330/index.shtml',
};

export function validFundSamples(value:unknown):value is FundSamples{
  if(!value||typeof value!=='object')return false;
  const snapshot=value as FundSamples;
  if(snapshot.provider!=='issuer_akshare'||typeof snapshot.message!=='string'||!Array.isArray(snapshot.records)||snapshot.records.length>3)return false;
  const seen=new Set<string>();
  return snapshot.records.every(record=>{
    if(!record||!Object.hasOwn(codeMetrics,record.code)||seen.has(record.code)||!codeMetrics[record.code].includes(record.metric)||!['ready','unavailable','conflict'].includes(record.status))return false;
    seen.add(record.code);
    if(record.status==='ready')return typeof record.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&Number.isFinite(record.value)&&(record.value as number)>0&&record.source===issuerSources[record.code]&&['matched','issuer_only'].includes(record.crossCheck||'')&&(record.changePct===undefined||Number.isFinite(record.changePct))&&(record.metric!=='per_10k_income'||(Number.isFinite(record.sevenDayAnnualizedPct)&&(record.sevenDayAnnualizedPct as number)>=0&&(record.sevenDayAnnualizedPct as number)<100));
    return record.value===undefined&&(record.message===undefined||typeof record.message==='string');
  });
}

export async function fundSamplesRequest(refresh=false):Promise<FundSamples>{
  const response=await fetch('/api/zhiyin/fund-samples',{cache:'no-store',signal:AbortSignal.timeout(refresh?40000:12000),...(refresh?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Funds':'1'},body:JSON.stringify({type:'refresh'})}:{})});
  const data=await response.json();
  if(!response.ok||!validFundSamples(data))throw new Error(data.error||'基金样本数据暂不可用');
  return data;
}
