import {ArrowUpRight, ReceiptText} from 'lucide-react';
import type {MerchantSummary} from '../lib/merchant';
import './merchant-workspace.css';

const money = (value: number) => `¥${(value / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const periodName = {today: '今天', week: '近 7 天', all: '全部记录'};
const date = (at: number) => new Date(at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});

export function MerchantInsightCard({summary, shopName, onOpen}: {summary: MerchantSummary; shopName: string; onOpen?: () => void}) {
 const max = Math.max(1, ...summary.dishes.map(dish => dish.quantity));
 return <section className="merchant-insight" aria-label={`${shopName}经营分析`}>
  <header><div><ReceiptText size={19} aria-hidden="true"/><h3>{shopName}</h3></div><span>{periodName[summary.period]}</span></header>
  <div className="merchant-insight-total"><span>净收款</span><strong>{money(summary.netCollected)}</strong><small>实收减去已记录退款</small></div>
  <dl className="merchant-metrics"><div><dt>已记支出</dt><dd>{money(summary.expenseTotal)}</dd></div><div><dt>现金差额</dt><dd>{money(summary.cashDifference)}</dd></div></dl>
  {summary.dishes.length > 0 ? <div className="merchant-dish-ranking"><h4>已收款菜品排行</h4><ol>{summary.dishes.slice(0, 3).map((dish, index) => <li key={dish.id}><span className="merchant-rank">{index + 1}</span><div><div className="merchant-dish-line"><strong>{dish.name}</strong><span>{money(dish.amount)}</span></div><div className="merchant-dish-track"><span style={{width: `${Math.max(0, dish.quantity / max * 100)}%`}}/></div><small>{dish.quantity} 份 · 已收款且未退款</small></div></li>)}</ol></div> : <p className="merchant-note">还没有可统计的已收款菜品。顾客下单后，在小店记录实际收款。</p>}
  {summary.pendingTotal > 0 && <p className="merchant-pending-note">另有 {money(summary.pendingTotal)} 待收款，未计入净收款。</p>}
  <details className="merchant-scope"><summary>统计口径</summary><p>按实际记录的收款、退款和支出时间统计。现金差额仅等于净收款减已记支出，未涵盖全部成本，不能作为利润。菜品按期间收款且当前未退款订单的销量排序，金额为对应菜品收入。</p></details>
  <footer><small>本次查询快照 · {date(summary.to)}（北京时间）</small>{onOpen && <button type="button" onClick={onOpen}>查看小店<ArrowUpRight size={15} aria-hidden="true"/></button>}</footer>
 </section>;
}
