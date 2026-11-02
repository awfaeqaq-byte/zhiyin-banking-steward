import {it,expect,afterEach,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer,type Server} from 'node:http';
import {messageMiddleware} from '../../server/message-service';

const dirs:string[]=[],servers:Server[]=[];
afterEach(async()=>{
 await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
 dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}));
});
it.each(['给妈妈0.001元吧','给妈妈转账0.001'])('首次提交%s经消息API直接拒绝非法金额，不调用模型',async text=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-transfer-amount-http-'));dirs.push(dir);
 const model=vi.fn(async()=> '模型不应决定非法金额的错误原因。');
 const server=createServer(messageMiddleware(dir,model));servers.push(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('address');
 const url=`http://127.0.0.1:${address.port}`,id=crypto.randomUUID(),owner=crypto.randomUUID();
 const headers={'Content-Type':'application/json','X-Zhiyin-Messages':'1','X-Zhiyin-Expense-Scope':crypto.randomUUID()};
 const post=(body:object)=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
 expect((await post({type:'submit',id,text,currentId:'',memoryRevision:0})).status).toBe(200);
 let state=await (await fetch(url,{headers})).json();
 for(let i=0;i<5&&state.runs[0].status==='routing';i++)state=await (await fetch(url,{headers})).json();
 const job=state.runs[0].jobs[0];
 expect((await post({type:'claim',id,jobId:job.id,owner})).status).toBe(200);
 const response=await post({type:'reply',id,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});
 expect(response.status).toBe(200);
 const result=await response.json();
 expect(result.reply.text).toContain('转账金额至少为0.01元');
 expect(result.reply.action).toBeUndefined();
 expect(result.state.runs[0].status).toBe('completed');
 expect(result.state.items[0].progress.stage).toBe('waiting_user');
 expect(model).not.toHaveBeenCalled();
});
