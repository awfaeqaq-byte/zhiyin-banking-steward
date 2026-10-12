import {execFile} from 'node:child_process';
import {existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {validFundSamples,type FundSampleRecord,type FundSamples} from '../src/lib/fund-samples';

const execFileAsync=promisify(execFile);
type Runner=(end:string)=>Promise<Pick<FundSamples,'provider'|'records'>>;
const day=(time:number)=>new Date(time).toISOString().slice(0,10);

export function createFundSamplesService(options:{cacheFile:string;runner?:Runner;now?:()=>number;python?:string}){
  const now=options.now||Date.now;
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const script=resolve(projectRoot,'scripts/akshare_fund_samples.py');
  const localPython=resolve(projectRoot,'.venv-akshare/bin/python');
  const python=options.python||process.env.AKSHARE_PYTHON||(existsSync(localPython)?localPython:'python3');
  const run:Runner=options.runner||(async end=>{
    const {stdout}=await execFileAsync(python,[script,'--end',end],{timeout:28000,maxBuffer:1024*1024,env:{...process.env,PYTHONUTF8:'1'}});
    return JSON.parse(stdout) as Pick<FundSamples,'provider'|'records'>;
  });
  function readCache():FundSamples|null{
    try{if(!existsSync(options.cacheFile))return null;const snapshot=JSON.parse(readFileSync(options.cacheFile,'utf8'));if(!validFundSamples(snapshot))return null;return {...snapshot,records:snapshot.records.map(record=>record.status==='ready'?{...record,stale:!!record.stale||now()-(record.retrievedAt||snapshot.fetchedAt||0)>72*3600000||now()-Date.parse(record.date!)>7*86400000}:record)};}
    catch{return null;}
  }
  function writeCache(snapshot:FundSamples){writeFileSync(options.cacheFile+'.tmp',JSON.stringify(snapshot),{mode:0o600});renameSync(options.cacheFile+'.tmp',options.cacheFile);}
  return {
    get():FundSamples{return readCache()||{provider:'issuer_akshare',message:'尚未获取基金样本；点击更新后读取三只基金的发行方披露。',records:[]};},
    async refresh():Promise<FundSamples>{
      const previous=readCache();
      try{
        const raw=await run(day(now()));
        const candidate:FundSamples={...raw,message:'基金样本获取完成'};
        if(!validFundSamples(candidate)||candidate.records.length!==3)throw new Error('来源返回的基金字段或数量不符合预期');
        const records:FundSampleRecord[]=candidate.records.map(record=>{
          if(record.status==='ready'){
            const observed=Date.parse(record.date!);
            if(!Number.isFinite(observed)||observed>now()+86400000)throw new Error(`基金 ${record.code} 返回无效日期`);
            return {...record,retrievedAt:now(),stale:now()-observed>7*86400000};
          }
          if(record.status==='conflict')return record;
          const old=previous?.records.find(item=>item.code===record.code&&item.status==='ready');
          return old?{...old,stale:true,message:`本次更新失败，保留旧样本：${record.message||'来源不可用'}`}:record;
        });
        const ready=records.filter(record=>record.status==='ready').length;
        const snapshot:FundSamples={provider:'issuer_akshare',fetchedAt:now(),message:`${ready} 项有发行方披露值；债券基金和 ETF 净值按数据日交叉核对，均非实时可交易报价。`,records};
        writeCache(snapshot);return snapshot;
      }catch(error){
        const message=error instanceof Error?error.message:'来源暂不可用';
        if(previous)return {...previous,message:`更新失败，保留旧样本：${message.slice(0,180)}`,records:previous.records.map(record=>record.status==='ready'?{...record,stale:true}:record)};
        return {provider:'issuer_akshare',message:`获取失败：${message.slice(0,180)}`,records:[]};
      }
    },
  };
}

export function fundSamplesMiddleware(service:ReturnType<typeof createFundSamplesService>){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try{
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
      if(req.method==='GET')return send(200,service.get());
      if(req.method!=='POST')return send(405,{error:'不支持的方法'});
      if(req.headers['x-zhiyin-funds']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>1024)return send(413,{error:'请求过大'});}
      if(JSON.parse(body)?.type!=='refresh')return send(400,{error:'不支持的操作'});
      return send(200,await service.refresh());
    }catch(error){return send(502,{error:error instanceof Error?error.message:'基金样本更新失败'});}
  };
}
