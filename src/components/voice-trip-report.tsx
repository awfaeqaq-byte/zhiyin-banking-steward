import {Check,ReceiptText,Repeat2} from 'lucide-react';
import {readVoiceTripReport,type VoiceTripReport as Report} from '../lib/voice-trip-report';
import './voice-trip-report.css';
const money=(v:number)=>'¥'+(v/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(v:string|number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(v));
export function VoiceTripReport({report}:{report:Report}){
 const d=readVoiceTripReport(report);if(!d)return null;
 const done=d.stage==='done';
 return <section className="voice-trip-report" aria-label="旅行账单与续费" data-stage={d.stage}>
  <div className="voice-trip-bill">
   <div className="voice-trip-heading"><ReceiptText size={17}/><strong>海边旅行账单</strong><span>{d.entries.length}笔 · {d.days.length}天</span></div>
   <div className="voice-trip-total"><strong>{money(d.total)}</strong><span>本次AA总额</span></div>
   <div className="voice-trip-days">{d.days.map(v=><span key={v.date}>{v.date.replace('-','/')}<b>{money(v.amount)}</b></span>)}</div>
   <p className="voice-trip-types">{[...d.entries].sort((a,b)=>b.amount-a.amount).slice(0,4).map(e=>e.title).join(' · ')}等</p>
   <div className="voice-trip-members">{d.members.map(m=><div key={m.id}><span>{m.self?'你':m.name}</span><b>{money(m.amount)}</b></div>)}</div>
   <p className="voice-trip-rule">晚饭女生半份、男生一份，其余四人均分</p>
   {d.personal.map(e=><p className="voice-trip-personal" key={e.id}>{e.title} {money(e.amount)} · 你请客，不计AA</p>)}
   {done?<p className="voice-trip-ready"><Check size={15}/>群收款已准备 · 待发送 <b>{money(d.collectAmount)}</b></p>:<details><summary>查看账单明细</summary><ol>{d.entries.map(e=><li key={e.id}><time>{day(e.at)}</time><span>{e.title}</span><b>{money(e.amount)}</b></li>)}</ol></details>}
  </div>
  <div className="voice-trip-renewal">
   <div className="voice-trip-heading"><Repeat2 size={16}/><strong>{done?'自动续费已取消':'发现一笔规律扣费'}</strong>{done&&<Check size={16}/>}</div>
   <div className="voice-trip-subscription"><span>{d.agreement.title}</span><b>{money(d.agreement.amount)}<small>/月</small></b></div>
   <p>{d.candidate.evidence.map(e=>day(e.occurredAt)).join('、')}<span> · 连续3期同额扣费</span></p>
   <p className="voice-trip-next">{done?'已停止后续自动扣费，历史款项不退款':`微信支付 · 下次 ${day(d.agreement.nextChargeAt!)} · 是否继续？`}</p>
  </div>
 </section>;
}
