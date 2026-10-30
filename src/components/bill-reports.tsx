import {useMemo,useState} from 'react';
import type {ConnectedFinancialSource,ExternalFinancialProvider} from '../lib/financial-connections';
import {formatCny} from '../lib/financial-connections';
import {availableBillMonths,buildAnnualBillReport,buildMonthlyBillReport} from '../lib/bill-report';
import './bill-reports.css';

const signed=(cents:number)=>`${cents<0?'−':'+'}${formatCny(Math.abs(cents))}`;
type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;

function CategoryChart({categories,total}:{categories:{name:string;amount:number}[];total:number}){
  const share=(amount:number)=>total?Math.round(amount/total*100):0;
  return <section className="bill-report-section" aria-label="消费分类">
    <h4>消费分类</h4>
    <div className="bill-category-strip" role="img" aria-label={`消费分类：${categories.map(item=>`${item.name} ${share(item.amount)}%`).join('，')}`}>
      {categories.map((item,index)=><span key={item.name} className={`bill-category-color-${index%6}`} style={{flexGrow:item.amount}}/>)}
    </div>
    <ul className="bill-category-list">{categories.map((item,index)=><li key={item.name}>
      <span className={`bill-category-dot bill-category-color-${index%6}`} aria-hidden="true"/><span>{item.name}</span><strong>{formatCny(item.amount)}</strong><small>{share(item.amount)}%</small>
    </li>)}</ul>
  </section>;
}

export function BillReports({connections,onConnect}:{connections:Connections;onConnect:()=>void}){
  const months=useMemo(()=>availableBillMonths(connections),[connections]);
  const [view,setView]=useState<'month'|'year'>('month');
  const [selection,setSelection]=useState('');
  const chosen=months.includes(selection)?selection:months[0];
  const year=Number(chosen?.slice(0,4));
  const monthly=chosen?buildMonthlyBillReport(connections,chosen):null;
  const annual=Number.isFinite(year)?buildAnnualBillReport(connections,year):null;
  const report=view==='month'?monthly:annual;
  const years=[...new Set(months.map(month=>month.slice(0,4)))];
  const openMonth=(month:string)=>{setSelection(month);setView('month');};
  if(!months.length)return <section className="surface bill-report"><h2>账单报告</h2><p>当前授权范围没有返回可用账单记录。</p><button onClick={onConnect}>管理账单授权</button></section>;
  return <section className="surface bill-report" aria-label="账单报告">
    <header className="bill-report-heading"><div><h2>账单报告</h2><p>依据已授权交易重新计算</p></div><div className="bill-report-tabs"><button aria-pressed={view==='month'} onClick={()=>setView('month')}>月度</button><button aria-pressed={view==='year'} onClick={()=>setView('year')}>年度</button></div></header>
    <label className="bill-report-period">{view==='month'?'选择账期':'选择年份'}
      {view==='month'?<select value={chosen} onChange={event=>setSelection(event.target.value)}>{months.map(month=><option key={month} value={month}>{month}</option>)}</select>:<select value={year} onChange={event=>setSelection(months.find(month=>month.startsWith(event.target.value))!)}>{years.map(value=><option key={value} value={value}>{value}年</option>)}</select>}
    </label>
    {report&&<>
      <div className="bill-report-intro"><h3>{view==='month'?`${chosen} 月度账单`:`${year} 年度账单`}</h3><p>{view==='month'&&monthly?`范围：${monthly.from} 至 ${monthly.to} · 来源：${monthly.sources.join('、')}`:annual?`覆盖 ${annual.months.length} 个有记录月份、${annual.count} 笔已返回交易。缺失月份不计为零消费。`:''}</p></div>
      <dl className="bill-report-totals"><div><dt>消费支出</dt><dd>{formatCny(report.expense)}</dd></div><div><dt>普通入账</dt><dd>{formatCny(report.income)}</dd></div></dl>
      <dl className="bill-report-adjustments"><div><dt>退款</dt><dd>{formatCny(report.refund)}</dd></div><div><dt>转入 / 转出</dt><dd>{formatCny(report.transferIn)} / {formatCny(report.transferOut)}</dd></div></dl>
    </>}
    {view==='month'&&monthly&&<>
      <CategoryChart categories={monthly.categories} total={monthly.expense}/>
      <section className="bill-report-section"><h4>重点线索</h4>{monthly.diagnosis.findings.length?<ul>{monthly.diagnosis.findings.map((finding,index)=><li key={index}><strong>{finding.title}</strong><p>{finding.detail}</p><details><summary>查看对应交易</summary>{finding.evidence.map(row=><p key={`${row.providerKey}:${row.id}`}>{row.occurredAt} · {row.providerName} · {row.title} · {formatCny(-row.amount)}</p>)}</details></li>)}</ul>:<p>本期没有达到规则阈值的线索。</p>}
      {monthly.diagnosis.trend?<p>与前一个等长时段的已返回记录相比：{monthly.diagnosis.trend.changePercent}%（记录完整性未知）。</p>:<p>前期数据不足，暂不能判断趋势。</p>}</section>
      <details className="bill-report-evidence"><summary>核对纳入统计的 {monthly.count} 笔交易</summary><ul>{monthly.transactions.map(row=><li key={`${row.providerName}:${row.id}`}>{row.occurredAt} · {row.providerName} · {row.title} · {signed(row.amount)}</li>)}</ul></details>
      <p className="fine-print left">排除 {monthly.diagnosis.quality.duplicates} 条重复记录、{monthly.diagnosis.quality.invalid} 条无效记录。{monthly.coverage}</p>
    </>}
    {view==='year'&&annual&&<>
      <section className="bill-report-section"><h4>按月趋势</h4>
        <div className="bill-annual-chart" role="img" aria-label={`年度消费趋势，${annual.months.length}个有记录月份`}>{annual.months.map(item=><span key={item.from}><i style={{height:`${Math.max(2,item.expense/Math.max(1,...annual.months.map(month=>month.expense))*100)}%`}}/><small>{Number(item.from.slice(5,7))}</small></span>)}</div>
        <p className="bill-report-chart-hint">消费金额 · 月份，点下方月份查看明细</p>
        <ul className="bill-month-list">{annual.months.map(item=><li key={item.from}><button onClick={()=>openMonth(item.from.slice(0,7))} aria-label={`查看${item.from.slice(0,7)}月度账单，消费${formatCny(item.expense)}，${item.count}笔交易`}><span>{item.from.slice(0,7)}<small>{item.count} 笔{item.coverageIncomplete?' · 数据不完整':''}</small></span><strong>{formatCny(item.expense)}</strong><span aria-hidden="true">›</span></button></li>)}</ul>
      </section>
      <CategoryChart categories={annual.categories} total={annual.expense}/>
      <p className="fine-print left">来源：{annual.sources.join('、')}。仅汇总有记录的授权月份；跨月覆盖和来源完整性需逐月核对。{annual.incomplete?'部分来源返回不完整，只能视为小计。':''}</p>
    </>}
  </section>;
}
