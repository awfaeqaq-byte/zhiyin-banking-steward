import {Store} from 'lucide-react';
import {readVoiceMerchantReport,type VoiceMerchantReport as Report} from '../lib/voice-merchant-report';
import './voice-merchant-report.css';
const money=(amount:number)=>'¥'+(amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(at:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(at);
export function VoiceMerchantReport({report}:{report:Report}){
  const detail=readVoiceMerchantReport(report);if(!detail)return null;
  const {shopName,summary,days}=detail,max=Math.max(1,...days.map(d=>Math.abs(d.amount)));
  return <section className="voice-wealth-review voice-merchant-report" aria-label="小王的小店经营结果">
    <div className="voice-wealth-heading"><span className="voice-wealth-icon"><Store size={18}/></span><strong>{shopName}</strong><span className="voice-wealth-badge">{summary.period==='week'?'近7天':'今天'}</span></div>
    <div className="voice-merchant-total"><span>净收款</span><strong>{money(summary.netCollected)}</strong></div>
    <p className="voice-merchant-receipts">已收 {money(summary.collectedTotal)}<span>退款 {money(summary.refundedTotal)}</span></p>
    <div className="voice-merchant-days"><span>每天净收款</span><svg role="img" aria-label="每天净收款" viewBox="0 0 280 54">{days.map((d,i)=>{const x=i*280/days.length+5,width=280/days.length-10,height=Math.max(1,Math.abs(d.amount)/max*(d.amount<0?8:26));return <g key={d.at}><title>{day(d.at)}：{money(d.amount)}</title><rect x={x} y={d.amount<0?34:34-height} width={width} height={height} rx="3" fill={d.amount<0?'#c57b67':'#087d75'} opacity={i===days.length-1?1:.65}/><text x={x+width/2} y="50" textAnchor="middle">{day(d.at)}</text></g>;})}</svg></div>
    <div className="voice-merchant-ranking"><strong>菜品销量排行</strong>{summary.dishes.length?<ol>{summary.dishes.slice(0,3).map((dish,i)=><li key={dish.id}><i>{i+1}</i><span>{dish.name}</span><b>{dish.quantity}份</b><small>{money(dish.amount)}</small></li>)}</ol>:<p>本时段暂无已收款菜品</p>}</div>
    <p className="voice-merchant-scope">销量按已收款且未退款的订单统计</p>
  </section>;
}
