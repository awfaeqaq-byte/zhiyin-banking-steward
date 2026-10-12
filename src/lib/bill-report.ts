import {buildBillAnalysis,type BillAnalysis} from './bill-analysis';
import type {ConnectedFinancialSource,ExternalFinancialProvider} from './financial-connections';

type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;

export function availableBillMonths(connections:Connections){
  const months=new Set<string>();
  for(const source of Object.values(connections)){
    if(!source?.scopes.includes('transactions'))continue;
    for(const row of source.transactions){
      const time=Date.parse(row.occurredAt);
      if(Number.isFinite(time))months.add(new Date(time+8*3600000).toISOString().slice(0,7));
    }
  }
  return [...months].sort().reverse();
}

export function buildMonthlyBillReport(connections:Connections,month:string):BillAnalysis|null{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
  const [year,number]=month.split('-').map(Number);
  const end=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  const analysis=buildBillAnalysis(connections,`${year}年${number}月账单`,Date.parse(`${end}T23:59:59+08:00`));
  return analysis.needsClarification?null:analysis;
}

export function buildAnnualBillReport(connections:Connections,year:number){
  if(!Number.isSafeInteger(year)||year<2000||year>2100)return null;
  const months=Array.from({length:12},(_,index)=>buildMonthlyBillReport(connections,`${year}-${String(index+1).padStart(2,'0')}`)!).filter(item=>item.count>0);
  if(!months.length)return null;
  const categories=new Map<string,number>();
  for(const month of months)for(const item of month.categories)categories.set(item.name,(categories.get(item.name)||0)+item.amount);
  const total=(key:'expense'|'income'|'refund'|'transferIn'|'transferOut')=>months.reduce((sum,item)=>sum+item[key],0);
  return {
    year,months,expense:total('expense'),income:total('income'),refund:total('refund'),
    transferIn:total('transferIn'),transferOut:total('transferOut'),
    categories:[...categories].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount),
    count:months.reduce((sum,item)=>sum+item.count,0),
    incomplete:months.some(item=>item.coverageIncomplete),
    sources:[...new Set(months.flatMap(item=>item.sources))],
  };
}
