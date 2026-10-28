import type {StewardReplyRequest,StewardReply} from './steward-chat';
import {isBillQuestion} from './bill-analysis';

export function billClarification(request:StewardReplyRequest):StewardReply|null {
 const users=request.messages.filter(m=>m.role==='user');
 const latest=users.at(-1)?.content||'';
 if(!request.billAnalysis&&!isBillQuestion(latest))return null;
 const ask=(text:string)=>({text,waitingQuestion:text});
 if(/截图|图片/.test(latest)&&!/已授权|授权查询|查.*账单/.test(latest))return ask('这段会话尚未提供可读取的截图。请提供截图，或明确改为查询已授权平台账单；这次使用哪种来源？');
 if(/退款前.{0,5}净消费|净消费.{0,5}退款前/.test(latest))return ask('这里有两个口径：退款前的消费支出，或扣除退款后的净消费。你要哪一种，还是同时列出消费、退款和净消费？');
 if(/双平台|两个平台|两平台|全部平台/.test(latest)&&/只(?:看|算|统计)|仅(?:看|算)/.test(latest)&&/微信|支付宝/.test(latest))return ask('“双平台”和“只看一个平台”范围不一致。这次只看微信支付、只看支付宝，还是两平台合计？');
 if(/那边|那个平台/.test(latest)&&!users.slice(0,-1).some(m=>/微信|支付宝/.test(m.content)))return ask('“那边”指微信支付还是支付宝？也可以明确选择两平台。');
 if(/那段时间|那个时候/.test(latest))return ask('这次要看哪段时间？请说明起始和截止日期。');
 if(/(?:从|起始|开始).{0,6}(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]/.test(latest)&&!/(?:到|至|截止|截至)(?:日期)?\s*(?:\d{4}年)?(?:\d{1,2}月)?\d{1,2}[日号]/.test(latest))return ask('起始日期记下了，请补充截止日期；我会保留已给的起点。');
 if(/分析.*消费|分析.*支出/.test(latest)&&(!request.billAnalysis||request.workspaceProgress)&&!users.some(m=>/\d{1,2}月|本月|上月|今天|昨天|最近\d+天|近\d+天/.test(m.content)))return ask('想分析哪段时间、哪个平台的消费？例如本月微信、支付宝或两平台。');
 if(/这笔|那笔/.test(latest)&&/归|分类/.test(latest)&&!request.billFocus&&!request.billAnalysis?.transactions.some(r=>latest.includes(r.title)&&latest.includes(String(Math.abs(r.amount)/100))))return ask('请明确是哪笔交易：可以点选明细，或提供平台、日期、商家和金额。确认唯一交易前不会替你选取。');
 return null;
}
export function netBillSummary(bill:NonNullable<StewardReplyRequest['billAnalysis']>){
 return `消费支出${(bill.expense/100).toFixed(2)}元，退款${(bill.refund/100).toFixed(2)}元，净消费${((bill.expense-bill.refund)/100).toFixed(2)}元。净消费为消费支出减退款，普通收入及转账不计入。`;
}
