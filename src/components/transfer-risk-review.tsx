import type {TransferReview} from '../lib/transfer-risk';
import {bankRecipients} from '../lib/bank-transfer';
import {money} from '../lib/native-banking';
const when=(time:number)=>new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
export function TransferRiskReview({review,checked,disabled,onChange}:{review:TransferReview;checked:boolean;disabled:boolean;onChange:(checked:boolean)=>void}){
 const records=review.matches.map(match=><li key={`${match.kind}-${match.id}`}><strong>{bankRecipients.find(r=>r.id===match.recipientId)?.name} · {money(match.amount)}</strong><span>{match.kind==='completed'?'已转账':'已预约，尚未扣款'} · {when(match.at)}</span>{match.kind==='pending'&&match.executeAt&&<span>预计执行 {when(match.executeAt)}</span>}<small>记录号 {match.id}</small></li>);
 return <section className="transfer-risk-review" aria-label="转账风险核对">
  {review.matches.length>0&&<><h3>可能重复转账</h3><p>同一事项内，10分钟内已有相同收款人、相同或相近金额的记录。请确认这次确实需要再转一笔。</p><ul>{records.slice(0,3)}</ul>{records.length>3&&<details><summary>其余 {records.length-3} 条记录</summary><ul>{records.slice(3)}</ul></details>}</>}
  {review.large&&<p><strong>大额转账提醒：</strong>本笔达到5000元，请再次核对收款账户、金额和用途。</p>}
  <label><input type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>我已核对{review.matches.length?'上述记录，仍需新增这笔转账':'收款账户和大额转账金额'}</span></label>
  <small>勾选只表示已核对；点击下方确认按钮才授权。记录时间为北京时间。</small>
 </section>;
}
