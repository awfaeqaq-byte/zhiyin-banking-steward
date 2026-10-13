import type {BillAnalysis} from './bill-analysis';

const yuan=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
const share=(amount:number,total:number)=>total>0?Number((BigInt(amount)*1000n+BigInt(total)/2n)/BigInt(total))/10:0;

/** Derived from the ledger, never from model prose or past assistant replies. */
export function billReplyFacts(bill:BillAnalysis){
 const top=bill.categories.slice(0,2);
 return {
  range:{from:bill.from,to:bill.to,sources:bill.sources},
  amountsYuan:{消费支出:bill.expense/100,普通入账:bill.income/100,退款:bill.refund/100,转入:bill.transferIn/100,转出:bill.transferOut/100},
  definition:'普通入账不含退款、转入、转出；转出不能成为收入构成。',
  categoryShares:bill.categories.map(c=>({name:c.name,amountYuan:c.amount/100,percent:share(c.amount,bill.expense)})),
  topCategories:{names:top.map(c=>c.name),percent:share(top.reduce((sum,c)=>sum+c.amount,0),bill.expense)},
  coverage:bill.coverage,trend:bill.diagnosis.trend,limitations:bill.diagnosis.limitations,
 };
}

const tenths:Record<string,number>={一:10,二:20,三:30,四:40,五:50,六:60,七:70,八:80,九:90,十:100};
/** Check explicit current-ledger claims, without treating quoted past mistakes as new facts. */
export function billReplyIssues(text:string,bill:BillAnalysis,requireAnalysis=false):string[]{
 if(bill.needsClarification||!bill.sources.length||!bill.count)return [];
 const issues=new Set<string>();
 const prose=text.replace(/“[^”]*”|"[^"\n]*"/g,'');
 for(const clause of prose.split(/[。；，\n]/)){
  if(/错误|没有依据|混淆|不应|不能算|不准确/.test(clause))continue;
  if(/(?:收入|普通入账).{0,30}(?:包含|包括|含有|含).{0,20}转(?:入|出|账)/.test(clause)&&!/不(?:包含|包括|含有|含)/.test(clause))issues.add('普通入账不能包含转入或转出');
  for(const [pattern,cents,label] of [
   [/(?:普通入账|收入)(?:为|是|共|合计|总计|[:：])?\s*([\d,]+(?:\.\d{1,2})?)\s*元/g,bill.income,'普通入账'],
   [/(?:消费支出|合计支出|总支出)(?:为|是|共|合计|总计|[:：])?\s*([\d,]+(?:\.\d{1,2})?)\s*元/g,bill.expense,'消费支出'],
  ] as const){for(const match of clause.matchAll(pattern))if(Math.round(Number(match[1].replaceAll(',',''))*100)!==cents)issues.add(`${label}金额与当前账本不符`);}
  const sourceClaim=clause.match(/(?:已按|只看|仅看|仅统计|只统计)(微信支付|微信|支付宝)(?:账单|的账单|平台)/);
  if(sourceClaim){const expected=sourceClaim[1]==='微信'?'微信支付':sourceClaim[1];if(bill.sources.length!==1||bill.sources[0]!==expected)issues.add('回复的平台范围与当前账本不符');}
  const allClaim=/(?:已返回|已统计|合并|合计)(?:全部平台|微信(?:支付)?\s*[+＋和、]\s*支付宝)/.test(clause);
  if(allClaim&&bill.sources.length<2)issues.add('单平台记录不能声称已返回两个平台');
  const ratio=clause.match(/(占(?:比)?(?:为|是|约|达到)?|超过|高于|不足|低于)\s*(?:(\d+(?:\.\d+)?)\s*%|([一二三四五六七八九十])成)/);
  if(ratio&&!/不是|并非|不能|不超过/.test(clause)){
   const prefix=clause.slice(0,ratio.index),categories=bill.categories.filter(c=>prefix.includes(c.name));
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
 return `${bill.sources.join('+')}，${bill.from}至${bill.to}。${conclusion}\n${trend}\n普通入账${yuan(bill.income)}元；转入${yuan(bill.transferIn)}元、转出${yuan(bill.transferOut)}元单列，均不计入普通入账。退款${yuan(bill.refund)}元未抵扣消费。${bill.coverageIncomplete?'记录不完整，金额仅是已返回小计。':'仅限本次已授权账单。'}`;
}
