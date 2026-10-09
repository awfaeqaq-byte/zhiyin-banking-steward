import {useMemo,useState} from 'react';
import type {ConnectedFinancialSource,ExternalFinancialProvider} from '../lib/financial-connections';
import {formatCny} from '../lib/financial-connections';
import {availableBillMonths,buildAnnualBillReport,buildMonthlyBillReport} from '../lib/bill-report';
const signed=(cents:number)=>`${cents<0?'−':'+'}${formatCny(Math.abs(cents))}`;

type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;

export function BillReports({connections,onConnect}:{connections:Connections;onConnect:()=>void}){
  const months=useMemo(()=>availableBillMonths(connections),[connections]);
  const [view,setView]=useState<'month'|'year'>('month');
  const [selection,setSelection]=useState('');
  const chosen=months.includes(selection)?selection:months[0];
  const year=Number(chosen?.slice(0,4));
  const monthly=chosen?buildMonthlyBillReport(connections,chosen):null;
  const annual=Number.isFinite(year)?buildAnnualBillReport(connections,year):null;
  if(!months.length)return <section className="surface bill-report"><h2>账单报告</h2><p>当前授权范围没有返回可用账单记录。</p><button onClick={onConnect}>管理账单授权</button></section>;
  return <section className="surface bill-report" aria-label="账单报告">
    <div className="section-line"><div><h2>账单报告</h2><p>依据已授权交易重新计算</p></div><div className="bill-report-tabs"><button aria-pressed={view==='month'} onClick={()=>setView('month')}>月度</button><button aria-pressed={view==='year'} onClick={()=>setView('year')}>年度</button></div></div>
    <label>选择账期 <select value={chosen} onChange={event=>setSelection(event.target.value)}>{months.map(month=><option key={month} value={month}>{month}</option>)}</select></label>
    {view==='month'&&monthly&&<>
      <h3>{chosen} 月度账单</h3><p>范围：{monthly.from} 至 {monthly.to} · 来源：{monthly.sources.join('、')}</p>
      <dl className="bill-report-totals"><div><dt>消费支出</dt><dd>{formatCny(monthly.expense)}</dd></div><div><dt>普通入账</dt><dd>{formatCny(monthly.income)}</dd></div><div><dt>退款</dt><dd>{formatCny(monthly.refund)}</dd></div><div><dt>转入 / 转出</dt><dd>{formatCny(monthly.transferIn)} / {formatCny(monthly.transferOut)}</dd></div></dl>
      <h4>消费分类</h4><ul>{monthly.categories.map(item=><li key={item.name}>{item.name} · {formatCny(item.amount)} · {monthly.expense?Math.round(item.amount/monthly.expense*100):0}%</li>)}</ul>
      <h4>重点线索</h4>{monthly.diagnosis.findings.length?<ul>{monthly.diagnosis.findings.map((finding,index)=><li key={index}><strong>{finding.title}</strong><p>{finding.detail}</p><details><summary>查看对应交易</summary>{finding.evidence.map(row=><p key={`${row.providerKey}:${row.id}`}>{row.occurredAt} · {row.providerName} · {row.title} · {formatCny(-row.amount)}</p>)}</details></li>)}</ul>:<p>本期没有达到规则阈值的线索。</p>}
      {monthly.diagnosis.trend?<p>与前一个等长时段的已返回记录相比：{monthly.diagnosis.trend.changePercent}%（记录完整性未知）。</p>:<p>前期数据不足，暂不能判断趋势。</p>}
      <details><summary>核对纳入统计的 {monthly.count} 笔交易</summary><ul>{monthly.transactions.map(row=><li key={`${row.providerName}:${row.id}`}>{row.occurredAt} · {row.providerName} · {row.title} · {signed(row.amount)}</li>)}</ul></details>
      <p className="fine-print left">排除 {monthly.diagnosis.quality.duplicates} 条重复记录、{monthly.diagnosis.quality.invalid} 条无效记录。{monthly.coverage}</p>
    </>}
    {view==='year'&&annual&&<><h3>{annual.year} 年度账单</h3><p>覆盖 {annual.months.length} 个有记录月份、{annual.count} 笔已返回交易。缺失月份不计为零消费。</p><dl className="bill-report-totals"><div><dt>消费支出</dt><dd>{formatCny(annual.expense)}</dd></div><div><dt>普通入账</dt><dd>{formatCny(annual.income)}</dd></div><div><dt>退款</dt><dd>{formatCny(annual.refund)}</dd></div></dl><h4>按月趋势</h4><ul>{annual.months.map(item=><li key={item.from}>{item.from.slice(0,7)} · {formatCny(item.expense)} · {item.count} 笔{item.coverageIncomplete?'（数据不完整）':''}</li>)}</ul><h4>年度消费分类</h4><ul>{annual.categories.map(item=><li key={item.name}>{item.name} · {formatCny(item.amount)}</li>)}</ul><p className="fine-print left">来源：{annual.sources.join('、')}。仅汇总有记录的授权月份；跨月覆盖和来源完整性需逐月核对。{annual.incomplete?'部分来源返回不完整，只能视为小计。':''}</p></>}
  </section>;
}
