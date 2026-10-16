/* Existing-world Operate extension: a compact editable arrangement above a merchant list.
 * Dates separate preparation from delivery; the budget rail shows held, spent and remaining.
 * Users review changes, authorize funds, then inspect the same order in the food app. */
import {useCallback,useEffect,useRef,useState,type SyntheticEvent} from 'react';
import {ArrowLeft,ArrowUpRight,CalendarDays,Gift,LoaderCircle,Plus,Send,ShieldCheck} from 'lucide-react';
import {availableBankFunds,heldOccasionBudget,occasionProducts,occasionQuote,occasionChangeImpact,occasionTotals,occasionRequest,requestOccasionAdvice,validateOccasionDraft,type OccasionDraft,type OccasionPlan} from '../lib/occasion-plans';
import {validBankSnapshot,type BankSnapshot} from '../lib/bank-transfer';
import {formatCny} from '../lib/financial-connections';
import {localTaskTime} from '../lib/task-calendar';
import {occasionFoodRequest} from '../lib/occasion-food-bridge';
import type {SceneContext} from '../lib/scene-context';
import {TaskCardHeader} from './task-card-header';
import './occasion-planner.css';
const blank=():OccasionDraft=>({title:'生日筹备',recipient:'',budget:100000,prepareAt:0,deliverAt:0,address:'',contact:'',note:'',productIds:['cake-light','flowers-roses']});
const labels={draft:'待确认预算',reserved:'筹备中',cancelled:'已取消',completed:'已完成'};
const date=(time:number)=>time?new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'待补充';
type Props={stewardName:string;sceneContext?:SceneContext;initialPrompt?:string;initialPlanId?:string;getMemoryContext?:(prompt:string)=>Promise<string>;onOpenCalendar?:(date:number)=>void;embedded?:boolean;conversation?:boolean;injectedPrompt?:{token:string;text:string};initialHistory?:Array<{role:'user'|'assistant';content:string}>;onRoutePrompt?:(text:string)=>Promise<void>;externalBusy?:boolean;onConversationTurn?:(user:string,answer:string,failed:boolean)=>Promise<void>};
export function OccasionPlanner({stewardName,sceneContext,initialPrompt='',initialPlanId='',getMemoryContext,onOpenCalendar,embedded=false,conversation=false,injectedPrompt,initialHistory,onRoutePrompt,externalBusy=false,onConversationTurn}:Props){
 const [state,setState]=useState<BankSnapshot|null>(null),[selected,setSelected]=useState<string|null>(null),[draft,setDraft]=useState<OccasionDraft>(blank),[editing,setEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[prompt,setPrompt]=useState('');
 const [advice,setAdvice]=useState(''),[options,setOptions]=useState<string[]>([]),[confirm,setConfirm]=useState<'reserve'|'cancel'|'complete'|'amend'|null>(null);
 const [foodOrders,setFoodOrders]=useState<Record<string,string>>({});
 const [catalogOpen,setCatalogOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
 const [editStep,setEditStep]=useState<'recipient'|'budget'|'time'|'shipping'|null>(null);
 const [ready,setReady]=useState(false);
 const consumed=useRef('');
 const confirmationRevision=useRef<number>(-1),confirmationDraft=useRef<OccasionDraft|null>(null);
 const id=useRef(initialPlanId||crypto.randomUUID()),lock=useRef(false),started=useRef(false),turns=useRef<Array<{role:'user'|'assistant';content:string}>>([]);
 const plan=state?.occasions?.find(p=>p.id===selected),totals=plan&&state?occasionTotals(plan,state):null;
 const locked=plan?.status==='cancelled'||plan?.status==='completed';
 const impact=plan&&state?occasionChangeImpact(plan,draft,state):null;
 const dirty=plan?JSON.stringify(draft)!==JSON.stringify({title:plan.title,recipient:plan.recipient,budget:plan.budget,prepareAt:plan.prepareAt,deliverAt:plan.deliverAt,address:plan.address,contact:plan.contact,note:plan.note,productIds:plan.productIds}):true;
 const accept=useCallback((value:BankSnapshot)=>{if(!validBankSnapshot(value))throw new Error('账户数据无法核对，请重试');setState(prev=>!prev||value.revision>=prev.revision?value:prev);return value;},[]);
 const refresh=useCallback(async()=>{try{accept(await occasionRequest());setError('');}catch(e){setError(e instanceof Error?e.message:'加载失败，请重试');}},[accept]);
 function select(p:OccasionPlan){id.current=p.id;setSelected(p.id);setDraft({title:p.title,recipient:p.recipient,budget:p.budget,prepareAt:p.prepareAt,deliverAt:p.deliverAt,address:p.address,contact:p.contact,note:p.note,productIds:[...p.productIds]});setEditing(true);setEditStep(null);setCatalogOpen(false);setConfirm(null);setAdvice('');setOptions([]);turns.current=[];setError('');}
 function create(){id.current=crypto.randomUUID();setSelected(null);setDraft(blank());setEditing(true);setEditStep(null);setCatalogOpen(false);setAdvice('');setError('');setConfirm(null);turns.current=[];}
 useEffect(()=>{void refresh();const run=()=>void refresh();window.addEventListener('zhiyin-phone-foreground',run);window.addEventListener('zhiyin-bank-updated',run);return()=>{window.removeEventListener('zhiyin-phone-foreground',run);window.removeEventListener('zhiyin-bank-updated',run);};},[refresh]);
 const advise=useCallback(async(text:string,current=draft)=>{if(!text.trim()||lock.current)return;lock.current=true;setBusy(true);setError('');setPrompt(text);
  let answer='',failed=false;
  try{const memory=getMemoryContext?await getMemoryContext(text):'';const result=await requestOccasionAdvice(text,current,memory,turns.current,sceneContext);answer=result.text;setAdvice(result.text);setOptions(result.questions??[]);
   const currentPlan=current as Partial<OccasionPlan>;
   const cannotEdit=locked||currentPlan.status==='cancelled'||currentPlan.status==='completed';
   if(result.patch&&Object.keys(result.patch).length&&!cannotEdit){setDraft(d=>({...d,...result.patch}));setConfirm(null);}
   if(cannotEdit&&result.patch&&Object.keys(result.patch).length){answer=result.text+' 当前安排已结束，需要重新安排。';setAdvice(answer);}
   if(conversation&&result.questions?.length)answer=[answer,...result.questions.filter(question=>!answer.includes(question))].join('\n');
   turns.current=[...turns.current,{role:'user' as const,content:text},{role:'assistant' as const,content:result.text}].slice(-8);setPrompt('');
  }catch(e){answer=e instanceof Error?e.message:'暂时无法整理，请重试';failed=true;setError(answer);}finally{try{await onConversationTurn?.(text,answer,failed);}finally{lock.current=false;setBusy(false);}}
 },[draft,getMemoryContext,locked,onConversationTurn,conversation,sceneContext]);
 useEffect(()=>{if(!state||started.current)return;started.current=true;const existing=state.occasions?.find(p=>p.id===initialPlanId);if(existing){select(existing);if(initialPrompt)void advise(initialPrompt,existing);}else if(initialPrompt){setEditing(true);void advise(initialPrompt,blank());}else if(embedded){setEditing(true);}
  if(initialPlanId&&!initialPrompt&&!['cancelled','completed'].includes(existing?.status??''))try{const stored=JSON.parse(sessionStorage.getItem(`zhiyin-occasion-draft:${initialPlanId}`)||'null');const cached=stored?.draft;const defaults=blank();if(stored?.planUpdatedAt===(existing?.updatedAt??null)&&cached&&Object.entries(defaults).every(([key,value])=>Array.isArray(value)?Array.isArray(cached[key])&&cached[key].every((id:string)=>occasionProducts.some(p=>p.id===id)):typeof cached[key]===typeof value&&(typeof value!=='number'||Number.isFinite(cached[key]))))setDraft(cached);}catch{/* A damaged draft must not replace verified account data. */}
  if(initialHistory)turns.current=initialHistory.slice(-8);
  setReady(true);
 },[state,initialPlanId,initialPrompt,advise,embedded,initialHistory]);
 useEffect(()=>{if(initialPlanId&&ready)try{sessionStorage.setItem(`zhiyin-occasion-draft:${initialPlanId}`,JSON.stringify({draft,planUpdatedAt:plan?.updatedAt??null}));}catch{/* Storage may be unavailable; explicit server saves remain usable. */}},[draft,initialPlanId,ready,plan?.updatedAt]);
 const adviseRef=useRef(advise);adviseRef.current=advise;
 useEffect(()=>{if(ready&&injectedPrompt&&consumed.current!==injectedPrompt.token){consumed.current=injectedPrompt.token;void adviseRef.current(injectedPrompt.text);}},[ready,injectedPrompt]);
 async function change(body:object){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const next=accept(await occasionRequest(body));setConfirm(null);const p=next.occasions?.find(x=>x.id===id.current);if(p)select(p);return next;}catch(e){setError(e instanceof Error?e.message:'保存失败，请刷新后重试');try{accept(await occasionRequest());}catch{/* Keep the form for retry. */}}finally{lock.current=false;setBusy(false);}}
 function askConfirmation(kind:'reserve'|'cancel'|'complete'|'amend'){if(!state)return;confirmationRevision.current=state.revision;confirmationDraft.current=kind==='amend'?structuredClone(draft):null;setConfirm(kind);}
 useEffect(()=>{if(confirm&&state&&state.revision!==confirmationRevision.current){setConfirm(null);setError('安排或账户已变化，请重新核对本次变更。');}},[confirm,state]);
 async function save(){if(!state)return;try{validateOccasionDraft(draft,Date.now());if(plan?.status==='reserved'){if(impact?.blockedOrders.length)throw new Error(impact.blockedOrders[0].reason);askConfirmation('amend');return;}await change({type:'save-occasion',id:id.current,revision:state.revision,draft});}catch(e){setError(e instanceof Error?e.message:'请核对安排');}}
 async function food(productId:string){if(!plan||lock.current)return;lock.current=true;setBusy(true);setError('');try{await occasionFoodRequest('prepare',{planId:plan.id,productId});accept(await occasionRequest());}catch(e){setError(e instanceof Error?e.message:'订单未能准备，请重试');}finally{lock.current=false;setBusy(false);}}
 async function records(){if(!plan||lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await occasionFoodRequest('records',{planId:plan.id});setFoodOrders(Object.fromEntries((result.orders??[]).map(o=>[o.id,o.status])));accept(await occasionRequest());}catch(e){setError(e instanceof Error?e.message:'订单状态未能读取');}finally{lock.current=false;setBusy(false);}}
 async function openOrder(orderId:string){try{await occasionFoodRequest('open',{planId:plan!.id,orderId});}catch(e){setError(e instanceof Error?e.message:'无法打开订单');}}
 const update=(patch:Partial<OccasionDraft>)=>{setDraft(d=>({...d,...patch}));setConfirm(null);};
 const missing=!draft.recipient?'recipient':!draft.deliverAt||!draft.prepareAt?'time':!draft.address||!draft.contact?'shipping':null;
 const step=editStep||missing;
 const orderLabels:Record<string,string>={PENDING_PAYMENT:'待付款',ACCEPTED:'商家已接单',PREPARING:'准备中',READY_FOR_DELIVERY:'待配送',DELIVERY_ASSIGNED:'已分配骑手',DELIVERING:'配送中',COMPLETED:'已送达',REFUNDED:'已退款',CANCELLED:'已取消'};
 const nextDecision=!locked&&step&&<section className="occasion-next-decision" aria-label="下一步需要确认"><h3>{step==='recipient'?'这次为谁准备？':step==='time'?'希望什么时候送达？':step==='shipping'?'最后补一下收货信息': '预算想调整到多少？'}</h3>
    {step==='recipient'&&<><div className="occasion-options">{['爱人','家人','朋友'].map(name=><button disabled={busy} key={name} onClick={()=>{update({recipient:name,title:`${name}生日`});setEditStep(null);}}>{name}</button>)}</div><label>准备对象<input disabled={busy} maxLength={60} value={draft.recipient} onChange={e=>update({recipient:e.target.value})} placeholder="也可以直接说姓名或关系"/></label></>}
    {step==='budget'&&<><div className="occasion-options">{[50000,100000,150000].map(amount=><button disabled={busy} key={amount} onClick={()=>{update({budget:amount});setEditStep(null);}}>{formatCny(amount)}</button>)}</div><label>调整预算（元）<input disabled={busy} type="number" min="0.01" max="50000" step="0.01" value={draft.budget/100} onChange={e=>update({budget:Math.round(Number(e.target.value)*100)})}/></label></>}
    {step==='time'&&<><p>送达时间和开始筹备分开安排；也可以直接告诉我日期。</p><div className="occasion-decision-fields"><label>送达时间<input disabled={busy} type="datetime-local" value={draft.deliverAt?localTaskTime(draft.deliverAt):''} onChange={e=>update({deliverAt:Date.parse(e.target.value+':00+08:00')||0})}/></label><label>筹备时间<input disabled={busy} type="datetime-local" value={draft.prepareAt?localTaskTime(draft.prepareAt):''} onChange={e=>update({prepareAt:Date.parse(e.target.value+':00+08:00')||0})}/></label></div></>}
    {step==='shipping'&&<><p>地址和电话目前未知，填写或直接告诉我，不会自行猜测。</p><div className="occasion-decision-fields"><label>送到哪里<input disabled={busy} maxLength={200} value={draft.address} onChange={e=>update({address:e.target.value})}/></label><label>收货人和电话<input disabled={busy} maxLength={80} value={draft.contact} onChange={e=>update({contact:e.target.value})}/></label></div></>}
    {editStep&&<button disabled={busy} onClick={()=>setEditStep(null)}>调整好了</button>}
   </section>;
 const Review=conversation?'details':'div';
 const allDelivered=!!plan&&plan.orders.filter(order=>plan.productIds.includes(order.productId)).length===plan.productIds.length&&plan.orders.filter(order=>plan.productIds.includes(order.productId)).every(order=>foodOrders[order.orderId]==='COMPLETED');
 const needsOrder=plan?.status==='reserved'&&plan.productIds.some(productId=>!plan.orders.some(order=>order.productId===productId));
 const phase=error?'需要重新核对':locked?labels[plan.status]:busy?'正在处理':confirm?'等待授权':missing?'待补充信息':dirty?'待核对方案':plan?.status==='draft'?'待确认预算':allDelivered?'待确认收货':'筹备中';
 const canSave=!locked&&(!plan||dirty&&plan.status!=='reserved');
 return <section className={`occasion-planner ${embedded?'occasion-embedded':''}`} aria-label="生活筹备">
  {!embedded&&<div className="occasion-toolbar">{editing?<button disabled={busy} onClick={()=>{setEditing(false);setConfirm(null);}}><ArrowLeft size={18}/>所有安排</button>:<p>把重要的日子，提前安排好。</p>}<button disabled={busy||!state} onClick={create}><Plus size={18}/>新建安排</button></div>}
  {error&&<div className="occasion-error" role="alert">{error}<button disabled={busy} onClick={()=>void refresh()}>刷新账户</button></div>}
  {!state&&!error&&<p role="status">正在读取安排…</p>}
  {!editing&&state&&<><div className="occasion-list">{[...(state.occasions??[])].reverse().map(p=><button key={p.id} onClick={()=>select(p)}><Gift size={22}/><span><strong>{p.title}</strong><small>{p.recipient} · {date(p.deliverAt)}送达</small></span><span>{labels[p.status]}<ArrowUpRight size={17}/></span></button>)}</div>{!state.occasions?.length&&<div className="occasion-empty"><Gift size={34}/><h2>下一件想交给{stewardName}的事</h2><p>生日、纪念日，先说你的想法。预算与订单都可以慢慢核对。</p><button className="occasion-primary" onClick={create}>准备一个生日</button></div>}</>}
  {editing&&<>
   <TaskCardHeader title={plan?.title||(draft.title!=='生日筹备'?draft.title:draft.recipient?`${draft.recipient}的生日筹备`:'准备一个重要的日子')} icon={<Gift size={18}/>} status={phase} tone={error?'warning':plan?.status==='completed'?'success':locked?'neutral':'attention'}/>
   {conversation&&<div className="occasion-conversation-summary"><p><strong>{draft.recipient||'对象待确认'}</strong><span>预算 {formatCny(draft.budget)}</span></p><p>{occasionProducts.filter(p=>draft.productIds.includes(p.id)).map(p=>p.name).join(' + ')||'商品待选择'} · 合计 {formatCny(occasionQuote(draft))}</p><small>{plan?labels[plan.status]:missing==='recipient'?'还需要确认准备对象':missing==='time'?'送达与筹备时间待补充':missing==='shipping'?'收货信息待补充':'方案待核对，尚未预留或付款'}</small></div>}
   {plan?.status==='reserved'&&dirty&&impact&&<section className="occasion-amendment" aria-label="本次变更">
    <div className="occasion-section-heading"><h3>本次变更</h3><span>待你确认</span></div>
    <ul>{impact.changes.map(item=><li key={item.field}><span>{item.label}</span><span>{item.field==='budget'?formatCny(Number(item.before)):item.field==='prepareAt'||item.field==='deliverAt'?date(Number(item.before)):String(item.before)||'未填写'} → {item.field==='budget'?formatCny(Number(item.after)):item.field==='prepareAt'||item.field==='deliverAt'?date(Number(item.after)):String(item.after)||'未填写'}</span></li>)}
     {impact.removedProductIds.map(productId=><li key={`remove-${productId}`}><span>移除商品</span><span>{occasionProducts.find(product=>product.id===productId)?.name}</span></li>)}
     {impact.addedProductIds.map(productId=><li key={`add-${productId}`}><span>添加商品</span><span>{occasionProducts.find(product=>product.id===productId)?.name}</span></li>)}
    </ul>
    <p>已付 {formatCny(impact.spent)} 保留，剩余预留由 {formatCny(impact.beforeHeld)} 调整为 <strong>{formatCny(impact.afterHeld)}</strong>。</p>
    {!!impact.keptOrders.length&&<p>{impact.keptOrders.length} 笔原订单保留，商品与付款金额不变。</p>}
    {!!impact.blockedOrders.length&&<div className="occasion-amendment-blocked"><p>这项变更涉及原订单，处理并核对退款后才能应用。这里只修改草案，不会修改已下单内容。</p>{impact.blockedOrders.map(({order,reason})=><div key={order.orderId}><p>{occasionProducts.find(product=>product.id===order.productId)?.name}：{reason}</p><button type="button" disabled={busy} onClick={()=>void openOrder(order.orderId)}>处理原订单 · {occasionProducts.find(product=>product.id===order.productId)?.name}<ArrowUpRight size={15}/></button></div>)}</div>}
    <div className="occasion-actions"><button type="button" className={confirm==='amend'?undefined:'occasion-primary'} disabled={busy||!!missing||!!impact.blockedOrders.length} onClick={()=>void save()}>核对本次变更</button><button type="button" disabled={busy} onClick={()=>select(plan)}>放弃本次修改</button></div>
    {confirm==='amend'&&<div className="occasion-confirm" role="region" aria-label="确认本次变更"><strong>确认调整这份安排？</strong><p>按以上差异保存，重新核对其他预约与预留。已付款原单不会重复扣款，日历中的生日日期不变。</p><button type="button" className="occasion-primary" disabled={busy} onClick={()=>void change({type:'save-occasion',id:plan.id,revision:confirmationRevision.current,draft:confirmationDraft.current,authorized:true})}>确认变更并调整预留</button><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>返回核对</button></div>}
   </section>}
   {conversation&&nextDecision}
   {conversation&&canSave&&<button type="button" className="occasion-primary occasion-next-action" disabled={busy||!!missing} onClick={()=>void save()}>{busy?'正在处理…':plan?'保存修改':'保存筹备方案'}</button>}
   {conversation&&needsOrder&&!dirty&&!confirm&&!reviewOpen&&<button type="button" className="occasion-primary occasion-next-action" onClick={()=>setReviewOpen(true)}>核对商品与订单<ArrowUpRight size={16}/></button>}
   <Review className="occasion-review" {...(conversation?{open:reviewOpen,onToggle:(event:SyntheticEvent<HTMLElement>)=>setReviewOpen((event.currentTarget as HTMLDetailsElement).open)}:{})}>
   {conversation&&<summary>查看完整方案<span>安排、商品与订单</span></summary>}
   {!conversation&&<form className="occasion-talk" onSubmit={e=>{e.preventDefault();if(onRoutePrompt){const text=prompt;void onRoutePrompt(text).then(()=>setPrompt('')).catch(e=>setError(e instanceof Error?e.message:'暂时未能整理，请重试'));}else void advise(prompt);}}><label htmlFor="occasion-prompt">交给{stewardName}整理</label><div><input id="occasion-prompt" maxLength={2000} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="说你的想法，或直接说哪里要改…"/><button className="occasion-primary" disabled={busy||externalBusy||!prompt.trim()} aria-label="整理筹备需求">{busy||externalBusy?<LoaderCircle className="occasion-spin" size={18}/>:<Send size={18}/>}</button></div></form>}
   {!conversation&&advice&&<div className="occasion-advice" aria-live="polite"><p>{advice}</p>{!!options.length&&<div className="occasion-questions">{options.map(o=><p key={o}>{o}</p>)}</div>}</div>}
   <div className="occasion-plan-overview" aria-label="当前筹备方案">
    {!plan&&<p className="occasion-plan-note">商品为初始建议，保存前可以调整。</p>}
    <div className="occasion-plan-facts">{([['recipient','准备对象',draft.recipient||'待确认'],['budget','预算',formatCny(draft.budget)],['time','送达时间',date(draft.deliverAt)],['shipping','收货信息',draft.address||'待补充']] as const).map(([key,label,value])=><button key={key} disabled={busy||locked} aria-label={`修改${label}`} onClick={()=>setEditStep(key)}><small>{label}</small><strong>{value}</strong></button>)}</div>
   </div>
   {!conversation&&nextDecision}
   <form className="occasion-details" noValidate onSubmit={e=>{e.preventDefault();void save();}}>
    <details className="occasion-arrangement"><summary><strong>手动编辑</strong><span>完整信息与偏好，按需展开</span></summary>
    <fieldset disabled={busy||locked}><legend>筹备安排</legend><div className="occasion-fields"><label>安排名称<input required maxLength={60} value={draft.title} onChange={e=>update({title:e.target.value})}/></label><label>为谁准备<input required maxLength={60} value={draft.recipient} onChange={e=>update({recipient:e.target.value})} placeholder="例如：爱人"/></label><label>预算（元）<input required type="number" min="0.01" max="50000" step="0.01" value={draft.budget/100||''} onChange={e=>update({budget:Math.round(Number(e.target.value)*100)})}/></label><label>开始筹备（北京时间）<input required type="datetime-local" value={draft.prepareAt?localTaskTime(draft.prepareAt):''} onChange={e=>update({prepareAt:Date.parse(e.target.value+':00+08:00')||0})}/></label><label>希望送达（北京时间）<input required type="datetime-local" value={draft.deliverAt?localTaskTime(draft.deliverAt):''} onChange={e=>update({deliverAt:Date.parse(e.target.value+':00+08:00')||0})}/></label><label>收货地址<input required maxLength={200} value={draft.address} onChange={e=>update({address:e.target.value})}/></label><label>联系人与电话<input required maxLength={80} value={draft.contact} onChange={e=>update({contact:e.target.value})}/></label><label>偏好与祝福<input maxLength={500} value={draft.note} onChange={e=>update({note:e.target.value})} placeholder="口味、过敏信息、祝福卡内容等"/></label></div></fieldset>
    </details>
    <div className="occasion-section-heading"><h3>商品组合</h3>{!locked?<button type="button" onClick={()=>setCatalogOpen(v=>!v)}>{catalogOpen?'收起商品目录':'调整商品'}</button>:<span>好食送 · 沙箱商品目录</span>}</div>
    <div className={!catalogOpen?'occasion-selected-only':''}>
    <div className="occasion-products">{occasionProducts.map(p=>{const checked=draft.productIds.includes(p.id),link=plan?.orders.find(o=>o.productId===p.id),receipt=state?.payments?.find(r=>r.id===link?.paymentId);return <article key={p.id}><label><input type="checkbox" disabled={busy||locked} checked={checked} onChange={()=>update({productIds:checked?draft.productIds.filter(id=>id!==p.id):[...draft.productIds,p.id]})}/><span><strong>{p.name}</strong><small>{p.description}</small><small>配送 {formatCny(p.deliveryFee)}</small></span><b>{formatCny(p.price)}</b></label>{checked&&plan?.status==='reserved'&&!dirty&&<div className="occasion-product-action"><span>{receipt?.refundedAt?'已退款':foodOrders[link?.orderId??'']?orderLabels[foodOrders[link!.orderId]]||foodOrders[link!.orderId]:receipt?'已付款 · 配送待核对':link?'待付款':'未准备订单'}</span>{link?<button type="button" disabled={busy} onClick={()=>void openOrder(link.orderId)}>查看外卖订单<ArrowUpRight size={15}/></button>:<button type="button" className={p.id===draft.productIds.find(productId=>!plan.orders.some(order=>order.productId===productId))&&!confirm?'occasion-primary':undefined} disabled={busy} onClick={()=>void food(p.id)}>准备订单并去外卖<ArrowUpRight size={15}/></button>}</div>}{checked&&plan&&['cancelled','completed'].includes(plan.status)&&link&&<button type="button" onClick={()=>void openOrder(link.orderId)}>查看原订单<ArrowUpRight size={15}/></button>}</article>;})}</div>
    </div>
    <div className="occasion-quote"><span>商品与配送合计</span><strong>{formatCny(occasionQuote(draft))}</strong><small>{draft.budget>=occasionQuote(draft)?`预算内还余 ${formatCny(draft.budget-occasionQuote(draft))}`:'超出预算，请调整商品或预算'}</small></div>
    {!conversation&&canSave&&<button className="occasion-primary" disabled={busy||!!missing}>{busy?'正在处理…':plan?'保存修改':'保存筹备方案'}</button>}
   </form>
   {plan?.orders.some(order=>!plan.productIds.includes(order.productId))&&<details className="occasion-order-history"><summary>查看已移除商品的原订单</summary>{plan.orders.filter(order=>!plan.productIds.includes(order.productId)).map(order=><p key={order.orderId}><span>{occasionProducts.find(product=>product.id===order.productId)?.name} · 已退款</span><button type="button" disabled={busy} onClick={()=>void openOrder(order.orderId)}>查看原订单<ArrowUpRight size={15}/></button></p>)}</details>}
   </Review>
   {plan&&state&&<section className="occasion-budget" aria-label="预算与执行"><div className="occasion-section-heading"><h3>资金安排</h3><span>{plan.status==='reserved'?'预算已预留':plan.status==='draft'?'尚未预留资金':plan.status==='cancelled'?'未用预算已释放':'安排已完成，余款已释放'}</span></div><dl><div><dt>预算</dt><dd>{formatCny(plan.budget)}</dd></div><div><dt>实际支出</dt><dd>{formatCny(totals!.spent)}</dd></div><div><dt>仍在预留</dt><dd>{formatCny(totals!.held)}</dd></div></dl><p>常用卡8888 · 可用 {formatCny(availableBankFunds(state))} · 全部安排预留 {formatCny(heldOccasionBudget(state))}</p>
    {plan.status==='draft'&&!dirty&&!confirm&&<button className="occasion-primary" disabled={busy||dirty} onClick={()=>askConfirmation('reserve')}><ShieldCheck size={17}/>预留这笔预算</button>}
    {plan.status==='reserved'&&<><p><CalendarDays size={16}/>{date(plan.prepareAt)}开始筹备，{date(plan.deliverAt)}送达。{plan.prepareAt<=Date.now()?'已到筹备时间，可以核对订单。':'也可以提前准备订单。'}</p><div className="occasion-actions">{onOpenCalendar&&<button onClick={()=>onOpenCalendar(plan.prepareAt)}>在日历查看</button>}<button className={!needsOrder&&!allDelivered&&!dirty&&!confirm?'occasion-primary':undefined} disabled={busy} onClick={()=>void records()}>核对订单状态</button><button className={allDelivered&&!dirty&&!confirm?'occasion-primary':undefined} disabled={busy||dirty||!allDelivered} onClick={()=>askConfirmation('complete')}>确认已收到，完成安排</button></div></>}
    {['draft','reserved'].includes(plan.status)&&<button className="occasion-danger" disabled={busy} onClick={()=>askConfirmation('cancel')}>取消安排</button>}
    {confirm&&confirm!=='amend'&&<div className="occasion-confirm" role="region" aria-label="确认资金安排"><strong>{confirm==='reserve'?'确认预留这笔资金？':confirm==='cancel'?'取消本次筹备？':'确认完成安排？'}</strong><p>{confirm==='reserve'?`预留 ${formatCny(plan.budget)} 后，其他付款不能使用这笔预算。银行卡总余额不会减少，实际支付时才扣款。`:confirm==='cancel'?'释放尚未使用的预算。已付款订单不会自动退款，请在外卖订单中单独处理；未付款订单将无法继续使用这笔预算。':'请确认商品已收到，完成后释放剩余预算。'}</p><button className="occasion-primary" disabled={busy} onClick={()=>void change({type:confirm==='reserve'?'reserve-occasion':confirm==='cancel'?'cancel-occasion':'complete-occasion',id:plan.id,revision:confirmationRevision.current,authorized:true})}>{confirm==='reserve'?`确认预留 ${formatCny(plan.budget)}`:confirm==='cancel'?'确认取消并释放余款':'确认完成并释放余款'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>返回核对</button></div>}
   </section>}
  </>}
 </section>;
}
