import type {StewardChatMessage} from './steward-chat';
import type {Workspace,WorkspaceRoute} from './workspaces';
import {bankRecipients,type TransferIntent} from './bank-transfer';
import {explicitTransferCents} from './transfer-amount';
import {isBankAACommand,bankAAIntent} from './bank-aa-command';

export const cancelledTransfer=(text:string)=>/^(?:好[的吧]?，?|那|先)?(?:算了|取消(?:这笔|这个|待办|转账)?|先别转了|不转了|不用转了|先不转了)[。！!\s]*$/.test(text.trim())||/^取消.{0,20}(?:元|转账|待办|核对)[。！!\s]*$/.test(text.trim());
const transferStart=/(?:给|向).{1,25}(?:转|汇)|转账|汇款/;
const otherIntent=/账单|消费分析|理财|基金|申购|赎回|订阅|会员|生日|筹备|挂失|限额|点餐|外卖/;
export const businessDomain=(text:string)=>/理财|申购|赎回|持仓|基金/.test(text)?'wealth':/银行卡|卡片|限额|挂失|无卡支付/.test(text)?'card':undefined;
export function transferUserTurns(messages:StewardChatMessage[]){
 let turns:string[]=[];
 for(const m of messages.filter(m=>m.role==='user')){if(cancelledTransfer(m.content)){turns=[];continue;}if(transferStart.test(m.content)&&!/(?:改|更正|继续|原来)/.test(m.content))turns=[];turns.push(m.content);}
 return turns;
}
/** Resolve only user-authored fields in this task. Assistant prose and prior receipts
 * cannot supply a recipient, amount or authorization. */
export function transferFields(messages:StewardChatMessage[]):Partial<TransferIntent>|null {
 let fields:Partial<TransferIntent>|null=null;
 for(const {content:raw} of messages.filter(m=>m.role==='user')){
  const text=raw.trim();
  if(cancelledTransfer(text)){fields=null;continue;}
  if(/回执|记录|历史|转账成功|到账|转过|是否成功|已经转|已转/.test(text)){fields=null;continue;}
  if(otherIntent.test(text)||isBankAACommand(text)||/预约|定时|明天|后天|每月|每周|\d{1,2}[月日号点:]/.test(text)){fields=null;continue;}
  if(transferStart.test(text))fields=/(?:改|更正|继续|原来)/.test(text)?fields||{}:{};
  if(!fields)continue;
  const matches=bankRecipients.filter(p=>[p.name,p.phone,...p.remark.split(' ')].some(name=>text.includes(name))||new RegExp(`(?:收款|尾号)\\s*${p.accountLast4}`).test(text));
  if(matches.length===1)fields.recipientId=matches[0].id;
  else if(matches.length>1)delete fields.recipientId;
  const amount=explicitTransferCents(text)??(/(?:金额|改成|改为|转|汇)/.test(text)?null:(()=>{const value=text.match(/(?:^|[，,；;])\s*(\d+(?:\.\d{1,2})?)\s*元(?:[，,；;。]|$)/)?.[1];return value?Math.round(Number(value)*100):null;})());
  if(amount!==null)fields.amount=amount;
  if(/微信|支付宝/.test(text)&&/从|用|付款/.test(text))delete fields.sourceAccountId;
  if(/常用卡|8888/.test(text)&&!/不用.{0,5}(?:常用卡|8888)/.test(text))fields.sourceAccountId='demo-8888';
 }
 return fields;
}

export function aaConversation(messages:StewardChatMessage[]){
 const users=messages.filter(m=>m.role==='user');
 const reverse=users.slice().reverse().findIndex(m=>isBankAACommand(m.content));
 const start=reverse<0?-1:users.length-1-reverse;
 if(start<0)return null;
 const turns=users.slice(start).map(m=>m.content);
 if(turns.slice(1).some(t=>otherIntent.test(t)||transferStart.test(t)))return null;
 let amount='',members='';
 for(const text of turns){
  const values=[...text.matchAll(/(?:总额|金额|改成|改为)?\s*(-?\d+(?:\.\d+)?)\s*元/g)];
  if(values.length>1)return {intent:null,text};
  const value=values[0];
  if(value)amount=value[1];
  if(bankRecipients.some(p=>text.includes(p.name)||text.includes(p.phone)))members=text;
 }
 // Latest complete membership replaces the previous list, preserving total only.
 const combined=`${members.replace(/(?:总额|金额|改成|改为)?\s*-?\d+(?:\.\d+)?\s*元/g,'').replace(/^(?:更正为|改成|改为|更正参与人为)/,'')}，总额${amount}元，银行AA`;
 return {intent:bankAAIntent(combined),text:combined};
}

/** Short answers and corrections stay with the current business. A clear new
 * business request still routes independently; this never authorizes execution. */
export function businessContinuation(prompt:string,current:Workspace|undefined):{parts:WorkspaceRoute[];clarification?:string}|null{
 if(!current||prompt.length>600)return null;
 const history=current.messages.filter(m=>m.role==='user').map(m=>m.content).join('\n');
 const nextDomain=businessDomain(prompt),lastDomain=current.messages.filter(m=>m.role==='user').slice().reverse().map(m=>businessDomain(m.content)).find(Boolean);
 if(nextDomain&&lastDomain&&nextDomain!==lastDomain)return null;
 const route=()=>({parts:[{taskId:current.id,kind:current.kind,title:current.title,text:prompt}]});
 const newBusiness=/^(?:另外|再帮我|还有|新任务)|(?:然后|同时|另外).{0,20}(?:转账|分析|申购|订阅|点餐)/;
 if(newBusiness.test(prompt))return null;
 if(current.kind==='transfer'&&!otherIntent.test(prompt))return route();
 if(current.kind==='subscriptions'&&!/转账|申购|赎回|挂失|生日|点餐|消费分析/.test(prompt)&&(/云盘|音乐|视频|微信|支付宝|提醒|取消|更正|重新|继续|失败|成功/.test(prompt)||current.progress?.waitingFor))return route();
 if(current.kind==='occasion'&&!/转账|申购|赎回|挂失|取消订阅|分析账单|点餐/.test(prompt))return route();
 if(current.kind==='bills'&&!/转账|申购|赎回|挂失|生日|订阅|点餐/.test(prompt))return route();
 if(current.kind==='general'&&/理财|申购|赎回|持仓|银行卡|限额/.test(history)&&!/转账|账单|订阅|生日|点餐/.test(prompt)&&(/改|补|继续|元|份|8888|风险|产品|持仓|支付|恢复|限额/.test(prompt)||current.progress?.waitingFor))return route();
 return null;
}
