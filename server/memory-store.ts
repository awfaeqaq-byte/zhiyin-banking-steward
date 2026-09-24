import {existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {emptyMemory,validMemoryState,updateMemory,type MemoryCommand} from '../src/lib/steward-memory';

export function createMemoryStore(file:string) {
  const get=()=>{
    if(!existsSync(file))return emptyMemory();
    const state:unknown=JSON.parse(readFileSync(file,'utf8'));
    if(!validMemoryState(state))throw new Error('记忆文件无法读取，请保留文件并检查，不会自动覆盖');
    return state;
  };
  return {get,change(command:MemoryCommand){
    let lock:number;
    try{lock=openSync(file+'.lock','wx',0o600);}catch{throw new Error('记忆正在保存，请稍后重试');}
    try {
      const next=updateMemory(get(),command);
      writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});
      renameSync(file+'.tmp',file);
      return next;
    }finally{closeSync(lock);unlinkSync(file+'.lock');}
  }};
}
export function memoryMiddleware(store:ReturnType<typeof createMemoryStore>) {
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try {
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});
      if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'仅允许同源访问'});
      if(req.method==='GET')return send(200,store.get());
      if(req.method!=='POST')return send(405,{error:'不支持的方法'});
      if(req.headers['x-zhiyin-memory']!=='1' || !req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
      let body='';
      for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>4096)return send(413,{error:'请求过大'});}
      const command=JSON.parse(body);
      if(!command || typeof command!=='object')return send(400,{error:'请求格式无效'});
      return send(200,store.change(command));
    }catch(error){const message=error instanceof Error?error.message:'记忆服务不可用';send(message.includes('已变化')?409:400,{error:message});}
  };
}
