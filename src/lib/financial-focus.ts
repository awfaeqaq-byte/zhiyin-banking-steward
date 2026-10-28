export type FinancialFocusTopic='food'|'delivery'|'ride'|'game'|'subscription'|'education'|'travel'|'large_transaction';
export type FinancialFocusRule={
  id:string;
  topic:FinancialFocusTopic;
  title:string;
  description:string;
  sourcePrompt:string;
  createdAt:number;
  updatedAt:number;
};

export const FINANCIAL_FOCUS_KEY='zhiyin-financial-focus-v1';

const topics:Array<{topic:FinancialFocusTopic;pattern:RegExp;title:string}>=[
  {topic:'large_transaction',pattern:/单笔|大额|2000元以上|两千元以上/,title:'大额消费'},
  {topic:'delivery',pattern:/外卖/,title:'外卖消费'},
  {topic:'ride',pattern:/打车|出租车|网约车/,title:'打车支出'},
  {topic:'game',pattern:/游戏|充值/,title:'游戏消费'},
  {topic:'subscription',pattern:/订阅|续费|重复扣费|长期扣费/,title:'订阅服务'},
  {topic:'education',pattern:/教育|孩子|学费|培训/,title:'教育支出'},
  {topic:'travel',pattern:/旅游|旅行|出游/,title:'旅行支出'},
  {topic:'food',pattern:/吃饭|餐饮|奶茶|咖啡/,title:'餐饮消费'},
];

export function readFinancialFocus(storage:Pick<Storage,'getItem'>=localStorage):FinancialFocusRule[]{
  try{
    const value=JSON.parse(storage.getItem(FINANCIAL_FOCUS_KEY)||'[]');
    if(!Array.isArray(value))return [];
    return value.filter((item):item is FinancialFocusRule=>item&&topics.some(topic=>topic.topic===item.topic)&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.description==='string'&&Number.isFinite(item.updatedAt));
  }catch{return [];}
}

export function writeFinancialFocus(rules:FinancialFocusRule[],storage:Pick<Storage,'setItem'>=localStorage){
  storage.setItem(FINANCIAL_FOCUS_KEY,JSON.stringify(rules.slice(0,12)));
}

function describe(topic:FinancialFocusTopic,prompt:string){
  const amount=prompt.match(/(?:超过|高于|达到|多于|满|单笔)\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*元?/);
  const threshold=amount?`¥${Number(amount[1]).toLocaleString('zh-CN')}`:'';
  if(topic==='subscription')return /重复扣费/.test(prompt)?'发现疑似重复扣费时告诉我':'出现新的自动续费或长期扣费时告诉我';
  if(topic==='education')return '每月汇总孩子教育相关支出';
  if(topic==='travel')return '单独统计旅行相关支出及变化';
  if(topic==='large_transaction')return threshold?`单笔超过 ${threshold} 时提醒我`:'只提醒值得核对的大额消费';
  if(threshold)return `单月超过 ${threshold} 时提醒我`;
  if(/每个月|每月/.test(prompt))return '每月汇总并说明主要变化';
  return '持续统计，出现明显变化时告诉我';
}

export type FinancialFocusChange={rules:FinancialFocusRule[];message:string;kind:'added'|'updated'|'removed'|'not_found';rule?:FinancialFocusRule};

export function applyFinancialFocusCommand(prompt:string,current:FinancialFocusRule[],now=Date.now()):FinancialFocusChange|null{
  const text=prompt.trim();
  if(/仅分析|只分析|只作.{0,6}分析|仅作.{0,6}分析|名称分析|仅询问|只问|只(?:给建议|比较)|不(?:要|用)(?:实际)?(?:执行|操作)|(?:引号|名称|标题).{0,15}(?:不是|不作为|当作|只是)/.test(text))return null;
  const topicInfo=topics.find(item=>item.pattern.test(text));
  if(!topicInfo)return null;
  const removing=/取消.*(?:关注|提醒|统计)|不再.*(?:关注|提醒|统计)|别再.*(?:关注|提醒|统计)|停止.*(?:关注|提醒|统计)/.test(text);
  const creating=/以后|持续关注|重点关注|帮我关注|提醒我|告诉我|每个月帮我|每月帮我|单独统计|只提醒/.test(text);
  if(!removing&&!creating)return null;
  const existing=current.find(rule=>rule.topic===topicInfo.topic);
  if(removing){
    if(!existing)return {rules:current,message:`目前没有正在关注“${topicInfo.title}”，所以没有修改。`,kind:'not_found'};
    return {rules:current.filter(rule=>rule.id!==existing.id),message:`好的，已停止关注“${existing.title}”。以后不会再按这条规则主动提醒你。`,kind:'removed',rule:existing};
  }
  const rule:FinancialFocusRule={
    id:existing?.id||`focus-${topicInfo.topic}-${now}`,
    topic:topicInfo.topic,
    title:topicInfo.title,
    description:describe(topicInfo.topic,text),
    sourcePrompt:text.slice(0,200),
    createdAt:existing?.createdAt||now,
    updatedAt:now,
  };
  const rules=[rule,...current.filter(item=>item.topic!==rule.topic)].slice(0,12);
  return {rules,rule,kind:existing?'updated':'added',message:`明白，已${existing?'更新':'加入'}“我的关注”：${rule.title}——${rule.description}。你随时可以直接说“停止关注${rule.title}”。`};
}
