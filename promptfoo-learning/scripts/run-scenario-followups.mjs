import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {requestStewardReply} from '../generated/steward-chat.mjs';
const base='http://127.0.0.1:3000',scope='237d7662-5574-4121-afba-ca103ac8d2eb';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>nativeFetch(typeof input==='string'&&input.startsWith('/')?base+input:input,init);
async function json(path,init={}){const r=await nativeFetch(base+path,init);const d=await r.json();if(!r.ok)throw Error(`${path} ${r.status}: ${JSON.stringify(d)}`);return d;}
const headers={'Content-Type':'application/json','X-Zhiyin-Workspaces':'1','X-Zhiyin-Expense-Scope':scope};
async function state(){return json('/api/zhiyin/workspaces',{headers});}
async function saveTurn(id,user,assistant){const s=await state();return json('/api/zhiyin/workspaces',{method:'POST',headers,body:JSON.stringify({type:'turn',id,user,assistant,memoryRevision:0,revision:s.revision,requestId:randomUUID()})});}
const tasks=[
 {title:'赛题验收·智能转账',questions:[
  '正向用例：按已登记手机号13800006621，给妈妈即时转500元。只生成核对方案，不要付款。',
  '正向用例：改为明天晚上8点给妈妈转500元，请生成定时转账核对方案。',
  '正向用例：360元我和王五、张三三人平摊AA，包含我自己，请生成收款核对方案。',
 ]},
 {title:'赛题验收·理财操作',questions:[
  '正向用例：对比知银沙箱的三款理财产品，列出起购金额、风险等级、持有期和申购费；我没有风险测评，不要替我申购。',
 ]},
 {title:'赛题验收·卡片管理',questions:[
  '核对功能：知银的卡片页现在有沙箱卡申请吗？只说明演示卡种和是否需要独立提交。',
 ]},
 {title:'赛题验收·跨场景联动',questions:[
  '核对功能：在知银生活筹备页，经我独立确认后能否预留1000元沙箱预算？生日前两天是筹备/订购时间，不是送达时间，请区分。',
 ]},
 {title:'赛题验收·扩展功能',questions:[
  '核对功能：当前任务提醒支持每周循环吗？请只根据知银现有功能回答。',
 ]},
];
const bank=await json('/api/zhiyin/bank'),wealthSnapshot=await json('/api/zhiyin/wealth');
const run={generatedAt:new Date().toISOString(),cases:[]};await mkdir('results',{recursive:true});
for(const task of tasks){
 const item=(await state()).items.find(i=>i.title===task.title);if(!item)throw Error(`Missing ${task.title}`);
 for(const user of task.questions){
  if(item.messages.some(m=>m.role==='user'&&m.content===user))continue;
  const messages=[{role:'user',content:user}];let reply,error;
  for(let attempt=0;attempt<3;attempt++){try{reply=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages,bank,wealthSnapshot});break;}catch(e){error=String(e);if(attempt<2)await new Promise(r=>setTimeout(r,1500));}}
  if(reply){await saveTurn(item.id,user,reply.text);run.cases.push({title:task.title,user,assistant:reply.text,action:reply.action??null,view:reply.view??null});process.stdout.write(`${task.title} ${reply.action?.type||reply.view||'text'}\n`);}
  else{run.cases.push({title:task.title,user,error});process.stdout.write(`${task.title} ERROR ${error}\n`);}
  await writeFile('results/scenario-followups.json',JSON.stringify(run,null,2));
 }
}
