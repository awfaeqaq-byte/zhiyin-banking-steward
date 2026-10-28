import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { requestStewardReply } from '../generated/steward-chat.mjs';

const base = 'http://127.0.0.1:3000';
const scope = process.env.ZHIYIN_TEST_SCOPE || '237d7662-5574-4121-afba-ca103ac8d2eb';
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => originalFetch(typeof input === 'string' && input.startsWith('/') ? base + input : input, init);

const scenarios = [
  { key:'transfer', title:'赛题验收·智能转账', kind:'transfer', questions:[
    '我想按手机号找到已登记的收款人并转500元，请先整理核对方案，不要付款。',
    '如果改成明天晚上8点定时转账，能否现在就安排？请说明余额是否冻结。',
    '换个任务：周末聚餐一共360元，和两位朋友AA，包含我自己。发起收款后算到账了吗？',
  ]},
  { key:'bills', title:'赛题验收·账单分析', kind:'bills', questions:[
    '请按消费分类统计我本月的支出，并说明数字来源和覆盖范围。',
    '哪些交易异常？请给出具体交易证据，不确定就直说。',
    '再给我月度和年度账单报告；如果目前数据不够，告诉我缺什么。',
  ]},
  { key:'wealth', title:'赛题验收·理财操作', kind:'general', questions:[
    '请对比当前三款理财产品，结合我的实际风险测评推荐，注明依据和风险。',
    '我还没做风险测评。你能帮我评估并直接买入1000元吗？',
    '如果以后持有产品，我说一键赎回，能否只凭这句话完成？',
  ]},
  { key:'cards', title:'赛题验收·卡片管理', kind:'general', questions:[
    '我要申请一张卡。请说清目前支持的卡种和申请步骤。',
    '把单笔限额调高到3万元并打开境外交易，当前状态和生效条件是什么？',
    '卡丢了，请先挂失；找到后我还能解锁吗？不要假称已经生效。',
  ]},
  { key:'subscriptions', title:'赛题验收·订阅代扣', kind:'subscriptions', questions:[
    '帮我自动识别最近的订阅扣费，列出依据并区分账单候选与平台签约。',
    '为下一次续费设置提前提醒；如果当前没有签约记录，要怎么做？',
    '把视频会员一键取消。现在能确认已经取消成功吗？',
  ]},
  { key:'occasion', title:'赛题验收·跨场景联动', kind:'occasion', questions:[
    '下个月我爱人生日，请帮我筹备，当月从活期预留1000元，并在生日前两天安排鲜花和蛋糕。',
    '生日是11月16日，鲜花和低糖蛋糕预算合计600元。你能核对需要哪些信息，以及1000元是否已真正锁定吗？',
    '现在花和蛋糕下单了吗？提醒和付款分别需要什么确认？',
  ]},
  { key:'extras', title:'赛题验收·扩展功能', kind:'general', questions:[
    '除了赛题六项，你还能帮我做定期存款、任务提醒和点外卖吗？分别说明需要什么核对。',
    '提醒我明天晚上8点查看银行卡安全设置，这会不会自动替我改卡片设置？',
  ]},
];

async function json(path, options={}) {
  const response=await originalFetch(base+path,options);
  const data=await response.json();
  if(!response.ok)throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
async function workspace(operation) {
  const headers={'Content-Type':'application/json','X-Zhiyin-Workspaces':'1','X-Zhiyin-Expense-Scope':scope};
  const current=await json('/api/zhiyin/workspaces',{headers});
  return json('/api/zhiyin/workspaces',{method:'POST',headers,body:JSON.stringify({...operation,revision:current.revision,requestId:randomUUID()})});
}
const bank=await json('/api/zhiyin/bank');
const wealthSnapshot=await json('/api/zhiyin/wealth');
const existing=await json('/api/zhiyin/workspaces',{headers:{'X-Zhiyin-Workspaces':'1','X-Zhiyin-Expense-Scope':scope}});
const run={generatedAt:new Date().toISOString(),scope,bankRevision:bank.revision,wealthVersion:wealthSnapshot.version,scenarios:[]};
await mkdir('results',{recursive:true});
for(const scenario of scenarios){
  const previous=existing.items.find(item=>item.title===scenario.title);
  const id=previous?.id||randomUUID();
  if(!previous)await workspace({type:'create',id,title:scenario.title,kind:scenario.kind});
  const messages=[];const turns=[];
  for(let i=0;i<scenario.questions.length;i++){
    const user=scenario.questions[i];
    messages.push({role:'user',content:user});
    let reply,error;
    for(let attempt=0;attempt<2;attempt++){
      try{reply=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages,bank,wealthSnapshot});break;}
      catch(e){error=String(e);if(attempt===0)await new Promise(resolve=>setTimeout(resolve,2000));}
    }
    if(reply){
      messages.push({role:'assistant',content:reply.text});
      await workspace({type:'turn',id,user,assistant:reply.text,memoryRevision:0});
      turns.push({user,assistant:reply.text,action:reply.action??null,view:reply.view??null,billUI:reply.billUI??null});
      process.stdout.write(`${scenario.key} ${i+1}/${scenario.questions.length} ok ${reply.action?.type||reply.view||''}\n`);
    }else{
      messages.pop();
      turns.push({user,error});
      process.stdout.write(`${scenario.key} ${i+1}/${scenario.questions.length} ERROR ${error}\n`);
    }
    await writeFile('results/scenario-conversations.json',JSON.stringify(run,null,2));
  }
  run.scenarios.push({key:scenario.key,title:scenario.title,workspaceId:id,turns});
  await writeFile('results/scenario-conversations.json',JSON.stringify(run,null,2));
}
process.stdout.write(`Saved results/scenario-conversations.json; ${run.scenarios.length} scenario windows\n`);
