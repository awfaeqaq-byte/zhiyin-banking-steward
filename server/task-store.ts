import {existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {validTaskState,updateTasks,type TaskCommand,type TaskState} from '../src/lib/task-calendar';
export function createTaskStore(file:string){
 const get=():TaskState=>{if(!existsSync(file))return {revision:0,tasks:[]};const data:unknown=JSON.parse(readFileSync(file,'utf8'));if(!validTaskState(data))throw new Error('日程文件损坏，已保留原文件，请检查');return data;};
 return {get,change(command:TaskCommand){let lock:number;try{lock=openSync(file+'.lock','wx',0o600);}catch{throw new Error('日程正在保存，请稍后重试');}try{const next=updateTasks(get(),command);writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file);return next;}finally{closeSync(lock);unlinkSync(file+'.lock');}}};
}
export function taskMiddleware(store:ReturnType<typeof createTaskStore>){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  try{
   if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});
   if(req.method==='GET')return send(200,store.get());
   if(req.method!=='POST')return send(405,{error:'不支持的方法'});
   if(req.headers['x-zhiyin-tasks']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
   let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>4096)return send(413,{error:'请求过大'});}
   return send(200,store.change(JSON.parse(body)));
  }catch(error){const message=error instanceof Error?error.message:'日程服务不可用';send(message.includes('已变化')?409:400,{error:message});}
 };
}
