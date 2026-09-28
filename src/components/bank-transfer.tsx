import {useEffect,useRef,useState} from 'react';
import {bankRequest,bankRecipients,findBankRecipients,type BankSchedule,type BankDraft,type BankReceipt,type BankRecipientId,type TransferIntent} from '../lib/bank-transfer';
import {cents,money} from '../lib/native-banking';
import {Button} from './ui/button';
const pendingKey='zhiyin-bank-pending-confirmation';
const localTime=(time:number)=>new Date(time-new Date(time).getTimezoneOffset()*60000).toISOString().slice(0,16);
export function BankTransfer({initial,onDone}:{initial:TransferIntent;onDone:(receipt:BankReceipt)=>void}){
 const [recipient,setRecipient]=useState<BankRecipientId>(initial.recipientId),[amount,setAmount]=useState(String(initial.amount/100));
 const [protectedAmount,setProtectedAmount]=useState(initial.protectedAmount===undefined?'':String(initial.protectedAmount/100));
 const [query,setQuery]=useState(''),[scheduled,setScheduled]=useState(!!initial.executeAt),[date,setDate]=useState(initial.executeAt?localTime(initial.executeAt):''),[schedule,setSchedule]=useState<BankSchedule|null>(null);
 const [draft,setDraft]=useState<BankDraft|null>(null),[receipt,setReceipt]=useState<BankReceipt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false);
 function complete(value:BankReceipt){setReceipt(value);setUncertain(false);try{localStorage.removeItem(pendingKey);}catch{/* A repeated receipt is idempotent. */}window.dispatchEvent(new Event('zhiyin-bank-updated'));onDone(value);}
 function scheduledDone(value:BankSchedule){setSchedule(value);setUncertain(false);localStorage.removeItem(pendingKey);window.dispatchEvent(new Event('zhiyin-bank-updated'));}
 useEffect(()=>{
  const id=localStorage.getItem(pendingKey);if(!id)return;
  let active=true;setBusy(true);setUncertain(true);
  void bankRequest<{draft?:BankDraft;receipt?:BankReceipt;schedule?:BankSchedule}>({type:'status',draftId:id}).then(result=>{if(!active)return;if(result.receipt)complete(result.receipt);else if(result.schedule)scheduledDone(result.schedule);else if(result.draft){setDraft(result.draft);setAmount(String(result.draft.amount/100));setRecipient(result.draft.recipientId);setScheduled(!!result.draft.executeAt);if(result.draft.executeAt)setDate(localTime(result.draft.executeAt));setError('上次结果待核实，请使用同一方案重试，不会重复扣款。');}else{localStorage.removeItem(pendingKey);setUncertain(false);}}).catch(()=>{if(active)setError('无法核实上次转账，请关闭后重新打开；暂不发起新转账。');}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
  // Recover once per panel, not when the parent callback changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const to=bankRecipients.find(r=>r.id===(receipt?.recipientId || draft?.recipientId || recipient))!;
 async function prepare(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const value=cents(amount);if(!value || value<1)throw new Error('请输入大于0且最多两位小数的金额');const reserve=protectedAmount.trim()===''?undefined:cents(protectedAmount);if(reserve===null || (reserve!==undefined && reserve<0))throw new Error('请核对需要保留的金额');if(query && !findBankRecipients(query).some(r=>r.id===recipient))throw new Error('请先选择搜索结果中的收款人');const executeAt=scheduled?new Date(date).getTime():undefined;if(scheduled && (!executeAt || executeAt<=Date.now()))throw new Error('请选择未来的预约时间');setDraft(await bankRequest<BankDraft>({type:'prepare',recipientId:recipient,amount:value,...(scheduled?{executeAt}:{}),...(reserve===undefined?{}:{protectedAmount:reserve})}));}catch(e){setError(e instanceof Error?e.message:'核对失败');}finally{lock.current=false;setBusy(false);}}
 async function confirm(){if(lock.current || !draft)return;lock.current=true;setBusy(true);setError('');try{localStorage.setItem(pendingKey,draft.id);setUncertain(true);if(draft.executeAt)scheduledDone(await bankRequest<BankSchedule>({type:'schedule',draftId:draft.id,authorized:true}));else complete(await bankRequest<BankReceipt>({type:'confirm',draftId:draft.id,authorized:true}));}catch(e){if(e instanceof Error && e.name==='BankRejection'){localStorage.removeItem(pendingKey);setUncertain(false);}setError(e instanceof Error?e.message:'结果待核实，请重试同一方案');}finally{lock.current=false;setBusy(false);}}
 return <section className="bank-transfer-flow" aria-label="转账安排">
  {schedule?<><h3>{schedule.status==='pending'?'预约已建立':'预约记录'}</h3><p>{money(schedule.amount)} → {bankRecipients.find(r=>r.id===schedule.recipientId)?.name}</p><p>{new Date(schedule.executeAt).toLocaleString('zh-CN')} 执行</p><p>未扣款、未冻结余额。可在「记录」中查看执行结果或撤销。</p></>:receipt?<><h3>转账已完成</h3><p>{money(receipt.amount)} → {to.name}（尾号 {to.accountLast4}）</p><p>银行卡剩余 {money(receipt.balanceAfter)}</p><small>回执号 {receipt.id}</small><p className="fine-print left">已记入银行沙箱账单，收款方沙箱账户已入账；不影响真实资金。</p></>:draft?<>
   <dl className="bank-transfer-facts"><div><dt>付款账户</dt><dd>常用卡 · 8888</dd></div><div><dt>收款账户</dt><dd>{to.name} · {to.accountLast4}</dd></div><div><dt>转账金额</dt><dd>{money(draft.amount)}</dd></div><div><dt>执行时间</dt><dd>{draft.executeAt?new Date(draft.executeAt).toLocaleString('zh-CN'):'确认后立即执行'}</dd></div><div><dt>当前余额</dt><dd>{money(draft.balance)}</dd></div><div><dt>{draft.executeAt?'按当前余额测算':'转账后余额'}</dt><dd>{money(draft.balance-draft.amount)}</dd></div></dl>
   {draft.impact && (draft.impact.pendingTotal>0 || draft.impact.protectedAmount>0) && <section className="smart-preview" aria-label="转账资金影响"><strong>安排后仍可支配 {money(draft.impact.remaining)}</strong><dl className="bank-transfer-facts"><div><dt>其他待执行预约</dt><dd>{money(draft.impact.pendingTotal)}</dd></div><div><dt>至少保留</dt><dd>{money(draft.impact.protectedAmount)}</dd></div></dl><span>已扣除这笔转账、其他预约和保留金额；未来收入未计入。</span></section>}
   <p className="fine-print left">尚未扣款。{draft.impact?.protectedAmount?'保留金额会在转账时检查，不冻结余额、不自动还款，也不阻止其他消费。':'未设置还款或生活费保留金额。'}微信、支付宝余额不参与支付。方案有效期5分钟。</p>
   {draft.executeAt&&<p className="fine-print left">到期重新检查余额、限额与夜间保护。服务关闭期间不会执行，重新启动后检查到期预约。</p>}
   <Button className="full-width" disabled={busy} onClick={()=>void confirm()}>{busy?'正在核实…':uncertain?'核实并重试同一笔转账':draft.executeAt?'确认预约转账（沙箱）':'确认并立即转账（沙箱）'}</Button>
   <Button variant="secondary" disabled={busy || uncertain} onClick={()=>{setDraft(null);setError('');}}>返回修改</Button>
  </>:<>
   <label className="field">查找收款人<input value={query} placeholder="姓名、手机号或备注" disabled={busy || uncertain} onChange={e=>setQuery(e.target.value)}/></label>
   <label className="field">收款人<select value={findBankRecipients(query).some(r=>r.id===recipient)?recipient:''} disabled={busy || uncertain} onChange={e=>setRecipient(e.target.value as BankRecipientId)}><option value="" disabled>请选择匹配的账户</option>{findBankRecipients(query).map(r=><option key={r.id} value={r.id}>{r.name} · 尾号 {r.accountLast4} · {r.remark}</option>)}</select></label>
   {query&&!findBankRecipients(query).length&&<p role="status">没有匹配的已登记银行账户，请核对姓名或手机号。</p>}
   <label className="field">转账金额（元）<input inputMode="decimal" value={amount} disabled={busy || uncertain} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="field">转账后至少保留（元）<input inputMode="decimal" value={protectedAmount} placeholder="选填，如还款和生活费合计" disabled={busy || uncertain} onChange={e=>setProtectedAmount(e.target.value)}/></label>
   <label className="field">执行方式<select value={scheduled?'scheduled':'now'} disabled={busy || uncertain} onChange={e=>setScheduled(e.target.value==='scheduled')}><option value="now">立即转账</option><option value="scheduled">定时转账</option></select></label>
   {scheduled&&<label className="field">预约时间（设备当地时间）<input type="datetime-local" value={date} disabled={busy || uncertain} onChange={e=>setDate(e.target.value)}/></label>}
   <p className="fine-print left">从常用卡 8888 转出，仅支持已登记收款账户。联系人手机号不等于银行账号。</p>
   <Button className="full-width" disabled={busy || uncertain} onClick={()=>void prepare()}>{busy?'正在核对…':scheduled?'核对预约转账':'核对即时转账'}</Button>
  </>}
  {(receipt||schedule)&&<Button variant="secondary" onClick={()=>{setReceipt(null);setSchedule(null);setDraft(null);setAmount('');setProtectedAmount('');setError('');}}>再安排一笔</Button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
