import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {requestStewardReply} from '../generated/steward-chat.mjs';

const base='http://127.0.0.1:3000';
const scope='237d7662-5574-4121-afba-ca103ac8d2eb';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>nativeFetch(typeof input==='string'&&input.startsWith('/')?base+input:input,init);
const headers={'Content-Type':'application/json','X-Zhiyin-Workspaces':'1','X-Zhiyin-Expense-Scope':scope};
async function json(path,init={}){const response=await nativeFetch(base+path,init);const value=await response.json();if(!response.ok)throw Error(`${path}: ${response.status}`);return value;}
const bank=await json('/api/zhiyin/bank');
const wealthSnapshot=await json('/api/zhiyin/wealth');
const followups=[
 {title:'赛题验收·卡片管理',user:'修复复测：知银当前可以申请哪两种演示卡？请说明是否已经提交。'},
 {title:'赛题验收·扩展功能',user:'修复复测：每周一循环提醒现在支持吗？如果不支持，请给我真实可用的下一步。'},
];
const output={generatedAt:new Date().toISOString(),cases:[]};
for(const item of followups){
 const snapshot=await json('/api/zhiyin/workspaces',{headers});
 const workspace=snapshot.items.find(value=>value.title===item.title);
 if(!workspace)throw Error(`Missing conversation: ${item.title}`);
 if(workspace.messages.some(message=>message.role==='user'&&message.content===item.user))continue;
 const reply=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:item.user}],bank,wealthSnapshot});
 const current=await json('/api/zhiyin/workspaces',{headers});
 await json('/api/zhiyin/workspaces',{method:'POST',headers,body:JSON.stringify({type:'turn',id:workspace.id,user:item.user,assistant:reply.text,memoryRevision:0,revision:current.revision,requestId:randomUUID()})});
 output.cases.push({title:item.title,user:item.user,assistant:reply.text,action:reply.action??null});
}
await mkdir('results',{recursive:true});
await writeFile('results/scenario-remediation-followups.json',JSON.stringify(output,null,2));
process.stdout.write(JSON.stringify(output.cases,null,2)+'\n');
