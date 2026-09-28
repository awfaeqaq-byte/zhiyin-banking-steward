import {useEffect,useRef,useState} from 'react';
import {bankRecipients,bankRequest,splitAA,type AAIntent,type AARequest,type BankReceipt,type TransferIntent} from '../lib/bank-transfer';
import {useBankAccount} from '../lib/use-bank-account';
import {cents,money} from '../lib/native-banking';
import {BankTransfer} from './bank-transfer';
import {Button} from './ui/button';
import './smart-transfers.css';

export type SmartIntent=TransferIntent | (AAIntent & {kind:'aa'});
const person=(id:string)=>id==='self'?'我自己':bankRecipients.find(r=>r.id===id)?.name || id;
const dateLabel=(value:number)=>new Date(value).toLocaleString('zh-CN');
const statusLabel={pending:'等待执行',completed:'已完成',failed:'执行失败',cancelled:'已撤销'};
const aaPendingKey='zhiyin-aa-pending';
type AADraft=AAIntent & {requestId:string;title:string};
function pendingAA():AADraft|null{
 try{const d=JSON.parse(localStorage.getItem(aaPendingKey)??'null');if(!d || typeof d.requestId!=='string' || typeof d.title!=='string' || !Array.isArray(d.recipientIds) || typeof d.includeSelf!=='boolean')return null;splitAA(d.amount,d.recipientIds,d.includeSelf);return d;}catch{return null;}
}

function AAForm({initial,onCreated}:{initial?:AAIntent;onCreated:()=>void}){
 const [amount,setAmount]=useState(initial?String(initial.amount/100):'');
 const [ids,setIds]=useState<AAIntent['recipientIds']>(initial?.recipientIds??[]);
 const [includeSelf,setIncludeSelf]=useState(initial?.includeSelf??true),[title,setTitle]=useState('聚餐AA');
 const [draft,setDraft]=useState<AADraft|null>(pendingAA);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(()=>!!pendingAA());
 const lock=useRef(false);
 let shares:ReturnType<typeof splitAA>=[];
 try{shares=splitAA(cents(amount)??0,ids,includeSelf);}catch{/* Incomplete inputs show no preview. */}
 function prepare(){try{const value=cents(amount)??0;splitAA(value,ids,includeSelf);if(!title.trim())throw Error('请填写收款说明');setDraft({amount:value,recipientIds:ids,includeSelf,title:title.trim(),requestId:crypto.randomUUID()});setError('');}catch(e){setError(e instanceof Error?e.message:'请核对收款信息');}}
 async function confirm(){
  if(!draft || lock.current)return;lock.current=true;setBusy(true);setError('');
  try{localStorage.setItem(aaPendingKey,JSON.stringify(draft));setUncertain(true);await bankRequest<AARequest>({type:'create-aa',...draft,authorized:true});localStorage.removeItem(aaPendingKey);setUncertain(false);setDraft(null);setAmount('');setIds([]);window.dispatchEvent(new Event('zhiyin-bank-updated'));onCreated();}
  catch(e){if(e instanceof Error && e.name==='BankRejection'){localStorage.removeItem(aaPendingKey);setUncertain(false);}setError(e instanceof Error?e.message:'结果待核实，请重试同一请求');}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="bank-transfer-flow" aria-label="AA收款">
  {draft?<><h3>{draft.title}</h3><p>总额 {money(draft.amount)} · {draft.recipientIds.length+(draft.includeSelf?1:0)} 人分摊</p>
   <dl className="bank-transfer-facts">{splitAA(draft.amount,draft.recipientIds,draft.includeSelf).map(s=><div key={s.recipientId}><dt>{person(s.recipientId)}{s.recipientId==='self'?'（不收款）':''}</dt><dd>{money(s.amount)}</dd></div>)}</dl>
   <p className="fine-print left">收款到账常用卡 8888。创建后显示每人的待收状态，不会自动从参与人账户扣款。</p>
   <Button disabled={busy} onClick={()=>void confirm()}>{busy?'正在发起…':uncertain?'核实并重试同一收款':'确认发起AA收款'}</Button>
   <Button variant="secondary" disabled={busy||uncertain} onClick={()=>setDraft(null)}>返回修改</Button>
  </>:<>
   <label className="field">收款说明<input value={title} maxLength={60} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="field">费用总额（元）<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="smart-person"><input type="checkbox" checked={includeSelf} onChange={e=>setIncludeSelf(e.target.checked)}/>包含我自己的一份</label>
   <fieldset className="smart-people"><legend>选择其他参与人</legend>{bankRecipients.map(r=><label className="smart-person" key={r.id}><input type="checkbox" checked={ids.includes(r.id)} onChange={e=>setIds(e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/><span>{r.name}<small>{r.remark}</small></span></label>)}</fieldset>
   {shares.length>0&&<div className="smart-preview"><strong>预计收回 {money(shares.filter(s=>s.recipientId!=='self').reduce((n,s)=>n+s.amount,0))}</strong><span>{shares.length} 人分摊，尾差按参与顺序分配到分</span></div>}
   <Button onClick={prepare}>核对AA分摊</Button>
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

export function SmartTransfers({initial,onDone}:{initial:SmartIntent;onDone:(receipt:BankReceipt)=>void}){
 const [tab,setTab]=useState<'transfer'|'aa'|'records'>('kind' in initial?'aa':'transfer');
 const bank=useBankAccount();
 const refresh=bank.refresh;
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [confirmation,setConfirmation]=useState<{label:string;body:object}|null>(null);
 const lock=useRef(false);
 useEffect(()=>{if(tab!=='records')return;const timer=setInterval(()=>void refresh(),3000);return()=>clearInterval(timer);},[tab,refresh]);
 async function execute(){
  if(!confirmation || lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await bankRequest({...confirmation.body,authorized:true});setConfirmation(null);await bank.refresh();window.dispatchEvent(new Event('zhiyin-bank-updated'));}
  catch(e){setError(e instanceof Error?e.message:'操作未完成');}finally{lock.current=false;setBusy(false);}
 }
 return <div className="smart-transfers">
  <nav className="smart-tabs" aria-label="转账功能">{([['transfer','转账'],['aa','AA收款'],['records','记录']] as const).map(([key,label])=><button key={key} aria-pressed={tab===key} disabled={busy} onClick={()=>{setTab(key);setConfirmation(null);setError('');}}>{label}</button>)}</nav>
  <div hidden={tab!=='transfer'}><BankTransfer initial={'kind' in initial?{recipientId:'mom',amount:0}:initial} onDone={onDone}/></div>
  <div hidden={tab!=='aa'}><AAForm initial={'kind' in initial?initial:undefined} onCreated={()=>{setTab('records');void bank.refresh();}}/></div>
  {tab==='records'&&<section className="smart-records" aria-label="转账与收款记录">
   <div className="smart-record-heading"><h3>预约转账</h3><button disabled={busy} onClick={()=>void bank.refresh()}>刷新</button></div>
   {!bank.state&&<p role="status">{bank.error || '正在读取记录…'}</p>}
   {bank.state&&!bank.state.schedules?.length&&<p className="fine-print left">还没有预约转账。</p>}
   {[...(bank.state?.schedules??[])].reverse().map(item=><article className="smart-record" key={item.id}>
    <div className="smart-record-heading"><strong>{person(item.recipientId)} · {money(item.amount)}</strong><span>{statusLabel[item.status]}</span></div>
    <p>{dateLabel(item.executeAt)}</p>{item.error&&<p role="status">{item.error}。未扣款，请重新安排。</p>}
    {item.status==='pending'&&<Button variant="secondary" disabled={busy} onClick={()=>setConfirmation({label:`撤销给${person(item.recipientId)}的${money(item.amount)}预约？`,body:{type:'cancel-schedule',id:item.id}})}>撤销预约</Button>}
   </article>)}
   <h3>AA收款</h3>
   {bank.state&&!bank.state.aaRequests?.length&&<p className="fine-print left">还没有发起AA收款。</p>}
   {[...(bank.state?.aaRequests??[])].reverse().map(item=>{
    const others=item.shares.filter(s=>s.recipientId!=='self'),paid=others.filter(s=>s.paidAt!==undefined);
    return <article className="smart-record" key={item.id}><div className="smart-record-heading"><strong>{item.title}</strong><span>{item.status==='pending'?`${paid.length}/${others.length} 人已付`:item.status==='completed'?'已收齐':'已结束'}</span></div>
     <p>已收 {money(paid.reduce((n,s)=>n+s.amount,0))} / 应收 {money(others.reduce((n,s)=>n+s.amount,0))}</p>
     <progress aria-label={`${item.title}收款进度`} max={others.length} value={paid.length}/>
     <dl className="bank-transfer-facts">{item.shares.map(share=><div key={share.recipientId}><dt>{person(share.recipientId)}</dt><dd>{money(share.amount)} · {share.recipientId==='self'?'自己承担':share.paidAt!==undefined?'已收款':item.status==='cancelled'?'已关闭':'待付款'}</dd></div>)}</dl>
     {item.status==='pending'&&<><details className="smart-simulation"><summary>测试对方付款</summary><p>独立银行沙箱账户付款，到账常用卡；不使用微信或支付宝余额。</p>{others.filter(s=>s.paidAt===undefined).map(share=><Button variant="secondary" key={share.recipientId} disabled={busy} onClick={()=>setConfirmation({label:`模拟${person(share.recipientId)}支付${money(share.amount)}？`,body:{type:'settle-aa',id:item.id,recipientId:share.recipientId}})}>{person(share.recipientId)}付款</Button>)}</details><Button variant="secondary" disabled={busy} onClick={()=>setConfirmation({label:'结束剩余收款？已到账的款项不会退回。',body:{type:'cancel-aa',id:item.id}})}>结束收款</Button></>}
    </article>;
   })}
   {(bank.state?.collections?.length??0)>0&&<details><summary>AA入账流水</summary>{[...(bank.state?.collections??[])].reverse().map(c=><div className="smart-record" key={c.id}><strong>{person(c.recipientId)} +{money(c.amount)}</strong><p>{dateLabel(c.completedAt)} · 到账后余额 {money(c.balanceAfter)}</p></div>)}</details>}
   {confirmation&&<div className="smart-confirm" role="group" aria-label="操作确认"><p>{confirmation.label}</p><Button disabled={busy} onClick={()=>void execute()}>{busy?'处理中…':'确认操作'}</Button><Button variant="secondary" disabled={busy} onClick={()=>setConfirmation(null)}>暂不操作</Button></div>}
   {(error||bank.error)&&<p role="alert">{error||bank.error}</p>}
  </section>}
 </div>;
}
