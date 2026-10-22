import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from './ui/button';
import {Dialog} from './ui/dialog';
import {suitableWealthProducts,wealthProducts,wealthRequest,validWealthSnapshot,type RiskAnswers,type RiskAssessment,type WealthDraft,type WealthReceipt,type WealthSnapshot,type RedemptionDraft,type RedemptionReceipt} from '../lib/wealth-operation';
import {WealthGoalPlanner} from './wealth-goal-planner';
import {WealthComparisonLab} from './wealth-comparison-lab';
import {marketContextRequest,type MarketContext} from '../lib/market-context';
import {RealFundSamples} from './real-fund-samples';
import {WealthConversation,WealthConversationProvider,useWealthConversation} from './wealth-conversation';
import {WealthCatalogShelf} from './wealth-catalog-shelf';
import {WealthProductShowcase} from './wealth-product-showcase';
import './wealth-banking.css';

const money=(cents:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(cents/100);
const questions:[keyof RiskAnswers,string,string[]][]=[
  ['experience','投资经验',['没有经验','有少量经验','经验较多']],
  ['loss','可承受亏损',['不能接受本金亏损','可接受小幅亏损','可接受较大波动']],
  ['term','资金使用期限',['一年内需要','一至三年','三年以上']],
  ['liquidity','流动性需求',['随时可能用钱','可保留部分资金','短期无需动用']],
  ['income','收入稳定性',['不稳定','基本稳定','较稳定']],
];
const riskName={low:'谨慎型',medium:'稳健型',high:'成长型'};

type WealthOperationProps={initialScreen?:'assessment'|'holdings';onInitialScreenConsumed?:()=>void;amount?:string;term?:string;availableBalance?:number;stewardName?:string;onOpenFund?:(id?:string)=>void;focusProductId?:string;onFocusHandled?:()=>void;onBack?:()=>void};
export function WealthOperationMvp(props:WealthOperationProps){
  const initialPlan={...(props.amount?{amountYuan:Number(props.amount)}:{}),...(props.term?{termMonths:Number(props.term)}:{})};
  return <WealthConversationProvider initialPlan={initialPlan}><WealthOperationContent {...props}/></WealthConversationProvider>;
}
function WealthOperationContent({initialScreen,onInitialScreenConsumed,availableBalance,stewardName='宁宁',onOpenFund,focusProductId,onFocusHandled,onBack}:WealthOperationProps){
  const {plan}=useWealthConversation();
  const [localFocus,setLocalFocus]=useState<string>();
  const [screen,setScreen]=useState<'products'|'assessment'|'detail'|'holdings'>(()=>initialScreen==='holdings'?'holdings':'products');
  const consumedScreen=useRef<typeof initialScreen>();
  const [questionIndex,setQuestionIndex]=useState(0);
  const [snapshot,setSnapshot]=useState<WealthSnapshot|null>(null);
  const [snapshotReady,setSnapshotReady]=useState(false);
  const [snapshotLoading,setSnapshotLoading]=useState(true);
  const [snapshotError,setSnapshotError]=useState('');
  const readGeneration=useRef({value:0}).current;
  const [answers,setAnswers]=useState<Partial<RiskAnswers>>({});
  const [selected,setSelected]=useState('');
  const [draft,setDraft]=useState<WealthDraft|null>(null);
  const [redemptionDraft,setRedemptionDraft]=useState<RedemptionDraft|null>(null);
  const [receipt,setReceipt]=useState<WealthReceipt|null>(null);
  const [redemptionReceipt,setRedemptionReceipt]=useState<RedemptionReceipt|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [market,setMarket]=useState<MarketContext|null>(null);
  const [marketBusy,setMarketBusy]=useState(false);
  const [marketError,setMarketError]=useState('');
  const [editingRisk,setEditingRisk]=useState(false);
  const numericAmount=plan.amountYuan??NaN,numericTerm=plan.termMonths??NaN;
  const hasPlan=Number.isFinite(numericAmount)&&numericAmount>0&&Number.isInteger(numericTerm)&&numericTerm>=0;
  const assessment=snapshot?.assessment&&snapshot.assessment.expiresAt>Date.now()?snapshot.assessment:null;
  const canCompare=Boolean(assessment)&&!editingRisk;
  const products=useMemo(()=>canCompare&&assessment?(hasPlan?suitableWealthProducts(numericAmount,numericTerm,assessment.risk):wealthProducts.filter(product=>product.open&&product.risk<=({low:1,medium:2,high:3}[assessment.risk]))):[],[numericAmount,numericTerm,assessment,canCompare,hasPlan]);
  const selectedEligible=products.some(product=>product.id===selected);
  useEffect(()=>{setDraft(null);},[numericAmount,numericTerm,assessment?.assessedAt]);
  const reload=useCallback(async()=>{
    const generation=++readGeneration.value;setSnapshotReady(false);setSnapshotLoading(true);setSnapshotError('');
    try {
      const value=await wealthRequest<WealthSnapshot>();
      if(!validWealthSnapshot(value))throw new Error('理财账户数据不可用');
      if(generation===readGeneration.value){setSnapshot(value);setSnapshotReady(true);if(value.assessment)setAnswers(value.assessment.answers);}
      return value;
    } catch(reason) {
      if(generation===readGeneration.value)setSnapshotError(reason instanceof Error?reason.message:'理财账户读取失败');
      throw reason;
    } finally { if(generation===readGeneration.value)setSnapshotLoading(false); }
  },[readGeneration]);
  useEffect(()=>{
    const refresh=()=>{void reload().catch(()=>undefined);};
    refresh();
    window.addEventListener('zhiyin-bank-updated',refresh);window.addEventListener('zhiyin-wealth-updated',refresh);
    return()=>{readGeneration.value++;window.removeEventListener('zhiyin-bank-updated',refresh);window.removeEventListener('zhiyin-wealth-updated',refresh);};
  },[reload,readGeneration]);
  useEffect(()=>{if(!canCompare)return;let active=true;void marketContextRequest().then(value=>{if(active)setMarket(value);}).catch(()=>{if(active)setMarketError('市场数据暂不可用，可稍后重试；产品规则仍可查看。');});return()=>{active=false;};},[canCompare]);
  async function refreshMarket(){setMarketBusy(true);setMarketError('');try{const value=await marketContextRequest(true);setMarket(value);if(value.status==='error')setMarketError(value.message);}catch(value){setMarketError(value instanceof Error?value.message:'市场数据暂不可用');}finally{setMarketBusy(false);}}
  async function assess(){setBusy(true);setError('');try{await wealthRequest<RiskAssessment>({type:'assess',answers:answers as RiskAnswers});await reload();setDraft(null);setSelected('');setEditingRisk(false);setScreen('products');window.dispatchEvent(new Event('zhiyin-wealth-updated'));}catch(value){setError(value instanceof Error?value.message:'测评保存失败');}finally{setBusy(false);}}
  async function prepare(){if(!selected||!hasPlan||!snapshotReady)return;setBusy(true);setError('');setReceipt(null);try{setDraft(await wealthRequest<WealthDraft>({type:'prepare',productId:selected,amount:Math.round(numericAmount*100),term:numericTerm}));}catch(value){setError(value instanceof Error?value.message:'方案核对失败');}finally{setBusy(false);}}
  async function confirm(){if(!draft)return;setBusy(true);setError('');try{const result=await wealthRequest<WealthReceipt>({type:'confirm',draftId:draft.id,authorized:true});window.dispatchEvent(new Event('zhiyin-bank-updated'));const state=await reload();if(!state.holdings?.some(item=>item.id===result.id)||state.cashBalance!==result.balanceAfter)throw new Error('申购回执已生成，持仓复查未完成，请刷新核对');setReceipt(result);setDraft(null);setScreen('holdings');}catch(value){setError(value instanceof Error?value.message:'申购结果待核实，请保留方案编号');}finally{setBusy(false);}}
  async function prepareRedemption(holdingId:string){setBusy(true);setError('');setRedemptionReceipt(null);try{setRedemptionDraft(await wealthRequest<RedemptionDraft>({type:'prepare-redemption',holdingId}));}catch(value){setError(value instanceof Error?value.message:'赎回核对失败');}finally{setBusy(false);}}
  async function confirmRedemption(){if(!redemptionDraft)return;setBusy(true);setError('');try{const result=await wealthRequest<RedemptionReceipt>({type:'confirm-redemption',draftId:redemptionDraft.id,authorized:true});window.dispatchEvent(new Event('zhiyin-bank-updated'));const state=await reload();if(!state.holdings?.some(item=>item.id===result.holdingId&&item.redeemedAt))throw new Error('赎回回执已生成，持仓复查未完成，请刷新核对');setRedemptionReceipt(result);setRedemptionDraft(null);}catch(value){setError(value instanceof Error?value.message:'赎回结果待核实');}finally{setBusy(false);}}
  const chosen=wealthProducts.find(item=>item.id===(draft?.productId||selected));
  const holding=snapshot?.holdings?.find(item=>item.id===redemptionDraft?.holdingId);
  const balanceInsufficient=!!chosen&&snapshot?.cashBalance!==undefined&&numericAmount*100+Math.round(numericAmount*chosen.feeRate*100)>snapshot.cashBalance;
  function startAssessment(){setAnswers(assessment?.answers??{});setQuestionIndex(0);setEditingRisk(Boolean(assessment));setSelected('');setDraft(null);setError('');setScreen('assessment');}
  useEffect(()=>{
    if(!initialScreen){consumedScreen.current=undefined;return;}
    if(consumedScreen.current===initialScreen||(initialScreen==='assessment'&&!snapshotReady))return;
    consumedScreen.current=initialScreen;
    if(initialScreen==='assessment'){
      setAnswers(assessment?.answers??{});setQuestionIndex(0);setEditingRisk(Boolean(assessment));setSelected('');setDraft(null);setError('');
    }
    setScreen(initialScreen);onInitialScreenConsumed?.();
  },[initialScreen,onInitialScreenConsumed,snapshotReady,assessment]);
  const [questionKey,questionLabel,choices]=questions[questionIndex];
  function continueProductPlan(){setScreen('products');setLocalFocus(chosen?.id);}
  return <><section className="wealth-banking" aria-labelledby={screen==='products'||screen==='holdings'?'wealth-mvp-title':undefined} aria-label={screen==='assessment'?'风险测评':screen==='detail'?'产品详情':undefined}>
    {(screen==='products'||screen==='holdings')&&<><div className="wealth-bank-top"><div className="wealth-bank-topline"><div>{onBack&&<button className="wealth-bank-return" type="button" aria-label="返回" onClick={onBack}><ArrowLeft size={19} aria-hidden="true"/></button>}<h2 id="wealth-mvp-title">财富</h2></div>{onOpenFund&&<button type="button" onClick={()=>onOpenFund()}>基金筛选</button>}</div></div>
    <div className="wealth-bank-balance"><span>常用卡 8888 · 可用余额</span><strong>{snapshot?.cashBalance===undefined?(snapshotLoading?'读取中…':'暂不可用'):money(snapshot.cashBalance)}</strong></div></>}
    {availableBalance!==undefined&&snapshot?.cashBalance!==undefined&&availableBalance!==snapshot.cashBalance&&<p className="wealth-bank-alert">银行卡页面显示 {money(availableBalance)}，{snapshotLoading?'正在同步最新余额。':'余额尚未核对一致，请重新读取账户。'}</p>}
    {screen!=='assessment'&&screen!=='detail'&&<nav className="wealth-bank-tabs" aria-label="理财页面"><button type="button" aria-current={screen==='products'?'page':undefined} onClick={()=>setScreen('products')}>产品</button><button type="button" aria-current={screen==='holdings'?'page':undefined} onClick={()=>setScreen('holdings')}>持仓 {snapshotReady&&<span>{snapshot?.holdings?.filter(item=>!item.redeemedAt).length??0}</span>}</button><button type="button" disabled={!snapshotReady} onClick={startAssessment}>风险测评</button></nav>}
    {snapshotLoading&&<p className="wealth-bank-read-status" role="status">{snapshot?'正在更新账户，当前显示上次读取结果。':'正在读取账户与风险测评，基金资料可先浏览。'}</p>}
    {snapshotError&&<div className="wealth-bank-read-error" role="alert"><div><strong>账户暂未读取成功</strong><p>{snapshotError}。{snapshot?'当前显示上次读取结果，请重试后再办理。':'重试后再核对余额、持仓与风险测评。'}</p></div><button type="button" onClick={()=>void reload().catch(()=>undefined)}>重新读取</button></div>}
    {error&&<p role="alert" className="wealth-bank-alert">{error}</p>}

    {screen==='assessment'&&<div className="wealth-bank-panel wealth-assessment">
      <button type="button" className="wealth-bank-back" onClick={()=>{setEditingRisk(false);setScreen('products');}}>‹ 返回理财</button>
      <div className="wealth-bank-panel-heading"><span>投资者适当性</span><h3>{assessment?'重新进行风险测评':'完成风险测评'}</h3><p>请按实际情况作答，结果将用于筛选符合条件的产品。</p></div>
      <div className="wealth-assessment-progress"><span>问题 {questionIndex+1} / {questions.length}</span><div role="progressbar" aria-label="测评进度" aria-valuenow={questionIndex+1} aria-valuemin={1} aria-valuemax={questions.length}><i style={{width:`${(questionIndex+1)/questions.length*100}%`}}/></div></div>
      <fieldset className="wealth-assessment-question"><legend>{questionLabel}</legend><div className="wealth-assessment-options">{choices.map((choice,index)=><button key={choice} type="button" aria-pressed={answers[questionKey]===index} onClick={()=>setAnswers(current=>({...current,[questionKey]:index as 0|1|2}))}><span>{choice}</span><i aria-hidden="true">{answers[questionKey]===index?'✓':''}</i></button>)}</div></fieldset>
      <div className="wealth-assessment-actions"><Button variant="secondary" disabled={questionIndex===0||busy} onClick={()=>setQuestionIndex(index=>index-1)}>上一题</Button>{questionIndex<questions.length-1?<Button disabled={answers[questionKey]===undefined||busy} onClick={()=>setQuestionIndex(index=>index+1)}>下一题</Button>:<Button disabled={busy||questions.some(([key])=>answers[key]===undefined)} onClick={()=>void assess()}>{assessment?'保存新测评':'保存风险测评'}</Button>}</div>
      <p className="wealth-bank-footnote">{assessment?'重新测评后，未确认的申购方案将失效。':'请如实填写。'}风险等级不代表收益承诺。</p>
    </div>}

    {screen==='products'&&<>
      {canCompare&&<>
        <WealthProductShowcase products={products} hasPlan={hasPlan} stewardName={stewardName} onOpen={id=>{setSelected(id);setScreen('detail');}} onAsk={setLocalFocus}/>
        {!products.length&&<div className="wealth-bank-empty"><strong>暂无符合当前条件的账户产品</strong><p>可以和{stewardName}调整金额或持有期；风险等级通过重新测评更新。</p></div>}
      </>}
      {!canCompare&&<WealthCatalogShelf stewardName={stewardName} onOpenFund={onOpenFund} onAskNingning={setLocalFocus}/>}
      <WealthConversation compact stewardName={stewardName} snapshot={snapshot} onOpenRisk={startAssessment} focusProductId={focusProductId||localFocus} onFocusHandled={()=>{setLocalFocus(undefined);onFocusHandled?.();}} onViewProduct={id=>{if(wealthProducts.some(item=>item.id===id)){setSelected(id);setScreen('detail');}else onOpenFund?.(id);}}/>
      {snapshotReady&&(assessment&&!editingRisk?<div className="wealth-bank-risk" role="status"><div><strong>当前风险等级：{riskName[assessment.risk]}</strong><small>有效至 {new Date(assessment.expiresAt).toLocaleDateString('zh-CN')}</small></div><button type="button" onClick={startAssessment}>调整风险偏好</button></div>:<div className="wealth-bank-gate" role="status"><h3>按你的计划筛选</h3><p>完成并保存风险测评后，结合投入金额与用钱时间核对账户产品。</p><Button onClick={startAssessment}>开始风险测评</Button></div>)}
      {canCompare&&<>
        <WealthCatalogShelf stewardName={stewardName} onOpenFund={onOpenFund} onAskNingning={setLocalFocus}/>
        {hasPlan&&<details className="wealth-bank-expand"><summary>展开对比分析与市场资料</summary><WealthComparisonLab products={products} amount={numericAmount} selected={selected} onSelect={setSelected} market={market} onRefreshMarket={()=>void refreshMarket()} marketBusy={marketBusy} marketError={marketError}/><RealFundSamples/></details>}
        <details className="wealth-bank-expand"><summary>按目标规划这笔钱</summary><WealthGoalPlanner/></details>
      </>}
    </>}

    {screen==='detail'&&chosen&&<div className="wealth-bank-panel wealth-product-detail"><button type="button" className="wealth-bank-back" onClick={()=>setScreen('products')}>‹ 返回产品列表</button><span className="wealth-bank-eyebrow">产品资料 · {chosen.dataDate}</span><h3>{chosen.name}</h3><p>{chosen.description}</p><div className="wealth-product-risk">R{chosen.risk} 风险等级 <span>{chosen.riskDisclosure}</span></div><dl><div><dt>起购金额</dt><dd>{chosen.minAmount} 元</dd></div><div><dt>金额递增</dt><dd>{chosen.increment} 元</dd></div><div><dt>最短持有</dt><dd>{chosen.minTerm===0?'无固定期限':`${chosen.minTerm} 个月`}</dd></div><div><dt>赎回规则</dt><dd>{chosen.liquidity}</dd></div><div><dt>申购费率</dt><dd>{(chosen.feeRate*100).toFixed(1)}%</dd></div><div><dt>本次申购费试算</dt><dd>{hasPlan?money(Math.round(numericAmount*chosen.feeRate*100)):'确定投入后计算'}</dd></div></dl><p className="wealth-bank-footnote">本地账户产品，交易记入本地账本。</p>{balanceInsufficient&&<p role="status" className="wealth-bank-alert">当前试算金额连同申购费超过常用卡余额，请和{stewardName}调整投入金额。</p>}{!hasPlan&&<div className="wealth-bank-next-step"><p>还需确定{plan.amountYuan===undefined?'投入金额':''}{plan.amountYuan===undefined&&plan.termMonths===undefined?'和':''}{plan.termMonths===undefined?'持有期':''}，{stewardName}会结合你的计划继续核对。</p><Button variant="secondary" onClick={continueProductPlan}>和{stewardName}完善计划</Button></div>}{hasPlan&&snapshotReady&&(!selectedEligible||balanceInsufficient)&&<div className="wealth-bank-next-step"><p>{balanceInsufficient?'调整投入后，会重新核对费用和余额。':'这项产品暂不符合当前计划或风险条件，可以回到对话调整计划。'}</p><Button variant="secondary" onClick={continueProductPlan}>和{stewardName}调整计划</Button></div>}<Button className="full-width" disabled={busy||!snapshotReady||!hasPlan||!selectedEligible||!Number.isFinite(numericAmount)||!Number.isInteger(numericTerm)||numericAmount*100+Math.round(numericAmount*chosen.feeRate*100)>(snapshot?.cashBalance??Infinity)} onClick={()=>void prepare()}>生成待确认申购方案</Button></div>}

    {screen==='holdings'&&<div className="wealth-bank-panel"><div className="wealth-bank-panel-heading"><span>账户资产</span><h3>我的持仓</h3><p>申购和赎回后，资金与持仓会同步核对。</p></div>{receipt&&<p role="status" className="wealth-bank-success">申购已完成 · 回执 {receipt.id} · 持仓与资金已复查</p>}{redemptionReceipt&&<p role="status" className="wealth-bank-success">赎回已完成 · 回执 {redemptionReceipt.id} · 到账 {money(redemptionReceipt.amount-redemptionReceipt.fee)}</p>}{!snapshot?<p className="wealth-bank-read-status">{snapshotLoading?'读取后将在这里显示你的持仓。':'持仓情况暂无法确认，请先重新读取账户。'}</p>:!snapshot.holdings?.some(item=>!item.redeemedAt)?<div className="wealth-bank-empty"><strong>暂无持仓</strong><p>完成风险测评后，可从产品页了解产品。</p><button type="button" onClick={()=>setScreen('products')}>查看产品 →</button></div>:<div className="wealth-bank-holdings">{snapshot.holdings.filter(item=>!item.redeemedAt).map(item=>{const product=wealthProducts.find(value=>value.id===item.productId)!;const unlock=item.purchasedAt+product.redemptionDays*86400000;return <article key={item.id}><span>{product.name}<i>R{product.risk}</i></span><strong>{money(item.principal)}</strong><small>持仓本金 · 暂无实时净值</small><p>申购于 {new Date(item.purchasedAt).toLocaleDateString('zh-CN')} · {Date.now()>=unlock?'可赎回':`最早 ${new Date(unlock).toLocaleDateString('zh-CN')} 赎回`}</p><button disabled={busy||Date.now()<unlock} onClick={()=>void prepareRedemption(item.id)}>赎回持仓</button></article>;})}</div>}</div>}
    <Dialog open={!!draft} onOpenChange={open=>!open&&setDraft(null)} title="请核对并确认申购" description="关键资金操作必须由你本人最后确认">{draft&&<div className="wealth-confirmation"><dl><div><dt>产品</dt><dd>{chosen?.name}</dd></div><div><dt>金额</dt><dd>{money(draft.amount)}</dd></div><div><dt>申购费用</dt><dd>{money(draft.fee??0)}</dd></div><div><dt>资金来源</dt><dd>常用卡 8888</dd></div><div><dt>扣款后余额</dt><dd>{money((draft.balanceAtPrepare??0)-draft.amount-(draft.fee??0))}</dd></div><div><dt>预计确认</dt><dd>即时记账</dd></div><div><dt>风险</dt><dd>{chosen?.riskDisclosure}</dd></div></dl>{error&&<p role="alert">{error}</p>}<div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setDraft(null)}>返回修改</Button><Button disabled={busy} onClick={()=>void confirm()}>确认申购</Button></div></div>}</Dialog>
    <Dialog open={!!redemptionDraft} onOpenChange={open=>!open&&setRedemptionDraft(null)} title="请核对并确认赎回" description="赎回后持仓与资金账本同步更新">{redemptionDraft&&<div className="wealth-confirmation"><p>{wealthProducts.find(item=>item.id===holding?.productId)?.name} · 全额赎回 {money(redemptionDraft.amount)}</p><p>赎回费用 {money(redemptionDraft.fee)} · 预计即时到账常用卡 8888</p><div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setRedemptionDraft(null)}>取消</Button><Button disabled={busy} onClick={()=>void confirmRedemption()}>确认赎回</Button></div></div>}</Dialog>
  </section></>;
}
