import {useCallback,useEffect,useMemo,useState} from 'react';
import {marketContextRequest,type MarketContext} from '../lib/market-context';
import {suitableWealthProducts,validWealthSnapshot,wealthRequest,type WealthSnapshot} from '../lib/wealth-operation';
import {WealthComparisonLab} from './wealth-comparison-lab';
import {RealFundSamples} from './real-fund-samples';
import {StewardReplyContent} from './steward-reply';

const riskName={low:'谨慎',medium:'稳健',high:'成长'};

function briefReply(reply:string){
  const sentence=reply.trim().match(/^[\s\S]*?[。！？]/)?.[0]??reply.trim();
  return sentence.length>110?`${sentence.slice(0,107)}…`:sentence;
}

export function WealthInlineCompare({reply,replyAssessedAt,stewardName,onExplain,onOpenWealth}:{reply:string;replyAssessedAt?:number;stewardName:string;onExplain:(selection:string)=>void;onOpenWealth?:()=>void}){
  const [amount,setAmount]=useState('10000');
  const [term,setTerm]=useState('12');
  const [selected,setSelected]=useState('');
  const [snapshot,setSnapshot]=useState<WealthSnapshot|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [market,setMarket]=useState<MarketContext|null>(null);
  const [marketBusy,setMarketBusy]=useState(false);
  const [marketError,setMarketError]=useState('');
  const numericAmount=Number(amount),numericTerm=Number(term);
  const risk=status==='ready'&&snapshot?.assessment&&snapshot.assessment.expiresAt>Date.now()?snapshot.assessment.risk:null;
  const replyIsCurrent=Boolean(risk&&replyAssessedAt===snapshot?.assessment?.assessedAt);
  const products=useMemo(()=>risk?suitableWealthProducts(numericAmount,numericTerm,risk):[],[numericAmount,numericTerm,risk]);
  const reload=useCallback(async()=>{
    setStatus('loading');
    try{
      const value=await wealthRequest<WealthSnapshot>();
      if(!validWealthSnapshot(value))throw new Error('测评数据不可用');
      setSnapshot(value);
      setStatus('ready');
    }catch{setSnapshot(null);setStatus('error');}
  },[]);
  useEffect(()=>{void reload();window.addEventListener('zhiyin-wealth-updated',reload);return()=>window.removeEventListener('zhiyin-wealth-updated',reload);},[reload]);
  useEffect(()=>{if(!risk)return;let active=true;void marketContextRequest().then(value=>{if(active)setMarket(value);}).catch(()=>{if(active)setMarketError('市场数据暂不可用');});return()=>{active=false;};},[risk]);
  async function refreshMarket(){setMarketBusy(true);setMarketError('');try{const value=await marketContextRequest(true);setMarket(value);if(value.status==='error')setMarketError(value.message);}catch(error){setMarketError(error instanceof Error?error.message:'市场数据暂不可用');}finally{setMarketBusy(false);}}
  const chosen=products.find(product=>product.id===selected);

  if(status==='loading')return <section className="steward-wealth-inline steward-wealth-gate" aria-label="互动理财比较工具"><p role="status">正在核对风险测评…</p></section>;
  if(status==='error')return <section className="steward-wealth-inline steward-wealth-gate" aria-label="互动理财比较工具"><h3>暂时无法核对测评状态</h3><p>产品对比已暂停，请重新读取测评结果。</p><button type="button" onClick={()=>void reload()}>重新读取风险测评</button></section>;
  if(!risk)return <section className="steward-wealth-inline steward-wealth-gate" aria-label="互动理财比较工具">
    <span className="wealth-inline-kicker">先完成</span><h3>风险测评</h3>
    <p>回答 5 个问题，确认可承受的波动和资金使用期限。完成后再看符合条件的产品。</p>
    {onOpenWealth&&<button type="button" onClick={onOpenWealth}>开始风险测评</button>}
  </section>;

  return <section className="steward-wealth-inline" aria-label="互动理财比较工具">
    <div className="wealth-inline-heading"><div><span className="wealth-inline-kicker">已完成测评</span><h3>{riskName[risk]}型 · 产品比较</h3></div>{onOpenWealth&&<button type="button" onClick={onOpenWealth}>调整风险偏好</button>}</div>
    <p className="wealth-inline-brief">{replyIsCurrent?briefReply(reply):'测评结果已更新。可以按当前风险等级重新比较，再请管家解释。'}</p>
    {replyIsCurrent?<details className="wealth-inline-disclosure"><summary>查看管家完整分析</summary><StewardReplyContent content={reply} stewardName={stewardName}/></details>:<button className="wealth-inline-reask" type="button" onClick={()=>onExplain('我已完成或更新风险测评，请按当前风险等级、可用金额和计划期限，简短说明哪些产品值得进一步核对。')}>按新测评重新询问</button>}
    <details className="wealth-inline-disclosure wealth-inline-tool"><summary>调整金额与期限，比较产品</summary>
      <div className="wealth-compare-controls"><label>试算投入（元）<input type="number" aria-label="对话试算金额" min="100" max="1000000" step="100" value={amount} onChange={event=>{setAmount(event.target.value);setSelected('');}}/></label><label>计划持有（月）：<strong>{term}</strong><input type="range" aria-label="对话试算期限" min="0" max="36" step="1" value={term} onChange={event=>{setTerm(event.target.value);setSelected('');}}/></label></div>
      <WealthComparisonLab products={products} amount={numericAmount} selected={selected} onSelect={setSelected} market={market} onRefreshMarket={()=>void refreshMarket()} marketBusy={marketBusy} marketError={marketError}/>
      <RealFundSamples/>
      <div className="steward-wealth-inline-actions"><button type="button" disabled={!chosen||!Number.isFinite(numericAmount)||numericAmount<=0} onClick={()=>onExplain(`请基于我在比较工具中的选择继续解释：产品 ${chosen?.name}（ID ${chosen?.id}），试算投入 ${numericAmount} 元，计划持有 ${numericTerm} 个月。这个选择只是比较偏好，不是申购授权；请核对风险、费用、流动性和缺失信息。`)}>让管家解释我的选择</button>{onOpenWealth&&<button type="button" onClick={onOpenWealth}>去理财页核对</button>}</div>
    </details>
  </section>;
}
