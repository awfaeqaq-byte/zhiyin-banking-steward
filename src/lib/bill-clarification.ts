import type {StewardReplyRequest,StewardReply} from './steward-chat';
import {isBillQuestion} from './bill-analysis';

export function billClarification(request:StewardReplyRequest):StewardReply|null {
 const users=request.messages.filter(m=>m.role==='user');
 const latest=users.at(-1)?.content||'';
 if(!request.billAnalysis&&!isBillQuestion(latest))return null;
 const ask=(text:string)=>({text,waitingQuestion:text});
 const month=latest.match(/(?:\d{4}年)?(\d{1,2})月/);if(month&&(Number(month[1])<1||Number(month[1])>12))return ask('月份无效，一年只有1至12月。请更正具体账期，已说明的平台会保留；没有生成报告。');
 if(/截图|图片/.test(latest)&&!/已授权|授权查询|查.*账单/.test(latest))return ask('这段会话尚未提供可读取的截图。请提供截图，或明确改为查询已授权平台账单；这次使用哪种来源？');
 if(/退款前.{0,5}净消费|净消费.{0,5}退款前/.test(latest))return ask('这里有两个口径：退款前的消费支出，或扣除退款后的净消费。你要哪一种，还是同时列出消费、退款和净消费？');
 if((/双平台|两个平台|两平台|全部平台/.test(latest)||/微信.{0,8}支付宝.{0,8}合计/.test(latest))&&/只(?:看|算|统计)|仅(?:看|算)/.test(latest)&&/微信|支付宝/.test(latest))return ask('“双平台”和“只看一个平台”范围不一致。这次只看微信支付、只看支付宝，还是两平台合计？');
 if(/那边|那个平台/.test(latest)&&!users.slice(0,-1).some(m=>/微信|支付宝/.test(m.content)))return ask('“那边”指微信支付还是支付宝？也可以明确选择两平台。');
 if(/那段时间|那个时候/.test(latest))return ask('这次要看哪段时间？请说明起始和截止日期。');
 if(/(?:从|起始|开始).{0,6}(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]/.test(latest)&&!/(?:到|至|截止|截至)(?:日期)?\s*(?:\d{4}年)?(?:\d{1,2}月)?\d{1,2}[日号]/.test(latest))return ask('起始日期记下了，请补充截止日期；我会保留已给的起点。');
 const selectedBill=Boolean(request.billAnalysis&&!request.billAnalysis.needsClarification&&/当前账单|这份账单|该账单/.test(latest));
 if(/分析.*消费|分析.*支出/.test(latest)&&!selectedBill&&!users.some(m=>/\d{1,2}月|本月|上月|今天|昨天|最近\d+天|近\d+天/.test(m.content)))return ask('想分析哪段时间、哪个平台的消费？例如本月微信、支付宝或两平台。');
 const unscopedStart=users.some(m=>/^(?:请|帮我)?(?:分析|看看)(?:消费|支出)[。！!?]?$/.test(m.content.trim()));
 if(unscopedStart&&!/算了|暂停|不用|先不看/.test(latest)&&!users.some(m=>/微信|支付宝|双平台|两个平台|两平台|全部平台|所有平台|都看|都要/.test(m.content)))return ask('账期记下了。这次看微信支付、支付宝，还是两平台？确认来源前不生成报告或申请额外平台授权。');
 if(/这笔|那笔/.test(latest)&&/归|分类/.test(latest)&&!request.billFocus&&!request.billAnalysis?.transactions.some(r=>latest.includes(r.title)&&latest.includes(String(Math.abs(r.amount)/100))))return ask('请明确是哪笔交易：可以点选明细，或提供平台、日期、商家和金额。确认唯一交易前不会替你选取。');
 return null;
}
export function netBillSummary(bill:NonNullable<StewardReplyRequest['billAnalysis']>){
 return `消费支出${(bill.expense/100).toFixed(2)}元，退款${(bill.refund/100).toFixed(2)}元，净消费${((bill.expense-bill.refund)/100).toFixed(2)}元。净消费为消费支出减退款，普通收入及转账不计入。`;
}

export function billClassificationReply(request:StewardReplyRequest):StewardReply|null {
 const bill=request.billAnalysis;if(!bill||bill.needsClarification)return null;
 const users=request.messages.filter(m=>m.role==='user').map(m=>m.content),latest=users.at(-1)||'';
 const lookup=bill.transactions.filter(row=>latest.includes(row.title)&&latest.includes(String(Math.abs(row.amount)/100)));
 if(/列出/.test(latest)&&/日期|平台|金额|编号/.test(latest)&&!/归到|归为|改为|改成/.test(latest)&&lookup.length)return {text:lookup.map(row=>`${row.providerName} ${row.occurredAt} ${row.title} ${Math.abs(row.amount/100).toFixed(2)}元，分类${row.category}，编号${row.id}`).join('\n')+'\n仅核对当前账单原始记录，尚未修改分类或账期。'};
 const instruction=users.slice().reverse().find(t=>/归到|归为|分类.*(?:改为|改成)/.test(t));
 const category=instruction?.match(/(?:归到|归为|分类.{0,3}(?:改为|改成))\s*[“"「]?([^，,。；;？?！!”"」\s]{1,12})/)?.[1];
 if(!category||!/这笔|那笔|分类|归到|归为|只改|重列/.test(latest))return null;
 const targetText=(/重列/.test(latest)&&!/这笔|那笔|换|另一/.test(latest)?instruction||latest:latest).split(/重列/)[0];
 const matches=request.billFocus?bill.transactions.filter(row=>request.billFocus!.id===row.id&&request.billFocus!.provider===row.providerKey):bill.transactions.filter(row=>targetText.includes(row.id)||targetText.includes(row.title)&&targetText.includes(String(Math.abs(row.amount)/100)));
 if(matches.length!==1)return {text:'请唯一确认这笔交易的平台、商家和金额，或点选明细；尚未应用本次分类反馈，也没有修改原账单。',waitingQuestion:'本次分类反馈对应哪一笔交易？'};
 const target=matches[0],date=targetText.match(/(?:\d{4}年)?\d{1,2}月\d{1,2}日/)?.[0];
 if(date){const m=date.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/)!;const expected=`${m[1]||target.occurredAt.slice(0,4)}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(expected!==target.occurredAt)return {text:`商家和金额匹配到${target.providerName} ${target.occurredAt} ${target.title}，但与你提供的日期不一致。请先确认是否就是此笔；未修改分类或原统计账期。`,waitingQuestion:'请核对该交易实际日期后确认目标。'};}
 const named=bill.transactions.filter(row=>users.some(t=>t.includes(row.title)));
 const rows=named.length?named:[target];
 return {text:`仅用于本次分析的分类反馈：\n${rows.slice(0,30).map(row=>`${row.providerName} ${row.occurredAt} ${row.title} ${Math.abs(row.amount/100).toFixed(2)}元：${row.id===target.id&&row.providerKey===target.providerKey?category:row.category}`).join('\n')}\n账期仍为${bill.from}至${bill.to}，${netBillSummary(bill)}只调整已确认目标的本次解释分类，其他交易保持；暂不支持持久保存自定义分类，未持久保存或修改原始账单。`,billUI:{sections:['overview','transactions'],evidenceRefs:[]}};
}
