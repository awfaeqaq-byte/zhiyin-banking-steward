import type {StewardChatMessage} from './steward-chat';
import type {Workspace,WorkspaceRoute} from './workspaces';
import {bankRecipients,type TransferIntent} from './bank-transfer';
import {explicitTransferCents} from './transfer-amount';
import {isBankAACommand,bankAAIntent,hasUnknownAAMember} from './bank-aa-command';

export const cancelledTransfer=(text:string)=>!/(?:订阅|会员|筹备|限额)/.test(text)&&(/(?:这次|这笔|本次).{0,5}(?:先不办|不办了|不转了)|不想提供金额|取消.{0,25}(?:元|转账|待办|核对)|(?:先别转了|不转了|不用转了|先不转了)/.test(text)||/^(?:好[的吧]?，?|那|先)?(?:算了|取消(?:这笔|这个|待办|转账)?)[。！!\s]*$/.test(text.trim()));
const transferStart=/(?:给|向).{1,25}(?:转|汇)|转账|汇款|转(?:一笔|一|笔)?(?:钱|款)|从.{0,15}转\s*\d/;
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
 // A resolved routing clarification keeps the original and its supplements in
 // one job. Read these user-authored fields in order, so a specific answer can
 // resolve the original ambiguous “家人” without discarding its amount.
 for(const raw of messages.filter(m=>m.role==='user').flatMap(m=>m.content.split(/\n补充[:：]/))){
  const text=raw.trim();
  if(cancelledTransfer(text)){fields=null;continue;}
  if(/回执|记录|历史|转账成功|到账|转过|是否成功|已经转|已转/.test(text)){fields=null;continue;}
  const scheduled=/预约|定时/.test(text),date=text.match(/(\d{4})(?:年|-)(\d{1,2})(?:月|-)(\d{1,2})日?[ T]*(\d{1,2}):(\d{2})/);
  let executeAt:number|undefined;
  if(scheduled&&date&&!/每月|每周/.test(text)){
   const local=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}T${date[4].padStart(2,'0')}:${date[5]}`;
   const value=Date.parse(local+':00+08:00');
   if(Number.isFinite(value)&&new Date(value+8*3600000).toISOString().slice(0,16)===local&&value>Date.now())executeAt=value;
  }
  if(otherIntent.test(text)||isBankAACommand(text)||(!executeAt&&/预约|定时|明天|后天|每月|每周|\d{1,2}[月日号点:]/.test(text))){fields=null;continue;}
  if(transferStart.test(text))fields=/(?:改|更正|继续|原来)/.test(text)?fields||{}:{};
  if(!fields)continue;
  if(executeAt)fields.executeAt=executeAt;
  const matches=bankRecipients.filter(p=>[p.name,p.phone,...p.remark.split(' ')].some(name=>text.includes(name))||new RegExp(`(?:收款|尾号)\\s*${p.accountLast4}`).test(text));
  if(matches.length===1)fields.recipientId=matches[0].id;
  else if(matches.length>1)delete fields.recipientId;
  const amount=explicitTransferCents(text)??(()=>{const value=text.match(/(?:^|[，,；;])\s*(?:金额(?:是|为)?\s*)?(\d+(?:\.\d{1,2})?)\s*元(?:[，,；;。]|$)/)?.[1];return value?Math.round(Number(value)*100):null;})();
  if(amount!==null)fields.amount=amount;
  if(/微信|支付宝/.test(text)&&/从|用|付款/.test(text))delete fields.sourceAccountId;
  if(/常用卡|8888/.test(text)&&!/不用.{0,5}(?:常用卡|8888)/.test(text))fields.sourceAccountId='demo-8888';
 }
 return fields;
}

export function aaConversation(messages:StewardChatMessage[]){
 const users=messages.filter(m=>m.role==='user');
 const reversed=users.slice().reverse();
 let reverse=reversed.findIndex(m=>isBankAACommand(m.content)&&!/改成|改为|去掉|不参加|说明不变/.test(m.content));
 if(reverse<0)reverse=reversed.findIndex(m=>isBankAACommand(m.content));
 const start=reverse<0?-1:users.length-1-reverse;
 if(start<0)return null;
 const turns=users.slice(start).map(m=>m.content);
 if(turns.slice(1).some(t=>otherIntent.test(t)||transferStart.test(t)))return null;
 let amount='',members='',includeSelf:boolean|undefined,count:number|undefined;
 for(const text of turns){
  const values=[...text.matchAll(/(?:总额|金额|改成|改为)?\s*(-?\d+(?:\.\d+)?)\s*元/g)];
  if(values.length>1)return {intent:null,text};
  const value=values[0];
  if(value)amount=value[1];
  if(bankRecipients.some(p=>text.includes(p.name)||text.includes(p.phone))){members=text.replace(/(?:去掉|移除|不包括|不包含)\s*(?:张三|李四|王五|爸爸|妈妈)/g,'').replace(/(?:张三|李四|王五|爸爸|妈妈)\s*(?:不参加|不参与)/g,'');}
  if(/(?:是否|要不要).{0,6}(?:本人|自己|参与)|还没定/.test(text))includeSelf=undefined;
  else if(/不(?:含|包含|包括)(?:我|本人|自己)/.test(text))includeSelf=false;
  else if(/我[、，,和与]|包[含括](?:我|本人|自己)/.test(text))includeSelf=true;
  const match=text.match(/([一二两三四五六七八九十]|\d+)个?人/);if(match){const values:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};count=values[match[1]]??Number(match[1]);}
 }
 // Latest complete membership replaces the previous list, preserving total only.
 const participants=bankRecipients.filter(p=>members.includes(p.name)||members.includes(p.phone));
 if(hasUnknownAAMember(members))return {intent:null,text:members,clarification:'名单里还有未登记或不明确的参与人，请确认完整名单；没有略去陌生人或发起AA。'};
 if(includeSelf===undefined)return {intent:null,text:members,clarification:'这次AA是否包含你本人？已给的总额和其他参与人会保留。'};
 if(count!==undefined&&count!==participants.length+Number(includeSelf))return {intent:null,text:members,clarification:`人数${count}人与名单${participants.length+Number(includeSelf)}人不一致，请确认最终名单，尚未发起AA。`};
 const combined=`名单${includeSelf?'我、':''}${participants.map(p=>p.name).join('、')}，总额${amount}元，${participants.length+Number(includeSelf)}人，银行AA`;
 const intent=bankAAIntent(combined);
 const title=turns.slice().reverse().map(t=>t.match(/(?:收款说明|说明)(?:写|是|为|改为|改成)[：:]?\s*([^，,。；;]{1,60})/)?.[1]).find(Boolean);
 return {intent:intent?{...intent,...(title?{title}: {})}:null,text:combined};
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
 if(current.kind==='transfer'&&!transferStart.test(prompt)&&!otherIntent.test(prompt))return route();
 if(current.kind==='subscriptions'&&!/转账|申购|赎回|挂失|生日|点餐|消费分析/.test(prompt)&&(/云盘|音乐|视频|微信|支付宝|提醒|取消|更正|重新|继续|失败|成功/.test(prompt)||current.progress?.waitingFor))return route();
 if(/[,，；;。！？!?\n]/.test(prompt)&&!/(?:只看|截止|起始|时间|日期|预算|地址|电话)/.test(prompt))return null;
 if(current.kind==='occasion'&&!/转账|申购|赎回|挂失|取消订阅|分析账单|点餐/.test(prompt))return route();
 if(current.kind==='bills'&&!/点外卖|外卖|解释.*复利|介绍|天气|旅游|旅行|转账|申购|赎回|挂失|生日|订阅|点餐/.test(prompt)&&!/转账|申购|赎回|挂失|生日|订阅|点餐/.test(prompt))return route();
 if(current.kind==='general'&&/理财|申购|赎回|持仓|银行卡|限额|我的卡|这张卡|R[123]|7天/.test(history)&&!/转账|账单|订阅|生日|点餐/.test(prompt)&&(/改|补|继续|元|份|8888|风险|产品|持仓|支付|恢复|限额|成功|核查|核对|没看见|人民币/.test(prompt)||current.progress?.waitingFor))return route();
 return null;
}
