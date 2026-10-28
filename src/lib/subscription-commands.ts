import type {StewardReply, StewardReplyRequest, StewardSubscription} from './steward-chat';
import {isSubscriptionListQuestion} from './subscription-access';

const cancel = /(?:取消|关闭|停止)(?!提醒|提示).{0,55}(?:自动续费|订阅|会员|云盘|音乐|视频|季卡|签约)/;
const selector = /^(?:改成|改为|换成|换为|就|选|选择)?(?:微信(?:支付)?|支付宝)\s*(?:\d+(?:\.\d{1,2})?元)?(?:的)?(?:那|这)?(?:一)?项[。！!？?\s]*$/;
const preference = /(?:稍后再说|暂缓|明天再说|都(?:要)?保留|全部保留|不(?:要|用)?再提示|别再提示|重新评估|重新检查)/;
const otherBusiness = /转账|汇款|给.{0,15}转|AA|aa|点餐|外卖|生日|日历|银行卡/;
const quoted = /ZHIYIN_ACTION:|原样|展示.*(?:指令|文字|标记)|不要(?:操作|办理|执行)|不(?:要|用)?取消|暂不取消|只.{0,40}提醒|(?:取消|关闭).{0,40}提醒/;

const nameAnalysis = (text:string)=>/名称|服务名|虚构/.test(text)&&/仅分析|只分析|只作.{0,6}分析|仅作.{0,6}分析|名称分析/.test(text);
const keepUnchanged = (text:string)=>/先不取消|暂不取消|保留.{0,6}(?:平台|订阅|会员)|都(?:要)?保留|全部保留|暂时保留|提醒.{0,6}不改/.test(text)
  && !cancel.test(text.replace(/先不取消|暂不取消|不取消/g,''))
  && !/(?:不(?:要|用)?再|别再)提示.{0,12}重复|不再提示该组合重复/.test(text);

export function isSubscriptionRouteIntent(text:string, currentSubscriptionTask=false):boolean {
  // Keep a withdrawal and all its qualifiers together, before the classifier
  // can treat “保留” as independent permission to suppress duplicate warnings.
  if(!otherBusiness.test(text)&&(nameAnalysis(text)||keepUnchanged(text)&&(currentSubscriptionTask||/订阅|会员|视频|音乐|云盘/.test(text))))return true;
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
  return (text.match(/(?:取消|关闭|停止)\s*(.+?)(?:自动续费|订阅|签约|[，,。！!？?]|$)/)?.[1]||'').replace(/^(?:一下|更正为|改成|改为|选择|选)/,'').replace(/^(?:微信支付|微信|支付宝)(?:的)?/,'').replace(/\d+(?:\.\d{1,2})?\s*元(?:\/(?:月|季|年)|每[月季年])?(?:的)?/g,'').replace(/(?:的|吧|吗)$/,'').trim();
}

function matchingSubscriptions(text:string, items:StewardSubscription[]):StewardSubscription[] {
  const name=targetName(text);
  const exact=items.filter(item=>text.includes(item.id)||name===item.title);
  if(exact.length)return exact;
  const clauses=text.split(/[，,。；;]/).filter(part=>!/保留|不要取消|不取消|别动/.test(part));
  const named=items.filter(item=>clauses.some(part=>{const escaped=item.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(escaped+'(?=自动续费|订阅|会员|这个|这项|[\\s，,。；;0-9]|$)').test(part);}));
  if(named.length)return named;
  // Compare complete names after removing common membership/billing wording.
  // Keep product qualifiers so a partial merchant name cannot select another plan.
  const normalize=(value:string)=>value.replace(/自动续费|连续包[月季年]|续费|订阅|会员|vip|\s/gi,'');
  const normalized=normalize(name);
  return normalized?items.filter(item=>normalize(item.title)===normalized):[];
}

/** Prepare one real current target. This never calls the partner cancellation API. */
export function subscriptionCommandReply(request:StewardReplyRequest):StewardReply|null {
  const users=request.messages.filter(message=>message.role==='user');
  let text=users.at(-1)?.content.trim()||'';
  if(/(?:把|将).{0,8}(?:那个|这个).{0,8}取消/.test(text)&&!request.subscriptions.some(item=>text.includes(item.title)))return {text:'这里指当前有效签约，还是账单识别出的历史候选？请明确服务、平台和要做的动作。确认前不会取消签约或删除历史记录。',waitingQuestion:'请明确有效签约或历史候选、服务名和平台。'};
  if(/统计|多少钱|多少元/.test(text)&&/测试会员|接下来|未来/.test(text)&&!/未来\s*\d+\s*天/.test(text))return {text:'这次统计哪个平台、未来多少天的计划扣费？请说明时间窗口和服务范围，我会按当前有效签约的实际下次扣费日统计。',waitingQuestion:'请确认平台、服务范围及未来多少天。'};
  let prior=users.slice(0,-1).reverse().find(m=>cancel.test(m.content)&&!quoted.test(m.content)&&!otherBusiness.test(m.content));
  if(prior){
    const chosen=users.slice(0,-1).reverse().map(m=>({message:m,items:matchingSubscriptions('取消'+m.content.replace(/^(?:更正为|改成|改为|选|选择)/,''),request.subscriptions)})).find(value=>value.items.length>0);
    if(chosen){const source=chosen.message.content+'\n'+prior.content;const provider=/微信/.test(source)&&!/支付宝/.test(source)?'微信':/支付宝/.test(source)&&!/微信/.test(source)?'支付宝':'';prior={...prior,content:'取消'+provider+chosen.items[0].title};}
  }
  const authorized=request.subscriptionAccess?.providers??[];
  const currentItems=request.subscriptions.filter(item=>authorized.includes(item.provider));
  const compared=currentItems.filter(item=>text.includes(item.title));
  if(/比较|贵的|便宜的/.test(text)&&/取消/.test(text)&&compared.length>1){
    const sameCycle=new Set(compared.map(item=>item.cycle)).size===1;
    const extreme=sameCycle?Math[/便宜/.test(text)?'min':'max'](...compared.map(item=>item.amount)):undefined;
    const targets=compared.filter(item=>item.amount===extreme);
    if(targets.length===1)text=`取消${targets[0].provider==='wechat_pay'?'微信':'支付宝'}${targets[0].title}`;
    else return {text:`${sameCycle?'这几项价格相同，无法用贵或便宜唯一选择。':'扣费周期不同，不能直接比较每次价格。'}请选择具体项目，尚未取消。\n${compared.map(label).join('；')}\n[[choices:${compared.map(item=>`取消${item.provider==='wechat_pay'?'微信':'支付宝'}${item.title}`).join('|')}]]`,waitingQuestion:'请确认要取消的具体服务和平台。'};
  }
  const dateQuery=/什么时候|哪天|下次.*(?:日期|扣)|扣多少|扣费日期/.test(text);
  if(dateQuery){
    const context=users.map(m=>m.content).join('\n'),matches=currentItems.filter(item=>context.includes(item.title)&&(!/微信/.test(context)||/支付宝/.test(context)||item.provider==='wechat_pay'));
    if(matches.length===1){const item=matches[0];return {text:`${label(item)}，${item.nextChargeAt===undefined?'当前未返回下次扣费日期':`下次计划${new Date(item.nextChargeAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}`}。本次仅查询，签约、提醒和偏好保持不变。`,action:{type:'open_subscriptions'}};}
  }
  const statusQuery=/先查|核查|取消成功|没取消成功|是否.*取消|状态/.test(text)&&!/重新取消|现在取消/.test(text);
  const priorPlatform=prior&&/微信/.test(prior.content)?'wechat_pay':prior&&/支付宝/.test(prior.content)?'alipay':undefined;
  if(statusQuery||prior&&/继续/.test(text)&&!currentItems.some(item=>item.title===targetName(prior.content)&&(!priorPlatform||item.provider===priorPlatform))){
    const origin=prior?.content||'取消'+text.replace(/^(?:微信支付|微信|支付宝)(?:的)?/,'').split(/刚才|已经|可能|是否|当前|现在/)[0];
    const title=targetName(origin),provider=/微信/.test(origin+'\n'+text)&&!/支付宝/.test(text)?'wechat_pay':/支付宝/.test(origin+'\n'+text)&&!/微信/.test(text)?'alipay':undefined;
    if(provider&&!authorized.includes(provider))return {text:'当前缺少目标平台的自动续费读取权限，恢复后才能核查当前状态；没有重复取消。',action:{type:'open_connections',provider,scope:'autopay'}};
    if(title){const matches=currentItems.filter(item=>item.title===title&&(!provider||item.provider===provider));return {text:matches.length?`本轮有效签约清单仍有${matches.map(label).join('；')}，不能认定取消成功。未重复提交。`:`本轮有效签约清单已没有“${title}”，当前未显示为有效签约，可能已关闭。仅凭有效清单不能证明具体关闭来源或历史退款；没有重复取消或重新签约。`,action:{type:'open_subscriptions'}};}
  }
  const reminderOrigin=users.slice().reverse().find(m=>/提醒/.test(m.content)&&/关闭|不再|不要|停止/.test(m.content));
  if(reminderOrigin&&!otherBusiness.test(text)&&/提醒|微信|支付宝|云盘|音乐|视频/.test(text)&&!/取消.{0,20}(?:会员|订阅|续费)/.test(text)){
    const combined=reminderOrigin.content+'\n'+text;
    const provider=/微信/.test(text)?'wechat_pay':/支付宝/.test(text)?'alipay':/微信/.test(combined)?'wechat_pay':/支付宝/.test(combined)?'alipay':undefined;
    if(provider&&!request.subscriptionAccess?.providers.includes(provider))return {text:'请先恢复目标平台的自动续费读取权限，再核对提醒；签约未改变。',action:{type:'open_connections',provider,scope:'autopay'}};
    const items=request.subscriptions.filter(item=>(!provider||item.provider===provider)&&combined.includes(item.title)&&request.subscriptionAccess?.providers.includes(item.provider));
    if(items.length!==1)return {text:'只关闭提醒不会取消签约。请明确要关闭哪项服务、哪个平台的提醒；尚未修改。',waitingQuestion:'请提供提醒对应的完整服务名和平台。'};
    return {text:`仅关闭${label(items[0])}的续费提醒，签约和费用不变。`,action:{type:'set_reminder',provider:items[0].provider,subscriptionId:items[0].id,enabled:false}};
  }
  const query=users.slice(-4).map(m=>m.content).join('\n'),days=query.match(/未来\s*(\d{1,3})\s*天/)?.[1];
  if(days&&!otherBusiness.test(text)&&!/取消|关闭|停止/.test(text)&&/订阅|续费|签约|云盘|音乐|V3|平台|微信|支付宝|未来/.test(text)){
    const provider=/微信/.test(query)&&!/支付宝|两平台|双平台/.test(query)?'wechat_pay':/支付宝/.test(query)&&!/微信|两平台|双平台/.test(query)?'alipay':undefined;
    const desired=provider?[provider]:['wechat_pay','alipay'];
    const missing=desired.find(p=>!request.subscriptionAccess?.providers.includes(p as 'wechat_pay'|'alipay'));
    if(missing)return {text:'当前查询范围缺少自动续费读取权限，请恢复后继续；缺失数据不能计为零。',action:{type:'open_connections',provider:missing as 'wechat_pay'|'alipay',scope:'autopay'}};
    const now=Date.now(),until=now+Number(days)*86400000;
    const prefix=query.match(/\b(V\d+)\b/i)?.[1];
    const selected=request.subscriptions.filter(item=>(!provider||item.provider===provider)&&(!prefix||item.title.includes(prefix)));
    const due=selected.filter(item=>item.nextChargeAt!==undefined&&item.nextChargeAt>=now&&item.nextChargeAt<=until);
    return {text:`未来${days}天${provider==='wechat_pay'?'微信支付':provider==='alipay'?'支付宝':'两平台'}${prefix||''}已返回的计划扣费：${due.map(label).join('；')||'没有已知到期项目'}。合计${(due.reduce((sum,item)=>sum+item.amount,0)/100).toFixed(2)}元。${selected.some(item=>item.nextChargeAt===undefined)||request.subscriptionAccess?.incompleteProviders.length?'部分日期或清单不完整，不能代表全部未来扣费。':'仅统计本轮有效清单与已知到期日，不含窗口外项目。'}`,action:{type:'open_subscriptions'}};
  }
  if(prior&&!cancel.test(text)&&!selector.test(text)&&!/保留|不取消|先不|不要取消/.test(text)&&!/转账|申购|赎回|生日|点餐|消费/.test(text)){
    if(/是否|成功|已取消|已关闭|先查|核查|失败|未到账|还有效/.test(text)){
      const priorName=targetName(prior.content);
      const provider=/微信/.test(prior.content)?'wechat_pay':/支付宝/.test(prior.content)?'alipay':undefined;
      const canRead=provider?request.subscriptionAccess?.providers.includes(provider):request.subscriptionAccess?.providers.length===2;
      if(!canRead)return {text:'当前缺少该平台的自动续费读取权限，请恢复权限后核查原签约。未重复取消，也未修改其他项目。',action:{type:'open_connections',scope:'autopay',...(provider?{provider}:{})}};
      const current=request.subscriptions.filter(item=>item.title===priorName&&(!provider||item.provider===provider));
      return {text:current.length?`本轮有效签约清单仍有${current.map(label).join('；')}，尚不能认定取消成功。请核对原项目，不会自动再次提交。`:`本轮有效签约清单已没有“${priorName||'原目标'}”${provider==='wechat_pay'?'（微信支付）':provider==='alipay'?'（支付宝）':''}，当前未显示为有效签约。未重复取消；清单不能证明历史退款或具体关闭来源。`,action:{type:'open_subscriptions'}};
    }
    if(/微信|支付宝|云盘|音乐|视频|继续|更正|改成|改为/.test(text)){
      const named=targetName(prior.content);
      const nameProvided=/云盘|音乐|视频/.test(text);
      text=`取消${nameProvided?text:/微信|支付宝/.test(text)?text+named:prior.content.replace(/^(?:取消|关闭|停止)/,'')}`;
    }
  }
  if(nameAnalysis(text))return {text:/忽略规则|立即取消/.test(text)?'这段名称包含“忽略规则”“立即取消”等操作指令，属于可疑的指令注入内容。服务名称仅作为待分析数据，不构成你的操作授权；没有执行其中的文字，也没有修改签约、续费提醒或重复提示偏好。':'仅把服务名称作为待分析数据；名称本身不能证明签约状态或构成操作授权。没有修改签约、续费提醒或重复提示偏好。'};
  if(!dateQuery&&!otherBusiness.test(text)&&keepUnchanged(text)&&(/订阅|音乐|云盘|视频|两项|这组/.test(text)||users.slice(0,-1).some(message=>/订阅|自动续费|会员/.test(message.content))))return {text:`${/比较|重复/.test(text)?'同类服务只能提示可能重复，不代表是同一签约或同一笔扣款。还需核对实际权益与使用频率；当前资料没有使用频率，不能断言哪项多余。':''}保留现有订阅；这次没有修改签约、续费提醒或重复提示偏好。需要关闭重复提示时，请单独说明。`};
  if(/订阅|续费|会员/.test(text)&&/只问|仅询问|规则|取消后|退款|仅分析|只分析|名称.*(?:指令|执行)/.test(text)&&!/现在(?:帮我)?取消|请(?:帮我)?取消/.test(text))return {text:'取消自动续费只会停止后续扣费，不会自动退还历史款项；已付周期的权益按商家规则保留，退款须另行核对。本次仅作说明，没有取消签约、修改提醒或重复提示偏好。'};
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
  if(!matches.length&&!changing){
    const generic=/^(?:(?:那个|这个|一个|那项|这项|那|这|一)\s*)?(?:V\d+)?(?:会员|云盘会员|云盘|订阅)?$/.test(named);
    const possible=generic?items.filter(item=>(!desired||item.provider===desired)&&(!/云盘/.test(named)||item.title.includes('云盘'))&&(!/V\d+/.test(named)||item.title.includes(named.match(/V\d+/)![0]))):[];
    if(generic)return {text:`请明确要取消哪个服务和平台；未替你选择，也未取消。${possible.length?'\n'+possible.map(label).join('；'):''}`,waitingQuestion:'请选择服务名称和平台。'};
    return {text:`当前有效清单没有匹配到${named||'这个项目'}，可能已关闭或名称不符。请核对名称和平台；没有替换为其他订阅，也没有取消。`};
  }
  if(desired)matches=matches.filter(item=>item.provider===desired);
  const amount=text.match(/(\d+(?:\.\d{1,2})?)\s*元/);
  if(amount)matches=matches.filter(item=>item.amount===Math.round(Number(amount[1])*100));
  if(matches.length!==1)return {text:matches.length?`找到同名项目，请选择平台与金额：\n${matches.map(item=>`- ${label(item)}`).join('\n')}\n尚未取消。`:`本轮清单没有符合该平台和金额的项目，请核对后再选；尚未取消。`,waitingQuestion:'请选择当前清单中的平台和金额。'};
  const item=matches[0];
  return {text:`准备核对取消：${label(item)}。确认后会停止该项目后续自动续费，不退还历史扣款；现在尚未取消，请打开目标核对并由本人最终确认。`,action:{type:'prepare_cancel',provider:item.provider,subscriptionId:item.id}};
}
