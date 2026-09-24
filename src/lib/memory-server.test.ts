import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,type Server} from 'node:http';
import {createMemoryStore,memoryMiddleware} from '../../server/memory-store';
const dirs:string[]=[];const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-memory-test-'));dirs.push(dir);return join(dir,'memory.json');}
it('重启存储仍可读取；并发版本冲突、文件损坏均不覆盖',()=>{
  const file=fixture(),store=createMemoryStore(file);
  store.change({type:'enabled',enabled:true,revision:0});
  store.change({type:'save',text:'偏好高铁',category:'preference',revision:1});
  expect(createMemoryStore(file).get().items[0].text).toBe('偏好高铁');
  store.change({type:'profile',profileAction:'enable',enabled:true,revision:2});
  store.change({type:'profile',profileAction:'observe',revision:3,observation:{topic:'music',text:'两个会员都有用途',quote:'两个都用',userText:'两个都用'}});
  expect(createMemoryStore(file).get().profile?.items[0].text).toBe('两个会员都有用途');
  expect(()=>store.change({type:'clear',revision:1})).toThrow(/变化/);
  writeFileSync(file,'broken');
  expect(()=>store.change({type:'clear',revision:2})).toThrow();
  expect(readFileSync(file,'utf8')).toBe('broken');
});
it('HTTP支持读写，拒绝跨站、非法方法和缺少保护头的写入',async()=>{
  const server=createServer(memoryMiddleware(createMemoryStore(fixture())));servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address || typeof address==='string')throw new Error('missing address');
  const url=`http://127.0.0.1:${address.port}`;
  expect((await (await fetch(url)).json()).enabled).toBe(false);
  expect((await fetch(url,{method:'POST'})).status).toBe(403);
  expect((await fetch(url,{headers:{Origin:'https://example.com'}})).status).toBe(403);
  expect((await fetch(url,{method:'DELETE'})).status).toBe(405);
  const headers={'Content-Type':'application/json','X-Zhiyin-Memory':'1'};
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({type:'enabled',enabled:true,revision:0})})).status).toBe(200);
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({type:'clear',revision:0})})).status).toBe(409);
});
