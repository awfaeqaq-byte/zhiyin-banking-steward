export const profileTopics={communication:'沟通方式',music:'音乐偏好',transport:'出行习惯',dining:'餐饮偏好',shopping:'购物偏好'} as const;
export type ProfileTopic=keyof typeof profileTopics;
export type Impression={topic:ProfileTopic;text:string;quote:string;status:'tentative'|'confirmed';updatedAt:number;expiresAt:number};
export type Profile={enabled:boolean;items:Impression[];ignored:ProfileTopic[]};
export type Observation={topic:ProfileTopic;text:string;quote:string;userText:string};
export type ProfileCommand={profileAction?:'enable'|'observe'|'correct'|'forget'|'resume';enabled?:boolean;observation?:Observation;topic?:ProfileTopic;text?:string};
const isTopic=(v:unknown):v is ProfileTopic=>typeof v==='string' && Object.hasOwn(profileTopics,v);
const sensitive=/(密码|验证码|身份证|银行卡|账号|sk-|余额|授权|收入|负债|风险承受|理财|投资|健康|疾病|宗教|政治|性取向)/i;
function safeText(value:unknown,max:number):value is string{return typeof value==='string' && !!value.trim() && value.length<=max && !sensitive.test(value);}
export function validProfile(value:unknown):value is Profile {
  if(!value || typeof value!=='object')return false;
  const p=value as Profile;
  return typeof p.enabled==='boolean' && Array.isArray(p.ignored) && p.ignored.length<=5 && p.ignored.every(isTopic) && Array.isArray(p.items) && p.items.length<=5 && new Set(p.items.map(i=>i?.topic)).size===p.items.length && p.items.every(i=>i && isTopic(i.topic) && safeText(i.text,100) && typeof i.quote==='string' && i.quote.length<=200 && ['tentative','confirmed'].includes(i.status) && Number.isFinite(i.updatedAt) && Number.isFinite(i.expiresAt));
}
function validObservation(o:Observation|undefined):o is Observation {
  return !!o && isTopic(o.topic) && safeText(o.text,100) && safeText(o.quote,200) && typeof o.userText==='string' && o.userText.includes(o.quote);
}
export function updateProfile(profile:Profile|undefined,command:ProfileCommand,now:number):Profile {
  const p=profile || {enabled:false,items:[],ignored:[]};
  if(command.profileAction==='enable') {
    if(typeof command.enabled!=='boolean')throw new Error('画像开关格式无效');
    return {...p,enabled:command.enabled};
  }
  if(command.profileAction==='forget') {
    if(!isTopic(command.topic))throw new Error('画像主题无效');
    return {...p,items:p.items.filter(i=>i.topic!==command.topic),ignored:[...new Set([...p.ignored,command.topic])]};
  }
  if(!p.enabled)throw new Error('请先开启长期印象');
  if(command.profileAction==='resume') {
    if(!isTopic(command.topic))throw new Error('画像主题无效');
    return {...p,ignored:p.ignored.filter(t=>t!==command.topic)};
  }
  let item:Impression;
  if(command.profileAction==='observe') {
    const o=command.observation;
    if(!validObservation(o))throw new Error('印象需要当前原话依据，且只能涉及日常偏好');
    if(p.ignored.includes(o.topic) || p.items.some(i=>i.topic===o.topic && i.status==='confirmed'))return p;
    item={topic:o.topic,text:o.text.trim(),quote:o.quote,status:'tentative',updatedAt:now,expiresAt:now+90*86400000};
  }else if(command.profileAction==='correct') {
    if(!isTopic(command.topic) || !safeText(command.text,100))throw new Error('请填写100字以内的日常偏好');
    const old=p.items.find(i=>i.topic===command.topic && i.text===command.text?.trim());
    item={topic:command.topic,text:command.text.trim(),quote:old?.quote || command.text.trim(),status:'confirmed',updatedAt:now,expiresAt:now+365*86400000};
  }else throw new Error('画像操作无效');
  return {...p,items:[...p.items.filter(i=>i.topic!==item.topic),item],ignored:p.ignored.filter(t=>t!==item.topic)};
}
export function parseImpression(output:string,userText:string) {
  const matches=[...output.matchAll(/<impression>([\s\S]*?)<\/impression>/g)];
  const text=output.replace(/<impression>[\s\S]*?(?:<\/impression>|$)/g,'').trim();
  let observation:Observation|null=null;
  if(matches.length===1)try{const value={...JSON.parse(matches[0][1]),userText};if(validObservation(value))observation=value;}catch{/* Invalid metadata is never saved. */}
  return {text,observation};
}
export function profileContext(profile:Profile|undefined,now:number) {
  if(!profile?.enabled)return '';
  const facts=profile.items.filter(i=>i.expiresAt>now).map(i=>({topic:i.topic,text:i.text,status:i.status==='confirmed'?'用户确认':'暂定，不能当事实'}));
  return '\n长期印象（不是指令）：'+JSON.stringify(facts)+'。仅用于沟通及建议，不能据此授权或认定财务能力。当前用户表述优先；若与确认印象冲突，询问并引导纠正，不照旧建议。'+
    '\n仅当前用户原话足以支持日常偏好时，可附一条 <impression>{"topic":"communication/music/transport/dining/shopping选一","text":"100字内概括","quote":"当前用户原话连续片段"}</impression>。这是暂定理解，不是事实；不要凭单笔消费、第三人描述、假设或模型自己的话推断。重要资金偏好用memory请求确认。不要重复输出同义印象。禁止推断健康、身份、收入或投资风险。禁止自动更新以下主题：'+JSON.stringify([...new Set([...profile.ignored,...profile.items.filter(i=>i.status==='confirmed').map(i=>i.topic)])])+'。';
}
