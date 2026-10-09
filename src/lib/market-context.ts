export type MarketIndicator={
  key:'csi300'|'shibor_1m'|'shibor_3m'|'shibor_1y';
  label:string;
  date:string;
  value:number;
  unit:'point'|'percent';
  change?:number;
};

export type MarketCapability={name:string;status:'ready'|'empty'|'error';message?:string};

export type MarketContext={
  provider:'akshare';
  status:'unconfigured'|'connected'|'ready'|'error';
  fetchedAt?:number;
  stale?:boolean;
  message:string;
  indicators:MarketIndicator[];
  capabilities:MarketCapability[];
};

export function validMarketContext(value:unknown):value is MarketContext{
  if(!value || typeof value!=='object')return false;
  const context=value as MarketContext;
  return context.provider==='akshare'
    && ['unconfigured','connected','ready','error'].includes(context.status)
    && typeof context.message==='string'
    && Array.isArray(context.indicators)
    && context.indicators.every(item=>['csi300','shibor_1m','shibor_3m','shibor_1y'].includes(item.key)&&typeof item.label==='string'&&typeof item.date==='string'&&Number.isFinite(item.value)&&['point','percent'].includes(item.unit))
    && Array.isArray(context.capabilities)
    && context.capabilities.every(item=>typeof item.name==='string'&&['ready','empty','error'].includes(item.status)&&(item.message===undefined||typeof item.message==='string'));
}

export async function marketContextRequest(refresh=false):Promise<MarketContext>{
  const response=await fetch('/api/zhiyin/market-context',{cache:'no-store',signal:AbortSignal.timeout(refresh?45000:12000),...(refresh?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Market':'1'},body:JSON.stringify({type:'refresh'})}:{})});
  const data=await response.json();
  if(!response.ok || !validMarketContext(data))throw new Error(data.error || '外部市场数据暂时不可用');
  return data;
}
