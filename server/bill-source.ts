import {existsSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {extname,isAbsolute} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash} from 'node:crypto';
import type {ConnectedFinancialSource,ExternalFinancialProvider,FinancialTransaction} from '../src/lib/financial-connections';

type GrantState={version:1;providers:ExternalFinancialProvider[]};
type Connections=Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;
const providers:ExternalFinancialProvider[]=['wechat_pay','alipay'];
const category:Record<string,string>={dining:'餐饮',transport:'出行',shopping:'购物',life:'生活',service:'生活',education:'教育',entertainment:'娱乐',gift:'礼品',transfer:'转账',income:'收入',other:'其他'};
const execFileAsync=promisify(execFile);

export function priorBeijingMonth(now:number){const date=new Date(now+8*3600000);return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1)).toISOString().slice(0,7);}

export async function readLocalWechatSource(configFile:string,importerFile:string,month:string):Promise<ConnectedFinancialSource>{
  if(!existsSync(configFile))throw new Error('本地微信账单源未配置，后台无法重新拉取');
  const config=JSON.parse(readFileSync(configFile,'utf8')) as {sourcePath?:string;expectedSha256?:string;enabled?:boolean};
  if(config.enabled!==true)throw new Error('本地微信账单回放未启用，请在沙箱控制台手动开启');
  if(!config.sourcePath||!isAbsolute(config.sourcePath)||extname(config.sourcePath).toLowerCase()!=='.xlsx')throw new Error('本地微信账单路径无效');
  const stat=statSync(config.sourcePath);
  if(!stat.isFile()||stat.size>50*1024*1024)throw new Error('本地微信账单不存在或超过 50MB');
  const sha=createHash('sha256').update(readFileSync(config.sourcePath)).digest('hex');
  if(config.expectedSha256&&sha!==config.expectedSha256)throw new Error('微信账单文件哈希已变化，请重新授权');
  const {stdout}=await execFileAsync(process.env.ZHIYIN_PYTHON||'python3',[importerFile,config.sourcePath],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});
  const parsed=JSON.parse(stdout) as {transactions?:Array<{id:string;merchant:string;amountCents:number;direction:'expense'|'income';category:string;occurredAt:string;linkedId?:string}>;importReport?:{sha256?:string;quarantinedRows?:number}};
  if(parsed.importReport?.sha256!==sha||!Array.isArray(parsed.transactions))throw new Error('微信账单导入校验失败');
  const [year,number]=month.split('-').map(Number);
  const from=new Date(Date.UTC(year,number-2,1)).toISOString().slice(0,7);
  const selected=parsed.transactions.filter(row=>row.occurredAt.slice(0,7)>=from&&row.occurredAt.slice(0,7)<=month);
  const valid=selected.filter(row=>typeof row.id==='string'&&typeof row.merchant==='string'&&Number.isSafeInteger(row.amountCents)&&row.amountCents>0&&['expense','income'].includes(row.direction)&&Number.isFinite(Date.parse(row.occurredAt)));
  const transactions:FinancialTransaction[]=valid.slice(0,5000).map(row=>({id:row.id.slice(0,80),title:row.merchant.slice(0,80),amount:row.direction==='expense'?-row.amountCents:row.amountCents,category:category[row.category]||'其他',occurredAt:row.occurredAt.slice(0,10),kind:row.category==='transfer'?'transfer':row.direction==='income'?'income':'payment',...(row.linkedId?{linkedId:row.linkedId.slice(0,100)}:{})}));
  return {provider:'wechat_pay',displayName:'微信支付',accountMasked:'已授权本地账单',scopes:['transactions'],syncedAt:new Date().toISOString(),autopays:[],transactions,transactionCoverage:{total:selected.length,returned:transactions.length,invalid:selected.length-valid.length,complete:selected.length===valid.length&&valid.length<=5000&&(parsed.importReport.quarantinedRows||0)===0,...(transactions.length?{from:transactions.at(-1)!.occurredAt,to:transactions[0].occurredAt}:{})}};
}

export function createBillSourceService(options:{grantFile:string;fetchSource:(provider:ExternalFinancialProvider,month:string)=>ConnectedFinancialSource|Promise<ConnectedFinancialSource>}){
  const read=():GrantState=>{if(!existsSync(options.grantFile))return {version:1,providers:[]};const raw=JSON.parse(readFileSync(options.grantFile,'utf8')) as GrantState;if(raw.version!==1||!Array.isArray(raw.providers)||raw.providers.some(item=>!providers.includes(item)))throw new Error('账单授权记录损坏');return raw;};
  const write=(state:GrantState)=>{writeFileSync(options.grantFile+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(options.grantFile+'.tmp',options.grantFile);};
  function grant(provider:ExternalFinancialProvider,authorized:boolean){if(!providers.includes(provider))throw new Error('账单来源无效');const state=read();state.providers=authorized?[...new Set([...state.providers,provider])]:state.providers.filter(item=>item!==provider);write(state);return {authorized:state.providers.includes(provider)};}
  async function refresh(month:string):Promise<Connections>{
    const state=read();if(!state.providers.length)throw new Error('没有后台账单读取授权，请重新连接账单来源');
    const result:Connections={};
    for(const provider of state.providers){const source=await options.fetchSource(provider,month);if(source.provider!==provider||!source.scopes.includes('transactions'))throw new Error(`${provider} 后台账单来源无效`);result[provider]=source;}
    return result;
  }
  return {grant,refresh,grants:()=>[...read().providers]};
}

export function billSourceMiddleware(service:ReturnType<typeof createBillSourceService>){return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  try{
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
    if(req.method==='GET')return send(200,{providers:service.grants()});
    if(req.method!=='POST'||req.headers['x-zhiyin-bill-source']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
    let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>512)return send(413,{error:'请求过大'});}
    const input=JSON.parse(body) as {provider:ExternalFinancialProvider;authorized:boolean};
    if(typeof input.authorized!=='boolean')return send(400,{error:'授权状态无效'});
    return send(200,service.grant(input.provider,input.authorized));
  }catch(error){return send(400,{error:error instanceof Error?error.message:'账单授权服务失败'});}
};}
