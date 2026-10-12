import {formatCny,type ConnectedFinancialSource,type ExternalFinancialProvider} from './financial-connections';
import type {MarketContext} from './market-context';
import {billReferenceTime,buildBillAnalysis} from './bill-analysis';

export type AgentAutomationKind='monthly_bill_review'|'weekly_wealth_check'|'anomaly_bill_review';
export type AgentAutomation={
  id:string;
  kind:AgentAutomationKind;
  enabled:boolean;
  createdAt:number;
  lastRunAt?:number;
  lastResult?:string;
};

export const AGENT_AUTOMATIONS_KEY='zhiyin-agent-automations-v1';
export const automationTemplates={
  monthly_bill_review:{title:'每月账单管家报告',schedule:'每月 1 日 09:00',description:'整理上月收支、分类变化与需要核对的异常线索。'},
  weekly_wealth_check:{title:'每周理财与现金流体检',schedule:'每周一 08:30',description:'核对可用资金和市场环境，只给出待确认建议，不自动交易。'},
  anomaly_bill_review:{title:'每日异常账单复核',schedule:'每天 20:00',description:'发现需要留意的交易线索后暂停，等待你逐项确认。'},
} satisfies Record<AgentAutomationKind,{title:string;schedule:string;description:string}>;

export type AutomationEvidence={
  id:string;
  title:string;
  detail:string;
  suggestion:string;
  decision?:'pending'|'confirmed'|'dismissed';
  transactions?:Array<{id:string;title:string;amount:number;occurredAt:string;providerName:string}>;
};

export type AutomationContext={
  capturedAt:number;
  bill:{sourceCount:number;recordCount:number;expense:number;coverage:string;findings:AutomationEvidence[]};
  wealth:{availableBalance?:number;market:MarketContext|null};
};

export type AutomationRun={
  id:string;
  kind:AgentAutomationKind;
  status:'completed'|'waiting_confirmation'|'failed';
  summary:string;
  evidence:AutomationEvidence[];
  startedAt:number;
  completedAt:number;
  trigger:'schedule'|'manual';
  engine:'mastra';
  reportMonth?:string;
  sourceRefreshedAt?:number;
  report?:{month:string;sources:string[];recordCount:number;expense:number;income:number;refund:number;transferIn:number;transferOut:number;categories:Array<{name:string;amount:number}>;coverage:string;incomplete:boolean};
};

export type ServerAgentAutomation={
  kind:AgentAutomationKind;
  enabled:boolean;
  createdAt:number;
  mastraScheduleId?:string;
  lastRun?:AutomationRun;
};

export type AutomationServerSnapshot={
  version:1;
  engine:'mastra';
  tasks:ServerAgentAutomation[];
  runs:AutomationRun[];
};

function validAutomationSnapshot(value:unknown):value is AutomationServerSnapshot{
  if(!value||typeof value!=='object')return false;
  const snapshot=value as AutomationServerSnapshot;
  return snapshot.version===1&&snapshot.engine==='mastra'&&Array.isArray(snapshot.tasks)&&Array.isArray(snapshot.runs);
}

export function createAutomationContext(
  connections:Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>,
  availableBalance:number|undefined,
  market:MarketContext|null,
  now?:number,
):AutomationContext{
  const transactionTimes=Object.values(connections).flatMap(source=>source?.transactions||[]).map(row=>Date.parse(row.occurredAt)).filter(Number.isFinite);
  const reference=now??(transactionTimes.length?Math.max(...transactionTimes):billReferenceTime(connections));
  const analysis=buildBillAnalysis(connections,'分析本月支出',reference);
  const diagnosed=analysis.diagnosis.findings.map((finding,index)=>({
    id:`finding-${index+1}`,
    title:finding.title.slice(0,120),
    detail:finding.detail.slice(0,360),
    suggestion:finding.suggestion.slice(0,240),
    decision:'pending' as const,
    transactions:finding.evidence.slice(0,5).map(row=>({id:row.id,title:row.title.slice(0,80),amount:row.amount,occurredAt:row.occurredAt,providerName:row.providerName})),
  }));
  const fallback=analysis.largest.slice(0,3).map((row,index)=>({
    id:`largest-${index+1}`,
    title:`复核较大支出：${row.title.slice(0,60)}`,
    detail:`${row.occurredAt} 通过${row.providerName}支出 ${formatCny(-row.amount)}。这只是金额排序线索，不代表交易异常。`,
    suggestion:'确认是否为计划内消费；若不认识这笔交易，再查看平台订单和商户详情。',
    decision:'pending' as const,
    transactions:[{id:row.id,title:row.title.slice(0,80),amount:row.amount,occurredAt:row.occurredAt,providerName:row.providerName}],
  }));
  return {
    capturedAt:Date.now(),
    bill:{
      sourceCount:analysis.sources.length,
      recordCount:analysis.count,
      expense:analysis.expense,
      coverage:analysis.coverage,
      findings:diagnosed.length?diagnosed:fallback,
    },
    wealth:{availableBalance,market},
  };
}

export function readAgentAutomations(storage:Pick<Storage,'getItem'>=localStorage):AgentAutomation[]{
  try{
    const value=JSON.parse(storage.getItem(AGENT_AUTOMATIONS_KEY)||'[]');
    if(!Array.isArray(value))return [];
    return value.filter((item):item is AgentAutomation=>item&&typeof item.id==='string'&&item.kind in automationTemplates&&typeof item.enabled==='boolean'&&Number.isFinite(item.createdAt));
  }catch{return [];}
}

export function writeAgentAutomations(items:AgentAutomation[],storage:Pick<Storage,'setItem'>=localStorage){
  storage.setItem(AGENT_AUTOMATIONS_KEY,JSON.stringify(items));
}

export function createAgentAutomation(kind:AgentAutomationKind,now=Date.now()):AgentAutomation{
  return {id:`${kind}-${now}`,kind,enabled:true,createdAt:now};
}

export function nextAutomationRun(item:AgentAutomation,now=Date.now()):number{
  const base=new Date(Math.max(item.lastRunAt||0,item.createdAt));
  if(item.kind==='monthly_bill_review'){
    const candidate=new Date(base.getFullYear(),base.getMonth(),1,9,0,0,0);
    while(candidate.getTime()<=Math.max(base.getTime(),now))candidate.setMonth(candidate.getMonth()+1);
    return candidate.getTime();
  }
  if(item.kind==='anomaly_bill_review'){
    const candidate=new Date(Math.max(item.lastRunAt||0,item.createdAt,now));
    candidate.setHours(20,0,0,0);
    if(candidate.getTime()<=now)candidate.setDate(candidate.getDate()+1);
    return candidate.getTime();
  }
  const candidate=new Date(base);
  candidate.setHours(8,30,0,0);
  const days=(8-candidate.getDay())%7||7;
  candidate.setDate(candidate.getDate()+days);
  while(candidate.getTime()<=now)candidate.setDate(candidate.getDate()+7);
  return candidate.getTime();
}

export async function automationServerRequest(body?:object):Promise<AutomationServerSnapshot>{
  const response=await fetch('/api/zhiyin/automations',{cache:'no-store',signal:AbortSignal.timeout(body&&'type' in body&&body.type==='run'&&'kind' in body&&body.kind==='monthly_bill_review'?150000:15000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Automation':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok||!validAutomationSnapshot(data))throw new Error(data.error||'自动任务服务暂时不可用');
  return data;
}

export function billAutomationResult(connections:Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>):string{
  const sources=Object.values(connections).filter((item):item is ConnectedFinancialSource=>Boolean(item?.scopes.includes('transactions')));
  const rows=sources.flatMap(item=>item.transactions||[]);
  if(!sources.length)return '本次未生成报告：还没有获得账单读取授权。';
  if(!rows.length)return `已核对 ${sources.map(item=>item.displayName).join('、')}，当前授权范围没有返回账单记录。`;
  const expense=rows.filter(item=>item.amount<0&&item.kind!=='transfer').reduce((sum,item)=>sum-Math.round(item.amount),0);
  return `已核对 ${sources.length} 个来源、${rows.length} 条记录；授权账单中的消费支出合计 ¥${(expense/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}。异常仍需逐笔确认。`;
}

export function wealthAutomationResult(balance:number|undefined,market:MarketContext|null):string{
  const balanceText=balance===undefined?'银行沙箱余额暂不可用':`银行沙箱可用余额 ¥${(balance/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const csi=market?.indicators.find(item=>item.key==='csi300');
  const marketText=csi?`沪深300 ${csi.date} 为 ${csi.value.toFixed(2)}`:market?.message||'外部市场环境暂不可用';
  return `已核对：${balanceText}；${marketText}。本任务不会推断风险等级，也不会自动申购或赎回。`;
}
