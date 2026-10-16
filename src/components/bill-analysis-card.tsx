import type {ReactNode} from 'react';
import {ArrowRight,ChevronRight,ReceiptText} from 'lucide-react';
import type {BillAnalysis} from '../lib/bill-analysis';
import {billReplyFacts} from '../lib/bill-reply-grounding';
import {formatCny} from '../lib/financial-connections';
import type {BillFocus} from '../lib/steward-ui';
import {Button} from './ui/button';
import {TaskCardHeader} from './task-card-header';
import './chat-task-cards.css';
import './bill-analysis-card.css';

type Props={bill:BillAnalysis;stewardName?:string;loading?:boolean;error?:string;disabled?:boolean;
 interpretationChanged?:boolean;details?:ReactNode;explanation?:ReactNode;
 onInspect:(focus:BillFocus)=>void;onAnalyze:()=>void};

export function BillAnalysisCard({bill,stewardName='宁宁',loading=false,error='',disabled=false,interpretationChanged=false,details,explanation,onInspect,onAnalyze}:Props){
 const ready=!error&&!loading&&!bill.needsClarification&&bill.sources.length>0&&bill.count>0;
 const shares=billReplyFacts(bill).categoryShares;
 const top=shares[0],largest=bill.largest[0],trend=bill.diagnosis.trend;
 return <section className="steward-task-card bill-analysis-card" aria-label="账单分析" aria-busy={loading}>
  <TaskCardHeader title="账单分析" icon={<ReceiptText/>} status={error?'核对失败':loading?'正在核对':bill.needsClarification?'等待你补充':!bill.sources.length?'等待授权':!bill.count?'暂无记录':bill.coverageIncomplete?'待补全记录':'分析已就绪'} tone={error?'danger':loading?'neutral':!ready||bill.coverageIncomplete?'attention':'success'} meta={`只读分析 · ${bill.sources.join(' · ')||'账单来源待授权'}`}/>
  <p className="bill-card-scope">{bill.needsClarification?'日期范围待确认':`${bill.from} — ${bill.to}`}</p>
  {error?<p role="alert">{error}。金额与分析待核对，请稍后重试。</p>:loading?<p className="task-card-explanation" role="status">正在核对账单数据…</p>:bill.needsClarification?<p className="task-card-explanation">需要先确认月份或日期范围，再计算这次账单。</p>:!bill.sources.length?<p className="task-card-explanation">需要账单读取授权，才能分析这个范围。</p>:!bill.count?<p className="task-card-explanation">这段时间未返回交易记录，不代表没有消费。</p>:<>
   {bill.coverageIncomplete&&<p className="bill-card-limitation">{bill.coverage}</p>}
   <dl className="bill-card-totals"><div><dt>{bill.coverageIncomplete?'已返回消费小计':'消费支出'}</dt><dd>{formatCny(bill.expense)}</dd></div><div><dt>普通入账</dt><dd>{formatCny(bill.income)}</dd></div></dl>
   <div className="bill-card-structure"><h3>钱主要花在哪里</h3><p>{top&&bill.expense>0?`${top.name}占本次消费的 ${top.percent}%，是支出最多的分类。`:'本次未返回消费类支出，不能据此判断没有消费。'}</p>
    <ul>{shares.slice(0,5).map(category=><li key={category.name}><span>{category.name}</span><strong>{formatCny(Math.round(category.amountYuan*100))}</strong><small>{category.percent}%</small><span className="bill-card-bar" aria-hidden="true"><i style={{width:`${category.percent}%`}}/></span></li>)}</ul>
    {bill.categories.length>5&&<p className="task-card-note">另有 {bill.categories.length-5} 个分类，可展开完整明细。</p>}
   </div>
   {largest&&<div className="bill-card-largest"><h3>最大一笔消费</h3><button disabled={disabled} aria-label={`请${stewardName}解释${largest.title} ${formatCny(-largest.amount)}`} onClick={()=>onInspect({provider:largest.providerKey,id:largest.id})}><span><strong>{largest.title}</strong><small>{largest.occurredAt} · {largest.providerName}</small></span><strong>{formatCny(-largest.amount)}</strong><ChevronRight size={16} aria-hidden="true"/></button><p className="task-card-explanation">金额大小不代表异常；可以点开这笔，结合用途继续核对。</p></div>}
   {!bill.coverageIncomplete&&<p className="task-card-explanation">{trend?`与前一个等长时段（${trend.previousFrom} — ${trend.previousTo}）相比，已返回消费金额${trend.changePercent===0?'持平':`${trend.changePercent>0?'增加':'减少'} ${Math.abs(trend.changePercent)}%`}。两期记录完整性未知。`:'前期消费记录不足，暂不能判断支出趋势。'}</p>}
   <details className="bill-card-disclosure"><summary>退款、转账与统计范围</summary><dl className="task-card-facts"><div><dt>退款单列</dt><dd>{formatCny(bill.refund)}</dd></div><div><dt>转入</dt><dd>{formatCny(bill.transferIn)}</dd></div><div><dt>转出</dt><dd>{formatCny(bill.transferOut)}</dd></div></dl><p>退款未抵扣消费；转入、转出均不计入普通入账或消费支出。</p><p>{bill.count} 笔已返回记录。{bill.coverage}</p></details>
  </>}
  {details&&<details className="bill-card-disclosure bill-card-workspace"><summary>查看明细与切换平台</summary>{details}</details>}
  {ready&&<>
   {interpretationChanged?<p className="task-card-explanation" role="status">账单数据或查看范围已更新，补充解读需重新生成。</p>:explanation&&<details className="bill-card-disclosure"><summary>查看{stewardName}的补充解读</summary>{explanation}</details>}
   <Button variant="secondary" disabled={disabled} onClick={onAnalyze}>请{stewardName}进一步分析<ArrowRight size={15} aria-hidden="true"/></Button>
   <p className="task-card-note">只统计本次已授权平台返回的记录，不代表全部账户。</p>
  </>}
 </section>;
}
