import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as childProcess from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelConfigStore, createModelConfigMiddleware, isLocalConfigRequest } from '../server/modelConfig';

const folders: string[] = [];
const initial = {apiKey:'private-test-key', baseUrl:'https://api.svips.org/', model:'old-model'};
// Windows verifies ACLs through system processes; allow their startup under load.
const privateConfigTimeout = process.platform === 'win32' ? 30000 : 5000;
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'model-config-test-')); folders.push(dir);
  const path = join(dir, 'model.json');
  return { path, store: createModelConfigStore(path, initial) };
}
function expectPrivateFile(path: string) {
  if (process.platform !== 'win32') {
    expect(statSync(path).mode & 0o777).toBe(0o600);
    return;
  }
  const script = `
$ErrorActionPreference = 'Stop'
$acl = [System.IO.File]::GetAccessControl($env:ZHIYIN_PRIVATE_CONFIG_PATH)
$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
  @{sid=$_.IdentityReference.Value; rights=$_.FileSystemRights.ToString(); type=$_.AccessControlType.ToString(); inherited=$_.IsInherited}
})
@{protected=$acl.AreAccessRulesProtected; currentSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; rules=$rules} | ConvertTo-Json -Depth 4 -Compress
`;
  const output = childProcess.execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {env:{...process.env, ZHIYIN_PRIVATE_CONFIG_PATH:path}, windowsHide:true, encoding:'utf8', timeout:10000});
  const acl = JSON.parse(output);
  expect(acl.protected).toBe(true);
  expect(acl.rules).toEqual([{sid:acl.currentSid, rights:'FullControl', type:'Allow', inherited:false}]);
}

afterEach(() => { vi.unstubAllEnvs(); for (const dir of folders.splice(0)) rmSync(dir, {recursive:true,force:true}); });
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
  }, privateConfigTimeout);
  it('saves immediately, persists privately and never returns the secret to the UI', () => {
    const {store,path}=setup();
    store.save({baseUrl:initial.baseUrl,model:'MiniMax-M2.7-highspeed',apiKey:''});
    expect(store.get().apiKey).toBe(initial.apiKey);
    expect(store.publicConfig()).toEqual({baseUrl:'https://api.svips.org',model:'MiniMax-M2.7-highspeed',hasApiKey:true});
    expect(JSON.stringify(store.publicConfig())).not.toContain(initial.apiKey);
    expect(createModelConfigStore(path, initial).get().model).toBe('MiniMax-M2.7-highspeed');
    expectPrivateFile(path);
    expect(readFileSync(path,'utf8')).toContain('private-test-key');
    store.save({baseUrl:initial.baseUrl,model:'更新后的模型',apiKey:''});
    expectPrivateFile(path);
    expect(createModelConfigStore(path, initial).get().model).toBe('更新后的模型');
  }, privateConfigTimeout);
  it.runIf(process.platform === 'win32')('preserves the old config and cleans up when Windows ACL setup is unavailable', () => {
    const {store,path}=setup();
    store.save({...initial,model:'saved-model'});
    const original=readFileSync(path,'utf8');
    vi.stubEnv('SystemRoot',join(folders.at(-1)!,'missing-windows'));
    expect(()=>store.save({...initial,model:'changed-model',apiKey:'replacement-private-key'})).toThrow('原配置未更改');
    expect(store.get().model).toBe('saved-model');
    expect(readFileSync(path,'utf8')).toBe(original);
    expect(readdirSync(folders.at(-1)!)).toEqual(['model.json']);
  }, privateConfigTimeout);
  it('does not send an existing key to a different host without a replacement key', () => {
    const {store}=setup();
    expect(()=>store.save({baseUrl:'https://another.example.com',model:'new',apiKey:''})).toThrow();
    expect(store.get()).toEqual(initial);
    store.save({baseUrl:'https://another.example.com',model:'new',apiKey:'replacement'});
    expect(store.get().apiKey).toBe('replacement');
  }, privateConfigTimeout);
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
