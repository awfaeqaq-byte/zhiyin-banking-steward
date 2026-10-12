import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {isLocalConfigRequest} from '../mobilegym/server/modelConfig';
import {voiceSessionInstructions} from '../src/lib/realtime-voice';

export type VoiceConfig={region:'beijing'|'singapore';workspaceId:string;model:'qwen3.8-omni-flash-realtime';ningningVoice:string;ahengVoice:string;apiKey:string};
const defaults:VoiceConfig={region:'beijing',workspaceId:'',model:'qwen3.8-omni-flash-realtime',ningningVoice:'longanlingxin',ahengVoice:'Zane',apiKey:''};
function validate(input:unknown,previous:VoiceConfig):VoiceConfig {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('语音配置格式无效');
 const d=input as Record<string,unknown>;
 if(Object.keys(d).some(k=>!Object.keys(defaults).includes(k)))throw new Error('语音配置含未支持字段');
 if(!['beijing','singapore'].includes(String(d.region))||d.model!==defaults.model||typeof d.workspaceId!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(d.workspaceId))throw new Error('请核对百炼地域、业务空间 ID 和实时模型');
 if(![d.ningningVoice,d.ahengVoice].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)))throw new Error('音色名称无效');
 if(d.apiKey!==undefined&&typeof d.apiKey!=='string')throw new Error('密钥格式无效');
 const replacement=typeof d.apiKey==='string'?d.apiKey.trim():'';
 if(replacement.length>500||/[^\x21-\x7e]/.test(replacement))throw new Error('密钥格式无效');
 if(previous.apiKey&&!replacement&&(previous.region!==d.region||previous.workspaceId!==d.workspaceId))throw new Error('更换地域或业务空间时，请重新输入对应密钥');
 const apiKey=replacement||previous.apiKey;if(!apiKey)throw new Error('请配置百炼实时语音 API 密钥');
 return {region:d.region as VoiceConfig['region'],workspaceId:d.workspaceId,model:defaults.model,ningningVoice:d.ningningVoice as string,ahengVoice:d.ahengVoice as string,apiKey};
}
export function createVoiceConfigStore(file:string){
 let current={...defaults};
 if(existsSync(file))current=validate(JSON.parse(readFileSync(file,'utf8')),defaults);
 return {file,get:()=>({...current}),publicConfig:()=>{const {apiKey,...safe}=current;return {...safe,configured:!!apiKey};},save(input:unknown){
  const next=validate(input,current),temp=`${file}.${randomUUID()}.tmp`;
  try{writeFileSync(temp,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});renameSync(temp,file);}catch{if(existsSync(temp))unlinkSync(temp);throw new Error('语音配置保存失败，原配置未更改');}current=next;
 }};
}
function send(res:ServerResponse,status:number,data:object){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
function sameOrigin(req:IncomingMessage){try{const host=new URL(`http://${req.headers.host}`);const origin=req.headers.origin?new URL(req.headers.origin):undefined;return (!origin||origin.host===host.host&&['http:','https:'].includes(origin.protocol))&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(String(req.headers['sec-fetch-site'])));}catch{return false;}}
async function body(req:IncomingMessage,max:number){let data='';for await(const chunk of req){data+=chunk.toString();if(Buffer.byteLength(data)>max)throw new Error('请求内容过长');}try{return JSON.parse(data) as unknown;}catch{throw new Error('请求格式无效');}}
export function voiceMiddleware(store:ReturnType<typeof createVoiceConfigStore>){return async(req:IncomingMessage,res:ServerResponse)=>{
 if(!isLocalConfigRequest(req))return send(res,403,{error:'语音配置仅允许本机 localhost 控制台访问'});
 if(req.method==='GET')return send(res,200,store.publicConfig());
 if(req.method!=='POST')return send(res,405,{error:'仅支持 GET 和 POST'});
 if(req.headers['x-sandbox-config']!=='1'||req.headers['content-type']!=='application/json')return send(res,403,{error:'配置请求校验失败'});
 try{store.save(await body(req,4096));send(res,200,store.publicConfig());}catch(cause){send(res,400,{error:cause instanceof Error?cause.message:'语音配置保存失败'});}
};}
const validSdp=(x:unknown):x is string=>typeof x==='string'&&x.length<=60000&&/^v=0\r?\n/.test(x)&&/^m=audio /m.test(x)&&!/^m=video /m.test(x);
export function voiceOfferMiddleware(store:ReturnType<typeof createVoiceConfigStore>,fetcher:typeof fetch=fetch){let pending=0;return async(req:IncomingMessage,res:ServerResponse)=>{
 if(!sameOrigin(req))return send(res,403,{error:'语音请求须来自当前页面'});
 if(req.method!=='POST')return send(res,405,{error:'仅支持 POST'});
 if(req.headers['x-zhiyin-voice']!=='1'||req.headers['content-type']!=='application/json')return send(res,403,{error:'语音请求校验失败'});
 const config=store.get();if(!config.apiKey)return send(res,503,{error:'尚未配置实时语音。请在本机沙箱控制台 → 模型配置 → 实时语音，填写百炼凭证。'});
 if(pending>=2)return send(res,429,{error:'语音正在连接，请稍后再试'});
 let input:Record<string,unknown>;try{const value=await body(req,64000);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('语音请求格式无效');input=value as Record<string,unknown>;if(Object.keys(input).some(k=>!['offer','stewardName'].includes(k))||!validSdp(input.offer)||!['宁宁','阿衡'].includes(String(input.stewardName)))throw new Error('请核对音频会话与管家名称');}catch(cause){return send(res,400,{error:cause instanceof Error?cause.message:'语音请求无效'});}
 pending++;
 try{
  const region=config.region==='beijing'?'cn-beijing':'ap-southeast-1';
  const url=`https://${config.workspaceId}.${region}.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${config.model}`;
  const upstream=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/sdp'},body:input.offer as string,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!upstream.ok)return send(res,502,{error:`百炼语音连接失败（HTTP ${upstream.status}），请核对实时模型权限、地域和业务空间。`});
  const answer=await upstream.text();if(!validSdp(answer))return send(res,502,{error:'语音服务返回的会话无效，请重试'});
  send(res,200,{answer,session:{modalities:['text','audio'],instructions:voiceSessionInstructions(String(input.stewardName)),audio:{output:{voice:input.stewardName==='阿衡'?config.ahengVoice:config.ningningVoice}},turn_detection:{type:'semantic_vad',threshold:0.5,silence_duration_ms:800},enable_search:false,tools:[{type:'function',function:{name:'ask_steward',description:'将用户本轮交代发送给原有管家，读取真实获授权数据、整理任务并在首页展示核对方案。没有金融执行权限。',parameters:{type:'object',properties:{text:{type:'string',description:'用户本轮语音原文，不改金额、姓名和日期'}},required:['text'],additionalProperties:false}}}]}});
 }catch{send(res,502,{error:'实时语音连接超时或中断，请检查网络后重试'});}finally{pending--;}
};}
export function voiceStatusMiddleware(store:ReturnType<typeof createVoiceConfigStore>){return async(req:IncomingMessage,res:ServerResponse)=>{
 if(!sameOrigin(req))return send(res,403,{error:'语音请求须来自当前页面'});
 if(req.method!=='GET')return send(res,405,{error:'仅支持 GET'});
 send(res,200,{configured:store.publicConfig().configured,model:defaults.model});
};}
