import {useEffect,useRef,useState} from 'react';
import {bankRequest} from '../lib/bank-transfer';
import {useBankAccount} from '../lib/use-bank-account';
import {assetMoney,depositProducts,parseDepositRequest,type DepositDraft,type DepositWithdrawalDraft,type TermDeposit,type DepositWithdrawalReceipt} from '../lib/bank-assets';
import {cents} from '../lib/native-banking';
import './term-deposit-panel.css';
const date=(time:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'}).format(time);

export function TermDepositPanel({initialRequest='',scope='assets'}:{initialRequest?:string;scope?:string}) {
  const bank=useBankAccount(),initial=parseDepositRequest(initialRequest);
  const [amount,setAmount]=useState(initial.amount),[months,setMonths]=useState<number|null>(initial.months);
  const [draft,setDraft]=useState<DepositDraft|null>(null),[withdrawal,setWithdrawal]=useState<DepositWithdrawalDraft|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const running=useRef(false),key=`zhiyin-deposit-plan:${scope}`;
  useEffect(()=>{
    const next=parseDepositRequest(initialRequest);
    if(next.amount||next.months){setAmount(next.amount);setMonths(next.months);setDraft(null);setWithdrawal(null);return;}
    try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.amount==='string'&&saved.amount.length<=20&&depositProducts.some(p=>p.months===saved.months)){setAmount(saved.amount);setMonths(saved.months);}}catch{/* Invalid edit drafts never authorize a payment. */}
  },[initialRequest,key]);
  function change(){setDraft(null);setWithdrawal(null);setNotice('');setError('');}
  async function run(action:()=>Promise<void>){
    if(running.current)return;running.current=true;setBusy(true);setError('');
    try{await action();}catch(cause){setError(cause instanceof Error?cause.message:'暂时无法核对，请重试');}
    finally{running.current=false;setBusy(false);}
  }
  async function updated(text:string){
    setNotice(text);window.dispatchEvent(new Event('zhiyin-bank-updated'));
    const state=await bank.refresh();if(!state?.assetSummary)throw new Error('已返回回执，但资产复查未完成，请刷新核对；不要新建另一笔');
  }
  async function prepare(){
    const value=cents(amount);if(value===null||value<10000||!months){setError('请确认存入金额（至少100元）和期限');return;}
    await run(async()=>{
      const quote=await bankRequest<DepositDraft>({type:'prepare-deposit',amount:value,months});
      if(!quote?.id||quote.amount!==value||quote.months!==months||!Number.isFinite(quote.expiresAt))throw new Error('定存方案无法核对，尚未确认存入');
      setDraft(quote);setWithdrawal(null);setNotice('');
      try{localStorage.setItem(key,JSON.stringify({amount,months}));}catch{/* Only edit preferences are stored; no authorization is persisted. */}
    });
  }
  const active=(bank.state?.termDeposits??[]).filter(d=>d.closedAt===undefined),pending=Boolean(draft||withdrawal);
  return <section className="term-deposit-panel" aria-label="定期存款办理">
    <header><h2>定期存款</h2><p>常用卡 · 8888，确认后从活期余额转入。到期后手动支取，不自动续存。</p></header>
    <p className="deposit-cash">{bank.state?.assetSummary?`扣除预留后的可用资金 ${assetMoney(bank.state.assetSummary.availableCash)}`:'正在读取可用资金…'}</p>
    {!pending&&<div className="deposit-editor">
      <label>想存多少？<span className="deposit-amount"><span aria-hidden="true">¥</span><input aria-label="存入金额（元）" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);change();}} placeholder="输入金额" maxLength={16}/></span></label>
      <div className="deposit-quick-amounts">{[1000,5000,10000].map(value=><button type="button" key={value} disabled={busy} onClick={()=>{setAmount(String(value));change();}}>{value.toLocaleString()}元</button>)}</div>
      <fieldset disabled={busy}><legend>这笔钱准备存多久？</legend><div className="deposit-terms">{depositProducts.map(product=><label key={product.months}><input type="radio" name={`term-${scope}`} aria-label={`${product.label}，沙箱年利率${product.rateBps/100}%`} checked={months===product.months} onChange={()=>{setMonths(product.months);change();}}/><span>{product.label}<small>示例年利率 {product.rateBps/100}%</small></span></label>)}</div></fieldset>
      <button type="button" className="primary-button deposit-primary" disabled={busy||!bank.state?.assetSummary||!amount||!months} onClick={()=>void prepare()}>{busy?'正在核对…':'核对定存方案'}</button>
    </div>}
    {draft&&<div className="deposit-confirm" aria-label="定存核对方案"><h3>核对存入</h3><strong>{assetMoney(draft.amount)}</strong>
      <dl><div><dt>资金来源</dt><dd>常用卡 · 8888</dd></div><div><dt>存期 / 示例年利率</dt><dd>{draft.months}个月 / {draft.rateBps/100}%</dd></div><div><dt>到期日</dt><dd>{date(draft.maturesAt)}</dd></div><div><dt>存入后账面现金</dt><dd>{assetMoney(draft.balance-draft.amount)}</dd></div></dl>
      <p>总资产只是从现金转为定存，不会增加。提前支取按沙箱活期年利率 0.2% 计息，可能少于到期利息；这些不是实际银行报价。</p>
      <button type="button" className="primary-button deposit-primary" disabled={busy} onClick={()=>void run(async()=>{
        const result=await bankRequest<TermDeposit>({type:'confirm-deposit',draftId:draft.id,authorized:true});
        if(result?.id!==draft.id||result.amount!==draft.amount)throw new Error('存入结果待核实，请保留本方案并重试核对');
        setDraft(null);await updated(`存入已完成：${assetMoney(result.amount)}，${result.months}个月定期。`);
      })}>{busy?'正在处理…':'确认存入'}</button><button type="button" className="text-link" disabled={busy} onClick={change}>返回调整</button>
    </div>}
    {withdrawal&&<div className="deposit-confirm" aria-label="定存支取方案"><h3>{withdrawal.early?'提前支取核对':'到期支取核对'}</h3><strong>{assetMoney(withdrawal.amount+withdrawal.interest)}</strong>
      <dl><div><dt>本金</dt><dd>{assetMoney(withdrawal.amount)}</dd></div><div><dt>本次模拟利息</dt><dd>{assetMoney(withdrawal.interest)}</dd></div><div><dt>计息年利率 / 收款账户</dt><dd>{withdrawal.rateBps/100}% / 常用卡8888</dd></div></dl>
      <p>{withdrawal.early?'尚未到期，按较低沙箱活期利率计息。确认后本息回到活期，不会保留这笔定存。':'确认后本息回到活期，不自动续存。'}</p>
      <button type="button" className="primary-button deposit-primary" disabled={busy} onClick={()=>void run(async()=>{
        const result=await bankRequest<DepositWithdrawalReceipt>({type:'confirm-deposit-withdrawal',draftId:withdrawal.id,authorized:true});
        if(result?.id!==withdrawal.id||result.depositId!==withdrawal.depositId||result.interest!==withdrawal.interest)throw new Error('支取回执待核实，请保留方案重试');
        setWithdrawal(null);await updated(`支取已完成，本息 ${assetMoney(result.amount+result.interest)} 已回到活期。`);
      })}>{busy?'正在处理…':'确认支取'}</button><button type="button" className="text-link" disabled={busy} onClick={change}>暂不支取</button>
    </div>}
    {notice&&<p className="deposit-notice" role="status">{notice}</p>}
    {(error||bank.error)&&<div className="deposit-error" role="alert"><p>{error||bank.error}</p><button type="button" disabled={busy} onClick={()=>void bank.refresh()}>刷新账户</button></div>}
    <div className="deposit-records"><h3>未支取的定存</h3>{!active.length?<p>{bank.state?'目前没有未支取定存。':'定存待读取。'}</p>:active.map(deposit=><article key={deposit.id}><div><strong>{assetMoney(deposit.amount)}</strong><span>{deposit.months}个月 · {date(deposit.maturesAt)} 到期</span><small>{Date.now()>=deposit.maturesAt?'已到期，等待支取':'持有中'} · 示例年利率 {deposit.rateBps/100}%</small></div><button type="button" disabled={busy||pending} onClick={()=>void run(async()=>{
      const quote=await bankRequest<DepositWithdrawalDraft>({type:'prepare-deposit-withdrawal',depositId:deposit.id});
      if(!quote?.id||quote.depositId!==deposit.id||quote.amount!==deposit.amount||!Number.isSafeInteger(quote.interest))throw new Error('支取方案无法核对');
      setWithdrawal(quote);setDraft(null);setNotice('');
    })}>支取这笔定存</button></article>)}</div>
    <details className="deposit-rules"><summary>计息与资产口径</summary><p>日期按银行后端时钟核对。单利按实际整天数 / 365 计算，金额四舍五入到分；到期后不继续累计定期利息，利息在确认支取后才入账。理财与定存按未赎回、未支取本金计入总资产，不伪造市场净值。此处不包含微信、支付宝钱包。</p></details>
  </section>;
}
