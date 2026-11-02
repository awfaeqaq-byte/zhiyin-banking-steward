import {execFile} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {validMarketContext,type MarketContext} from '../src/lib/market-context';

const execFileAsync=promisify(execFile);
type AkshareResult=Pick<MarketContext,'indicators'|'capabilities'> & {message?:string};
type Runner=(mode:'probe'|'batch',start:string,end:string)=>Promise<AkshareResult>;
const day=(time:number)=>new Date(time).toISOString().slice(0,10).replaceAll('-','');

export function createAkshareMarketService(options:{cacheFile:string;runner?:Runner;now?:()=>number;python?:string}){
  const now=options.now||Date.now;
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const script=resolve(projectRoot,'scripts/data/akshare_market.py');
  const defaultPython=resolve(projectRoot,'.venv-akshare/bin/python');
  const python=options.python||process.env.AKSHARE_PYTHON||(existsSync(defaultPython)?defaultPython:'python3');
  const run:Runner=options.runner||(async(mode,start,end)=>{
    try{
      const {stdout}=await execFileAsync(python,[script,'--mode',mode,'--start',start,'--end',end],{timeout:25000,maxBuffer:1024*1024,env:{...process.env,PYTHONUTF8:'1'}});
      return JSON.parse(stdout) as AkshareResult;
    }catch(error){
      const detail=error as Error & {stderr?:string;code?:number|string};
      const message=detail.stderr?.trim()||detail.message;
      throw new Error(message.includes('AKSHARE_NOT_INSTALLED')?'未安装 AKShare，请先执行 scripts/data/setup_akshare.sh':`外部数据获取失败：${message.slice(0,240)}`);
    }
  });
  const base=(status:MarketContext['status'],message:string):MarketContext=>({provider:'akshare',status,message,indicators:[],capabilities:[]});
  function readCache(){try{if(!existsSync(options.cacheFile))return null;const value=JSON.parse(readFileSync(options.cacheFile,'utf8'));if(!validMarketContext(value)||!value.fetchedAt)return null;return {...value,stale:now()-value.fetchedAt>12*3600000};}catch{return null;}}
  function writeCache(value:MarketContext){writeFileSync(options.cacheFile+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(options.cacheFile+'.tmp',options.cacheFile);}
  return {
    get():MarketContext{return readCache()||base('connected','AKShare 适配器已就绪，点击“检测更新”先执行小样本验证。');},
    async refresh():Promise<MarketContext>{
      const end=now(),probeStart=end-10*86400000,batchStart=end-40*86400000;
      let probe:AkshareResult;
      try{probe=await run('probe',day(probeStart),day(end));}
      catch(error){return base('error',error instanceof Error?`小样本验证失败：${error.message}`:'小样本验证失败');}
      if(!probe.indicators.length)return {...base('error','AKShare 小样本未返回沪深300数据，已停止后续批量获取。'),capabilities:probe.capabilities};
      let batch:AkshareResult;
      try{batch=await run('batch',day(batchStart),day(end));}
      catch(error){const context:MarketContext={provider:'akshare',status:'connected',fetchedAt:now(),message:error instanceof Error?`小样本成功，批量更新失败：${error.message}`:'小样本成功，批量更新失败',indicators:probe.indicators,capabilities:probe.capabilities};writeCache(context);return context;}
      const merged=[...new Map([...probe.indicators,...batch.indicators].map(item=>[item.key,item])).values()];
      const partial=batch.capabilities.some(item=>item.status!=='ready');
      const context:MarketContext={provider:'akshare',status:merged.length?'ready':'connected',fetchedAt:now(),message:merged.length?(partial?'AKShare 更新完成，部分数据源暂时降级；已保留验证成功的数据。':'已先完成 AKShare 小样本验证，再更新指数与利率摘要。外部数据只用于市场环境解释。'):'AKShare 连接成功，但批量数据暂无可用摘要。',indicators:merged,capabilities:[...probe.capabilities,...batch.capabilities]};
      writeCache(context);return context;
    },
  };
}

export function marketContextMiddleware(service:ReturnType<typeof createAkshareMarketService>){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try{
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
      if(req.method==='GET')return send(200,service.get());
      if(req.method!=='POST')return send(405,{error:'不支持的方法'});
      if(req.headers['x-zhiyin-market']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>1024)return send(413,{error:'请求过大'});}
      const data=JSON.parse(body);if(data?.type!=='refresh')return send(400,{error:'不支持的操作'});
      return send(200,await service.refresh());
    }catch(error){return send(502,{error:error instanceof Error?error.message:'外部市场数据更新失败'});}
  };
}
