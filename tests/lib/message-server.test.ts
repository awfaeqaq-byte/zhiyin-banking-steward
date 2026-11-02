import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
import type {StewardModelPayload} from '../../src/lib/steward-chat';
import {createBankStore} from '../../server/bank-store';
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
it('CR2-070 多份已保存筹备先澄清，选择后绑定原业务ID，不创建空副本',async()=>{
 const dir=fixture(),bank=createBankStore(join(dir,'.zhiyin-bank.local.json'));
 const draft={title:'专项CR2-066',recipient:'测试家人',budget:100000,prepareAt:Date.now()+10*86400000,deliverAt:Date.now()+12*86400000,address:'虚构测试地址',contact:'测试家人 13800000000',note:'低甜',productIds:['cake-light']};
 bank.saveOccasion({id:'existing-066',revision:0,draft});bank.saveOccasion({id:'existing-071',revision:1,draft:{...draft,title:'专项CR2-071',deliverAt:draft.deliverAt+86400000}});
 const model=vi.fn(async()=>{throw Error('不应用模型猜测已有计划ID');}),service=createMessageService(dir,model);
 service.submit(scope,{id:'choose-plan',text:'有专项CR2-071和专项CR2-066，把那个生日计划预算改900元',currentId:'',memoryRevision:0});await service.idle(scope);
 expect(service.get(scope).runs!.find(r=>r.id==='choose-plan')).toMatchObject({status:'waiting_user',jobs:[]});
 service.submit(scope,{id:'selected-plan',text:'专项CR2-066，071不要动',currentId:'',memoryRevision:0});await service.idle(scope);
 const state=service.get(scope),job=state.runs!.find(r=>r.id==='selected-plan')!.jobs[0];expect(job.taskId).toBe('existing-066');expect(state.items.find(t=>t.id==='existing-066')?.kind).toBe('occasion');expect(state.items.find(t=>t.id==='existing-066')?.messages.some(m=>m.role==='user'&&m.content.includes('预算改900元'))).toBe(true);
 expect(bank.get().occasions).toHaveLength(2);expect(bank.get().occasions!.every(p=>p.budget===100000)).toBe(true);expect(model).not.toHaveBeenCalled();
});
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
  const source=payload.input.filter(m=>m.content.startsWith('本轮原文片段')).map(m=>m.content).join('');
  if(!source.includes('今晚聚餐'))return JSON.stringify({parts:[],clarification:'要改今晚聚餐还是周末旅行？'});
  if(payload.input.some(m=>m.content.includes('待澄清数据'))){
   expect(payload.input.some(m=>m.content.includes('改成30')&&m.content.includes('今晚聚餐还是周末旅行'))).toBe(true);
   return JSON.stringify({parts:[{taskId:null,kind:'general',title:'今晚聚餐',segmentIds:[0]}],continuesClarification:true});
  }
  return JSON.stringify({parts:[{taskId:null,kind:'general',title:'今晚聚餐'}]});
 });const service=createMessageService(dir,model);service.submit(scope,{id:crypto.randomUUID(),text:'改成30',currentId:'',memoryRevision:0});await service.idle(scope);
 const id=crypto.randomUUID();service.submit(scope,{id,text:'今晚聚餐',currentId:'',memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(r=>r.id===id)!;expect(run.status).toBe('ready');expect(run.prompt).toBe('今晚聚餐');expect(run.jobs[0].text).toBe('改成30\n补充：今晚聚餐');
});

it('长请求经两轮澄清仍完整到达转账处理，补充内容不替换原始交代',async()=>{
 const original=`请先理解这笔转账的用途。${'用于家庭日常生活开支，'.repeat(18)}请转账783给家人`;
 const dir=fixture();let count=0;const model=vi.fn(async(payload:StewardModelPayload)=>{
  void payload;count++;
  if(count===1)return JSON.stringify({parts:[],clarification:'给哪位家人？'});
  if(count===2)return JSON.stringify({parts:[],clarification:'是现在办理还是预约？',continuesClarification:true});
  if(count===3)return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'家人生活费',segmentIds:[0]}],continuesClarification:true});
  if(count===4)return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'家人生活费'}]});
  return '已为妈妈整理783元转账方案，请确认。[ZHIYIN_ACTION:TRANSFER|妈妈|783]';
 });
 const service=createMessageService(dir,model),first=crypto.randomUUID(),second=crypto.randomUUID(),third=crypto.randomUUID(),owner=crypto.randomUUID();
 service.submit(scope,{id:first,text:original,currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:second,text:'妈妈',currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:third,text:'现在办理',currentId:'',memoryRevision:0});await service.idle(scope);
 const state=service.get(scope),run=state.runs!.find(r=>r.id===third)!;expect(run.status).toBe('ready');expect(run.prompt).toBe('现在办理');expect(run.jobs[0].text).toContain(original);expect(run.jobs[0].text).toContain('妈妈');
 service.claim(scope,third,run.jobs[0].id,owner);const reply=await service.reply(scope,{id:third,jobId:run.jobs[0].id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});
 expect(reply.waitingQuestion).toContain('8888');expect(reply.action).toBeUndefined();
 // Deterministic transfer validation now asks for the missing payment account.
 // Routing still preserved the complete 783-yuan instruction through both answers.
 expect(model).toHaveBeenCalledTimes(4);
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
it('重试旧分类不把后来新消息的追问绑定成自己的前文',async()=>{
 const dir=fixture();let count=0;const model=vi.fn(async()=>{
  count++;if(count===1)throw new Error('分类暂时失败');
  if(count===2)return JSON.stringify({parts:[],clarification:'要改今晚聚餐还是周末旅行？'});
  return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'妈妈生活费'}],continuesClarification:true});
 });const service=createMessageService(dir,model),oldId=crypto.randomUUID();
 service.submit(scope,{id:oldId,text:'给妈妈转500',currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:crypto.randomUUID(),text:'把聚餐改成30',currentId:'',memoryRevision:0});await service.idle(scope);
 service.retry(scope,{id:oldId,retryId:crypto.randomUUID(),memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(r=>r.id===oldId)!;
 expect(run.status).toBe('ready');expect(run.jobs[0].text).toBe('给妈妈转500');expect(run).not.toHaveProperty('sourcePrompt');expect(model).toHaveBeenCalledTimes(3);
});
it('澄清后二次分类失败仍保存完整参数，原消息重试后可继续分类',async()=>{
 const dir=fixture();let count=0;const model=vi.fn(async()=>{
  count++;if(count===1)return JSON.stringify({parts:[],clarification:'给哪位家人？'});
  if(count===2)return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'生活费'}],continuesClarification:true});
  if(count===3)throw new Error('分类服务断开');
  return JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'生活费'}]});
 });const service=createMessageService(dir,model),answer=crypto.randomUUID();
 service.submit(scope,{id:crypto.randomUUID(),text:'请转账783给家人',currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:answer,text:'妈妈',currentId:'',memoryRevision:0});await service.idle(scope);
 expect(service.get(scope).runs!.find(r=>r.id===answer)).toMatchObject({status:'failed',sourcePrompt:'请转账783给家人\n补充：妈妈',jobs:[]});
 service.retry(scope,{id:answer,retryId:crypto.randomUUID(),memoryRevision:0});await service.idle(scope);
 expect(service.get(scope).runs!.find(r=>r.id===answer)?.jobs[0].text).toBe('请转账783给家人\n补充：妈妈');expect(model).toHaveBeenCalledTimes(4);
});
it('澄清超出容量明确提示重述，不截断原交代中的金额',async()=>{
 const original=`${'用途说明'.repeat(497)}请转账783给家人`,dir=fixture();let count=0;
 const model=vi.fn(async()=>++count===1?JSON.stringify({parts:[],clarification:'给哪位家人？'}):JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'生活费'}],continuesClarification:true}));
 const service=createMessageService(dir,model),first=crypto.randomUUID(),answer=crypto.randomUUID();
 service.submit(scope,{id:first,text:original,currentId:'',memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:answer,text:'我的妈妈，她叫李梅',currentId:'',memoryRevision:0});await service.idle(scope);
 const state=service.get(scope);expect(state.runs!.find(r=>r.id===answer)).toMatchObject({status:'failed',jobs:[],error:expect.stringContaining('超过2000字')});
 expect(state.runs!.find(r=>r.id===first)?.prompt).toBe(original);expect(state.items).toHaveLength(0);
});
it('两笔都执行续接待澄清的新转账，旧安排不重排队，也不产生付款授权',async()=>{
 const dir=fixture(),old='old-transfer',storage=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 storage.change({type:'create',id:old,kind:'transfer',title:'28日给妈妈转1000元',revision:0,requestId:crypto.randomUUID()});
 const before=storage.get().items[0];
 const model=vi.fn(async()=>JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'现在给妈妈转2000元',segmentIds:[0]}],clarification:'这笔2000元替代原来的1000元，还是两笔都执行？'}));
 const service=createMessageService(dir,model),first=crypto.randomUUID(),answer=crypto.randomUUID();
 service.submit(scope,{id:first,text:'现在给妈妈转2000',currentId:old,memoryRevision:0});await service.idle(scope);
 service.submit(scope,{id:answer,text:'都执行',currentId:old,memoryRevision:0});await service.idle(scope);
 const state=service.get(scope),run=state.runs!.find(r=>r.id===answer)!;
 expect(run.status).toBe('ready');expect(run.jobs).toHaveLength(1);
 expect(run.jobs[0]).toMatchObject({text:'现在给妈妈转2000\n补充：都执行',status:'queued'});
 expect(run.jobs[0].taskId).not.toBe(old);expect(state.items.find(t=>t.id===old)).toEqual(before);
 expect(run.sourcePrompt).toBe('现在给妈妈转2000\n补充：都执行');expect(model).toHaveBeenCalledOnce();
});
it('重试旧短答不读取该消息之后的新追问，避免把旧确认送给新任务',async()=>{
 const dir=fixture(),storage=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 const change=(op:Parameters<typeof storage.change>[0])=>storage.change({...op,revision:storage.get().revision,requestId:crypto.randomUUID()});
 change({type:'create',id:'birthday',kind:'reminder',title:'生日',revision:0,requestId:'init'});
 change({type:'turn',id:'birthday',user:'记录生日',assistant:'王芳生日是7月15号，对吗？',memoryRevision:0,revision:0,requestId:'init'});
 const id=crypto.randomUUID();
 change({type:'message-submit',id,text:'对',currentId:'birthday',memoryRevision:0,revision:0,requestId:'init'});
 change({type:'message-fail',id,error:'旧版分流失败',stage:'routing',revision:0,requestId:'init'});
 change({type:'create',id:'later-transfer',kind:'transfer',title:'后来转账',revision:0,requestId:'init'});
 change({type:'turn',id:'later-transfer',user:'给妈妈转2000',assistant:'是现在转2000元，对吗？',memoryRevision:0,revision:0,requestId:'init'});
 change({type:'conversation-append',id:'append',messages:[{id:'later-question',role:'assistant',content:'是现在转2000元，对吗？',workspaceId:'later-transfer',memoryRevision:0}],revision:0,requestId:'init'});
 const model=vi.fn(),service=createMessageService(dir,model);
 service.retry(scope,{id,retryId:crypto.randomUUID(),memoryRevision:0});await service.idle(scope);
 const run=service.get(scope).runs!.find(r=>r.id===id)!;
 expect(run.jobs[0]?.taskId).toBe('birthday');expect(model).not.toHaveBeenCalled();
});
