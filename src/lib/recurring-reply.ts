import type {StewardReply, StewardReplyRequest} from './steward-chat';
import {isRecurringReviewQuestion} from './subscription-commands';

export function recurringReviewReply(request:StewardReplyRequest):StewardReply|null {
  const question=request.messages.filter(message=>message.role==='user').at(-1)?.content||'';
  if(!isRecurringReviewQuestion(question)||!request.recurringAnalysis)return null;
  const analysis=request.recurringAnalysis;
  if(!analysis.providers.length)return {text:'当前没有交易账单读取权限，不能核对周期扣费证据。请先选择并授权账单来源；不会从旧聊天补造历史。',action:{type:'open_connections'}};
  const candidates=request.recurringCandidates||[];
  const named=candidates.filter(item=>question.includes(item.title));
  const shown=named.length?named:candidates;
  const rows=analysis.excluded.map(item=>`- ${item.title}（${item.provider==='wechat_pay'?'微信支付':'支付宝'}）：有效样本${item.sampleCount}笔；${item.reason}。实际证据${item.sampleCount>item.evidence.length?`（仅列最近${item.evidence.length}笔）`:''}：${item.evidence.map(record=>`${new Date(record.occurredAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}支出${(Math.abs(record.amount)/100).toFixed(2)}元`).join('、')}。`);
  const accepted=shown.map(item=>`- ${item.title}（${item.providerName}）：${item.evidence.length}笔实际支出符合${item.cycle}周期，最近金额${(item.amount/100).toFixed(2)}元；实际证据${item.evidence.length>6?'（仅列最近6笔）':''}：${item.evidence.slice(-6).map(record=>`${new Date(record.occurredAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}支出${(Math.abs(record.amount)/100).toFixed(2)}元`).join('、')}。推测下一次${new Date(item.estimatedNextChargeAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}；仅为账单候选，不证明已签约，也不保证一定扣费。`);
  return {text:['这些历史支出不能直接认定为已开通自动续费。按本轮授权快照中的历史样本核对，不限于本月：',...rows,...accepted,rows.length||accepted.length?'':'本轮没有可解释的有效周期样本，不能编造往月交易。',analysis.totalExcluded>analysis.excluded.length?`未识别组共${analysis.totalExcluded}组，此处列出${analysis.excluded.length}组；可告诉我具体商家继续核对。`:'',analysis.incomplete?'平台历史数据返回不完整，结论仅限本次样本。':'结论仅限本轮返回的历史记录，不代表全部账户或全部历史；未识别不等于证明没有订阅。'].filter(Boolean).join('\n')};
}
