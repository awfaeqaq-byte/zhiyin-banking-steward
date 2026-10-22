import {useEffect,useRef,useState} from 'react';
import {ArrowDownLeft,ArrowRight,ArrowUpRight,Check,ChevronDown,ChevronRight,LoaderCircle,ReceiptText,ShieldCheck} from 'lucide-react';
import {buildBillAnalysis,billReferenceTime} from '../lib/bill-analysis';
import {billProvider,billScopeQuestion,type BillUI,type BillInteraction,type BillFocus} from '../lib/steward-ui';
import {formatCny,type ConnectedFinancialSource,type ExternalFinancialProvider,type FinancialScope} from '../lib/financial-connections';
import {Button} from './ui/button';
import {TaskCardHeader} from './task-card-header';
import {BillSpendingVisual} from './bill-spending-visual';
import './steward-bill-workspace.css';

type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;
export type ConnectBillSource=(provider:ExternalFinancialProvider,scopes:FinancialScope[])=>Promise<ConnectedFinancialSource>;
const providers=[{id:'wechat_pay' as const,name:'微信支付'},{id:'alipay' as const,name:'支付宝'}];

export function InlineBillConsent({provider,connections,onConnect,onComplete,disabled=false}:{
  provider?:ExternalFinancialProvider;connections:Connections;onConnect:ConnectBillSource;
  onComplete:(connections:Connections,selected:ExternalFinancialProvider[])=>void|Promise<void>;disabled?:boolean;
}) {
  const [selected,setSelected]=useState<ExternalFinancialProvider[]>(provider?[provider]:providers.map(p=>p.id));
  const [busy,setBusy]=useState<ExternalFinancialProvider|'continuing'|null>(null);
  const [error,setError]=useState('');
  const completed=useRef<Connections>({});
  const latest=useRef(connections);latest.current=connections;
  const lock=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(!lock.current)setSelected(provider?[provider]:providers.map(p=>p.id));},[provider]);
  const allGranted=selected.length>0&&selected.every(p=>(completed.current[p]||connections[p])?.scopes.includes('transactions'));
  async function confirm() {
    if(lock.current||disabled||!selected.length)return;
    lock.current=true;setError('');
    try{
      for(const id of selected){
        const source=completed.current[id]||latest.current[id];
        if(source?.scopes.includes('transactions'))continue;
        setBusy(id);
        const scopes=[...new Set<FinancialScope>([...(source?.scopes||[]),'transactions'])];
        const result=await onConnect(id,scopes);
        if(!mounted.current)return;
        if(result.provider!==id||!result.scopes.includes('transactions'))throw new Error('平台未返回账单读取授权，这次没有继续分析。');
        completed.current[id]=result;
      }
      if(!mounted.current)return;
      setBusy('continuing');
      await onComplete({...latest.current,...completed.current},selected);
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'平台未确认，请稍后重试。');}
    finally{lock.current=false;if(mounted.current)setBusy(null);}
  }
  return <section className="steward-inline-consent" aria-label="账单读取范围" aria-busy={Boolean(busy)}>
    <TaskCardHeader title="这次看哪些账单？" icon={<ReceiptText/>} status={busy==='continuing'?'正在整理':busy?'等待平台确认':error?'待重新确认':allGranted?'已获读取授权':'等待你确认'} tone={error?'warning':busy?'neutral':allGranted?'success':'attention'} meta="确认读取范围后，我接着整理刚才的问题。"/>
    <fieldset className="bill-provider-choices"><legend className="sr-only">选择账单来源</legend>{providers.map(p=><label key={p.id}>
      <input type="checkbox" aria-label={p.name} checked={selected.includes(p.id)} disabled={Boolean(busy)||disabled} onChange={e=>setSelected(current=>e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id))}/>
      <span>{p.name}</span><Check size={16} aria-hidden="true"/>
    </label>)}</fieldset>
    <div className="bill-consent-scope"><ShieldCheck size={18} aria-hidden="true"/><div><strong>仅新增读取交易账单</strong><p>不包含付款、转账，也不新增余额或自动扣费权限。已有授权保持不变。</p></div></div>
    {error&&<p className="bill-ui-error" role="alert">{error}</p>}
    {!selected.length&&<p className="bill-ui-note" role="status">请选择至少一个账单来源。</p>}
    <Button disabled={Boolean(busy)||disabled||!selected.length} onClick={()=>void confirm()}>
      {busy?<><LoaderCircle size={17} className="spin" aria-hidden="true"/>{busy==='continuing'?'继续整理原问题…':`等待${providers.find(p=>p.id===busy)?.name}确认…`}</>:<>{allGranted?'继续分析账单':'继续到平台确认'}<ArrowRight size={17} aria-hidden="true"/></>}
    </Button>
    <p className="bill-ui-note">沙箱合作授权：需要你在平台再同意一次，未确认前不会读取新数据。</p>
  </section>;
}

export function StewardBillWorkspace({question,connections,ui,onInteract,onViewChange,selectedCategory,selectedFocus,interpretationChanged,onRequestConnection,stewardName='宁宁',compact=false,disabled=false,loading=false,error='',now}:{
  question:string;connections:Connections;ui?:BillUI;onInteract:(value:BillInteraction)=>void;
  onRequestConnection?:(provider?:ExternalFinancialProvider)=>void;stewardName?:string;
  onViewChange?:(value:BillInteraction)=>void;selectedCategory?:string;interpretationChanged?:boolean;
  selectedFocus?:BillFocus;
  compact?:boolean;disabled?:boolean;loading?:boolean;error?:string;now?:number;
}) {
  const [provider,setProvider]=useState<ExternalFinancialProvider|undefined>(()=>billProvider(question));
  const [category,setCategory]=useState(selectedCategory||'');
  const [focus,setFocus]=useState<BillFocus|undefined>(selectedFocus);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{setProvider(billProvider(question));},[question]);
  useEffect(()=>{setCategory(selectedCategory||'');setExpanded(false);},[question,selectedCategory]);
  useEffect(()=>{setFocus(selectedFocus);},[question,selectedFocus]);
  const scopedQuestion=billScopeQuestion(question,provider);
  const bill=buildBillAnalysis(connections,scopedQuestion,now??billReferenceTime(connections));
  const unavailable=Boolean(error)||loading;
  const frozen=disabled||unavailable;
  const sections=ui?.sections||['overview','categories'];
  const purchases=bill.transactions.filter(t=>t.amount<0&&t.kind!=='transfer');
  const filtered=compact&&category?purchases.filter(t=>t.category===category):bill.transactions;
  const selected=bill.transactions.find(t=>t.id===focus?.id&&t.providerKey===focus.provider);
  const rows=filtered.slice(0,expanded?100:4);
  function switchSource(id?:ExternalFinancialProvider) {
    setProvider(id);setCategory('');setFocus(undefined);setExpanded(false);
    onViewChange?.({question:billScopeQuestion(question,id),...(id?{provider:id}:{})});
  }
  function selectCategory(next:string) {
    setCategory(next);setFocus(undefined);setExpanded(false);
    onViewChange?.({question:scopedQuestion,provider,...(next?{category:next}:{})});
  }
  function inspectTransaction(picked:BillFocus) {
    if(frozen)return;
    setFocus(picked);
    onInteract({question:scopedQuestion,provider,focus:picked});
  }
  function transactions() {
    return <div className="bill-scene-transactions">
      <div className="bill-scene-list-heading"><h3>{compact&&category?`${category}消费`:'全部交易'}</h3><span>{filtered.length} 笔</span></div>
      {compact&&category&&<button disabled={frozen} className="bill-scene-link" onClick={()=>selectCategory('')}>查看全部记录</button>}
      <ul>{rows.map(row=>{
        const incoming=row.amount>0;
        const kind=row.kind==='transfer'?(incoming?'转入':'转出'):row.kind==='refund'&&incoming?'退款':incoming?'入账':row.amount<0?'消费':'其他收支';
        return <li key={`${row.providerKey}:${row.id}`}>
          <button aria-label={`请${stewardName}解释${row.title} ${formatCny(Math.abs(row.amount))}`} disabled={frozen} onClick={()=>inspectTransaction({provider:row.providerKey,id:row.id})} aria-pressed={selected?.providerKey===row.providerKey&&selected?.id===row.id}>
            <span className={`bill-scene-transaction-icon${incoming?' is-incoming':''}`} aria-hidden="true">{kind==='消费'?<ReceiptText size={17}/>:incoming?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span>
            <span className="bill-scene-transaction-description"><strong>{row.title}</strong><small>{row.occurredAt.slice(5)} · {row.providerName}{kind==='消费'?` · ${row.category}`:''}</small></span>
            <span className="bill-scene-transaction-value"><span className="bill-scene-money">{incoming?'+':row.amount<0?'−':''}{formatCny(Math.abs(row.amount))}</span><small>{kind}</small></span>
            <ChevronRight size={15} aria-hidden="true"/>
          </button>
        </li>;
      })}</ul>
      {!rows.length&&<p className="bill-ui-note">该分类未返回消费记录。</p>}
      {filtered.length>4&&<button className="bill-scene-link bill-scene-expand" disabled={frozen} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起明细':`展开更多 · ${filtered.length} 笔`}<ChevronDown size={15} aria-hidden="true"/></button>}
      {expanded&&filtered.length>100&&<p className="bill-ui-note">当前最多展开100笔，可缩小时间或平台范围。</p>}
    </div>;
  }
  return <section className={`steward-bill-scene${compact?' steward-bill-scene-compact':''}`} aria-label="账单工作区" aria-busy={loading||disabled}>
    {!compact&&<TaskCardHeader title="支出一起看清楚" icon={<ReceiptText/>} status={error?'核对失败':loading?'正在核对':bill.needsClarification?'等待你补充':!bill.sources.length?'等待授权':!bill.count?'暂无记录':bill.coverageIncomplete?'待补全记录':'分析已就绪'} tone={error?'danger':loading?'neutral':bill.needsClarification||!bill.sources.length||!bill.count||bill.coverageIncomplete?'attention':'success'} meta={<><p>{bill.needsClarification?'日期范围待确认':`${bill.from} — ${bill.to}`}</p><p>只读分析 · 基于当前已授权的沙箱账单</p></>}/>}
    <div className="bill-scene-sources" role="group" aria-label="账单平台范围">
      <button aria-label="查看全部平台" aria-pressed={!provider} disabled={frozen} onClick={()=>switchSource()}>全部</button>
      {providers.map(p=><button key={p.id} aria-label={`只看${p.name}`} aria-pressed={provider===p.id} disabled={frozen} onClick={()=>switchSource(p.id)}>{p.name}</button>)}
    </div>
    {error?<p className="bill-ui-error" role="alert">{error}。金额待核对，暂不使用旧记录继续分析。</p>:loading?<p className="bill-ui-note" role="status"><LoaderCircle size={16} className="spin"/>正在核对账单数据…</p>:bill.needsClarification?<p className="bill-ui-note">需要先确认准确的月份或日期范围。</p>:!bill.sources.length?<div className="bill-scene-empty"><p>需要账单读取授权，才能继续分析这个范围。</p>{onRequestConnection&&<Button onClick={()=>onRequestConnection(provider)} disabled={disabled}>核对读取范围</Button>}</div>:!bill.count?<p className="bill-ui-note">这段时间未返回交易记录，不代表没有消费。可以换个平台或告诉我另一段时间。</p>:<>
      {!compact&&<BillSpendingVisual bill={bill} disabled={frozen} selectedCategory={category} onSelectCategory={selectCategory} onInspect={inspectTransaction} stewardName={stewardName} showOverview={sections.includes('overview')} showCategories={sections.includes('categories')} showTrend={sections.includes('trend')}/>}
      {(compact||sections.includes('transactions'))&&transactions()}
      {interpretationChanged&&<p className="bill-ui-note" role="status">查看范围已切换，上面的解读仍对应原范围。</p>}
      {!compact&&<button className="bill-scene-link" disabled={frozen} onClick={()=>onInteract({question:scopedQuestion,provider,...(category?{category}:{})})}>请{stewardName}分析当前账单<ArrowRight size={15} aria-hidden="true"/></button>}
      {selected&&<p className="bill-scene-selection" role="status"><Check size={15} aria-hidden="true"/>已选中「{selected.title}」，可以直接补充。</p>}
      {(ui?.evidenceRefs||[]).map(ref=>{const finding=bill.diagnosis.findings[ref-1];return finding?<details className="bill-scene-proof" key={ref} open><summary>核对交易依据<ChevronDown size={15} aria-hidden="true"/></summary><ul>{finding.evidence.map(row=><li key={`${row.providerKey}:${row.id}`}><span>{row.title}<small>{row.occurredAt} · {row.providerName}</small></span><strong>{formatCny(Math.abs(row.amount))}</strong></li>)}</ul><p>{finding.detail}</p></details>:null;})}
      <details className="bill-scene-proof"><summary>统计范围与其他收支<ChevronDown size={15} aria-hidden="true"/></summary>
        <p>{bill.from} — {bill.to} · {bill.sources.join('、')}。</p>
        <p>{bill.count} 笔已返回记录；退款 {formatCny(bill.refund)}、转入 {formatCny(bill.transferIn)}、转出 {formatCny(bill.transferOut)} 单列，不计入消费支出。</p>
        <p>{bill.coverage}</p>
        {(bill.diagnosis.quality.duplicates>0||bill.diagnosis.quality.invalid>0)&&<p>排除 {bill.diagnosis.quality.duplicates} 条同平台重复记录、{bill.diagnosis.quality.invalid} 条无效记录。</p>}
      </details>
      {onRequestConnection&&providers.filter(p=>!connections[p.id]?.scopes.includes('transactions')).map(p=><button key={p.id} className="bill-scene-link" disabled={frozen} onClick={()=>onRequestConnection(p.id)}>加入{p.name}账单<ArrowRight size={15} aria-hidden="true"/></button>)}
    </>}
  </section>;
}
