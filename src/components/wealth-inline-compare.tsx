import {useEffect,useMemo,useState} from 'react';
import {marketContextRequest,type MarketContext} from '../lib/market-context';
import {suitableWealthProducts,validWealthSnapshot,wealthProducts,wealthRequest,type WealthSnapshot} from '../lib/wealth-operation';
import {WealthComparisonLab} from './wealth-comparison-lab';
import {RealFundSamples} from './real-fund-samples';

export function WealthInlineCompare({onExplain,onOpenWealth}:{onExplain:(selection:string)=>void;onOpenWealth?:()=>void}){
  const [amount,setAmount]=useState('10000');
  const [term,setTerm]=useState('12');
  const [selected,setSelected]=useState('');
  const [snapshot,setSnapshot]=useState<WealthSnapshot|null>(null);
  const [market,setMarket]=useState<MarketContext|null>(null);
  const [marketBusy,setMarketBusy]=useState(false);
  const [marketError,setMarketError]=useState('');
  const numericAmount=Number(amount),numericTerm=Number(term);
  const risk=snapshot?.assessment&&snapshot.assessment.expiresAt>Date.now()?snapshot.assessment.risk:null;
  const products=useMemo(()=>risk?suitableWealthProducts(numericAmount,numericTerm,risk):wealthProducts.filter(product=>product.open),[numericAmount,numericTerm,risk]);
  useEffect(()=>{let active=true;void Promise.allSettled([wealthRequest<WealthSnapshot>(),marketContextRequest()]).then(([wealthResult,marketResult])=>{
    if(!active)return;
    if(wealthResult.status==='fulfilled'&&validWealthSnapshot(wealthResult.value))setSnapshot(wealthResult.value);
    if(marketResult.status==='fulfilled')setMarket(marketResult.value);
  });return()=>{active=false;};},[]);
  async function refreshMarket(){setMarketBusy(true);setMarketError('');try{const value=await marketContextRequest(true);setMarket(value);if(value.status==='error')setMarketError(value.message);}catch(error){setMarketError(error instanceof Error?error.message:'市场数据暂不可用');}finally{setMarketBusy(false);}}
  const chosen=products.find(product=>product.id===selected);
  return <section className="steward-wealth-inline" aria-label="互动理财比较工具">
    <h3>调整条件，看产品差异</h3>
    <p>{risk?`已按当前 ${risk==='low'?'谨慎':risk==='medium'?'稳健':'成长'}型测评筛选；这里的选择不会发起申购。`:'风险测评尚未完成或不可读取；以下仅作产品差异学习。'}</p>
    <div className="wealth-compare-controls"><label>试算投入（元）<input type="number" aria-label="对话试算金额" min="100" max="1000000" step="100" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>计划持有（月）：<strong>{term}</strong><input type="range" aria-label="对话试算期限" min="0" max="36" step="1" value={term} onChange={event=>setTerm(event.target.value)}/></label></div>
    <WealthComparisonLab products={products} amount={numericAmount} selected={selected} onSelect={setSelected} market={market} onRefreshMarket={()=>void refreshMarket()} marketBusy={marketBusy} marketError={marketError} screened={!!risk}/>
    <RealFundSamples/>
    <div className="steward-wealth-inline-actions"><button type="button" disabled={!chosen||!Number.isFinite(numericAmount)||numericAmount<=0} onClick={()=>onExplain(`请基于我在比较工具中的选择继续解释：演示产品 ${chosen?.name}（ID ${chosen?.id}），试算投入 ${numericAmount} 元，计划持有 ${numericTerm} 个月。这个选择只是比较偏好，不是申购授权；请核对风险、费用、流动性和缺失信息。`)}>让管家解释我的选择</button>{onOpenWealth&&<button type="button" onClick={onOpenWealth}>去理财页核对</button>}</div>
  </section>;
}
