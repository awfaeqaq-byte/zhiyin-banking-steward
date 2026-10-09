import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,ChevronDown,ChevronRight,LoaderCircle,ReceiptText,ShieldCheck} from 'lucide-react';
import {buildBillAnalysis,billReferenceTime} from '../lib/bill-analysis';
import {billProvider,billScopeQuestion,type BillUI,type BillInteraction,type BillFocus} from '../lib/steward-ui';
import {formatCny,type ConnectedFinancialSource,type ExternalFinancialProvider,type FinancialScope} from '../lib/financial-connections';
import {Button} from './ui/button';
import './steward-bill-workspace.css';

type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;
export type ConnectBillSource=(provider:ExternalFinancialProvider,scopes:FinancialScope[])=>Promise<ConnectedFinancialSource>;
const providers=[{id:'wechat_pay' as const,name:'微信支付'},{id:'alipay' as const,name:'支付宝'}];

export function InlineBillConsent({provider,connections,onConnect,onComplete,disabled=false}:{
  provider?:ExternalFinancialProvider;connections:Connections;onConnect:ConnectBillSource;
  onComplete:(connections:Connections)=>void|Promise<void>;disabled?:boolean;
}) {
  const [selected,setSelected]=useState<ExternalFinancialProvider[]>(provider?[provider]:providers.map(p=>p.id));
  const [busy,setBusy]=useState<ExternalFinancialProvider|'continuing'|null>(null);
  const [error,setError]=useState('');
  const completed=useRef<Connections>({});
  const latest=useRef(connections);latest.current=connections;
  const lock=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
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
      await onComplete({...latest.current,...completed.current});
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'平台未确认，请稍后重试。');}
    finally{lock.current=false;if(mounted.current)setBusy(null);}
  }
  return <section className="steward-inline-consent" aria-label="账单读取范围" aria-busy={Boolean(busy)}>
    <header><ReceiptText size={21} aria-hidden="true"/><div><h2>这次看哪些账单？</h2><p>确认读取范围后，我接着整理刚才的问题。</p></div></header>
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

export function StewardBillWorkspace({question,connections,ui,onInteract,onRequestConnection,stewardName='宁宁',disabled=false,loading=false,error='',now}:{
  question:string;connections:Connections;ui?:BillUI;onInteract:(value:BillInteraction)=>void;
  onRequestConnection?:(provider?:ExternalFinancialProvider)=>void;stewardName?:string;
  disabled?:boolean;loading?:boolean;error?:string;now?:number;
}) {
  const [provider,setProvider]=useState<ExternalFinancialProvider|undefined>(()=>billProvider(question));
  const [category,setCategory]=useState('');
  const [focus,setFocus]=useState<BillFocus>();
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{setProvider(billProvider(question));},[question]);
  const scopedQuestion=billScopeQuestion(question,provider);
  const bill=buildBillAnalysis(connections,scopedQuestion,now??billReferenceTime(connections));
  const unavailable=Boolean(error)||loading;
  const frozen=disabled||unavailable;
  const sections=ui?.sections||['overview','categories'];
  const purchases=bill.transactions.filter(t=>t.amount<0&&!['refund','income','transfer'].includes(t.kind||''));
  const filtered=category?purchases.filter(t=>t.category===category):bill.transactions;
  const selected=bill.transactions.find(t=>t.id===focus?.id&&t.providerKey===focus.provider);
  const rows=filtered.slice(0,expanded?100:4);
  function switchSource(id?:ExternalFinancialProvider) {
    setProvider(id);setCategory('');setFocus(undefined);setExpanded(false);
    onInteract({question:billScopeQuestion(question,id),...(id?{provider:id}:{})});
  }
  function selectTransaction(row:typeof bill.transactions[number]) {
    const picked={provider:row.providerKey,id:row.id};setFocus(picked);
    onInteract({question:scopedQuestion,provider,focus:picked});
  }
  function transactions() {
    return <div className="bill-scene-transactions"><h3>{category?`${category}交易`:'账单记录'}</h3>
      {category&&<button className="bill-scene-link" onClick={()=>setCategory('')}>查看全部记录</button>}
      <ul>{rows.map(row=><li key={`${row.providerKey}:${row.id}`}>
        <button aria-label={`请${stewardName}解释${row.title} ${formatCny(Math.abs(row.amount))}`} disabled={frozen} onClick={()=>selectTransaction(row)} aria-pressed={selected?.providerKey===row.providerKey&&selected?.id===row.id}>
          <span><strong>{row.title}</strong><small>{row.occurredAt.slice(5)} · {row.providerName} · {row.kind==='transfer'?'转账':row.kind==='refund'?'退款':row.category}</small></span>
          <span className="bill-scene-money">{row.amount>0?'+':'−'}{formatCny(Math.abs(row.amount))}</span><ChevronRight size={15} aria-hidden="true"/>
        </button>
      </li>)}</ul>
      {!rows.length&&<p className="bill-ui-note">该分类未返回消费记录。</p>}
      {filtered.length>4&&<button className="bill-scene-link" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起明细':`展开更多 · ${filtered.length} 笔`}<ChevronDown size={15} aria-hidden="true"/></button>}
      {expanded&&filtered.length>100&&<p className="bill-ui-note">当前最多展开100笔，可缩小时间或平台范围。</p>}
    </div>;
  }
  return <section className="steward-bill-scene" aria-label="账单工作区" aria-busy={loading||disabled}>
    <header className="bill-scene-heading"><h2>支出一起看清楚</h2><span>{bill.from} — {bill.to}</span></header>
    <div className="bill-scene-sources" role="group" aria-label="账单平台范围">
      <button aria-label="查看全部平台" aria-pressed={!provider} disabled={frozen} onClick={()=>switchSource()}>全部</button>
      {providers.map(p=><button key={p.id} aria-label={`只看${p.name}`} aria-pressed={provider===p.id} disabled={frozen} onClick={()=>switchSource(p.id)}>{p.name}</button>)}
    </div>
    {error?<p className="bill-ui-error" role="alert">{error}。金额待核对，暂不使用旧记录继续分析。</p>:loading?<p className="bill-ui-note" role="status"><LoaderCircle size={16} className="spin"/>正在核对账单数据…</p>:bill.needsClarification?<p className="bill-ui-note">需要先确认准确的月份或日期范围。</p>:!bill.sources.length?<div className="bill-scene-empty"><p>需要账单读取授权，才能继续分析这个范围。</p>{onRequestConnection&&<Button onClick={()=>onRequestConnection(provider)} disabled={disabled}>核对读取范围</Button>}</div>:!bill.count?<p className="bill-ui-note">这段时间未返回交易记录，不代表没有消费。可以换个平台或告诉我另一段时间。</p>:<>
      {sections.map(section=>section==='overview'?<dl className="bill-scene-overview" key={section}>
        <div><dt>消费支出</dt><dd key={`${scopedQuestion}:${bill.expense}`}>{formatCny(bill.expense)}</dd></div>
        <div><dt>普通入账</dt><dd>{formatCny(bill.income)}</dd></div>
      </dl>:section==='categories'?<div className="bill-scene-categories" key={section}>
        <h3>消费分布</h3><ul>{bill.categories.map(c=><li key={c.name}><button disabled={frozen} aria-label={`查看${c.name}交易 ${formatCny(c.amount)}`} aria-pressed={category===c.name} onClick={()=>{setCategory(category===c.name?'':c.name);setExpanded(false);}}>
          <span>{c.name}</span><span className="bill-scene-bar" aria-hidden="true"><i style={{transform:`scaleX(${bill.expense?c.amount/bill.expense:0})`}}/></span><strong>{formatCny(c.amount)}</strong><ChevronRight size={15} aria-hidden="true"/>
        </button></li>)}</ul>
      </div>:section==='trend'?<div className="bill-scene-trend" key={section}><h3>前期对照</h3>{bill.diagnosis.trend?<><p>已返回消费金额{bill.diagnosis.trend.changePercent===0?'持平':`${bill.diagnosis.trend.changePercent>0?'增加':'减少'} ${Math.abs(bill.diagnosis.trend.changePercent)}%`}</p><small>{bill.diagnosis.trend.previousFrom} — {bill.diagnosis.trend.previousTo}；两期记录完整性未知。</small></>:<p className="bill-ui-note">前期记录不足，暂不能判断趋势。</p>}</div>:<div key={section}>{transactions()}</div>)}
      {category&&!sections.includes('transactions')&&transactions()}
      {selected&&<p className="bill-scene-selection" role="status"><Check size={15} aria-hidden="true"/>正在围绕「{selected.title}」继续解释，也可以直接补充。</p>}
      {(ui?.evidenceRefs||[]).map(ref=>{const finding=bill.diagnosis.findings[ref-1];return finding?<details className="bill-scene-proof" key={ref} open><summary>核对交易依据<ChevronDown size={15} aria-hidden="true"/></summary><ul>{finding.evidence.map(row=><li key={`${row.providerKey}:${row.id}`}><span>{row.title}<small>{row.occurredAt} · {row.providerName}</small></span><strong>{formatCny(Math.abs(row.amount))}</strong></li>)}</ul><p>{finding.detail}</p></details>:null;})}
      <details className="bill-scene-proof"><summary>统计范围与其他收支<ChevronDown size={15} aria-hidden="true"/></summary>
        <p>{bill.count} 笔已返回记录；退款 {formatCny(bill.refund)}、转入 {formatCny(bill.transferIn)}、转出 {formatCny(bill.transferOut)} 单列，不计入消费支出。</p>
        <p>排除 {bill.diagnosis.quality.duplicates} 条同平台重复记录、{bill.diagnosis.quality.invalid} 条无效记录。不代表完整账单。</p>
      </details>
      {onRequestConnection&&providers.filter(p=>!connections[p.id]?.scopes.includes('transactions')).map(p=><button key={p.id} className="bill-scene-link" disabled={frozen} onClick={()=>onRequestConnection(p.id)}>加入{p.name}账单<ArrowRight size={15} aria-hidden="true"/></button>)}
    </>}
    <p className="bill-ui-note bill-scene-footer">只读分析 · 基于当前已授权的沙箱账单</p>
  </section>;
}
