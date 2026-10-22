import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
const scope='11111111-1111-4111-8111-111111111111';
it('V2 新会话回复不读取其他事项的旧金额和附言，分流追问也不跨会话延续',async()=>{
 const dir=fixture(),call=vi.fn(async(payload:{instructions:string;input:Array<{role:string;content:string}>})=>{
   const input=payload.input.map(m=>m.content).join('\n');expect(input).not.toContain('旧任务附言十月房租');
   if(payload.instructions.includes('分流'))return JSON.stringify({parts:[{taskId:'new-chat',kind:'general',title:'说明规则',segmentIds:[0]}]});
   return '只解释本次请求，尚未办理。';
 });
 const service=createMessageService(dir,call);
 service.operate(scope,{type:'conversation-append',id:crypto.randomUUID(),messages:[{id:'old-note',role:'user',content:'旧任务附言十月房租',workspaceId:'old-task',memoryRevision:0}]});
 service.operate(scope,{type:'message-submit',id:'old-run',text:'改成20',currentId:'old-task',memoryRevision:0});
 service.operate(scope,{type:'message-routed',id:'old-run',parts:[],clarification:'旧任务附言十月房租需要修改吗？'});
 service.operate(scope,{type:'conversation-append',id:crypto.randomUUID(),messages:[{id:'new-only',role:'assistant',content:'当前新会话',workspaceId:'new-chat',memoryRevision:0}]});
 const storage=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 storage.change({type:'create',id:'new-chat',kind:'general',title:'新对话',revision:storage.get().revision,requestId:crypto.randomUUID()});
 const id=crypto.randomUUID(),owner=crypto.randomUUID();service.submit(scope,{id,text:'你好',currentId:'new-chat',memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(r=>r.id===id)!;expect(run.status).toBe('ready');const job=run.jobs[0];service.claim(scope,id,job.id,owner);
 await service.reply(scope,{id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});expect(call).toHaveBeenCalledOnce();
});
function fixture(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-message-'));dirs.push(dir);return dir;}
it('S12 真实消息链中同名取消、微信选择及改为支付宝沿用同一任务，不调用模型或执行取消',async()=>{
 const model=vi.fn(async()=>{throw Error('该链路不应调用分类或回复模型');});const service=createMessageService(fixture(),model),owner=crypto.randomUUID();
 const subscriptions=[{key:'wechat_pay:wx-same',provider:'wechat_pay' as const,id:'wx-same',title:'测试云盘同名',providerName:'微信支付',amount:1800,cycle:'月',daysUntilCharge:null,reminderEnabled:true},{key:'alipay:ali-same',provider:'alipay' as const,id:'ali-same',title:'测试云盘同名',providerName:'支付宝',amount:2800,cycle:'月',daysUntilCharge:null,reminderEnabled:true}];
 let taskId='';const replies=[];
 for(const text of ['取消测试云盘同名','微信18元那项','改成支付宝28元那项']){
  const id=crypto.randomUUID();service.submit(scope,{id,text,currentId:taskId,memoryRevision:0});await service.idle(scope);
  const job=service.get(scope).runs!.find(run=>run.id===id)!.jobs[0];if(taskId)expect(job.taskId).toBe(taskId);taskId=job.taskId;service.claim(scope,id,job.id,owner);
  replies.push(await service.reply(scope,{id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions,subscriptionAccess:{providers:['wechat_pay','alipay'],incompleteProviders:[]},messages:[]}}));
 }
 expect(replies[0].action).toBeUndefined();expect(replies[1].action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'wx-same'});expect(replies[2].action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'ali-same'});
 expect(replies[2].text).toContain('28.00元/月');expect(replies[2].text).toContain('尚未取消');expect(model).not.toHaveBeenCalled();
});
it('未连接的自动续费询问从分类到持久回复都不调用模型，旧历史不能恢复授权',async()=>{
 const dir=fixture(),model=vi.fn(async()=>{throw new Error('HTTP429');}),service=createMessageService(dir,model);
 service.operate(scope,{type:'conversation-append',id:crypto.randomUUID(),messages:[{id:'old-subscriptions',role:'assistant',content:'当前已授权支付宝，有云盘A等2项自动续费。'}]});
 const id=crypto.randomUUID(),owner=crypto.randomUUID();
 service.submit(scope,{id,text:'我有哪些自动续费？',currentId:'',memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(item=>item.id===id)!;
 expect(run.status).toBe('ready');const job=run.jobs[0];service.claim(scope,id,job.id,owner);
 const result=await service.reply(scope,{id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],subscriptionAccess:{providers:[],incompleteProviders:[]},messages:[]}});
 expect(result.action).toEqual({type:'open_connections',scope:'autopay'});expect(result.text).toContain('没有可读取自动续费的有效授权');
 expect(result.text).not.toContain('云盘A');expect(service.get(scope).conversation?.at(-1)?.content).toBe(result.text);
 expect(service.get(scope).runs!.find(item=>item.id===id)!.status).toBe('completed');expect(model).not.toHaveBeenCalled();
});
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
