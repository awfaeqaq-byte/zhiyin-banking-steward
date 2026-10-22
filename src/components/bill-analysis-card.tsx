import {useId,useState,type ReactNode} from 'react';
import {ArrowRight,ChevronRight,ReceiptText,MessageCircle} from 'lucide-react';
import type {BillAnalysis} from '../lib/bill-analysis';
import {formatCny} from '../lib/financial-connections';
import type {BillFocus} from '../lib/steward-ui';
import {Button} from './ui/button';
import {TaskCardHeader} from './task-card-header';
import {BillSpendingVisual} from './bill-spending-visual';
import './chat-task-cards.css';
import './bill-analysis-card.css';

type Props={bill:BillAnalysis;stewardName?:string;loading?:boolean;error?:string;disabled?:boolean;
 interpretationChanged?:boolean;details?:ReactNode;explanation?:ReactNode;
 initialView?:'overview'|'insight';onRetry?:()=>void;
 selectedCategory?:string;onCategoryChange?:(category:string)=>void;
 onInspect:(focus:BillFocus)=>void;onAnalyze:()=>void};
type View='overview'|'details'|'insight';

export function BillAnalysisCard({bill,stewardName='宁宁',loading=false,error='',disabled=false,interpretationChanged=false,details,explanation,initialView='overview',onRetry,selectedCategory,onCategoryChange,onInspect,onAnalyze}:Props){
 const [view,setView]=useState<View>(initialView);
 const [localCategory,setLocalCategory]=useState({scope:'',name:''});
 const scope=[bill.from,bill.to,...bill.sources].join(':');
 const category=onCategoryChange?(selectedCategory||''):(localCategory.scope===scope?localCategory.name:'');
 const panelId=useId();
 const ready=!error&&!loading&&!bill.needsClarification&&bill.sources.length>0&&bill.count>0;
 const largest=bill.largest[0];
 const frozen=disabled||loading||Boolean(error);
 function selectCategory(name:string){setLocalCategory({scope,name});onCategoryChange?.(name);}
 const tabs: {id:View;label:string}[]=[{id:'overview',label:'概览'},...(details?[{id:'details' as const,label:'明细'}]:[]),{id:'insight',label:'解读'}];
 const currentView=view==='details'&&!details?'overview':view;
 return <section className="steward-task-card bill-analysis-card" aria-label="账单分析" aria-busy={loading}>
  <TaskCardHeader title="账单分析" icon={<ReceiptText/>} status={error?'核对失败':loading?'正在核对':bill.needsClarification?'等待你补充':!bill.sources.length?'等待授权':!bill.count?'暂无记录':bill.coverageIncomplete?'待补全记录':'分析已就绪'} tone={error?'danger':loading?'neutral':!ready||bill.coverageIncomplete?'attention':'success'}/>
  <div className="bill-card-range"><p>{bill.needsClarification?'日期范围待确认':`${bill.from} — ${bill.to}`}</p><span>{bill.sources.join(' · ')||'账单来源待授权'}</span></div>
  {error?<p role="alert">{error.replace(/[。.!！]+$/,'')}。金额与分析待核对，请稍后重试。</p>:loading?<p className="task-card-explanation" role="status">正在核对账单数据…</p>:bill.needsClarification?<p className="task-card-explanation">需要先确认月份或日期范围，再计算这次账单。</p>:!bill.sources.length?<p className="task-card-explanation">需要账单读取授权，才能分析这个范围。</p>:!bill.count?<p className="task-card-explanation">这段时间未返回交易记录，不代表没有消费。</p>:null}
  {error&&onRetry&&<Button variant="secondary" disabled={disabled||loading} onClick={onRetry}>重新核对账单</Button>}
  {!loading&&!error&&<div className="bill-card-views" role="group" aria-label="账单查看方式">{tabs.map(tab=><button key={tab.id} type="button" aria-pressed={currentView===tab.id} aria-controls={panelId} disabled={disabled||!ready&&tab.id!=='details'} onClick={()=>setView(tab.id)}>{tab.label}{tab.id==='details'&&ready&&<span>{bill.count}</span>}</button>)}</div>}
  <div id={panelId} className="bill-card-view">
   {ready&&currentView==='overview'&&<>
    {bill.coverageIncomplete&&<p className="bill-card-limitation">{bill.coverage}</p>}
    <BillSpendingVisual bill={bill} disabled={frozen} selectedCategory={category} onSelectCategory={selectCategory} onInspect={onInspect} stewardName={stewardName}/>
    {!category&&largest&&<div className="bill-card-largest"><h3>最大一笔消费</h3><button disabled={frozen} aria-label={`请${stewardName}解释${largest.title} ${formatCny(-largest.amount)}`} onClick={()=>onInspect({provider:largest.providerKey,id:largest.id})}><span className="bill-card-receipt"><ReceiptText size={18} aria-hidden="true"/></span><span><strong>{largest.title}</strong><small>{largest.occurredAt.slice(5)} · {largest.providerName}</small></span><strong>{formatCny(-largest.amount)}</strong><ChevronRight size={16} aria-hidden="true"/></button></div>}
    <details className="bill-card-disclosure bill-card-trend"><summary>查看前期对照{!bill.coverageIncomplete&&bill.diagnosis.trend?` · ${bill.diagnosis.trend.changePercent===0?'持平':`${bill.diagnosis.trend.changePercent>0?'增加':'减少'} ${Math.abs(bill.diagnosis.trend.changePercent)}%`}`:' · 暂无可比数据'}</summary><BillSpendingVisual bill={bill} showOverview={false} showCategories={false} showTrend/></details>
    <button className="bill-card-insight-link" disabled={frozen} onClick={()=>setView('insight')}><MessageCircle size={17} aria-hidden="true"/><span>{interpretationChanged?'更新账单解读':`查看${stewardName}的解读`}</span><ArrowRight size={16} aria-hidden="true"/></button>
   </>}
   {currentView==='details'&&details}
   {ready&&currentView==='insight'&&<div className="bill-card-insight">
    <h3>{stewardName}的解读</h3>
    {interpretationChanged?<p className="task-card-explanation" role="status">账单数据或查看范围已更新，补充解读需重新生成。</p>:explanation?<div className="bill-card-prose">{explanation}</div>:<p className="task-card-explanation">可以结合当前消费结构，继续核对具体用途和交易。</p>}
    <Button variant="secondary" disabled={frozen} onClick={onAnalyze}>{interpretationChanged?'重新分析当前账单':`请${stewardName}进一步分析`}<ArrowRight size={15} aria-hidden="true"/></Button>
    <p className="task-card-note">也可以直接在下方对话里，告诉我你想重点看哪一项。</p>
   </div>}
  </div>
  {ready&&currentView!=='details'&&<details className="bill-card-disclosure"><summary>退款、转账与统计范围</summary><dl className="task-card-facts"><div><dt>退款单列</dt><dd>{formatCny(bill.refund)}</dd></div><div><dt>转入</dt><dd>{formatCny(bill.transferIn)}</dd></div><div><dt>转出</dt><dd>{formatCny(bill.transferOut)}</dd></div></dl><p>退款未抵扣消费；转入、转出均不计入普通入账或消费支出。</p><p>{bill.count} 笔已返回记录。{bill.coverage}</p></details>}
  <p className="bill-card-footnote">只读分析 · 仅限本次已授权账单</p>
 </section>;
}
