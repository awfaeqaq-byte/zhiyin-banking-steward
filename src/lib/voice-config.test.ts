import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createVoiceConfigStore,voiceMiddleware,voiceOfferMiddleware,voiceStatusMiddleware} from '../../server/voice-service';
const dirs:string[]=[];
function store(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-voice-test-'));dirs.push(dir);return createVoiceConfigStore(join(dir,'voice.local.json'));}
afterEach(()=>{dirs.forEach(dir=>rmSync(dir,{recursive:true,force:true}));dirs.length=0;vi.restoreAllMocks();});
const config={region:'beijing',workspaceId:'ws-example',model:'qwen3.8-omni-flash-realtime',ningningVoice:'longanlingxin',ahengVoice:'Zane',apiKey:'test-only-key'};
describe('独立后端语音凭证',()=>{
 it('语音配置损坏只关闭语音，保留文件、不使银行服务启动失败或回退另一密钥',()=>{
  const s=store();writeFileSync(s.file,'broken',{mode:0o600});const damaged=createVoiceConfigStore(s.file);
  expect(damaged.publicConfig()).toMatchObject({configured:false});expect(()=>damaged.get()).toThrow('损坏');expect(()=>damaged.save(config)).toThrow('损坏');expect(readFileSync(s.file,'utf8')).toBe('broken');
 });
 it('默认未配置、保存不回显密钥、重启恢复，私有文件仅本人可读',()=>{
  const s=store();expect(s.publicConfig().configured).toBe(false);s.save(config);
  expect(s.publicConfig()).toMatchObject({configured:true,region:'beijing'});expect(JSON.stringify(s.publicConfig())).not.toContain(config.apiKey);
  expect(statSync(s.file).mode&0o777).toBe(0o600);expect(readFileSync(s.file,'utf8')).toContain(config.apiKey);
  expect(createVoiceConfigStore(s.file).publicConfig().configured).toBe(true);
  s.save({...config,apiKey:''});expect(s.get().apiKey).toBe(config.apiKey);
 });
 it('拒绝任意服务地址、伪造字段和错误参数，跨地域必须重新提供密钥',()=>{
  const s=store();s.save(config);
  for(const bad of [{...config,endpoint:'https://evil.example'},{...config,workspaceId:'../evil'},{...config,model:'MiniMax'},{...config,apiKey:'key\nheader'},{...config,region:'singapore',apiKey:''}])expect(()=>s.save(bad)).toThrow();
  expect(s.get().region).toBe('beijing');
 });
});
async function http(handler:ReturnType<typeof voiceMiddleware>,request:(base:string)=>Promise<void>){const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};try{await request(`http://127.0.0.1:${address.port}`);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
describe('语音 API 边界',()=>{
 it('状态可供首页读取但不包含密钥或业务空间，不支持修改与跨站读取',async()=>{
  const s=store();s.save(config);await http(voiceStatusMiddleware(s),async base=>{const r=await fetch(base);expect(await r.json()).toEqual({configured:true,model:config.model});expect((await fetch(base,{method:'POST'})).status).toBe(405);expect((await fetch(base,{headers:{Origin:'https://evil.example'}})).status).toBe(403);});
 });
 it('配置和上游错误不回显敏感响应，拒绝异常请求体和方法',async()=>{
  const s=store();await http(voiceMiddleware(s),async base=>{expect((await fetch(base)).status).toBe(200);expect((await fetch(base,{method:'PUT'})).status).toBe(405);expect((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-Config':'1'},body:'bad-json'})).status).toBe(400);});s.save(config);
  const upstream=vi.fn<typeof fetch>(async()=>new Response('provider private error: test-only-key',{status:401}));await http(voiceOfferMiddleware(s,upstream),async base=>{expect((await fetch(base)).status).toBe(405);expect((await fetch(base,{method:'POST'})).status).toBe(403);const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Voice':'1'},body:JSON.stringify({offer:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',stewardName:'宁宁'})});expect(r.status).toBe(502);expect(await r.text()).not.toContain('private');});
 });
 it('配置需要本机同源与校验头，不会将密钥返回前端',async()=>{
  const s=store();await http(voiceMiddleware(s),async base=>{
   expect((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)})).status).toBe(403);
   expect((await fetch(base,{headers:{Origin:'https://evil.example'}})).status).toBe(403);
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-Config':'1'},body:JSON.stringify(config)});
   expect(r.status).toBe(200);expect(await r.text()).not.toContain(config.apiKey);
  });
 });
 it('未配置不发起上游调用；无效 SDP 与跨站请求不可创建计费会话',async()=>{
  const s=store(),upstream=vi.fn();await http(voiceOfferMiddleware(s,upstream),async base=>{
   const send=(body:unknown,origin?:string)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Voice':'1',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
   expect((await send({offer:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',stewardName:'宁宁'})).status).toBe(503);
   s.save(config);expect((await send({offer:'bad',stewardName:'宁宁'})).status).toBe(400);
   expect((await send({offer:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',stewardName:'宁宁'},'https://evil.example')).status).toBe(403);
   expect(upstream).not.toHaveBeenCalled();
  });
 });
 it('只向指定百炼地域转发 SDP，密钥仅在服务端，错误不泄漏上游响应',async()=>{
  const s=store();s.save(config);const upstream=vi.fn<typeof fetch>(async()=>new Response('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',{headers:{'Content-Type':'application/sdp'}}));
  await http(voiceOfferMiddleware(s,upstream),async base=>{
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Voice':'1'},body:JSON.stringify({offer:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',stewardName:'阿衡'})});
   expect(r.status).toBe(200);const body=await r.json();expect(body.answer).toContain('m=audio');expect(body.session.audio.output.voice).toBe('Zane');expect(JSON.stringify(body)).not.toContain(config.apiKey);
   expect(body.session.input_audio_transcription).toEqual({model:'qwen3-asr-flash-realtime'});expect(body.session.turn_detection.interrupt_response).toBe(true);expect(body.session.tools[0].function.description).toContain('普通交流不调用');
   expect(upstream.mock.calls[0][0]).toBe('https://ws-example.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=qwen3.8-omni-flash-realtime');
   expect(upstream.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{Authorization:'Bearer test-only-key'}});
  });
 });
});
