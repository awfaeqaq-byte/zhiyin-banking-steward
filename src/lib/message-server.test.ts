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
