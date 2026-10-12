import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createWorkspaceStore} from './workspace-store';import {createBankStore} from './bank-store';import {createTaskStore} from './task-store';
import {existsSync,readFileSync} from 'node:fs';
import {emptyExpenseState,validExpenseState} from '../src/lib/expense-notebook';
import {expenseActivityClosed,collectionProgress} from '../src/lib/expense-follow-up';
import {sharedTextPreview} from '../src/lib/wechat-message-share';
import {validSceneOrder,sceneFingerprint,type SceneFlow,type SceneLink,type SceneRecord,type SceneOrderObservation,type SceneStage,type SceneNext} from '../src/lib/scene-flow';
import type {WorkspaceState} from '../src/lib/workspaces';
const labels:Record<string,string>={PENDING_PAYMENT:'待付款',PAID:'已付款',ACCEPTED:'商家已接单',PREPARING:'正在制作',READY_FOR_DELIVERY:'等待配送',DELIVERY_ASSIGNED:'骑手已接单',DELIVERING:'配送中',COMPLETED:'已送达',REFUNDING:'退款中',REFUNDED:'已退款',CANCELLED:'已取消'};
const rank=(status:string)=>['PENDING_PAYMENT','PAID','ACCEPTED','PREPARING','READY_FOR_DELIVERY','DELIVERY_ASSIGNED','DELIVERING','COMPLETED','REFUNDING','REFUNDED','CANCELLED'].indexOf(status);
export function createSceneService(directory:string){
 const bank=createBankStore(join(directory,'.zhiyin-bank.local.json')),calendar=createTaskStore(join(directory,'.zhiyin-tasks.local.json'));
 function storage(scope:string){if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope))throw new Error('任务空间标识无效');return createWorkspaceStore(join(directory,`.zhiyin-workspaces-${scope}.local.json`));}
 function reconcile(scope:string,input:{orders?:SceneOrderObservation[];errors?:Array<{workspaceId:string;message:string}>}={}):WorkspaceState{
  const store=storage(scope),state=store.get(),account=bank.get(),dates=calendar.get().tasks;
  const expenseFile=join(directory,`.zhiyin-expenses-${scope}.local.json`),expenses=existsSync(expenseFile)?JSON.parse(readFileSync(expenseFile,'utf8')):emptyExpenseState();if(!validExpenseState(expenses))throw new Error('消费账本无法核对，原记录已保留');
  if(input.orders!==undefined&&(!Array.isArray(input.orders)||input.orders.length>200||!input.orders.every(validSceneOrder)||input.orders.some(o=>o.checkedAt>Date.now()+10000)))throw new Error('订单观察格式无效');
  if(input.errors!==undefined&&(!Array.isArray(input.errors)||input.errors.length>100||input.errors.some(e=>!e||!state.items.some(t=>t.id===e.workspaceId)||typeof e.message!=='string'||!e.message.trim()||e.message.length>300)))throw new Error('平台读取状态无效');
  const groups=new Map<string,typeof state.items>();
  for(const task of state.items.filter(t=>t.status==='active')){const key=task.sceneId||task.id;groups.set(key,[...(groups.get(key)||[]),task]);}
  const scenes:SceneFlow[]=[];
  for(const [id,members] of groups){
   const links:SceneLink[]=[],records:SceneRecord[]=[];let stage:SceneStage='waiting_user',next:SceneNext|undefined;
   const add=(link:SceneLink,status?:string,label?:string)=>{if(!links.some(l=>l.kind===link.kind&&l.id===link.id))links.push(link);if(status&&label)records.push({...link,status,label});};
   const root=state.items.find(t=>t.id===id)||members[0];
   for(const task of members){
    const sources=task.messages.filter(m=>m.role==='user'&&sharedTextPreview(m.content));for(const m of sources)add({kind:'message',id:m.id,workspaceId:task.id},'provided','已保留微信所选消息来源');
    for(const run of state.runs||[])if(run.jobs.some(j=>j.taskId===task.id))add({kind:'message',id:run.id,workspaceId:task.id});
    for(const date of dates.filter(d=>d.workspaceId===task.id))add({kind:'calendar',id:date.id,workspaceId:task.id},date.status==='cancelled'?'cancelled':'saved',`${date.title}${date.status==='cancelled'?'已取消':'已保存到日历'}`);
    const plan=account.occasions?.find(p=>p.id===task.id);if(plan){add({kind:'occasion',id:plan.id,workspaceId:task.id},plan.status,plan.status==='reserved'?'筹备预算已预留':plan.status==='draft'?'筹备方案已保存，预算待确认':plan.status==='completed'?'筹备安排已完成':'筹备安排已取消，未用预算已释放');for(const order of plan.orders)add({kind:'food_order',id:order.orderId,workspaceId:task.id,channel:'occasion'});}
    if(task.progress?.food?.orderId)add({kind:'food_order',id:task.progress.food.orderId,workspaceId:task.id,channel:'food'});
    const book=expenses.books.find((b:typeof expenses.books[number])=>b.id===task.expenseBookId);if(book){add({kind:'expense_book',id:book.id,workspaceId:task.id},expenseActivityClosed(book)?'completed':'active',expenseActivityClosed(book)?'消费活动已结清':'消费记录已保存');for(const batch of book.batches){let label='分摊已整理，等待微信确认',status='prepared';if(batch.status==='published'){status='pending';label='微信群收款已发起，等待成员付款';if(batch.receipt){const progress=collectionProgress(book,batch,batch.receipt);if(progress.cancelled){status='cancelled';label='微信群收款已取消，退款需核对';}else if(progress.complete){status='completed';label='本批微信群收款已收齐';}else label=`微信群收款还有${progress.members.filter(m=>!m.paid).length}人未付`;}}add({kind:'collection',id:batch.id,workspaceId:task.id},status,label);}}
    for(const receipt of account.transactions.filter(r=>r.workspaceId===task.id))add({kind:'transfer',id:receipt.id,workspaceId:task.id},'completed','银行转账已完成');
    for(const schedule of account.schedules?.filter(r=>r.workspaceId===task.id)||[])add({kind:'schedule',id:schedule.id,workspaceId:task.id},schedule.status,schedule.status==='pending'?'预约已登记，等待银行到期执行':schedule.status==='completed'?'预约转账已完成':schedule.status==='failed'?`预约未完成：${schedule.error||'请核对原因'}`:'预约已撤销');
    for(const aa of account.aaRequests?.filter(r=>r.workspaceId===task.id)||[])add({kind:'bank_aa',id:aa.id,workspaceId:task.id},aa.status,aa.status==='pending'?'银行AA已发起，等待付款':aa.status==='completed'?'银行AA已收齐':'银行AA已结束');
   }
   const old=state.scenes?.find(s=>s.id===id),orders=structuredClone(old?.orders||[]).filter(o=>links.some(l=>l.kind==='food_order'&&l.id===o.id&&l.workspaceId===o.taskId));
   for(const incoming of input.orders||[]){if(!members.some(t=>t.id===incoming.taskId))continue;const link=links.find(l=>l.kind==='food_order'&&l.id===incoming.id&&l.workspaceId===incoming.taskId);if(!link)throw new Error('订单归属无法核对');const previous=orders.find(o=>o.id===incoming.id&&o.taskId===incoming.taskId);if(previous&&(incoming.checkedAt<previous.checkedAt||rank(incoming.status)<rank(previous.status)))continue;if(previous)Object.assign(previous,incoming);else orders.push(incoming);}
   for(const link of links.filter(l=>l.kind==='food_order')){const observation=orders.find(o=>o.id===link.id&&o.taskId===link.workspaceId);const plan=account.occasions?.find(p=>p.id===link.workspaceId),order=plan?.orders.find(o=>o.orderId===link.id),payment=account.payments?.find(p=>p.id===order?.paymentId);const status=payment?.refundedAt?'REFUNDED':payment&&(!observation||observation.status==='PENDING_PAYMENT')?'PAID':observation?.status||'UNKNOWN';records.push({...link,status,label:labels[status]||'订单状态待核对'});}
   if(!links.some(l=>l.kind!=='message')&&!members.some(t=>['food','occasion','aa','reminder','transfer'].includes(t.kind)||t.sceneId)&&!records.length)continue;
   const errors=input.errors===undefined?old?.error:input.errors.filter(e=>members.some(t=>t.id===e.workspaceId)).map(e=>e.message).join('；')||undefined;
   const business=records.filter(r=>r.kind!=='message');const active=state.runs?.some(r=>['routing','ready','processing'].includes(r.status)&&r.jobs.some(j=>members.some(t=>t.id===j.taskId)));
   const unfinished=business.find(r=>['failed'].includes(r.status));const plan=business.find(r=>r.kind==='occasion');const food=business.find(r=>r.kind==='food_order'&&!['COMPLETED','REFUNDED','CANCELLED'].includes(r.status));const collect=business.find(r=>['collection','bank_aa','schedule'].includes(r.kind)&&['pending','prepared'].includes(r.status));
   if(unfinished)stage='failed';else if(errors||business.some(r=>r.status==='UNKNOWN'))stage='waiting_external';else if(active)stage='processing';else if(food)stage=food.status==='PENDING_PAYMENT'?'waiting_authorization':'waiting_external';else if(collect)stage=collect.status==='prepared'?'waiting_authorization':'waiting_external';else if(plan&&['draft','reserved'].includes(plan.status))stage=business.some(r=>r.kind==='food_order'&&r.status==='COMPLETED')?'waiting_user':'waiting_authorization';else if(business.some(r=>r.kind==='expense_book'&&r.status==='active'))stage='waiting_authorization';else if(members.some(t=>!business.some(r=>r.workspaceId===t.id)&&t.kind!=='general'))stage='waiting_user';else if(business.length)stage=business.every(r=>r.status==='cancelled'||r.status==='CANCELLED')?'cancelled':'completed';else if(members.some(t=>t.progress?.stage==='waiting_authorization'))stage='waiting_authorization';
   const target=food||plan||business.find(r=>r.kind==='expense_book')||business.find(r=>['schedule','transfer','bank_aa'].includes(r.kind))||business.find(r=>r.kind==='calendar')||business.find(r=>r.kind==='food_order');
   if(target){const kind=target.kind==='food_order'?'food':target.kind==='occasion'?'occasion':target.kind==='expense_book'?'expense':target.kind==='calendar'?'calendar':'bank';next={kind,id:target.id,workspaceId:target.workspaceId,...(target.channel?{channel:target.channel}:{}),...(kind==='calendar'?{date:dates.find(d=>d.id===target.id)!.dueAt}:{})};}
   const statusText=business.map(r=>r.label).filter((v,i,a)=>a.indexOf(v)===i).slice(0,4).join('；');let summary=statusText||'交代已保留，等待补充必要信息。';if(errors)summary=`平台结果还需核对：${errors}。原订单和方案已保留。`;else if(stage==='processing')summary='正在后台整理这件事。';else if(stage==='waiting_user'&&plan)summary+='。请确认收到后，再完成筹备安排。';
   const scene:SceneFlow={id,title:root.title,workspaceIds:members.map(t=>t.id),links,records,stage,summary,orders,checkedAt:old?.checkedAt||Date.now(),fingerprint:'',...(errors?{error:errors}:{}),...(next?{next}:{})};scene.fingerprint=sceneFingerprint(scene);if(scene.fingerprint!==old?.fingerprint||JSON.stringify(scene.orders)!==JSON.stringify(old?.orders))scene.checkedAt=Date.now();scenes.push(scene);
  }
  for(const order of input.orders||[])if(!scenes.some(s=>s.links.some(l=>l.kind==='food_order'&&l.workspaceId===order.taskId&&l.id===order.id)))throw new Error('订单归属无法核对');
  if(JSON.stringify(state.scenes||[])===JSON.stringify(scenes))return state;
  return store.change({type:'scene-sync',id:'scene-sync',scenes,revision:state.revision,requestId:randomUUID()});
 }
 return {get:(scope:string)=>reconcile(scope),reconcile};
}
export function sceneMiddleware(directory:string){const service=createSceneService(directory);return async(req:IncomingMessage,res:ServerResponse)=>{
 const send=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
 try{if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});const scope=req.headers['x-zhiyin-expense-scope'];if(typeof scope!=='string')throw new Error('任务空间标识无效');if(req.method==='GET')return send(200,service.get(scope));if(req.method!=='POST')return send(405,{error:'仅支持GET和POST'});if(req.headers['x-zhiyin-scenes']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>65536)return send(413,{error:'观察结果过长'});}return send(200,service.reconcile(scope,JSON.parse(raw)));}catch(e){send(400,{error:e instanceof Error?e.message:'事项状态暂不可用'});}
};}
