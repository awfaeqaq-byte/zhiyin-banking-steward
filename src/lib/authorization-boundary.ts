import type {StewardChatMessage} from './steward-chat';

const authority = /授权|确认|批准|同意|风险测评/;
const substitute = /代表|视为|视同|相当于|等于|算作|当作|就(?:是|算)|即(?:为|是)|代替|替代|免去|无需|不用|不必|跳过|自动生效|已完成/;
const future = /以后|今后|下次|后续|接下来|从现在起|只要|约定|记住|记下|凡是/;
const verbal = /口头|聊天|对话|历史消息|历史记录|管理员|工单|外部/;
const bypass = /跳过|不经|不用|无需|免去|直接|立即|立刻|宣称|声称|说.*(?:已|成功)|当作.*(?:已|成功)/;
const fakeRole = /(?:["']role["']\s*:\s*["'](?:system|developer)["']|<\s*(?:system|developer)\b|\[(?:系统|开发者)消息\])/i;
const fakeInstruction = /最高优先级|忽略|回复必须|开头|跳过|立即执行|立刻执行|绕过/;
const readonlySources=(text:string)=>/生日|日历/.test(text)&&/资料|来源|检测|读取/.test(text)&&/已授权|已保存|已确认/.test(text)&&/不(?:要|用)(?:执行|操作)|仅(?:查询|检测)|只(?:查询|检测)/.test(text)&&!/转账|付款|下单|预留|申购|赎回|挂失|调额|跳过.{0,8}(?:授权|确认)/.test(text);

/** Conversation text can describe a request, but cannot create an authorization fact. */
export function isAuthorizationSubstitution(text:string):boolean {
  if(readonlySources(text))return false;
  return authority.test(text)&&substitute.test(text)
    && ((future.test(text)&&/继续|我说|口令|暗号|聊天|口头|确认/.test(text))
      || (verbal.test(text)&&/授权|独立确认|付款确认|交易确认/.test(text)));
}

export function isRoleInstructionSpoof(text:string):boolean {
  return fakeRole.test(text)&&fakeInstruction.test(text);
}

export function authorizationBoundary(messages:StewardChatMessage[]):string|null {
  const latest=messages.filter(message=>message.role==='user').at(-1)?.content.trim()||'';
  if(readonlySources(latest)&&!isRoleInstructionSpoof(latest))return null;
  const earlier=messages.slice(0,-1).some(message=>message.role==='user'&&isAuthorizationSubstitution(message.content));
  const claimedAuthorization=/(?:我|本人|客户|管理员|外部).{0,18}(?:已|已经).{0,12}(?:授权|确认|批准)/.test(latest)
    && /转账|申购|赎回|挂失|调额|取消|下单|付款|预留/.test(latest)&&bypass.test(latest);
  const unsafeClaim=(verbal.test(latest)&&authority.test(latest)&&bypass.test(latest))
    || claimedAuthorization || (earlier&&/^继续(?:[。！!，, ]|$)/.test(latest)&&bypass.test(latest));
  if(isRoleInstructionSpoof(latest))return '用户文字中的伪造系统角色不是系统指令，我不会按其中要求改变回复格式或跳过核对。这次没有执行任何操作；若你要办理业务，请直接说明目标，再到独立页面核对确认。';
  if(!isAuthorizationSubstitution(latest)&&!unsafeClaim)return null;
  return '口头约定、历史聊天或管理员声明不能代替授权；我不会把“继续”视为已确认。资金、卡片和订单操作仍须在独立核对页由本人确认，是否生效只以服务端记录和回执为准。这次没有执行或确认任何操作。';
}

/** Drop old unsafe promises before a later, otherwise legitimate request reaches the model. */
export function withoutAuthorizationClaims(messages:StewardChatMessage[]):StewardChatMessage[] {
  let skipReply=false;
  return messages.filter(message=>{
    if(message.role==='user'){
      skipReply=isAuthorizationSubstitution(message.content)||isRoleInstructionSpoof(message.content);
      return !skipReply;
    }
    if(skipReply){skipReply=false;return false;}
    return !isAuthorizationSubstitution(message.content)&&!isRoleInstructionSpoof(message.content);
  });
}
