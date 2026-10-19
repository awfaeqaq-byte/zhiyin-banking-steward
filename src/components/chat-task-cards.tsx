import {LargeTransferNotice} from './large-transfer-notice';
import {useState} from 'react';
import {ArrowRight,ArrowUpRight,CheckCircle2,Clock3,Layers3,Send,ShieldCheck,WalletCards} from 'lucide-react';
import {bankRecipients,validTransfer,type TransferIntent,type TransferImpact} from '../lib/bank-transfer';
import {formatCny,type ExternalFinancialProvider} from '../lib/financial-connections';
import type {StewardSubscription} from '../lib/steward-chat';
import type {SceneFlow,SceneNext,SceneStage} from '../lib/scene-flow';
import {Button} from './ui/button';
import {Switch} from './ui/switch';
import {TaskCardHeader,type TaskCardTone} from './task-card-header';
import './chat-task-cards.css';

export type TransferQuote={balance:number;limit:number;frozen:boolean;impact:TransferImpact;capturedAt:number};
const date=(time:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);

export function TransferPlanCard({intent,quote,sourceText='',onReview,disabled=false}:{intent:TransferIntent;quote?:TransferQuote;sourceText?:string;onReview:(intent:TransferIntent)=>void;disabled?:boolean}){
 const recipient=bankRecipients.find(p=>p.id===intent.recipientId);
 const needsReserve=/留够|留出|保留|预留|不影响.*还款|保证.*还款/.test(sourceText)&&!/(不用|不需要|无需|取消).{0,5}(保留|预留)|不留预算/.test(sourceText);
 const reserve=sourceText.match(/(?:留够|留出|保留|预留)\s*(\d+(?:\.\d{1,2})?)\s*(万)?\s*元/);
 const expectedReserve=reserve?Math.round(Number(reserve[1])*(reserve[2]?1000000:100)):undefined;
 const unresolvedReserve=needsReserve&&(intent.protectedAmount===undefined||expectedReserve!==undefined&&intent.protectedAmount!==expectedReserve);
 const blocked=unresolvedReserve||!validTransfer(intent)||Boolean(quote&&(quote.frozen||quote.impact.remaining<0||intent.amount>quote.impact.available));
 return <section className="steward-task-card transfer-plan-card" aria-label="转账方案">
  <TaskCardHeader title="转账方案" icon={<Send/>} status={unresolvedReserve?'约束待核对':quote?.frozen?'卡片不可用':blocked?'金额待调整':'待你核对'} tone={blocked?'warning':'attention'}/>
  <div className="task-card-transfer-target"><span>准备转给<strong>{recipient?.name||'收款人待核对'}</strong><small>{recipient?`收款账号尾号 ${recipient.accountLast4}`:'请先核对收款对象'}</small></span><strong>{formatCny(intent.amount)}</strong></div>
  <LargeTransferNotice amount={intent.amount}/>
  <dl className="task-card-facts"><div><dt>执行时间</dt><dd>{intent.executeAt?date(intent.executeAt):'确认后立即转账'}</dd></div><div><dt>资金来源</dt><dd>银行沙箱 · 常用卡</dd></div>{quote&&<><div><dt>保留金额</dt><dd>{unresolvedReserve?'尚未核对':formatCny(quote.impact.protectedAmount)}</dd></div><div><dt>其他预约</dt><dd>{formatCny(quote.impact.pendingTotal)}</dd></div><div><dt>测算剩余可安排</dt><dd>{unresolvedReserve?'待补全方案后测算':quote.impact.remaining<0?'金额不足':formatCny(quote.impact.remaining)}</dd></div></>}</dl>
  <p className="task-card-explanation">{unresolvedReserve?'你提出的保留金额还没有计入这份方案。请重新告诉我转账金额和需保留金额，再一起核对。':quote?.frozen?'这张卡已挂失，先处理卡片状态。':blocked?'可安排金额不足，请调整金额或资金安排。':!quote?'尚未读取银行余额，核对页会重新检查。':'已计入需保留金额和其他预约，核对时还会重新读取银行状态。'}<br/>尚未转账，打开核对不会扣款。</p>
  <Button disabled={disabled||blocked} onClick={()=>onReview(intent)}>{intent.executeAt?'核对预约转账':'核对银行转账'}<ArrowRight size={16} aria-hidden="true"/></Button>
 </section>;
}

export function SubscriptionReviewCard({items,error='',disabled=false,onReviewCancel,onToggleReminder,onOpen}:{items:StewardSubscription[];error?:string;disabled?:boolean;onReviewCancel:(provider:ExternalFinancialProvider,id:string)=>void;onToggleReminder:(key:string,enabled:boolean)=>void;onOpen:()=>void}){
 const monthly=items.filter(i=>i.cycle==='月'),shown=items.slice(0,4);
 return <section className="steward-task-card subscription-review-card" aria-label="订阅安排">
  <TaskCardHeader title="订阅安排" icon={<WalletCards/>} status={error?'待重新核对':items.length?'待你核对':'暂无签约记录'} tone={error?'warning':items.length?'attention':'neutral'} meta="来源：已授权平台签约"/>
  {error?<p role="alert">{error}。签约与金额待核对。</p>:!items.length?<p className="task-card-explanation">本次授权数据未返回签约记录。账单里的规律付款还需要单独核对，不能据此断定没有订阅。</p>:<>
   {monthly.length>0&&<div className="task-card-total"><span>按月签约 · {monthly.length} 项</span><strong>{formatCny(monthly.reduce((sum,i)=>sum+i.amount,0))}<small> / 月</small></strong></div>}
   <ul className="task-card-subscriptions">{shown.map(item=><li key={item.key}><div><strong>{item.title}</strong><span>{item.providerName} · {item.daysUntilCharge===null?'扣费时间待核对':item.daysUntilCharge<0?'已到扣费日，结果待核对':item.daysUntilCharge===0?'今天到扣费日':`${item.daysUntilCharge}天后到扣费日`}</span></div><strong>{formatCny(item.amount)}<small> / {item.cycle}</small></strong><div className="task-card-row-actions"><div className="task-card-reminder"><span>续费提醒<small>{item.reminderEnabled?'已开启':'已关闭'}</small></span><Switch label={`${item.title}续费提醒`} checked={item.reminderEnabled} disabled={disabled} onCheckedChange={enabled=>onToggleReminder(item.key,enabled)}/></div><Button className="task-card-cancel" variant="ghost" size="sm" disabled={disabled} onClick={()=>onReviewCancel(item.provider,item.id)}>核对并取消{item.title}</Button></div></li>)}</ul>
   <p className="task-card-explanation">金额按平台签约展示，年度费用单独列出。取消前先核对签约对象；还没有取消任何服务。</p>
  </>}
  <Button variant="secondary" disabled={disabled} onClick={onOpen}>查看自动续费清单{items.length>4?`（共${items.length}项）`:''}<ArrowRight size={15} aria-hidden="true"/></Button>
 </section>;
}

const stages:Record<SceneStage,string>={processing:'正在整理',waiting_user:'需要你补充',waiting_authorization:'等待你确认',waiting_external:'等待平台结果',completed:'已完成',cancelled:'已取消',failed:'待处理'};
const stageTones:Record<SceneStage,TaskCardTone>={processing:'neutral',waiting_user:'attention',waiting_authorization:'attention',waiting_external:'neutral',completed:'success',cancelled:'neutral',failed:'danger'};
const recordStatuses:Record<string,string>={saved:'已记录',pending:'待处理',completed:'已完成',cancelled:'已取消',failed:'未成功',draft:'方案待核对',reserved:'预算已预留',PENDING_PAYMENT:'等待付款',PAID:'已付款',ACCEPTED:'商家已接单',PREPARING:'商家制作中',READY_FOR_DELIVERY:'等待配送',DELIVERY_ASSIGNED:'已安排配送',DELIVERING:'配送中',COMPLETED:'已送达',REFUNDING:'退款处理中',REFUNDED:'已退款',CANCELLED:'已取消'};
const nextLabels:Record<SceneNext['kind'],string>={food:'查看原订单',occasion:'继续核对筹备',expense:'查看收款进度',calendar:'查看日历安排',bank:'查看银行记录'};
export function SceneProgressCard({scene,onResume,disabled=false}:{scene:SceneFlow;onResume?:(next:SceneNext)=>Promise<unknown>|void;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const records=scene.records.filter(r=>r.kind!=='message');
 async function resume(next=scene.next){if(!next||!onResume||busy||disabled)return;setBusy(true);setError('');try{await onResume(next);}catch(cause){setError(cause instanceof Error?cause.message:'原事项暂未打开，请稍后重试。');}finally{setBusy(false);}}
 return <section className="steward-task-card scene-progress-card" aria-label="跨场景进度">
  <TaskCardHeader title={scene.title} icon={<Layers3/>} status={stages[scene.stage]} tone={stageTones[scene.stage]}/>
  <p className="task-card-explanation">{scene.summary}</p>
  <ol className="task-card-records">{records.slice(0,5).map(r=><li key={`${r.kind}:${r.id}`}>{['saved','completed','COMPLETED','REFUNDED'].includes(r.status)?<CheckCircle2 size={16} aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}<span>{r.label}<small>{recordStatuses[r.status]||'状态待核对'}</small></span></li>)}</ol>
  {records.length>5&&<p className="task-card-explanation">已关联 {records.length} 条业务记录，可进入原事项核对完整详情。</p>}
  <p className="task-card-note"><Clock3 size={14} aria-hidden="true"/>{scene.checkedAt?`${date(scene.checkedAt)}核对的结果`:'尚未完成状态核对'} · 返回后继续核对</p>
  {scene.error&&<p className="task-card-explanation">{scene.error}</p>}{error&&<p role="alert">{error}</p>}
  {!!scene.expenses?.pendingCount&&onResume&&<Button disabled={disabled||busy||!!scene.error} onClick={()=>void resume({kind:'expense',id:scene.id,workspaceId:scene.workspaceIds[0],action:'prepare_expenses'})}>整理本次费用<ArrowUpRight size={15} aria-hidden="true"/></Button>}
  {scene.next&&onResume&&<Button variant={scene.expenses?.pendingCount?'secondary':'primary'} disabled={disabled||busy} onClick={()=>void resume()}>{busy?'正在打开…':nextLabels[scene.next.kind]}<ArrowUpRight size={15} aria-hidden="true"/></Button>}
  <p className="task-card-note"><ShieldCheck size={14} aria-hidden="true"/>此处只查看进度，付款与预算操作仍需单独确认。</p>
 </section>;
}
