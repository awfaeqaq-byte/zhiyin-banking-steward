import {useEffect,useRef,useState} from 'react';
import {bankRequest,bankRecipients,type BankDraft,type BankReceipt,type BankRecipientId,type TransferIntent} from '../lib/bank-transfer';
import {cents,money} from '../lib/native-banking';
import {Button} from './ui/button';
const pendingKey='zhiyin-bank-pending-confirmation';
export function BankTransfer({initial,onDone}:{initial:TransferIntent;onDone:(receipt:BankReceipt)=>void}){
 const [recipient,setRecipient]=useState<BankRecipientId>(initial.recipientId),[amount,setAmount]=useState(String(initial.amount/100));
 const [draft,setDraft]=useState<BankDraft|null>(null),[receipt,setReceipt]=useState<BankReceipt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false);
 function complete(value:BankReceipt){setReceipt(value);setUncertain(false);try{localStorage.removeItem(pendingKey);}catch{/* A repeated receipt is idempotent. */}window.dispatchEvent(new Event('zhiyin-bank-updated'));onDone(value);}
 useEffect(()=>{
  const id=localStorage.getItem(pendingKey);if(!id)return;
  let active=true;setBusy(true);setUncertain(true);
  void bankRequest<{draft?:BankDraft;receipt?:BankReceipt}>({type:'status',draftId:id}).then(result=>{if(!active)return;if(result.receipt)complete(result.receipt);else if(result.draft){setDraft(result.draft);setAmount(String(result.draft.amount/100));setRecipient(result.draft.recipientId);setError('上次结果待核实，请使用同一方案重试，不会重复扣款。');}else{localStorage.removeItem(pendingKey);setUncertain(false);}}).catch(()=>{if(active)setError('无法核实上次转账，请关闭后重新打开；暂不发起新转账。');}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
  // Recover once per panel, not when the parent callback changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const to=bankRecipients.find(r=>r.id===(receipt?.recipientId || draft?.recipientId || recipient))!;
 async function prepare(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const value=cents(amount);if(!value || value<1)throw new Error('请输入大于0且最多两位小数的金额');setDraft(await bankRequest<BankDraft>({type:'prepare',recipientId:recipient,amount:value}));}catch(e){setError(e instanceof Error?e.message:'核对失败');}finally{lock.current=false;setBusy(false);}}
 async function confirm(){if(lock.current || !draft)return;lock.current=true;setBusy(true);setError('');try{localStorage.setItem(pendingKey,draft.id);setUncertain(true);complete(await bankRequest<BankReceipt>({type:'confirm',draftId:draft.id,authorized:true}));}catch(e){if(e instanceof Error && e.name==='BankRejection'){localStorage.removeItem(pendingKey);setUncertain(false);}setError(e instanceof Error?e.message:'结果待核实，请重试同一方案');}finally{lock.current=false;setBusy(false);}}
 return <section className="bank-transfer-flow" aria-label="即时转账">
  {receipt?<><h3>转账已完成</h3><p>{money(receipt.amount)} → {to.name}（尾号 {to.accountLast4}）</p><p>银行卡剩余 {money(receipt.balanceAfter)}</p><small>回执号 {receipt.id}</small><p className="fine-print left">已记入银行沙箱账单，收款方沙箱账户已入账；不影响真实资金。</p></>:draft?<>
   <dl className="bank-transfer-facts"><div><dt>付款账户</dt><dd>常用卡 · 8888</dd></div><div><dt>收款账户</dt><dd>{to.name} · {to.accountLast4}</dd></div><div><dt>转账金额</dt><dd>{money(draft.amount)}</dd></div><div><dt>执行时间</dt><dd>确认后立即执行</dd></div><div><dt>当前余额</dt><dd>{money(draft.balance)}</dd></div><div><dt>转账后余额</dt><dd>{money(draft.balance-draft.amount)}</dd></div></dl>
   <p className="fine-print left">尚未扣款。未预留信用卡还款或生活预算；微信、支付宝余额不参与支付。方案有效期5分钟。</p>
   <Button className="full-width" disabled={busy} onClick={()=>void confirm()}>{busy?'正在核实…':uncertain?'核实并重试同一笔转账':'确认并立即转账（沙箱）'}</Button>
   <Button variant="secondary" disabled={busy || uncertain} onClick={()=>{setDraft(null);setError('');}}>返回修改</Button>
  </>:<>
   <label className="field">收款人<select value={recipient} disabled={busy || uncertain} onChange={e=>setRecipient(e.target.value as BankRecipientId)}>{bankRecipients.map(r=><option key={r.id} value={r.id}>{r.name} · 尾号 {r.accountLast4}</option>)}</select></label>
   <label className="field">转账金额（元）<input inputMode="decimal" value={amount} disabled={busy || uncertain} onChange={e=>setAmount(e.target.value)}/></label>
   <p className="fine-print left">从常用卡 8888 转出，仅支持已登记收款账户。联系人手机号不等于银行账号。</p>
   <Button className="full-width" disabled={busy || uncertain} onClick={()=>void prepare()}>{busy?'正在核对…':'核对即时转账'}</Button>
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
