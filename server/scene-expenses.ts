import {join} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createExpenseStore} from './expense-store';
import {validSceneExpenseSource,type SceneExpenseSource,type SceneExpenseReference} from '../src/lib/scene-expenses';
export type SceneExpenseResolver=(scope:string,workspaceId:string)=>{sources:SceneExpenseSource[];bookIds:string[]}|Promise<{sources:SceneExpenseSource[];bookIds:string[]}>;
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
export function sceneExpensesMiddleware(directory:string,resolveSources:SceneExpenseResolver){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  try{
   if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});
   const scope=req.headers['x-zhiyin-expense-scope'];if(typeof scope!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope))throw new Error('任务空间标识无效');
   const workspaceId=new URL(req.url||'/',`http://${req.headers.host}`).searchParams.get('workspaceId');if(!validId(workspaceId))throw new Error('事项编号无效');
   if(!['GET','POST'].includes(req.method||''))return send(405,{error:'仅支持读取与确认入账'});
   const resolved=await resolveSources(scope,workspaceId);
   if(!Array.isArray(resolved.sources)||!resolved.sources.every(validSceneExpenseSource)||!Array.isArray(resolved.bookIds))throw new Error('订单来源无法核对');
   const store=createExpenseStore(join(directory,`.zhiyin-expenses-${scope}.local.json`));
   if(req.method==='GET')return send(200,{sources:resolved.sources,state:store.syncSources(resolved.sources)});
   if(req.headers['x-zhiyin-scene-expenses']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>16384)return send(413,{error:'入账请求过长'});}
   const body=JSON.parse(raw);
   if(body.workspaceId!==workspaceId||!validId(body.bookId)||!resolved.bookIds.includes(body.bookId))throw new Error('消费账本不属于当前事项');
   const references=body.references as SceneExpenseReference[];
   if(!Array.isArray(references)||!references.length||references.length>100||new Set(references.map(r=>r?.id)).size!==references.length)throw new Error('请选择要记入的实付订单');
   const sources=references.map(reference=>{
    const source=resolved.sources.find(s=>s.id===reference?.id);if(!source)throw new Error('付款不属于当前事项或来源暂不可读');
    if(source.paidAmount!==reference.paidAmount||source.refundedAmount!==reference.refundedAmount)throw new Error('订单金额或退款已变化，请重新核对后入账');
    return source;
   });
   const state=store.importSources(body.bookId,sources,{revision:body.revision,requestId:body.requestId,references});
   return send(200,{sources:resolved.sources,state});
  }catch(error){const message=error instanceof Error?error.message:'订单实付暂未核对';return send(message.includes('已变化')?409:400,{error:message});}
 };
}
