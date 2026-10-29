import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUpRight,CalendarClock,Check,ChevronRight,RefreshCw,Send,Wallet} from 'lucide-react';
import {type MerchantState} from '../lib/merchant';
import {fundingProjection,validFundingDate,type FundingDraft,type FundingOperation,type FundingPlan} from '../lib/merchant-funding';
import {hasPendingMerchantOperation,merchantRequest,recoverMerchantOperation} from '../lib/merchant-service';
import './merchant-funding.css';
const money=(amount:number)=>`¥${(amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const dateTime=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,16);
const stamp=(at:number)=>new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const amountValue=(text:string)=>/^\d+(?:\.\d{1,2})?$/.test(text)&&Number(text)<=1000000?Math.round(Number(text)*100):null;
function applied(state:MerchantState,draft?:FundingDraft|null) {
 if(!draft||state.revision<=draft.revision)return false;
 const p=state.funding?.plans.find(p=>p.id===draft.planId);
 if(draft.intent==='cash')return state.funding?.cash?.amount===draft.amount;
 if(draft.intent==='plan')return !!p&&p.amount===draft.amount&&p.title===draft.title&&p.dueDate===draft.dueDate;
 return draft.intent==='paid'?p?.status==='paid':draft.intent==='cancel'?p?.status==='cancelled':false;
}
export function MerchantFundingPanel({draft:proposal,active=true,stewardName='宁宁',onAsk}:{draft?:FundingDraft;active?:boolean;stewardName?:string;onAsk?:(text:string)=>void}) {
 const [state,setState]=useState<MerchantState|null>(null),[draft,setDraft]=useState<FundingDraft|null>(proposal??null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState(hasPendingMerchantOperation);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[question,setQuestion]=useState('');
 const [title,setTitle]=useState(proposal?.title??''),[amount,setAmount]=useState(proposal?.amount!==undefined?String(proposal.amount/100):''),[dueDate,setDueDate]=useState(proposal?.dueDate??'');
 const [category,setCategory]=useState(proposal?.category??'其他'),[paymentMode,setPaymentMode]=useState(''),[expenseId,setExpenseId]=useState(''),[paidAt,setPaidAt]=useState(dateTime);
 const mounted=useRef(false),lock=useRef(false),epoch=useRef(0),formRef=useRef<HTMLFormElement>(null);
 const load=useCallback(async()=>{
  if(lock.current)return;
  const request=++epoch.current;setLoading(true);
  try{const next=await merchantRequest();if(mounted.current&&request===epoch.current){setState(next);setError('');setPending(hasPendingMerchantOperation());}}
  catch(cause){if(mounted.current&&request===epoch.current)setError(cause instanceof Error?cause.message:'资金安排暂时无法读取');}
  finally{if(mounted.current&&request===epoch.current)setLoading(false);}
 },[]);
 useEffect(()=>{
  mounted.current=true;++epoch.current;
  if(!active){setLoading(false);return()=>{mounted.current=false;};}
  void load();const refresh=()=>{if(document.visibilityState!=='hidden')void load();};
  window.addEventListener('zhiyin-merchant-updated',refresh);window.addEventListener('zhiyin-phone-foreground',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{mounted.current=false;window.removeEventListener('zhiyin-merchant-updated',refresh);window.removeEventListener('zhiyin-phone-foreground',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[active,load]);
 const edit=(next:FundingDraft)=>{
  setDraft(next);setTitle(next.title??'');setAmount(next.amount!==undefined?String(next.amount/100):'');setDueDate(next.dueDate??'');setCategory(next.category??'其他');setPaymentMode('');setExpenseId('');setPaidAt(dateTime());setNotice('');setError('');
  requestAnimationFrame(()=>{formRef.current?.scrollIntoView?.({block:'nearest',behavior:'auto'});formRef.current?.querySelector<HTMLElement>('input,select,button')?.focus({preventScroll:true});});
 };
 async function save(operation?:FundingOperation,recover=false){
  if(lock.current||!state||!active||!recover&&(hasPendingMerchantOperation()||draft?.revision!==state.revision))return;
  lock.current=true;++epoch.current;setBusy(true);setLoading(false);setError('');setNotice('');
  try{
   const next=recover?await recoverMerchantOperation():await merchantRequest(operation,state.revision);
   if(mounted.current){setState(next);setDraft(null);setNotice(recover?'上次记录结果已核对，请查看当前安排。':operation?.type==='pay-funding-plan'?'已登记为已支付，经营账本已同步。':operation?.type==='cancel-funding-plan'?'安排已取消，预算预留已释放。':operation?.type==='set-funding-cash'?'可用余额已确认，资金测算已更新。':'安排已保存，尚未付款。');}
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'没有完成保存，编辑已保留');}
  finally{lock.current=false;if(mounted.current){setBusy(false);setPending(hasPendingMerchantOperation());}}
 }
 const p=state?fundingProjection(state):null;
 const current=state?.funding?.plans.find(p=>p.id===draft?.planId);
 const done=!!state&&applied(state,draft);
 const ended=!!current&&current.status!=='planned';
 const stale=!!state&&!!draft&&draft.revision!==state.revision;
 const value=amountValue(amount);
 const paymentDate=Date.parse(`${paidAt}:00+08:00`);
 const validPayment=paymentMode==='existing'?!!expenseId:paymentMode==='new'&&Number.isFinite(paymentDate)&&paymentDate<=Date.now();
 const invalid=draft?.intent==='cash'?value===null:draft?.intent==='plan'?value===null||value<=0||!title.trim()||!validFundingDate(dueDate):draft?.intent==='paid'?!validPayment:false;
 const disabled=busy||loading||pending||stale||ended||invalid;
 const selection=(plan:FundingPlan,intent:FundingDraft['intent'])=>edit({intent,revision:state!.revision,planId:plan.id,title:plan.title,category:plan.category,amount:plan.amount,dueDate:plan.dueDate});
 function submit(event:FormEvent){
  event.preventDefault();if(disabled||!draft||value===null&&['cash','plan'].includes(draft.intent))return;
  if(draft.intent==='cash')void save({type:'set-funding-cash',amount:value!});
  if(draft.intent==='plan')void save({type:'save-funding-plan',id:draft.planId!,title:title.trim(),category,amount:value!,dueDate});
  if(draft.intent==='cancel')void save({type:'cancel-funding-plan',id:draft.planId!});
  if(draft.intent==='paid')void save({type:'pay-funding-plan',id:draft.planId!,...(paymentMode==='existing'?{expenseId}:{occurredAt:paymentDate})});
 }
 if(!active)return <details className="merchant-funding funding-archive"><summary>历史资金方案{proposal?.title?` · ${proposal.title}`:''}</summary><p>{proposal?.amount!==undefined?money(proposal.amount):'金额待确认'}{proposal?.dueDate?` · ${proposal.dueDate}`:''}</p><small>后续方案已有更新，请以最近的安排和小店账本为准。</small></details>;
 return <section className="merchant-funding" aria-label="小店资金安排" aria-busy={loading||busy}>
  <header className="funding-heading"><span><Wallet size={20} aria-hidden="true"/><strong>经营资金安排</strong></span><button aria-label="刷新资金安排" onClick={()=>void load()} disabled={busy||loading}><RefreshCw size={17}/></button></header>
  {error&&<div className="funding-alert" role="alert"><p>{error}</p><button onClick={()=>void load()} disabled={busy||loading}>重新读取</button></div>}
  {notice&&<p className="funding-success" role="status"><Check size={16} aria-hidden="true"/>{notice}</p>}
  {pending&&<div className="funding-alert"><p>上次保存结果待核对，先恢复原请求，避免重复记账。</p><button disabled={busy} onClick={()=>void save(undefined,true)}>核对上次记录</button></div>}
  {!state&&loading&&<p role="status">正在读取资金安排…</p>}
  {state&&!state.shop&&<p>先在“我的小店”创建店铺，再安排经营资金。</p>}
  {state?.shop&&p&&<>
   <div className="funding-balance"><div><span>可用资金</span><strong>{p.available===null?'待确认':money(p.available)}</strong></div><button disabled={busy||pending} onClick={()=>edit({intent:'cash',revision:state.revision,...(p.available!==null&&p.available>=0?{amount:p.available}:{})})}>{p.available===null?'确认余额':'核对余额'}<ChevronRight size={15} aria-hidden="true"/></button></div>
   <dl className="funding-totals"><div><dt>计划支出</dt><dd>{money(p.required)}</dd></div><div data-warning={!!p.shortfall}><dt>{p.shortfall?'资金缺口':'安排后可用'}</dt><dd>{p.shortfall===null?'待测算':money(p.shortfall||p.free||0)}</dd></div></dl>
   {p.rows.length>0&&p.available!==null&&<div className="funding-coverage" aria-label={`计划支出${money(p.required)}，可用资金${money(p.available)}`}><span style={{width:`${Math.min(100,Math.max(0,p.available)/Math.max(1,p.required)*100)}%`}}/></div>}
   {p.firstShortfall&&<p className="funding-gap"><CalendarClock size={17} aria-hidden="true"/>{p.firstShortfall} 起资金不足，尚缺 {money(p.shortfall!)}。请调整金额、日期或补充资金来源。</p>}
   {draft&&draft.intent!=='overview'&&!done&&<form className="funding-editor" ref={formRef} onSubmit={submit}>
    <h4>{draft.intent==='cash'?'核对可用余额':draft.intent==='paid'?'登记实际付款':draft.intent==='cancel'?'取消这笔安排':current?'调整这笔安排':'核对这笔安排'}</h4>
    {stale&&<div className="funding-alert"><p>小店记录有变化，请对照最新余额和安排重新核对。{current&&`原记录：${current.title} ${money(current.amount)}，${current.dueDate}。`}</p><button type="button" disabled={busy||loading||ended} onClick={()=>setDraft({...draft,revision:state.revision})}>已核对最新记录</button></div>}
    {ended&&<p className="funding-alert">原安排已{current.status==='paid'?'支付':'取消'}，不能再次执行。</p>}
    {(draft.intent==='cash'||draft.intent==='plan')&&<fieldset disabled={busy||pending||ended}>
     {draft.intent==='plan'&&<label>支出事项<input aria-label="支出事项" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} placeholder="房租、采购或其他安排" required/></label>}
     <div className="funding-fields"><label>{draft.intent==='cash'?'当前余额（元）':'安排金额（元）'}<input aria-label={draft.intent==='cash'?'当前余额（元）':'安排金额（元）'} type="number" min={draft.intent==='cash'?'0':'0.01'} max="1000000" step="0.01" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
     {draft.intent==='plan'&&<label>到期日期<input aria-label="到期日期" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></label>}</div>
     {draft.intent==='plan'&&<details><summary>记账分类</summary><select aria-label="安排分类" value={category} onChange={e=>setCategory(e.target.value)}>{['进货','房租','人工','水电','其他'].map(c=><option key={c}>{c}</option>)}</select></details>}
    </fieldset>}
    {draft.intent==='cash'&&<p className="funding-note">填写此刻可用的经营资金，不含未收款订单。后续新登记收款、退款和支出会调整测算；补记已包含在余额里的旧账后，请重新核对余额。</p>}
    {draft.intent==='plan'&&<p className="funding-note">仅安排预算，不会冻结资金或自动付款。到期状态可在此查看。</p>}
    {(draft.intent==='paid'||draft.intent==='cancel')&&<p className="funding-confirm-line">{current?.title??draft.title} · {money(current?.amount??draft.amount??0)}<br/>{current?.dueDate??draft.dueDate}</p>}
    {draft.intent==='paid'&&<fieldset disabled={busy||pending||ended}><p className="funding-note">仅登记已经在原渠道完成的付款，不会发起转账。</p><label>记账方式<select aria-label="记账方式" value={paymentMode} onChange={e=>{setPaymentMode(e.target.value);setExpenseId('');}}><option value="">请选择，避免重复记账</option><option value="new">这笔尚未入账，新记支出</option><option value="existing">已经记过，关联已有支出</option></select></label>{paymentMode==='new'&&<label>实际付款时间<input aria-label="实际付款时间" type="datetime-local" value={paidAt} max={dateTime()} onChange={e=>setPaidAt(e.target.value)}/></label>}{paymentMode==='existing'&&<label>关联已有支出<select aria-label="关联已有支出" value={expenseId} onChange={e=>setExpenseId(e.target.value)}><option value="">选择同金额的记录</option>{state.expenses.filter(e=>e.amount===current?.amount&&!state.funding?.plans.some(p=>p.expenseId===e.id)).map(e=><option value={e.id} key={e.id}>{e.title} · {money(e.amount)} · {stamp(e.occurredAt)}</option>)}</select></label>}</fieldset>}
    {draft.intent==='cancel'&&<p className="funding-note">只释放计划中的预留，不会退款或删除经营账目。</p>}
    <div className="funding-actions"><button className="funding-primary" type="submit" disabled={disabled}>{busy?'正在保存…':draft.intent==='cash'?'确认可用余额':draft.intent==='plan'?'确认保存安排':draft.intent==='paid'?'确认登记已支付':'确认取消安排'}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>暂不处理</button></div>
   </form>}
   {done&&<p className="funding-success">这份方案已记录，请在下方查看或调整当前安排。</p>}
   {onAsk&&<form className="funding-ask" onSubmit={e=>{e.preventDefault();if(question.trim())onAsk(`我的小店资金安排：${question.trim()}`);}}><label htmlFor="merchant-funding-question">交代给{stewardName}</label><div><input id="merchant-funding-question" aria-label="交代小店资金安排" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="下周五房租3000元，帮我安排" maxLength={500}/><button aria-label={`交给${stewardName}`} disabled={!question.trim()}><Send size={18}/></button></div></form>}
   <div className="funding-list-heading"><h4>待安排支出 <span>{p.rows.length}</span></h4><button disabled={busy||pending} onClick={()=>edit({intent:'plan',revision:state.revision,planId:crypto.randomUUID()})}>手动添加</button></div>
   {p.rows.length===0?<p className="funding-empty">把房租、进货等支出交代给{stewardName}，金额与日期核对后会留在这里。</p>:<ol className="funding-timeline">{p.rows.map(plan=><li key={plan.id}><details><summary><span className="funding-date"><b>{plan.dueDate.slice(5).replace('-','/')}</b><small>{plan.dueDate.slice(0,4)}{plan.overdue?' · 已到期':''}</small></span><span className="funding-plan-info"><strong>{plan.title}</strong><small>{plan.remaining===null?'确认余额后测算':plan.remaining<0?`累计缺口 ${money(-plan.remaining)}`:`安排后余 ${money(plan.remaining)}`}</small></span><strong>{money(plan.amount)}</strong><ChevronRight size={14} aria-hidden="true"/></summary><div className="funding-actions"><button disabled={busy||pending} onClick={()=>selection(plan,'plan')}>调整</button><button disabled={busy||pending} onClick={()=>selection(plan,'paid')}>登记已支付</button><button disabled={busy||pending} onClick={()=>selection(plan,'cancel')}>取消安排</button></div></details></li>)}</ol>}
   {(state.funding?.plans.some(p=>p.status!=='planned'))&&<details className="funding-history"><summary>已完成与取消的安排</summary><ul>{state.funding.plans.filter(p=>p.status!=='planned').slice().reverse().map(plan=><li key={plan.id}><div><strong>{plan.title}</strong><small>{plan.dueDate} · {money(plan.amount)}</small></div><span>{plan.status==='paid'?'已支付':'已取消'}</span></li>)}</ul></details>}
   <details className="funding-evidence"><summary>余额与测算依据<ArrowUpRight size={14} aria-hidden="true"/></summary><p>{state.funding?.cash?`${stamp(state.funding.cash.confirmedAt)} 由你确认可用余额 ${money(state.funding.cash.amount)}，之后按新登记的现金收付调整。`:'尚未确认余额，营业额和待收款不能直接作为可用资金。'}只计算已登记的单次安排，按到期日期依次扣减；不预测未来营业收入，不代表银行实时余额。补记旧账后请重新核对余额。</p></details>
  </>}
 </section>;
}
