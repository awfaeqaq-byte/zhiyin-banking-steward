import { formatCny, type FinancialTransaction } from './financial-connections';

export type DiagnosticRow = FinancialTransaction & { providerName:string; providerKey:string };
type Finding = { kind:'amount'|'frequency'|'periodic'; title:string; detail:string; suggestion:string; evidence:DiagnosticRow[] };
const dayMs=86400000;
const dateOf=(time:number)=>new Date(time).toISOString().slice(0,10);
const expense=(row:DiagnosticRow)=>row.amount<0 && row.kind!=='transfer' && row.kind!=='refund';

export function normalizeBillCategory(category:string) {
  const value=category.trim();
  const groups:Record<string,string[]>={餐饮:['餐饮美食','餐饮','餐饮外卖','美食'],交通:['出行','交通','交通出行'],购物:['购物','购物消费','日用百货'],生活缴费:['生活缴费','水电煤']};
  return Object.entries(groups).find(([,aliases])=>aliases.includes(value))?.[0] || value || '未分类';
}

export function diagnoseBills(history:DiagnosticRow[], from:string, to:string, quality:{duplicates:number;invalid:number}) {
  const current=history.filter(row=>row.occurredAt>=from && row.occurredAt<=to && expense(row));
  const findings:Finding[]=[];
  const limitations=['仅依据已返回账单；相似付款不会自动删除，跨平台同金额不等于重复扣款。'];
  const sorted=current.map(row=>-row.amount).sort((a,b)=>a-b);
  const median=sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;
  if(current.length>=5) {
    const large=current.filter(row=>-row.amount>=Math.max(100000,median*3)).sort((a,b)=>a.amount-b.amount).slice(0,2);
    for(const row of large) findings.push({kind:'amount',title:`有一笔较大消费：${row.title.slice(0,40)}`,detail:`${row.occurredAt} 支出 ${formatCny(-row.amount)}，超过本期单笔中位数的 3 倍且不少于 1,000 元。金额大不代表异常。`,suggestion:'核对是否是计划内消费；若不认识这笔交易，再查看商户详情。',evidence:[row]});
  } else limitations.push('本期消费样本不足 5 笔，暂不判断金额是否偏离日常。');
  const merchants=new Map<string,DiagnosticRow[]>();
  for(const row of history.filter(expense)) {
    const title=row.title.trim().replace(/\s+/g,' ');
    if(!title) continue;
    const key=`${row.providerKey}:${title}`;
    merchants.set(key,[...(merchants.get(key)||[]),row]);
  }
  for(const rows of merchants.values()) {
    const days=new Map<string,DiagnosticRow[]>();
    for(const row of rows.filter(row=>row.occurredAt>=from && row.occurredAt<=to)) days.set(row.occurredAt,[...(days.get(row.occurredAt)||[]),row]);
    const repeated=[...days.values()].find(items=>items.length>=3);
    if(repeated) findings.push({kind:'frequency',title:`同一天向${repeated[0].title.slice(0,40)}付款 ${repeated.length} 次`,detail:`${repeated[0].occurredAt} 有多笔独立交易记录，可能是正常分次消费，不等于重复扣款。`,suggestion:'对照订单确认是否每笔都有对应消费。',evidence:repeated.slice(0,5)});
    const recent=[...rows].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).slice(-3);
    if(recent.length<3 || recent[2].occurredAt<from || recent[2].occurredAt>to) continue;
    const gaps=recent.slice(1).map((row,i)=>(Date.parse(row.occurredAt)-Date.parse(recent[i].occurredAt))/dayMs);
    const amounts=recent.map(row=>-row.amount);
    if(gaps.every(gap=>gap>=25 && gap<=35) && Math.max(...amounts)/Math.min(...amounts)<=1.1) findings.push({kind:'periodic',title:`${recent[2].title.slice(0,40)}呈现按月付款规律`,detail:'连续三笔付款间隔为 25–35 天，金额差异不超过 10%；仅凭账单不能确认已开通自动续费。',suggestion:'确认是否是你希望保留的固定支出，再查看扣费协议。',evidence:recent});
  }
  const days=Math.round((Date.parse(to)-Date.parse(from))/dayMs)+1;
  const previousTo=dateOf(Date.parse(from)-dayMs);
  const previousFrom=dateOf(Date.parse(from)-days*dayMs);
  const previous=history.filter(row=>expense(row) && row.occurredAt>=previousFrom && row.occurredAt<=previousTo);
  const previousExpense=previous.reduce((sum,row)=>sum-row.amount,0);
  const currentExpense=current.reduce((sum,row)=>sum-row.amount,0);
  const trend=previousExpense>0 ? {previousFrom,previousTo,previousExpense,currentExpense,changePercent:Math.round((currentExpense/previousExpense-1)*100),label:'与前一个等长时段的已返回记录对比，不是完整月环比'} : null;
  if(!trend) limitations.push('前期消费记录不足，暂不能判断支出趋势。');
  else limitations.push('两期记录完整性未知，支出变化不代表真实消费水平必然变化。');
  return {quality, findings:findings.slice(0,5), totalFindings:findings.length, trend, limitations};
}
