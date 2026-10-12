import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CalendarClock,Check,CheckCircle2,Clock3,Eye,MessageCircle,Pause,Play,ReceiptText,RefreshCw,ShieldCheck,TrendingUp,X} from 'lucide-react';
import type {ConnectedFinancialSource,ExternalFinancialProvider} from '../lib/financial-connections';
import {marketContextRequest,type MarketContext} from '../lib/market-context';
import {automationServerRequest,automationTemplates,createAutomationContext,nextAutomationRun,type AgentAutomationKind,type AutomationEvidence,type AutomationRun,type AutomationServerSnapshot} from '../lib/agent-automations';
import {Dialog} from './ui/dialog';

type Props={stewardName?:string;connections:Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;availableBalance?:number;onOpenBills:()=>void;onOpenWealth:()=>void;onOpenCards?:()=>void;onDiscussRun?:(run:AutomationRun)=>void;onSnapshotChange?:(snapshot:AutomationServerSnapshot)=>void};
const kinds:AgentAutomationKind[]=['monthly_bill_review','weekly_wealth_check','anomaly_bill_review'];
const emptySnapshot:AutomationServerSnapshot={version:1,engine:'mastra',tasks:[],runs:[]};

export function AgentAutomationCenter({stewardName='宁宁',connections,availableBalance,onOpenBills,onOpenWealth,onOpenCards,onDiscussRun,onSnapshotChange}:Props){
  const [snapshot,setSnapshot]=useState<AutomationServerSnapshot>(emptySnapshot);
  const [market,setMarket]=useState<MarketContext|null>(null);
  const [busy,setBusy]=useState<AgentAutomationKind|null>(null);
  const [decisionBusy,setDecisionBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [selectedEvidence,setSelectedEvidence]=useState<{runId:string;item:AutomationEvidence}|null>(null);
  const liveContext=useMemo(()=>createAutomationContext(connections,availableBalance,market),[connections,availableBalance,market]);
  const commit=useCallback((next:AutomationServerSnapshot)=>{setSnapshot(next);onSnapshotChange?.(next);},[onSnapshotChange]);
  useEffect(()=>{let active=true;void Promise.allSettled([automationServerRequest(),marketContextRequest()]).then(results=>{if(!active)return;const [tasks,external]=results;if(tasks.status==='fulfilled')commit(tasks.value);else setError(tasks.reason instanceof Error?tasks.reason.message:'自动任务服务暂时不可用');if(external.status==='fulfilled')setMarket(external.value);});return()=>{active=false;};},[commit]);
  async function action(kind:AgentAutomationKind,type:'start'|'toggle'|'run'){
    setBusy(kind);setMessage('');setError('');
    let latestMarket=market;
    if((type==='run'||type==='start')&&kind==='weekly_wealth_check')try{latestMarket=await marketContextRequest();setMarket(latestMarket);}catch{/* The audit record will state which sources were available. */}
    try{
      const latest=createAutomationContext(connections,availableBalance,latestMarket);
      const updated=await automationServerRequest({type,kind,...(type==='toggle'?{}:{context:latest})});commit(updated);
      const last=updated.runs.find(run=>run.kind===kind);
      setMessage(type==='start'?`${automationTemplates[kind].title}已启用后台守护`:type==='toggle'?'任务状态已更新':last?.status==='failed'?'检查未生成报告，失败原因已保存':'检查已完成，运行记录已保存');
    }catch(value){setError(value instanceof Error?value.message:'自动任务操作失败');}
    finally{setBusy(null);}
  }
  async function decide(runId:string,evidenceId:string,decision:'confirmed'|'dismissed'){
    const key=`${runId}:${evidenceId}`;setDecisionBusy(key);setError('');
    try{commit(await automationServerRequest({type:'decide',runId,evidenceId,decision}));setMessage('这条线索的核对结果已保存');}
    catch(value){setError(value instanceof Error?value.message:'核对结果保存失败');}
    finally{setDecisionBusy('');}
  }
  return <div className="automation-center">
    <section className="automation-intro surface">
      <CalendarClock size={22}/><div><h2>{stewardName}在后台按时检查，关键判断仍由你确认</h2><p>月报执行时重新读取已授权的本地账单来源；其他来源没有后台适配器时会留下失败记录。不会自动扣款、申购、赎回或修改卡片。</p></div>
      <span className="automation-engine"><ShieldCheck size={14}/>后台守护已就绪</span>
    </section>
    <details className="surface automation-data-health"><summary>本次分析的数据范围</summary><div><span><strong>{liveContext.bill.sourceCount}</strong><small>已授权账单来源</small></span><span><strong>{liveContext.bill.recordCount}</strong><small>最近可分析月份记录</small></span><span><strong>{market?.status==='ready'?(market.stale?'缓存待刷新':'已更新'):'待更新'}</strong><small>外部市场数据</small></span></div><p>{liveContext.bill.coverage}</p></details>
    {message&&<p className="automation-status" role="status"><CheckCircle2 size={16}/>{message}</p>}
    {error&&<p className="automation-error" role="alert"><AlertTriangle size={16}/>{error}</p>}
    <div className="automation-grid">
      {kinds.map(kind=>{
        const template=automationTemplates[kind],item=snapshot.tasks.find(value=>value.kind===kind),Icon=kind==='monthly_bill_review'?ReceiptText:kind==='weekly_wealth_check'?TrendingUp:AlertTriangle;
        const next=item?nextAutomationRun({id:item.mastraScheduleId||kind,kind,enabled:item.enabled,createdAt:item.createdAt,lastRunAt:item.lastRun?.completedAt}):null;
        return <article className="surface automation-card" key={kind}>
          <header><span><Icon size={19}/></span><div><h3>{template.title}</h3><p>{template.description}</p></div></header>
          <dl><div><dt>执行计划</dt><dd>{template.schedule}</dd></div><div><dt>状态</dt><dd>{item?(item.enabled?'已启用':'已暂停'):'尚未设置'}</dd></div>{next&&<div><dt>下次检查</dt><dd>{new Date(next).toLocaleString('zh-CN')}</dd></div>}</dl>
          {item?.lastRun&&<div className={`automation-result ${item.lastRun.status==='waiting_confirmation'?'needs-review':''}`}><strong>{item.lastRun.status==='waiting_confirmation'?'等待你确认':'最近一次运行结果'}</strong><p>{item.lastRun.summary}</p><small>{new Date(item.lastRun.completedAt).toLocaleString('zh-CN')} · {item.lastRun.trigger==='manual'?'手动检查':'后台定时检查'}</small></div>}
          <div className="automation-actions">
            {!item?<button type="button" disabled={busy===kind} onClick={()=>void action(kind,'start')}>设置任务</button>:<button type="button" className="secondary" disabled={busy===kind} onClick={()=>void action(kind,'toggle')}>{item.enabled?<><Pause size={15}/>暂停</>:<><Play size={15}/>继续</>}</button>}
            <button type="button" className="secondary" disabled={busy===kind} onClick={()=>void action(kind,'run')}><RefreshCw size={15}/>{busy===kind?'运行中':'立即运行'}</button>
            <button type="button" className="text" onClick={kind==='weekly_wealth_check'?onOpenWealth:onOpenBills}>查看功能</button>
          </div>
        </article>;
      })}
    </div>
    <section className="surface automation-audit" aria-labelledby="automation-audit-title">
      <div className="section-line"><div><h2 id="automation-audit-title">运行与确认记录</h2><p>每次任务都保留触发方式、依据和最终确认结果。</p></div><span className="pill">最近 {snapshot.runs.length} 次</span></div>
      {!snapshot.runs.length?<div className="automation-empty"><Clock3 size={22}/><p>还没有运行记录。可以先点击任一任务的“立即运行”。</p></div>:<div className="automation-run-list">{snapshot.runs.slice(0,8).map(run=><article key={run.id}>
        <header><div><strong>{automationTemplates[run.kind].title}</strong><span>{new Date(run.completedAt).toLocaleString('zh-CN')} · {run.trigger==='manual'?'手动检查':'后台检查'}</span></div><span className="automation-run-tools">{onDiscussRun&&<button type="button" onClick={()=>onDiscussRun(run)}><MessageCircle size={13}/>继续问{stewardName}</button>}<i data-status={run.status}>{run.status==='waiting_confirmation'?'待确认':run.status==='failed'?'失败':'已完成'}</i></span></header>
        <p>{run.summary}</p>
        {run.report&&<details><summary>查看 {run.report.month} 月报明细</summary><p>来源：{run.report.sources.join('、')} · 后台读取：{run.sourceRefreshedAt?new Date(run.sourceRefreshedAt).toLocaleString('zh-CN'):'未知'}</p><p>收入 ¥{(run.report.income/100).toFixed(2)} · 消费 ¥{(run.report.expense/100).toFixed(2)} · 退款 ¥{(run.report.refund/100).toFixed(2)} · 转入 ¥{(run.report.transferIn/100).toFixed(2)} · 转出 ¥{(run.report.transferOut/100).toFixed(2)}</p><p>消费分类：{run.report.categories.length?run.report.categories.map(item=>`${item.name} ¥${(item.amount/100).toFixed(2)}`).join('、'):'暂无'}</p><small>{run.report.coverage}</small></details>}
        {!!run.evidence.length&&<details open={run.status==='waiting_confirmation'}><summary>查看依据与处理记录（{run.evidence.length}）</summary><div className="automation-evidence-list">{run.evidence.map(item=><div key={item.id}>
          <span><strong>{item.title}</strong><small>{item.detail}</small><em>{item.suggestion}</em></span>
          <span className="automation-evidence-actions">{!!item.transactions?.length&&<button type="button" onClick={()=>setSelectedEvidence({runId:run.id,item})}><Eye size={14}/>查看交易</button>}{run.kind==='anomaly_bill_review'&&item.decision==='pending'?<span className="automation-decision"><button disabled={decisionBusy===`${run.id}:${item.id}`} onClick={()=>void decide(run.id,item.id,'confirmed')}><Check size={14}/>需要关注</button><button disabled={decisionBusy===`${run.id}:${item.id}`} onClick={()=>void decide(run.id,item.id,'dismissed')}><X size={14}/>排除线索</button></span>:item.decision&&<b data-decision={item.decision}>{item.decision==='confirmed'?'已确认':'已排除'}</b>}</span>
        </div>)}</div></details>}
      </article>)}</div>}
    </section>
    <p className="fine-print left">后台守护在本机服务运行时生效；电脑休眠或服务停止期间不会执行。正式部署还需要常驻服务和通知通道。</p>
    <Dialog open={!!selectedEvidence} onOpenChange={open=>!open&&setSelectedEvidence(null)} title="核对相关交易" description="这些记录只是复核依据，不代表已经判定为异常">
      {selectedEvidence&&<div className="automation-transaction-dialog"><div className="warning-box"><AlertTriangle size={20}/><p>{selectedEvidence.item.detail}</p></div><div className="automation-transaction-list">{selectedEvidence.item.transactions?.map(row=><article key={row.id}><span><strong>{row.title}</strong><small>{row.providerName} · {row.occurredAt}</small></span><b>{row.amount<0?'−':'+'} ¥{Math.abs(row.amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></article>)}</div><p>{selectedEvidence.item.suggestion}</p><div className="automation-dialog-actions">{onOpenCards&&<button type="button" className="secondary" onClick={()=>{setSelectedEvidence(null);onOpenCards();}}>检查银行卡与安全</button>}{selectedEvidence.item.decision==='pending'&&<><button type="button" onClick={()=>{void decide(selectedEvidence.runId,selectedEvidence.item.id,'confirmed');setSelectedEvidence(null);}}>需要继续关注</button><button type="button" className="secondary" onClick={()=>{void decide(selectedEvidence.runId,selectedEvidence.item.id,'dismissed');setSelectedEvidence(null);}}>这是正常交易</button></>}</div></div>}
    </Dialog>
  </div>;
}
