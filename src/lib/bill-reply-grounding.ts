import type {BillAnalysis} from './bill-analysis';

const yuan=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
const share=(amount:number,total:number)=>total>0?Number((BigInt(amount)*1000n+BigInt(total)/2n)/BigInt(total))/10:0;

export function monthlyBillExpenses(bill:BillAnalysis){
 const months=new Map<string,number>();
 for(const row of bill.transactions){
  const month=row.occurredAt.slice(0,7);
  months.set(month,(months.get(month)??0)+(row.amount<0&&row.kind!=='transfer'?-row.amount:0));
 }
 return [...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,amount])=>({month,amount}));
}

export function monthlyBillSummary(bill:BillAnalysis):string{
 const monthly=monthlyBillExpenses(bill);
 if(!monthly.length)return '';
 return `已返回记录的逐月消费小计：\n${monthly.map(({month,amount})=>`${month}：${yuan(amount)}元`).join('\n')}\n合计：${yuan(bill.expense)}元。退款、转账不抵扣消费；未列出的月份没有返回记录，不能当作零消费。各月小计不代表完整月账单。`;
}

/** Derived from the ledger, never from model prose or past assistant replies. */
export function billReplyFacts(bill:BillAnalysis){
 const top=bill.categories.slice(0,2);
 const recordedMonths=[...new Set(bill.transactions.map(row=>row.occurredAt.slice(0,7)))].sort();
 const months:string[]=[];let month=bill.from.slice(0,7);
 while(month<=bill.to.slice(0,7)&&months.length<1200){months.push(month);const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);month=next.toISOString().slice(0,7);}
 const example=(t:BillAnalysis['transactions'][number])=>({title:t.title.slice(0,60),amountYuan:t.amount/100,date:t.occurredAt,source:t.providerName});
 return {
  range:{from:bill.from,to:bill.to,sources:bill.sources},
  amountsYuan:{消费支出:bill.expense/100,普通入账:bill.income/100,退款:bill.refund/100,转入:bill.transferIn/100,转出:bill.transferOut/100},
  counts:{全部流水:bill.count,消费:bill.expenseCount},
  monthCoverage:{有记录月份:recordedMonths,未返回记录月份:months.filter(value=>!recordedMonths.includes(value)),说明:'未返回记录不代表该月消费为0，也不能证明整月账单完整。'},
  definition:'普通入账不含退款、转入、转出；转出不能成为收入构成。',
  categoryShares:bill.categories.map(c=>({name:c.name,amountYuan:c.amount/100,percent:share(c.amount,bill.expense),examples:bill.transactions.filter(t=>t.category===c.name&&t.amount<0&&!['transfer','refund','income'].includes(t.kind||'')).slice(0,2).map(example)})),
  incomeExamples:bill.transactions.filter(t=>t.amount>0&&!['refund','transfer'].includes(t.kind||'')).slice(0,3).map(example),
  topCategories:{names:top.map(c=>c.name),percent:share(top.reduce((sum,c)=>sum+c.amount,0),bill.expense)},
  coverage:bill.coverage,trend:bill.diagnosis.trend,limitations:bill.diagnosis.limitations,
 };
}

const tenths:Record<string,number>={一:10,二:20,三:30,四:40,五:50,六:60,七:70,八:80,九:90,十:100};
/** Check explicit current-ledger claims, without treating quoted past mistakes as new facts. */
export function billReplyIssues(text:string,bill:BillAnalysis,requireAnalysis=false):string[]{
 if(bill.needsClarification||!bill.sources.length||!bill.count)return [];
 const issues=new Set<string>();
 if(monthlyBillExpenses(bill).length&&/(?:逐月|每月|各月|按月).{0,20}(?:无法|不能).{0,8}(?:拆分|计算|提供|统计)|(?:缺少|没有|未提供).{0,10}逐月.{0,10}(?:金额|明细)/.test(text))issues.add('已返回月份有代码计算的小计，不能声称无法拆分或缺少逐月金额');
 const prose=text.replace(/“([^”]*)”|"([^"\n]*)"/g,(_whole,left:string|undefined,right:string|undefined)=>bill.categories.some(c=>c.name===(left??right))?(left??right)!:'');
 for(const clause of prose.split(/[。；\n]/)){
  if(/错误|没有依据|混淆|不应|不能算|不准确/.test(clause))continue;
  if(/(?:收入|普通入账).{0,30}(?:包含|包括|含有|含).{0,20}转(?:入|出|账)/.test(clause)&&!/不(?:包含|包括|含有|含)/.test(clause))issues.add('普通入账不能包含转入或转出');
  for(const [pattern,cents,label] of [
   [/(?:普通入账|收入)(?:为|是|共|合计|总计|[:：])?\s*([\d,]+(?:\.\d{1,2})?)\s*元/g,bill.income,'普通入账'],
   [/(?:消费支出|合计支出|总支出|消费)(?:为|是|共|合计|总计|约|[:：])?\s*([\d,]+(?:\.\d{1,2})?)\s*元/g,bill.expense,'消费支出'],
  ] as const){for(const match of clause.matchAll(pattern))if(Math.round(Number(match[1].replaceAll(',',''))*100)!==cents)issues.add(`${label}金额与当前账本不符`);}
  const sourceClaim=clause.match(/(?:已按|只看|仅看|仅统计|只统计)(微信支付|微信|支付宝)(?:账单|的账单|平台)/);
  if(sourceClaim){const expected=sourceClaim[1]==='微信'?'微信支付':sourceClaim[1];if(bill.sources.length!==1||bill.sources[0]!==expected)issues.add('回复的平台范围与当前账本不符');}
  const allClaim=/(?:已返回|已统计|合并|合计)(?:全部平台|微信(?:支付)?\s*[+＋和、]\s*支付宝)/.test(clause);
  if(allClaim&&bill.sources.length<2)issues.add('单平台记录不能声称已返回两个平台');
  if(/跨平台/.test(clause)&&/数据不重复|没有重复|已去重/.test(clause))issues.add('不能断言跨平台流水已去重');
  if(/具体明细(?:账单)?未返回|账单未细分|未返回(?:交易)?明细/.test(clause)&&bill.transactions.length)issues.add('已返回的交易明细不能说成没有明细');
  if(/(?:共|合计|总计|有)?\s*(\d+)笔(?:的)?消费/.test(clause)&&Number(clause.match(/(\d+)笔(?:的)?消费/)?.[1])!==bill.expenseCount)issues.add('流水总笔数不能当消费笔数');
  if(/(?:消费|支出)(?:共|合计|总计|有)?\s*(\d+)笔/.test(clause)&&Number(clause.match(/(?:消费|支出)(?:共|合计|总计|有)?\s*(\d+)笔/)?.[1])!==bill.expenseCount)issues.add('消费笔数与账本不符');
  if(/未(?:读取|获取)|没有.{0,8}(?:账单数据|账单权限)|需要重新授权/.test(clause)&&!bill.coverageIncomplete)issues.add('当前已返回授权账本，不能声称缺失');
  let previousRatioEnd=0;
  for(const ratio of clause.matchAll(/(占(?:比)?(?:为|是|约|达到)?|超过|高于|不足|低于)\s*(?:(?:总|消费)?支出(?:的)?\s*)?(?:(\d+(?:\.\d+)?)\s*%|([一二三四五六七八九十])成)/g)){
   const prefix=clause.slice(previousRatioEnd,ratio.index);previousRatioEnd=ratio.index!+ratio[0].length;
   if(/不是|并非|不能|不超过/.test(prefix))continue;
   let categories=bill.categories.filter(c=>prefix.includes(c.name));
   if(!categories.length&&/两项|两类/.test(prefix))categories=bill.categories.filter(c=>clause.slice(0,ratio.index).includes(c.name));
   if(categories.length>0&&categories.length<=2){
    const actual=share(categories.reduce((sum,c)=>sum+c.amount,0),bill.expense),claimed=ratio[2]?Number(ratio[2]):tenths[ratio[3]];
    const invalid=/超过|高于/.test(ratio[1])?actual<=claimed:/不足|低于/.test(ratio[1])?actual>=claimed:Math.abs(actual-claimed)>0.11;
    if(invalid)issues.add('分类占比与代码计算的结果不符');
   }
  }
 }
 if(requireAnalysis&&/已(?:返回|按|读取)|账单.{0,8}(?:返回|读取)/.test(prose)&&!/占|集中|主要|核对|前期|趋势|优先|建议|不足/.test(prose.replace(/核对范围|核对授权/g,'')))issues.add('只报告读取状态，没有分析支出结构');
 return [...issues];
}

/** A bounded fallback if a model cannot keep even the explicit ledger facts consistent. */
export function groundedBillReply(bill:BillAnalysis):string{
 const facts=billReplyFacts(bill),top=facts.topCategories;
 const conclusion=top.names.length?`${top.names.join('与')}合计占消费支出的${top.percent}%，可以先展开这${top.names.length===1?'一':'两'}类明细核对用途；分类占比较高本身不代表异常。`:'当前记录不足以判断消费结构。';
 const trend=bill.diagnosis.trend?`与前一个等长时段的已返回记录相比变化${bill.diagnosis.trend.changePercent}%；两期记录完整性未知，不能当作完整月环比。`:'前期记录不足，暂不能判断支出是否增加。';
 return `${bill.sources.join('+')}，${bill.from}至${bill.to}。共${bill.count}笔流水，其中消费${bill.expenseCount}笔，消费支出${yuan(bill.expense)}元。${conclusion}\n${trend}\n普通入账${yuan(bill.income)}元；转入${yuan(bill.transferIn)}元、转出${yuan(bill.transferOut)}元单列，均不计入普通入账。退款${yuan(bill.refund)}元未抵扣消费。${bill.coverageIncomplete?'记录不完整，金额仅是已返回小计。':'仅限本次已授权账单。'}`;
}
