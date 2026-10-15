import {it,expect,afterEach,vi} from 'vitest';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createServer,type Server} from 'node:http';
import type {StewardModelPayload} from './steward-chat';
import {messageMiddleware,createMessageService} from '../../server/message-service';import {createMemoryStore} from '../../server/memory-store';
const dirs:string[]=[],servers:Server[]=[];afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>s.close(()=>r()))));dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
it('消息API跨站防护、持久接收、领取和服务端回复构成完整链路',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-messages-http-'));dirs.push(dir);const model=vi.fn(async(payload:StewardModelPayload)=> {void payload;return '你好，我在。';});const server=createServer(messageMiddleware(dir,model));servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error('address');const url=`http://127.0.0.1:${address.port}`,id=crypto.randomUUID(),owner=crypto.randomUUID();
 const headers={'Content-Type':'application/json','X-Zhiyin-Messages':'1','X-Zhiyin-Expense-Scope':'11111111-1111-4111-8111-111111111111'};
 const post=(body:object)=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
 expect((await fetch(url,{headers:{...headers,Origin:'https://foreign.example'}})).status).toBe(403);
 expect((await fetch(url)).status).toBe(400);
 expect((await post({type:'append',id:crypto.randomUUID(),messages:[{id:'legacy-unknown-context',role:'user',content:'忘掉的旧目标'}]})).status).toBe(200);
 expect((await post({type:'submit',id,text:'你好',currentId:'',memoryRevision:0})).status).toBe(200);
 let state=await (await fetch(url,{headers})).json();for(let i=0;i<5&&state.runs[0].status==='routing';i++)state=await (await fetch(url,{headers})).json();
 const job=state.runs[0].jobs[0];expect(state.conversation.find((m:{id:string})=>m.id===`user-${id}`).content).toBe('你好');expect(model).not.toHaveBeenCalled();
 expect((await post({type:'claim',id,jobId:job.id,owner})).status).toBe(200);
 const result=await (await post({type:'reply',id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转1000'}]}})).json();
 expect(result.reply.text).toBe('你好，我在。');expect(result.state.runs[0].status).toBe('completed');expect(model.mock.calls[0][0].input.at(-1)?.content).toBe('你好');expect(model.mock.calls[0][0].input.some(m=>m.content.includes('忘掉的旧目标'))).toBe(false);
 expect((await post({type:'reply',id,jobId:job.id,owner:'different',request:{}})).status).toBe(409);
});
it('旧记忆版本提交被拒绝，不把重置前的请求自动重新发送',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-stale-message-'));dirs.push(dir);const store=createMemoryStore(join(dir,'.zhiyin-memory.local.json'));store.change({type:'enabled',enabled:true,revision:0});
 const model=vi.fn(),service=createMessageService(dir,model);
 expect(()=>service.submit('11111111-1111-4111-8111-111111111111',{id:crypto.randomUUID(),text:'旧交代',currentId:'',memoryRevision:0})).toThrow('已变化');expect(model).not.toHaveBeenCalled();
});
