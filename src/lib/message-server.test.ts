import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
const scope='11111111-1111-4111-8111-111111111111';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-message-'));dirs.push(dir);return dir;}
it('服务端独立完成分类和回复，离开页面后仍保存正文；同消息ID不会重复请求模型',async()=>{
 const dir=fixture(),model=vi.fn(async()=> '你好，我在。'),service=createMessageService(dir,model),id=crypto.randomUUID(),owner=crypto.randomUUID();
 service.submit(scope,{id,text:'你好',currentId:'',memoryRevision:0});await service.idle(scope);
 let state=service.get(scope);const job=state.runs![0].jobs[0];expect(model).not.toHaveBeenCalled();
 service.claim(scope,id,job.id,owner);
 await service.reply(scope,{id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});
 state=service.get(scope);expect(state.runs![0].status).toBe('completed');expect(state.conversation?.at(-1)?.content).toBe('你好，我在。');
 await service.reply(scope,{id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});expect(model).toHaveBeenCalledOnce();
 expect(createMessageService(dir,model).get(scope).conversation).toEqual(state.conversation);
});
it('真实分类输出只负责编号，错复制的旧text不会替换这次转账金额',async()=>{
 const dir=fixture(),model=vi.fn(async()=>JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'妈妈生活费',text:'转1000给妈妈'}]})),service=createMessageService(dir,model),id=crypto.randomUUID();
 service.submit(scope,{id,text:'转500给妈妈',currentId:'',memoryRevision:0});await service.idle(scope);
 expect(service.get(scope).runs![0].jobs[0].text).toBe('转500给妈妈');expect(service.get(scope).items[0].pending?.[0].text).toBe('转500给妈妈');
});
it('服务重启把未完成分类标为中断，保留原话与重试提示，不重放业务',()=>{
 const dir=fixture(),id=crypto.randomUUID();createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`)).change({type:'message-submit',id,text:'给妈妈转500',currentId:'',memoryRevision:0,requestId:crypto.randomUUID(),revision:0});
 const model=vi.fn(),service=createMessageService(dir,model);expect(service.get(scope).runs![0].status).toBe('interrupted');expect(model).not.toHaveBeenCalled();
 expect(service.get(scope).conversation?.at(-1)?.retryPrompt).toBe('给妈妈转500');
});
it('并发重试共用模型调用，完成后的其他归属仍不能写结果',async()=>{
 const dir=fixture();let release!:(value:string)=>void;const model=vi.fn(()=>new Promise<string>(resolve=>{release=resolve;}));const service=createMessageService(dir,model),id=crypto.randomUUID(),owner=crypto.randomUUID();service.submit(scope,{id,text:'你好',currentId:'',memoryRevision:0});await service.idle(scope);const job=service.get(scope).runs![0].jobs[0];service.claim(scope,id,job.id,owner);
 const input={id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}};const first=service.reply(scope,input),second=service.reply(scope,input);release('我在。');await Promise.all([first,second]);expect(model).toHaveBeenCalledOnce();
 expect(()=>service.complete(scope,{type:'message-complete',id,jobId:job.id,owner:'other',assistant:'替换结果',memoryRevision:0,failed:false})).toThrow('归属');
});
it('分类追问的补充带上待澄清原请求，同时保持这轮原文不可变',async()=>{
 const dir=fixture(),model=vi.fn(async(payload:{instructions:string;input:Array<{role:string;content:string}>})=>{
  if(payload.input.some(m=>m.content.includes('本轮原文片段 0（系统编号，唯一新请求）："改成30"')))return JSON.stringify({parts:[],clarification:'要改今晚聚餐还是周末旅行？'});
  expect(payload.input.some(m=>m.content.includes('待澄清数据：')&&m.content.includes('改成30')&&m.content.includes('今晚聚餐还是周末旅行'))).toBe(true);
  return JSON.stringify({parts:[{taskId:null,kind:'general',title:'今晚聚餐',segmentIds:[0]}]});
 });const service=createMessageService(dir,model);service.submit(scope,{id:crypto.randomUUID(),text:'改成30',currentId:'',memoryRevision:0});await service.idle(scope);
 const id=crypto.randomUUID();service.submit(scope,{id,text:'今晚聚餐',currentId:'',memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(r=>r.id===id)!;expect(run.status).toBe('ready');expect(run.prompt).toBe('今晚聚餐');expect(run.jobs[0].text).toBe('今晚聚餐');
});

it('长请求经两轮澄清仍完整到达转账处理，补充内容不替换原始交代',async()=>{
 const original=`请先理解这笔转账的用途。${'用于家庭日常生活开支，'.repeat(18)}请转账783给家人`;
 const dir=fixture();let count=0;const model=vi.fn(async()=>{
  count++;
  if(count===1)return JSON.stringify({parts:[],clarification:'给哪位家人？'});
  if(count===2)return JSON.stringify({parts:[],clarification:'是现在办理还是预约？',continuesClarification:true});
  if(count===3)return JSON.stringify({parts:[],clarification:'是现在办理还是预约？'});
  if(count===4)return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'家人生活费',segmentIds:[0]}],continuesClarification:true});
  if(count===5)return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'家人生活费'}]});
  return '已为妈妈整理783元转账方案，请确认。[ZHIYIN_ACTION:TRANSFER|妈妈|783]';
 });
 const service=createMessageService(dir,model),first=crypto.randomUUID(),second=crypto.randomUUID(),third=crypto.randomUUID(),owner=crypto.randomUUID();
 service.submit(scope,{id:first,text:original,currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:second,text:'妈妈',currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:third,text:'现在办理',currentId:'',memoryRevision:0});await service.idle(scope);
 const state=service.get(scope),run=state.runs!.find(r=>r.id===third)!;expect(run.status).toBe('ready');expect(run.prompt).toBe('现在办理');expect(run.jobs[0].text).toContain(original);expect(run.jobs[0].text).toContain('妈妈');
 service.claim(scope,third,run.jobs[0].id,owner);await service.reply(scope,{id:third,jobId:run.jobs[0].id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});
 const payload=model.mock.calls.at(-1)?.[0] as unknown as {instructions:string;input:Array<{content:string}>};expect(payload.input.at(-1)?.content).toContain('783');expect(payload.instructions).toContain('转账');
 expect(service.get(scope).conversation?.filter(m=>m.role==='user').map(m=>m.content)).toEqual([original,'妈妈','现在办理']);
});
it('澄清期间转向新事项不携带未确认的旧金额或跨任务上下文',async()=>{
 const dir=fixture();let count=0;const model=vi.fn(async()=>{count++;return count===1?JSON.stringify({parts:[],clarification:'给哪位家人？'}):JSON.stringify({parts:[{taskId:null,kind:'general',title:'杭州介绍'}],continuesClarification:false});});
 const service=createMessageService(dir,model);service.submit(scope,{id:crypto.randomUUID(),text:'请转账783给家人',currentId:'',memoryRevision:0});await service.idle(scope);
 const id=crypto.randomUUID();service.submit(scope,{id,text:'介绍一下杭州',currentId:'',memoryRevision:0});await service.idle(scope);const run=service.get(scope).runs!.find(r=>r.id===id)!;
 expect(run.jobs[0].text).toBe('介绍一下杭州');expect(run).not.toHaveProperty('sourcePrompt');
});
it('服务端失败重试复用原消息且不重放已经成功的事项',async()=>{
 const dir=fixture(),model=vi.fn(async()=>JSON.stringify({parts:[{taskId:null,kind:'aa',title:'聚餐',segmentIds:[0]},{taskId:null,kind:'transfer',title:'生活费',segmentIds:[1]}]})),service=createMessageService(dir,model),id=crypto.randomUUID(),owner=crypto.randomUUID();
 service.submit(scope,{id,text:'饮料18，给妈妈转500',currentId:'',memoryRevision:0});await service.idle(scope);const [one,two]=service.get(scope).runs![0].jobs;
 service.claim(scope,id,one.id,owner);service.complete(scope,{type:'message-complete',id,jobId:one.id,owner,assistant:'饮料已记好',memoryRevision:0,failed:false});
 service.claim(scope,id,two.id,owner);service.complete(scope,{type:'message-complete',id,jobId:two.id,owner,assistant:'模型失败',memoryRevision:0,failed:true});
 const retryId=crypto.randomUUID();service.retry(scope,{id,retryId,memoryRevision:0});await service.idle(scope);const state=service.get(scope);
 expect(state.runs).toHaveLength(1);expect(state.runs![0].jobs[0].status).toBe('completed');expect(state.runs![0].jobs[1].status).toBe('queued');expect(model).toHaveBeenCalledOnce();
 service.retry(scope,{id,retryId,memoryRevision:0});expect(service.get(scope).runs![0].jobs).toEqual(state.runs![0].jobs);
});
