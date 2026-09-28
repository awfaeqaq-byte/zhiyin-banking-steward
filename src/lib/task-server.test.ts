import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTaskStore,taskMiddleware} from '../../server/task-store';
it('日程API校验同源、版本、大小并且不覆盖损坏数据',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-task-api-')),file=join(dir,'tasks.json');const store=createTaskStore(file);const server=createServer(taskMiddleware(store));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error('port');const url=`http://127.0.0.1:${address.port}`;
 try{
  expect((await fetch(url)).status).toBe(200);expect((await fetch(url,{method:'DELETE'})).status).toBe(405);expect((await fetch(url,{method:'POST'})).status).toBe(403);expect((await fetch(url,{headers:{origin:'https://evil.example'}})).status).toBe(403);
  const headers={'Content-Type':'application/json','X-Zhiyin-Tasks':'1'};const post=(data:unknown)=>fetch(url,{method:'POST',headers,body:JSON.stringify(data)});
  expect((await post({type:'save',revision:0,id:'one',title:'提醒',dueAt:Date.now()+3600000})).status).toBe(200);
  expect((await post({type:'status',revision:0,id:'one',status:'completed'})).status).toBe(409);
  expect((await post({type:'save',revision:1,id:'two',title:'未来',dueAt:0})).status).toBe(400);
  expect((await post('x'.repeat(5000))).status).toBe(413);
  writeFileSync(file,'broken');expect((await post({type:'status',revision:1,id:'one',status:'completed'})).status).toBe(400);expect(readFileSync(file,'utf8')).toBe('broken');
 }finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
