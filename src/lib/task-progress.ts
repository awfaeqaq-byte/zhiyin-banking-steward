import type {Workspace,WorkspaceRoute} from './workspaces';
import {isBillQuestion,type BillAnalysis} from './bill-analysis';
import {billProvider} from './steward-ui';
import {foodRoute} from './food-order';

import type {TaskProgress} from './task-progress-schema';
export {validTaskProgress,type TaskProgress} from './task-progress-schema';
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown,max:number):x is string=>typeof x==='string'&&!!x.trim()&&x.length<=max;
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));

// These guards only bind clear read-only intent/short answers. Mixed or new business
// still goes through semantic routing; no financial operation is inferred here.
const otherBusiness=/群收款|(?:AA|aa)|平分|分摊|记.{0,3}(?:饮料|午餐|晚餐)|给.{0,15}转|转给|转\s*\d|取消|撤销|续费|订阅|会员|提醒|生日|纪念日|银行卡|挂失|冻结|限额|付款|支付\s*\d|买|下单/;
export function clearBillIntent(prompt:string) {
  return isBillQuestion(prompt)&&!otherBusiness.test(prompt);
}
function periodIn(prompt:string):string|undefined {
  // Preserve unsupported/ambiguous ranges rather than silently falling back to this month.
  if(/下个?月|去年|前年|季度|半年|今年|本周|上周|前天|明天|未来|接下来|至(?!今)|月.*到.*月|\d{4}-\d{2}|\d+日|\d+号|\d+\/\d+/.test(prompt))return prompt.slice(0,80);
  if(/(?:就?近|最近)\s*(?:一|1|个)?个?月/.test(prompt))return '最近30天';
  if(/最近|近[七三一\d]|这[七三一\d]/.test(prompt)) {
    if(/30|三十/.test(prompt))return '最近30天';
    if(/7|七|一周/.test(prompt))return '最近7天';
    return prompt.slice(0,80);
  }
  if(/上个?月/.test(prompt))return '上月';
  if(/本月|这个月|这月|当月/.test(prompt))return '本月';
  if(/昨天/.test(prompt))return '昨天';
  if(/今天/.test(prompt))return '今天';
  return prompt.match(/(?:\d{4}年)?\d{1,2}月/)?.[0];
}
function mergeBill(progress:TaskProgress,prompt:string):TaskProgress {
  const period=periodIn(prompt);
  const provider=/全部平台|所有平台|两个平台|都看|都要/.test(prompt)?'all':billProvider(prompt);
  return {...progress,stage:'collecting',waitingFor:undefined,bill:{...progress.bill,...(period?{period}:{}),...(provider?{provider}:{})}};
}
export function readTaskProgress(task:Workspace):TaskProgress {
  if(task.progress)return structuredClone(task.progress);
  let progress:TaskProgress={goal:task.title||'当前交代',stage:'collecting'};
  // Lazy recovery from legacy USER messages only, using the current memory revision.
  for(const m of task.messages.filter(m=>m.role==='user'&&m.memoryRevision===task.memoryRevision)) {
    if(clearBillIntent(m.content))progress=mergeBill({...progress,goal:m.content.slice(0,300),bill:progress.bill||{}},m.content);
    else if(otherBusiness.test(m.content))progress={goal:task.title||'当前交代',stage:'collecting'};
    else if(progress.bill)progress=mergeBill(progress,m.content);
  }
  return progress;
}
export function advanceTaskProgress(task:Workspace,prompt:string):TaskProgress {
  let progress=readTaskProgress(task);
  if(task.kind==='food')return {...progress,stage:'collecting',waitingFor:undefined,food:progress.food||{items:[],note:''}};
  if(progress.bill&&/^(?:算了|不用了|先不看了|暂停)[。！!\s]*$/.test(prompt))return {...progress,stage:'paused',waitingFor:undefined};
  if(clearBillIntent(prompt)||task.kind==='bills') {
    if(!progress.bill)progress={goal:prompt.slice(0,300),stage:'collecting',bill:{}};
    progress=mergeBill(progress,prompt);
    // Bare "账单" retains the established default month; "最近" stays ambiguous.
    progress.bill={...progress.bill,period:progress.bill?.period||'本月'};
    return progress;
  }
  if(progress.bill&&!otherBusiness.test(prompt))return mergeBill(progress,prompt);
  return {goal:progress.goal,stage:'collecting'};
}
export function billTaskQuestion(progress:TaskProgress):string {
  const source=progress.bill?.provider==='wechat_pay'?'；只看微信支付':progress.bill?.provider==='alipay'?'；只看支付宝':progress.bill?.provider==='all'?'；全部平台':'';
  return `${progress.bill?.period||'本月'}账单${source}`;
}
export function settleTaskProgress(progress:TaskProgress,{bill,failed,waitingQuestion,needsAuthorization}:{bill?:BillAnalysis;failed?:boolean;waitingQuestion?:string;needsAuthorization?:boolean}):TaskProgress {
  if(failed)return {...progress,stage:'failed'};
  if(bill?.needsClarification)return {...progress,stage:'waiting_user',waitingFor:{field:'period',question:'想看哪个时间范围的账单？'}};
  if(bill&&!bill.sources.length) {
    const provider=progress.bill?.provider;
    return {...progress,stage:provider?'waiting_authorization':'waiting_user',waitingFor:{field:provider?'authorization':'provider',question:provider?'需要你在平台确认账单读取范围。':'这次想看微信支付、支付宝，还是两个平台？'}};
  }
  if(waitingQuestion)return {...progress,stage:'waiting_user',waitingFor:{field:'reply',question:waitingQuestion}};
  if(needsAuthorization)return {...progress,stage:'waiting_authorization',waitingFor:{field:'authorization',question:'请核对方案并本人授权；当前未执行。'}};
  return {...progress,stage:'ready',waitingFor:undefined};
}

export function taskContinuation(prompt:string,tasks:Workspace[],currentId:string):{parts:WorkspaceRoute[];clarification?:string}|null {
  const food=foodRoute(prompt,tasks,currentId);if(food?.parts[0].taskId)return food;
  const current=tasks.find(t=>t.id===currentId&&t.status==='active');
  if(!current)return null;
  const progress=readTaskProgress(current),p=prompt.trim();
  if(otherBusiness.test(p)||p.length>100)return null;
  const compact=p.replace(/[，。！!？?\s]/g,'');
  const periodAnswer=/^(?:那|就|只看|就看|改成|改为|看)?(?:(?:最近|就近|近|过去)?(?:一|1)个?月|(?:最近|近|这)?(?:\d{1,3}|七|三十)天|最近|最近的|本月|这个月|上月|上个月|下月|下个月|昨天|今天|(?:\d{4}年)?\d{1,2}月)(?:的|账单|支出|收支|呢|吧)*$/.test(compact);
  const billAnswer=progress.bill&&(clearBillIntent(p)||/^(?:补充[:：])?(?:就|只看|就看|仅看|先看|先|用|换成|改成|选|选择)?(?:微信(?:支付)?|支付宝|全部平台|所有平台|两个平台|都看|都要)(?:吧|的)?$/.test(compact)
    ||/^(?:那|好[的吧]?|帮我|请|先|给我|我想|我要|可以|就|把|现在)*(?:授权|连接|绑定|接入)(?:一下)?(?:微信(?:支付)?|支付宝)?(?:吧)?$/.test(compact)
    ||/^(?:怎么|如何)(?:授权|连接)|^我要授权$/.test(compact)
    ||periodAnswer||/^(?:算了|不用了|先不看了|暂停|继续)$/.test(compact));
  const answer=progress.waitingFor&&(p===progress.waitingFor.question||/^(?:好|好的|可以|继续|同意|不用了|算了|简短一点|详细一点)[。！!]*$/.test(p)
    ||current.kind==='general'&&progress.waitingFor.field==='reply'&&/记住|记忆/.test(progress.waitingFor.question)&&/^(?:记忆|记住(?:吧|这个日期)?|帮我记住|记下来|要记住|不用记|不需要)[。！!]*$/.test(p)
    ||progress.waitingFor.field==='reply'&&/^(?:\d+(?:\.\d+)?(?:元|块)?|明天|后天|今天|上午|下午|晚上|早上|周|星期|下周)/.test(p)&&!/[，；;]/.test(p));
  if(!/^[？?]+$/.test(p)&&!billAnswer&&!answer)return null;
  return {parts:[{taskId:current.id,kind:current.kind,title:current.title,text:prompt}]};
}

export function parseTaskWait(output:string):{text:string;waitingQuestion?:string} {
  const matches=[...output.matchAll(/\[\[task-wait:([^\n]*?)\]\]/g)];
  const cleaned=output.replace(/\[\[task-wait:[^\n]*?\]\]/g,'').trim();
  if(matches.length!==1)return {text:cleaned};
  try {
    const value:unknown=JSON.parse(matches[0][1]);
    if(record(value)&&keys(value,['question'])&&text(value.question,300))return {text:cleaned,waitingQuestion:value.question.trim()};
  } catch {/* Malformed planning hints cannot become actions. */}
  return {text:cleaned};
}
