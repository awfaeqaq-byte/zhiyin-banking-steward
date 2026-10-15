import {useState} from 'react';
import type {MarketContext} from '../lib/market-context';
import type {WealthProduct} from '../lib/wealth-operation';

const yuan=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);

export function WealthComparisonLab({products,amount,selected,onSelect,market,onRefreshMarket,marketBusy,marketError,screened=true}:{
  products:WealthProduct[];amount:number;selected:string;onSelect:(id:string)=>void;
  market:MarketContext|null;onRefreshMarket:()=>void;marketBusy:boolean;marketError:string;screened?:boolean;
}){
  const [dimension,setDimension]=useState<'fee'|'term'>('fee');
  const [focused,setFocused]=useState('');
  const detailed=products.find(product=>product.id===(focused||selected))||products[0];
  const metric=(product:WealthProduct)=>dimension==='fee'?Math.round(amount*product.feeRate*100)/100:product.minTerm;
  const maximum=Math.max(1,...products.map(metric));
  return <div className="wealth-lab">
    <div className="wealth-lab-market" role="region" aria-label="真实市场观察">
      <div className="wealth-lab-heading"><h4>真实市场观察</h4><button type="button" disabled={marketBusy} onClick={onRefreshMarket}>{marketBusy?'更新中…':'更新市场数据'}</button></div>
      {market?.indicators.length?<>
        <p>AKShare 公开市场样本{market.stale?' · 缓存已过期':''}；仅作市场背景，不是下方产品的净值或预期收益。</p>
        <div className="wealth-market-points">{market.indicators.map(item=><span key={item.key}><strong>{item.label}</strong> {item.value.toLocaleString('zh-CN')} {item.unit==='percent'?'%':'点'} <small>数据日 {item.date.slice(0,4)}-{item.date.slice(4,6)}-{item.date.slice(6,8)}{item.change===undefined?'':` · 当日 ${item.change>0?'+':''}${item.change.toFixed(2)}%`}</small></span>)}</div>
      </>:<p>尚无已核验的市场样本。点击更新后可查看指数与利率，产品比较仍可独立使用。</p>}
      {marketError&&<p role="status">{marketError}</p>}
    </div>
    {products.length>0&&<div className="wealth-lab-chart" aria-label="产品交互比较图">
      <div className="wealth-lab-heading"><h4>产品对比</h4><div role="group" aria-label="切换对比维度"><button type="button" aria-pressed={dimension==='fee'} onClick={()=>setDimension('fee')}>申购费</button><button type="button" aria-pressed={dimension==='term'} onClick={()=>setDimension('term')}>最短持有</button></div></div>
      <p>点击产品条查看详情；悬停或聚焦可查看费用、风险和赎回规则。{screened?'仅展示已通过当前适当性条件的产品。':'当前未完成风险测评，展示产品规则供了解差异，不代表适合你。'}</p>
      <div className="wealth-bars">{products.map(product=><button key={product.id} type="button" aria-pressed={selected===product.id} aria-label={`${product.name}，${dimension==='fee'?`本次申购费 ${yuan(metric(product))} 元`:`最短持有 ${metric(product)} 个月`}`} onClick={()=>{onSelect(product.id);setFocused(product.id);}} onMouseEnter={()=>setFocused(product.id)} onFocus={()=>setFocused(product.id)}>
        <span className="wealth-bar-name">{product.name}</span><span className="wealth-bar-track"><span style={{width:`${Math.max(2,metric(product)/maximum*100)}%`}}/></span><strong>{dimension==='fee'?`${yuan(metric(product))} 元`:`${metric(product)} 个月`}</strong>
      </button>)}</div>
      {detailed&&<p className="wealth-lab-detail" role="status">{detailed.name} · R{detailed.risk} · 申购费 {yuan(Math.round(amount*detailed.feeRate*100)/100)} 元 · {detailed.liquidity}。{detailed.riskDisclosure}</p>}
    </div>}
  </div>;
}
