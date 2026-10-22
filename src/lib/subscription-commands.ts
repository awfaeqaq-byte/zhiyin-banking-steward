import type {StewardReply, StewardReplyRequest, StewardSubscription} from './steward-chat';
import {isSubscriptionListQuestion} from './subscription-access';

const cancel = /(?:取消|关闭|停止)(?!提醒|提示).{0,55}(?:自动续费|订阅|会员|云盘|音乐|视频)/;
const selector = /^(?:改成|改为|换成|换为|就|选|选择)?(?:微信(?:支付)?|支付宝)\s*(?:\d+(?:\.\d{1,2})?元)?(?:的)?(?:那|这)?(?:一)?项[。！!？?\s]*$/;
const preference = /(?:稍后再说|暂缓|明天再说|都(?:要)?保留|全部保留|不(?:要|用)再提示|重新评估|重新检查)/;
const otherBusiness = /转账|汇款|给.{0,15}转|AA|aa|点餐|外卖|生日|日历|银行卡/;
const quoted = /ZHIYIN_ACTION:|原样|展示.*(?:指令|文字|标记)|不要(?:操作|办理|执行)|不(?:要|用)?取消|暂不取消|只.{0,40}提醒|(?:取消|关闭).{0,40}提醒/;

export function isSubscriptionRouteIntent(text:string, currentSubscriptionTask=false):boolean {
  if(otherBusiness.test(text)||quoted.test(text))return false;
  return isSubscriptionListQuestion(text)||cancel.test(text)
    ||preference.test(text)&&(/订阅|会员|音乐|视频|云盘|这组|两项/.test(text)||currentSubscriptionTask)
    ||currentSubscriptionTask&&selector.test(text)
    ||isRecurringReviewQuestion(text);
}

export function isRecurringReviewQuestion(text:string):boolean {
  return !otherBusiness.test(text)&&/订阅|自动续费|周期扣费|识别/.test(text)
    && /账单|历史|候选|样本|三期|两期|这些|为什么没|没有识别|未识别/.test(text);
}

const label=(item:StewardSubscription)=>`${item.provider==='wechat_pay'?'微信支付':'支付宝'} · ${item.title} · ${(item.amount/100).toFixed(2)}元/${item.cycle}`;
function targetName(text:string):string {
  return (text.match(/(?:取消|关闭|停止)\s*(.+?)(?:自动续费|订阅|签约|[，,。！!？?]|$)/)?.[1]||'').replace(/^(?:一下|微信支付|微信|支付宝)/,'').replace(/\d+(?:\.\d{1,2})?\s*元(?:的)?/g,'').replace(/(?:的|吧|吗)$/,'').trim();
}

function matchingSubscriptions(text:string, items:StewardSubscription[]):StewardSubscription[] {
  const name=targetName(text);
  const exact=items.filter(item=>text.includes(item.id)||name===item.title);
  if(exact.length)return exact;
  // Compare complete names after removing common membership/billing wording.
  // Keep product qualifiers so a partial merchant name cannot select another plan.
  const normalize=(value:string)=>value.replace(/自动续费|连续包[月季年]|续费|订阅|会员|vip|\s/gi,'');
  const normalized=normalize(name);
  return normalized?items.filter(item=>normalize(item.title)===normalized):[];
}

/** Prepare one real current target. This never calls the partner cancellation API. */
export function subscriptionCommandReply(request:StewardReplyRequest):StewardReply|null {
  const users=request.messages.filter(message=>message.role==='user');
  const text=users.at(-1)?.content.trim()||'';
  if(quoted.test(text)||otherBusiness.test(text)||!request.subscriptionAccess)return null;
  const previous=[...users.slice(0,-1)].reverse().find(message=>cancel.test(message.content)&&!quoted.test(message.content)&&!otherBusiness.test(message.content));
  const changing=selector.test(text)&&Boolean(previous);
  const cancelling=cancel.test(text)||changing;
  const choosing=preference.test(text)&&/订阅|会员|音乐|视频|云盘|这组|两项/.test(text);
  if(!cancelling&&!choosing)return null;
  const providers=request.subscriptionAccess.providers;
  const desired=/微信/.test(text)&&!/支付宝/.test(text)?'wechat_pay':/支付宝/.test(text)&&!/微信/.test(text)?'alipay':undefined;
  if(!providers.length||desired&&!providers.includes(desired))return {text:'当前没有对应平台的自动续费读取授权。请先连接并核对自动续费权限；这次没有取消或修改提醒。',action:{type:'open_connections',scope:'autopay',...(desired?{provider:desired}:{})}};
  const items=request.subscriptions.filter(item=>providers.includes(item.provider));
  if(choosing){
    const groups=(request.duplicateGroups||[]).filter(group=>group.titles.every(title=>items.some(item=>item.title===title)));
    const categories=['音乐','视频','云盘','外卖'].filter(word=>text.includes(word));
    const matching=groups.filter(group=>categories.length?categories.some(word=>group.category?.includes(word)||group.titles.some(title=>title.includes(word))):groups.length===1||group.titles.some(title=>text.includes(title)));
    if(matching.length!==1)return {text:matching.length?'有多组同类订阅，请说明是哪一组；这次没有修改偏好。':'请说明要处理哪组同类订阅，例如音乐或视频；这次没有修改偏好。',waitingQuestion:'要处理哪一组同类订阅？'};
    const decision=/稍后再说|暂缓|明天再说/.test(text)?'later':/重新评估|重新检查/.test(text)?'review':'keep';
    return {text:decision==='later'?'这组重复提示暂缓一天；续费提醒、签约和费用不变。':decision==='review'?'重新核对这组重复提示；签约和续费提醒不变。':'保留这组订阅，不再提示该组合重复；签约、续费提醒和费用不变。',action:{type:'set_duplicate_preference',groupId:matching[0].id,decision}};
  }
  const named=targetName(text);
  const origin=changing?previous!.content:text;
  const titles=matchingSubscriptions(origin,items);
  let matches=matchingSubscriptions(text,items);
  if(changing)matches=titles;
  if(!matches.length&&!changing)return {text:`当前有效清单没有匹配到${named||'这个项目'}，可能已关闭或名称不符。请核对名称和平台；没有替换为其他订阅，也没有取消。`};
  if(desired)matches=matches.filter(item=>item.provider===desired);
  const amount=text.match(/(\d+(?:\.\d{1,2})?)\s*元/);
  if(amount)matches=matches.filter(item=>item.amount===Math.round(Number(amount[1])*100));
  if(matches.length!==1)return {text:matches.length?`找到同名项目，请选择平台与金额：\n${matches.map(item=>`- ${label(item)}`).join('\n')}\n尚未取消。`:`本轮清单没有符合该平台和金额的项目，请核对后再选；尚未取消。`,waitingQuestion:'请选择当前清单中的平台和金额。'};
  const item=matches[0];
  return {text:`准备核对取消：${label(item)}。确认后会停止该项目后续自动续费，不退还历史扣款；现在尚未取消，请打开目标核对并由本人最终确认。`,action:{type:'prepare_cancel',provider:item.provider,subscriptionId:item.id}};
}
