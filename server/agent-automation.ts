import type {IncomingMessage,ServerResponse} from 'node:http';
import {existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {Mastra} from '@mastra/core/mastra';
import {createStep,createWorkflow} from '@mastra/core/workflows';
import {LibSQLStore} from '@mastra/libsql';
import {z} from 'zod';
import {automationTemplates,type AgentAutomationKind,type AutomationContext,type AutomationEvidence,type AutomationRun,type AutomationServerSnapshot,type ServerAgentAutomation} from '../src/lib/agent-automations';
import {buildMonthlyBillReport} from '../src/lib/bill-report';
import type {ConnectedFinancialSource,ExternalFinancialProvider} from '../src/lib/financial-connections';
import {priorBeijingMonth} from './bill-source';

type PersistedState={
  version:1;
  context:AutomationContext|null;
  tasks:Partial<Record<AgentAutomationKind,Omit<ServerAgentAutomation,'lastRun'>>>;
  runs:AutomationRun[];
};

const kinds:AgentAutomationKind[]=['monthly_bill_review','weekly_wealth_check','anomaly_bill_review'];
const workflowKeys={monthly_bill_review:'monthlyBillReview',weekly_wealth_check:'weeklyWealthCheck',anomaly_bill_review:'anomalyBillReview'} as const satisfies Record<AgentAutomationKind,string>;
const workflowIds:Record<AgentAutomationKind,string>={monthly_bill_review:'zhiyin-monthly-bill-review',weekly_wealth_check:'zhiyin-weekly-wealth-check',anomaly_bill_review:'zhiyin-anomaly-bill-review'};
const crons:Record<AgentAutomationKind,string>={monthly_bill_review:'0 9 1 * *',weekly_wealth_check:'30 8 * * 1',anomaly_bill_review:'0 20 * * *'};

function money(cents:number){return `¥${(cents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function emptyState():PersistedState{return {version:1,context:null,tasks:{},runs:[]};}

export function createAgentAutomationService(options:{stateFile:string;databaseUrl:string;now?:()=>number;refreshBills?:(month:string)=>Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>|Promise<Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>>}){
  const now=options.now||Date.now;
  function read():PersistedState{
    try{if(!existsSync(options.stateFile))return emptyState();const value=JSON.parse(readFileSync(options.stateFile,'utf8')) as PersistedState;return value?.version===1&&Array.isArray(value.runs)?value:emptyState();}catch{return emptyState();}
  }
  function write(value:PersistedState){writeFileSync(options.stateFile+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(options.stateFile+'.tmp',options.stateFile);}
  async function result(kind:AgentAutomationKind,trigger:AutomationRun['trigger']):Promise<AutomationRun>{
    const startedAt=now(),state=read(),context=state.context;
    let status:AutomationRun['status']='completed',summary='',evidence:AutomationEvidence[]=[];
    let reportMonth:string|undefined,sourceRefreshedAt:number|undefined;
    let reportSnapshot:AutomationRun['report'];
    if(kind==='monthly_bill_review'){
      reportMonth=priorBeijingMonth(startedAt);
      try{
        if(!options.refreshBills)throw new Error('未配置后台账单读取器');
        const sources=await options.refreshBills(reportMonth);
        sourceRefreshedAt=now();
        const report=buildMonthlyBillReport(sources,reportMonth);
        if(!report||!report.sources.length)throw new Error('没有可分析的已授权账单');
        reportSnapshot={month:reportMonth,sources:report.sources,recordCount:report.count,expense:report.expense,income:report.income,refund:report.refund,transferIn:report.transferIn,transferOut:report.transferOut,categories:report.categories.slice(0,20),coverage:report.coverage,incomplete:report.coverageIncomplete};
        const categories=report.categories.slice(0,3).map(item=>`${item.name} ${money(item.amount)}`).join('、');
        summary=`${reportMonth} 月报：后台重新读取 ${report.sources.join('、')}，共 ${report.count} 条记录；${report.coverageIncomplete?'已返回记录的小计，':'已授权记录合计，'}消费 ${money(report.expense)}，收入 ${money(report.income)}，退款 ${money(report.refund)}${categories?`；主要分类 ${categories}`:''}。${report.coverage}`;
        evidence=report.diagnosis.findings.slice(0,5).map((finding,index)=>({id:`monthly-${index+1}`,title:finding.title,detail:finding.detail,suggestion:finding.suggestion,decision:'pending',transactions:finding.evidence.slice(0,5).map(row=>({id:row.id,title:row.title,amount:row.amount,occurredAt:row.occurredAt,providerName:row.providerName}))}));
      }catch(error){status='failed';summary=`${reportMonth} 月报未生成：${error instanceof Error?error.message:'后台读取账单失败'}`;}
    }else if(!context){status='failed';summary='尚未同步已授权数据，任务未执行。';}
    else if(kind==='weekly_wealth_check'){
      const balance=context.wealth.availableBalance===undefined?'沙箱余额暂不可用':`沙箱可用余额 ${money(context.wealth.availableBalance)}`;
      const csi=context.wealth.market?.indicators.find(item=>item.key==='csi300');
      const shibor=context.wealth.market?.indicators.find(item=>item.key==='shibor_3m');
      summary=`已完成现金流和市场环境体检：${balance}${csi?`；沪深300 ${csi.date} 为 ${csi.value.toFixed(2)}`:''}${shibor?`；Shibor 3个月为 ${shibor.value.toFixed(3)}%`:''}。不会据此自动交易。`;
      evidence=[{id:'wealth-balance',title:'账户流动性依据',detail:balance,suggestion:'结合近期固定支出确定可用于理财的金额。',decision:'confirmed'},...(csi?[{id:'market-csi300',title:'外部市场依据',detail:`AKShare：沪深300 ${csi.date} 为 ${csi.value.toFixed(2)}`,suggestion:'市场数据只影响解释与节奏，不改变用户风险上限。',decision:'confirmed' as const}]:[])];
    }else{
      evidence=context.bill.findings.map(item=>({...item,decision:'pending' as const})).slice(0,8);
      status=evidence.length?'waiting_confirmation':'completed';
      summary=evidence.length?`发现 ${evidence.length} 条账单线索，需要你确认后才能完成复核。`:'本次没有发现达到规则阈值的账单线索。';
    }
    const completedAt=now();
    return {id:`run-${completedAt}-${Math.random().toString(36).slice(2,8)}`,kind,status,summary,evidence,startedAt,completedAt,trigger,engine:'mastra',...(reportMonth?{reportMonth}:{}),...(sourceRefreshedAt?{sourceRefreshedAt}:{}),...(reportSnapshot?{report:reportSnapshot}:{})};
  }
  async function execute(kind:AgentAutomationKind,trigger:AutomationRun['trigger']){
    const run=await result(kind,trigger),state=read();state.runs=[run,...state.runs].slice(0,50);write(state);return run;
  }
  const runOutput=z.object({runId:z.string(),status:z.enum(['completed','waiting_confirmation','failed'])});
  function workflow(kind:AgentAutomationKind){
    const schema=z.object({kind:z.literal(kind),trigger:z.enum(['schedule','manual']).default('schedule')});
    const step=createStep({id:`execute-${kind}`,inputSchema:schema,outputSchema:runOutput,execute:async({inputData})=>{const run=await execute(kind,inputData.trigger);return {runId:run.id,status:run.status};}});
    return createWorkflow({id:workflowIds[kind],inputSchema:schema,outputSchema:runOutput}).then(step).commit();
  }
  const workflows={monthlyBillReview:workflow('monthly_bill_review'),weeklyWealthCheck:workflow('weekly_wealth_check'),anomalyBillReview:workflow('anomaly_bill_review')};
  const mastra=new Mastra({workflows,storage:new LibSQLStore({id:'zhiyin-agent-storage',url:options.databaseUrl}),scheduler:{enabled:true}});
  async function ensureSchedule(kind:AgentAutomationKind){
    const state=read(),existing=state.tasks[kind];
    if(existing?.mastraScheduleId){try{await mastra.schedules.resume(existing.mastraScheduleId);return existing.mastraScheduleId;}catch{/* Recreate a missing or incompatible schedule. */}}
    const schedule=await mastra.schedules.create({id:`zhiyin-${kind}`,workflowId:workflowIds[kind],cron:crons[kind],timezone:'Asia/Shanghai',inputData:{kind,trigger:'schedule'},metadata:{title:automationTemplates[kind].title}});
    return schedule.id;
  }
  async function start(kind:AgentAutomationKind,context:AutomationContext){
    validateContext(context);const state=read();state.context=context;write(state);
    const id=await ensureSchedule(kind),latest=read();latest.tasks[kind]={kind,enabled:true,createdAt:latest.tasks[kind]?.createdAt||now(),mastraScheduleId:id};write(latest);return snapshot();
  }
  async function toggle(kind:AgentAutomationKind){
    const state=read(),task=state.tasks[kind];if(!task?.mastraScheduleId)throw new Error('任务尚未设置');
    if(task.enabled)await mastra.schedules.pause(task.mastraScheduleId);else await mastra.schedules.resume(task.mastraScheduleId);
    state.tasks[kind]={...task,enabled:!task.enabled};write(state);return snapshot();
  }
  async function runNow(kind:AgentAutomationKind,context:AutomationContext){
    validateContext(context);const state=read();state.context=context;write(state);
    if(!state.tasks[kind])await start(kind,context);
    const instance=mastra.getWorkflow(workflowKeys[kind]);const run=await instance.createRun();await run.start({inputData:{kind,trigger:'manual'}});return snapshot();
  }
  function decide(runId:string,evidenceId:string,decision:'confirmed'|'dismissed'){
    const state=read(),run=state.runs.find(item=>item.id===runId);if(!run)throw new Error('没有找到该运行记录');
    const evidence=run.evidence.find(item=>item.id===evidenceId);if(!evidence)throw new Error('没有找到该线索');
    evidence.decision=decision;
    if(run.evidence.every(item=>item.decision&&item.decision!=='pending')){run.status='completed';run.summary=`已完成 ${run.evidence.length} 条账单线索复核；确认 ${run.evidence.filter(item=>item.decision==='confirmed').length} 条，排除 ${run.evidence.filter(item=>item.decision==='dismissed').length} 条。`;}
    write(state);return snapshot();
  }
  function snapshot():AutomationServerSnapshot{
    const state=read();return {version:1,engine:'mastra',tasks:kinds.flatMap(kind=>{const task=state.tasks[kind];if(!task)return [];return [{...task,lastRun:state.runs.find(run=>run.kind===kind)}];}),runs:state.runs};
  }
  return {snapshot,start,toggle,runNow,decide};
}

function validateContext(value:AutomationContext){
  if(!value||!Number.isFinite(value.capturedAt)||!value.bill||!value.wealth)throw new Error('任务上下文无效');
  if(!Number.isSafeInteger(value.bill.sourceCount)||value.bill.sourceCount<0||value.bill.sourceCount>10)throw new Error('账单来源数量无效');
  if(!Number.isSafeInteger(value.bill.recordCount)||value.bill.recordCount<0||value.bill.recordCount>10000)throw new Error('账单记录数量无效');
  if(!Number.isSafeInteger(value.bill.expense)||value.bill.expense<0)throw new Error('账单金额无效');
  if(!Array.isArray(value.bill.findings)||value.bill.findings.length>20||value.bill.findings.some(item=>!item.id||item.title.length>120||item.detail.length>360||item.suggestion.length>240||!Array.isArray(item.transactions||[])||(item.transactions||[]).length>5||(item.transactions||[]).some(row=>!row.id||row.title.length>80||!Number.isSafeInteger(row.amount)||!Number.isFinite(Date.parse(row.occurredAt))||row.providerName.length>40)))throw new Error('账单线索无效');
  if(value.wealth.availableBalance!==undefined&&(!Number.isSafeInteger(value.wealth.availableBalance)||value.wealth.availableBalance<0))throw new Error('账户余额无效');
}

export function agentAutomationMiddleware(service:ReturnType<typeof createAgentAutomationService>){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try{
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
      if(req.method==='GET')return send(200,service.snapshot());
      if(req.method!=='POST')return send(405,{error:'不支持的方法'});
      if(req.headers['x-zhiyin-automation']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>128*1024)return send(413,{error:'请求过大'});}const data=JSON.parse(body);
      if(!kinds.includes(data.kind)&&data.type!=='decide')return send(400,{error:'任务类型无效'});
      if(data.type==='start')return send(200,await service.start(data.kind,data.context));
      if(data.type==='toggle')return send(200,await service.toggle(data.kind));
      if(data.type==='run')return send(200,await service.runNow(data.kind,data.context));
      if(data.type==='decide'&&typeof data.runId==='string'&&typeof data.evidenceId==='string'&&['confirmed','dismissed'].includes(data.decision))return send(200,service.decide(data.runId,data.evidenceId,data.decision));
      return send(400,{error:'不支持的操作'});
    }catch(error){return send(400,{error:error instanceof Error?error.message:'自动任务操作失败'});}
  };
}
