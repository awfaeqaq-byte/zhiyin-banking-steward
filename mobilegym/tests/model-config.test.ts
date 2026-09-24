import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelConfigStore, createModelConfigMiddleware, isLocalConfigRequest } from '../server/modelConfig';

const folders: string[] = [];
const initial = {apiKey:'private-test-key', baseUrl:'https://api.svips.org/', model:'old-model'};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'model-config-test-')); folders.push(dir);
  const path = join(dir, 'model.json');
  return { path, store: createModelConfigStore(path, initial) };
}
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, {recursive:true,force:true}); });
describe('local model configuration', () => {
  async function call(method: string, body = '', headers = {}) {
    const {store}=setup();
    const req = Readable.from([body]);
    Object.assign(req,{method,headers:{host:'localhost:3000',...headers},socket:{remoteAddress:'127.0.0.1'}});
    return new Promise<{status:number;body:string}>(resolve=>{
      const res = {statusCode:200,setHeader(){},end(value:string){resolve({status:this.statusCode,body:value});}};
      void createModelConfigMiddleware(store)(req as never,res as never);
    });
  }
  it('redacts GET and requires a JSON custom-header write', async () => {
    const get = await call('GET'); expect(get.status).toBe(200); expect(get.body).not.toContain(initial.apiKey);
    expect((await call('POST','{}')).status).toBe(403);
    expect((await call('DELETE')).status).toBe(405);
    expect((await call('GET','',{origin:'https://evil.example'})).status).toBe(403);
    const headers = {'content-type':'application/json','x-sandbox-config':'1'};
    expect((await call('POST','bad',headers)).status).toBe(400);
    expect((await call('POST','x'.repeat(4100),headers)).status).toBe(413);
    const saved = await call('POST',JSON.stringify({...initial,model:'new'}),headers);
    expect(saved.status).toBe(200); expect(saved.body).not.toContain(initial.apiKey);
    expect(JSON.parse(saved.body).model).toBe('new');
  });
  it('saves immediately, persists privately and never returns the secret to the UI', () => {
    const {store,path}=setup();
    store.save({baseUrl:initial.baseUrl,model:'MiniMax-M2.7-highspeed',apiKey:''});
    expect(store.get().apiKey).toBe(initial.apiKey);
    expect(store.publicConfig()).toEqual({baseUrl:'https://api.svips.org',model:'MiniMax-M2.7-highspeed',hasApiKey:true});
    expect(JSON.stringify(store.publicConfig())).not.toContain(initial.apiKey);
    expect(createModelConfigStore(path, initial).get().model).toBe('MiniMax-M2.7-highspeed');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path,'utf8')).toContain('private-test-key');
  });
  it('does not send an existing key to a different host without a replacement key', () => {
    const {store}=setup();
    expect(()=>store.save({baseUrl:'https://another.example.com',model:'new',apiKey:''})).toThrow();
    expect(store.get()).toEqual(initial);
    store.save({baseUrl:'https://another.example.com',model:'new',apiKey:'replacement'});
    expect(store.get().apiKey).toBe('replacement');
  });
  it.each(['http://api.svips.org','https://user:pass@api.svips.org','https://localhost','https://127.0.0.1','https://api.svips.org?key=secret'])('rejects unsafe address %s', baseUrl => {
    const {store}=setup(); expect(()=>store.save({baseUrl,model:'new',apiKey:'secret'})).toThrow();
    expect(store.get()).toEqual(initial);
  });
  it('rejects cross-origin and remote management requests', () => {
    const req = {headers:{host:'localhost:3000',origin:'http://localhost:3000'},socket:{remoteAddress:'127.0.0.1'}};
    expect(isLocalConfigRequest(req as never)).toBe(true);
    expect(isLocalConfigRequest({...req,headers:{...req.headers,origin:'https://evil.example'}} as never)).toBe(false);
    expect(isLocalConfigRequest({...req,socket:{remoteAddress:'192.168.1.10'}} as never)).toBe(false);
    expect(isLocalConfigRequest({...req,headers:{host:'evil.example'}} as never)).toBe(false);
  });
});
