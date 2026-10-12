import {useEffect,useMemo,useState} from 'react';
import {Button} from './ui/button';
import {Dialog} from './ui/dialog';
import {suitableWealthProducts,wealthProducts,wealthRequest,validWealthSnapshot,type RiskAnswers,type RiskAssessment,type WealthDraft,type WealthReceipt,type WealthSnapshot,type RedemptionDraft,type RedemptionReceipt} from '../lib/wealth-operation';
import {WealthGoalPlanner} from './wealth-goal-planner';
import {WealthComparisonLab} from './wealth-comparison-lab';
import {marketContextRequest,type MarketContext} from '../lib/market-context';
import {RealFundSamples} from './real-fund-samples';

const money=(cents:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(cents/100);
const questions:[keyof RiskAnswers,string,string[]][]=[
  ['experience','投资经验',['没有经验','有少量经验','经验较多']],
  ['loss','可承受亏损',['不能接受本金亏损','可接受小幅亏损','可接受较大波动']],
  ['term','资金使用期限',['一年内需要','一至三年','三年以上']],
  ['liquidity','流动性需求',['随时可能用钱','可保留部分资金','短期无需动用']],
  ['income','收入稳定性',['不稳定','基本稳定','较稳定']],
];
const riskName={low:'谨慎型',medium:'稳健型',high:'成长型'};

export function WealthOperationMvp({amount,term,availableBalance}:{amount:string;term:string;availableBalance?:number}){
  const [snapshot,setSnapshot]=useState<WealthSnapshot|null>(null);
  const [answers,setAnswers]=useState<Partial<RiskAnswers>>({});
  const [selected,setSelected]=useState('');
  const [draft,setDraft]=useState<WealthDraft|null>(null);
  const [redemptionDraft,setRedemptionDraft]=useState<RedemptionDraft|null>(null);
  const [receipt,setReceipt]=useState<WealthReceipt|null>(null);
  const [redemptionReceipt,setRedemptionReceipt]=useState<RedemptionReceipt|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [planAmount,setPlanAmount]=useState(amount);
  const [planTerm,setPlanTerm]=useState(term);
  const [market,setMarket]=useState<MarketContext|null>(null);
  const [marketBusy,setMarketBusy]=useState(false);
  const [marketError,setMarketError]=useState('');
  const numericAmount=Number(planAmount),numericTerm=Number(planTerm);
  const assessment=snapshot?.assessment&&snapshot.assessment.expiresAt>Date.now()?snapshot.assessment:null;
  const products=useMemo(()=>assessment?suitableWealthProducts(numericAmount,numericTerm,assessment.risk):[],[numericAmount,numericTerm,assessment]);
  const selectedEligible=products.some(product=>product.id===selected);
  useEffect(()=>{setPlanAmount(amount);setPlanTerm(term);},[amount,term]);
  async function reload(){const value=await wealthRequest<WealthSnapshot>();if(!validWealthSnapshot(value))throw new Error('理财账户数据不可用');setSnapshot(value);return value;}
  useEffect(()=>{let active=true;void wealthRequest<WealthSnapshot>().then(value=>{if(active&&validWealthSnapshot(value))setSnapshot(value);}).catch(value=>{if(active)setError(value instanceof Error?value.message:'理财账户读取失败');});return()=>{active=false;};},[]);
  useEffect(()=>{let active=true;void marketContextRequest().then(value=>{if(active)setMarket(value);}).catch(()=>{if(active)setMarketError('市场数据暂不可用，演示产品事实仍可单独比较。');});return()=>{active=false;};},[]);
  async function refreshMarket(){setMarketBusy(true);setMarketError('');try{const value=await marketContextRequest(true);setMarket(value);if(value.status==='error')setMarketError(value.message);}catch(value){setMarketError(value instanceof Error?value.message:'市场数据暂不可用');}finally{setMarketBusy(false);}}
  async function assess(){setBusy(true);setError('');try{await wealthRequest<RiskAssessment>({type:'assess',answers:answers as RiskAnswers});await reload();setDraft(null);setSelected('');}catch(value){setError(value instanceof Error?value.message:'测评保存失败');}finally{setBusy(false);}}
  async function prepare(){if(!selected)return;setBusy(true);setError('');setReceipt(null);try{setDraft(await wealthRequest<WealthDraft>({type:'prepare',productId:selected,amount:Math.round(numericAmount*100),term:numericTerm}));}catch(value){setError(value instanceof Error?value.message:'方案核对失败');}finally{setBusy(false);}}
  async function confirm(){if(!draft)return;setBusy(true);setError('');try{const result=await wealthRequest<WealthReceipt>({type:'confirm',draftId:draft.id,authorized:true});window.dispatchEvent(new Event('zhiyin-bank-updated'));const state=await reload();if(!state.holdings?.some(item=>item.id===result.id)||state.cashBalance!==result.balanceAfter)throw new Error('申购回执已生成，持仓复查未完成，请刷新核对');setReceipt(result);setDraft(null);}catch(value){setError(value instanceof Error?value.message:'申购结果待核实，请保留方案编号');}finally{setBusy(false);}}
  async function prepareRedemption(holdingId:string){setBusy(true);setError('');setRedemptionReceipt(null);try{setRedemptionDraft(await wealthRequest<RedemptionDraft>({type:'prepare-redemption',holdingId}));}catch(value){setError(value instanceof Error?value.message:'赎回核对失败');}finally{setBusy(false);}}
  async function confirmRedemption(){if(!redemptionDraft)return;setBusy(true);setError('');try{const result=await wealthRequest<RedemptionReceipt>({type:'confirm-redemption',draftId:redemptionDraft.id,authorized:true});window.dispatchEvent(new Event('zhiyin-bank-updated'));const state=await reload();if(!state.holdings?.some(item=>item.id===result.holdingId&&item.redeemedAt))throw new Error('赎回回执已生成，持仓复查未完成，请刷新核对');setRedemptionReceipt(result);setRedemptionDraft(null);}catch(value){setError(value instanceof Error?value.message:'赎回结果待核实');}finally{setBusy(false);}}
  const chosen=wealthProducts.find(item=>item.id===(draft?.productId||selected));
  const holding=snapshot?.holdings?.find(item=>item.id===redemptionDraft?.holdingId);
  return <><WealthGoalPlanner/><section className="surface wealth-mvp" aria-labelledby="wealth-mvp-title">
    <div className="section-line"><div><h2 id="wealth-mvp-title" className="section-title">理财操作沙箱</h2><p>风险测评 → 产品对比 → 本人确认 → 持仓与赎回</p></div><span className="pill">MVP</span></div>
    <p>常用卡 8888 可用余额：<strong>{snapshot?.cashBalance===undefined?'待读取':money(snapshot.cashBalance)}</strong>。申购从同一余额扣款，赎回原路入账。</p>
    {availableBalance!==undefined&&snapshot?.cashBalance!==undefined&&availableBalance!==snapshot.cashBalance&&<p className="fine-print left">银行卡页面显示 {money(availableBalance)}，正在同步最新余额。</p>}
    <h3>风险测评</h3><p>本次测评有效期一年，重新测评会使待确认方案失效。</p>
    <div className="wealth-risk-questions">{questions.map(([key,label,choices])=><label key={key}>{label}<select aria-label={label} value={answers[key]??''} onChange={event=>setAnswers(current=>({...current,[key]:Number(event.target.value)}))}><option value="">请选择</option>{choices.map((choice,index)=><option value={index} key={choice}>{choice}</option>)}</select></label>)}</div>
    <Button disabled={busy||questions.some(([key])=>answers[key]===undefined)} onClick={()=>void assess()}>保存风险测评</Button>
    {assessment&&<p role="status">当前风险等级：{riskName[assessment.risk]} · 有效至 {new Date(assessment.expiresAt).toLocaleDateString('zh-CN')}</p>}
    <h3>产品推荐与对比</h3><p>调整金额和计划期限，先探索适当性、费用与可取用时间。仅展示满足金额、期限和风险上限的演示产品；市场指数与利率不会改变风险上限。</p>
    <div className="wealth-compare-controls"><label>计划投入（元）<input aria-label="试算投入金额" type="number" min="100" max="1000000" step="100" value={planAmount} onChange={event=>setPlanAmount(event.target.value)}/></label><label>计划持有（月）：<strong>{Number.isFinite(numericTerm)?numericTerm:'—'}</strong><input aria-label="试算持有期限" type="range" min="0" max="36" step="1" value={Number.isFinite(numericTerm)?Math.min(36,Math.max(0,numericTerm)):0} onChange={event=>setPlanTerm(event.target.value)}/></label></div>
    {!assessment&&<p role="status">完成风险测评后才会生成适当性候选；下方先展示全部演示产品的事实差异，供你探索。</p>}
    <WealthComparisonLab products={assessment?products:wealthProducts} amount={numericAmount} selected={selected} onSelect={setSelected} market={market} onRefreshMarket={()=>void refreshMarket()} marketBusy={marketBusy} marketError={marketError} screened={!!assessment}/>
    <RealFundSamples/>
    <div className="wealth-products" role="group" aria-label="候选产品">{products.map(product=><button key={product.id} type="button" aria-pressed={selected===product.id} onClick={()=>setSelected(product.id)}><span><strong>{product.name}</strong><i>R{product.risk}</i></span><p>{product.description}</p><small>起购 {product.minAmount} 元 · 递增 {product.increment} 元 · 申购费率 {(product.feeRate*100).toFixed(1)}% · {product.liquidity}</small><small>{product.riskDisclosure} · 产品数据日期 {product.dataDate}</small></button>)}</div>
    {products.length>1&&<div className="wealth-comparison"><table><caption>候选产品对比</caption><thead><tr><th>产品</th><th>风险</th><th>申购费率</th><th>最低持有</th><th>赎回</th></tr></thead><tbody>{products.map(product=><tr key={product.id}><th>{product.name}</th><td>R{product.risk}</td><td>{(product.feeRate*100).toFixed(1)}%</td><td>{product.minTerm} 个月</td><td>{product.liquidity}</td></tr>)}</tbody></table></div>}
    {assessment&&!products.length&&<p>当前金额或期限没有符合的演示产品。</p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    {snapshot?.cashBalance!==undefined&&selected&&numericAmount*100+Math.round(numericAmount*(chosen?.feeRate??0)*100)>snapshot.cashBalance&&<p role="status">当前试算金额连同申购费超过常用卡余额，请调低金额后再生成方案。</p>}
    <Button className="full-width" disabled={busy||!selectedEligible||!Number.isFinite(numericAmount)||!Number.isInteger(numericTerm)||numericAmount*100+Math.round(numericAmount*(chosen?.feeRate??0)*100)>(snapshot?.cashBalance??Infinity)} onClick={()=>void prepare()}>生成待确认申购方案</Button>
    <p className="fine-print left">产品目录为演示数据，数据日期见产品详情；不展示或承诺未来收益。</p>
    {receipt&&<p role="status">沙箱申购已完成 · 回执 {receipt.id} · 持仓与资金已复查</p>}
    {redemptionReceipt&&<p role="status">沙箱赎回已完成 · 回执 {redemptionReceipt.id} · 到账 {money(redemptionReceipt.amount-redemptionReceipt.fee)}</p>}
    <h3>我的持仓</h3>{!snapshot?.holdings?.some(item=>!item.redeemedAt)?<p>当前没有未赎回持仓。</p>:<div className="wealth-history">{snapshot.holdings.filter(item=>!item.redeemedAt).map(item=>{const product=wealthProducts.find(value=>value.id===item.productId)!;const unlock=item.purchasedAt+product.redemptionDays*86400000;return <article key={item.id}><strong>{product.name}</strong><p>本金 / 当前演示价值：{money(item.principal)} · 盈亏 {money(0)}</p><p>申购日期 {new Date(item.purchasedAt).toLocaleDateString('zh-CN')} · {Date.now()>=unlock?'可赎回':`最早 ${new Date(unlock).toLocaleDateString('zh-CN')} 赎回`}</p><button disabled={busy||Date.now()<unlock} onClick={()=>void prepareRedemption(item.id)}>赎回持仓</button></article>;})}</div>}
    <Dialog open={!!draft} onOpenChange={open=>!open&&setDraft(null)} title="请核对并确认申购" description="关键资金操作必须由你本人最后确认">{draft&&<div className="wealth-confirmation"><dl><div><dt>产品</dt><dd>{chosen?.name}</dd></div><div><dt>金额</dt><dd>{money(draft.amount)}</dd></div><div><dt>申购费用</dt><dd>{money(draft.fee??0)}</dd></div><div><dt>资金来源</dt><dd>常用卡 8888</dd></div><div><dt>扣款后余额</dt><dd>{money((draft.balanceAtPrepare??0)-draft.amount-(draft.fee??0))}</dd></div><div><dt>预计确认</dt><dd>沙箱即时</dd></div><div><dt>风险</dt><dd>{chosen?.riskDisclosure}</dd></div></dl>{error&&<p role="alert">{error}</p>}<div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setDraft(null)}>返回修改</Button><Button disabled={busy} onClick={()=>void confirm()}>确认沙箱申购</Button></div></div>}</Dialog>
    <Dialog open={!!redemptionDraft} onOpenChange={open=>!open&&setRedemptionDraft(null)} title="请核对并确认赎回" description="赎回后持仓与资金账本同步更新">{redemptionDraft&&<div className="wealth-confirmation"><p>{wealthProducts.find(item=>item.id===holding?.productId)?.name} · 全额赎回 {money(redemptionDraft.amount)}</p><p>赎回费用 {money(redemptionDraft.fee)} · 预计即时到账常用卡 8888</p><div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setRedemptionDraft(null)}>取消</Button><Button disabled={busy} onClick={()=>void confirmRedemption()}>确认沙箱赎回</Button></div></div>}</Dialog>
  </section></>;
}
