// Isolated synthetic account for asset/deposit UI verification; never reads private account files.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'zhiyin-assets-review-'));
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {createBankStore,bankMiddleware}=await loader.ssrLoadModule('/server/bank-store.ts');
const {createWealthStore,wealthMiddleware}=await loader.ssrLoadModule('/server/wealth-store.ts');
const {emptyMemory}=await loader.ssrLoadModule('/src/lib/steward-memory.ts');
const {emptyWorkspaces,changeWorkspaces}=await loader.ssrLoadModule('/src/lib/workspaces.ts');
const bank=createBankStore(join(directory,'bank.json'));
bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
const wealth=createWealthStore(bank),now=Date.now();
wealth.assess({experience:0,loss:0,term:0,liquidity:0,income:0},now);
const investment=wealth.prepare({amount:500000,term:3,productId:'cash-plus'},now);wealth.confirm(investment.id,now);
const deposit=bank.prepareDeposit({amount:200000,months:3},now);bank.confirmDeposit(deposit.id,now);
const banking=bankMiddleware(bank),investing=wealthMiddleware(wealth);
let workspaces=emptyWorkspaces();
const page=`<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离资产核对</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0}</style><script>localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope','assets-review');</script><iframe title="知银隔离资产测试" src="/?phone=mobilegym"></iframe></html>`;
const middleware={name:'isolated-assets-preview',enforce:'pre',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const path=req.url?.split('?')[0];
  if(path==='/__assets-review'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page);return;}
  if(path==='/api/zhiyin/bank')return banking(req,res);
  if(path==='/api/zhiyin/wealth')return investing(req,res);
  if(!path?.startsWith('/api/zhiyin/'))return next();
  try{
    let input='';for await(const chunk of req){input+=chunk;if(input.length>64000)throw new Error('request too large');}
    const body=input?JSON.parse(input):{};
    let result={};
    if(path.endsWith('/workspaces')){if(body.type)workspaces=changeWorkspaces(workspaces,body);result=workspaces;}
    else if(path.endsWith('/memory'))result=emptyMemory();
    else if(path.endsWith('/tasks'))result={revision:0,tasks:[]};
    else if(path.endsWith('/automations'))result={version:1,tasks:[],attention:[],runs:[]};
    else if(path.endsWith('/fund-samples'))result={provider:'issuer_akshare',message:'隔离测试，不抓取外部行情',records:[]};
    else if(path.endsWith('/market-context'))result={provider:'akshare',status:'connected',message:'隔离测试，不抓取外部行情',indicators:[],capabilities:[]};
    else if(path.endsWith('/steward-reply')){
      const text=body.input.at(-1).content;
      result=body.instructions.includes('任务分流器')?{output_text:JSON.stringify({parts:[{taskId:workspaces.items.find(t=>t.kind==='general')?.id??null,kind:'general',title:'定期存款',text}]})}:{output_text:'我先把金额和期限整理好。核对资金影响后，再由你确认存入。[ZHIYIN_VIEW:TERM_DEPOSIT]'};
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch(error){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
});}};
const server=await createServer({configFile:false,plugins:[middleware,react()],server:{host:'127.0.0.1',port:5178,strictPort:true}});
await server.listen();console.log('Isolated assets review: http://127.0.0.1:5178/__assets-review');
async function close(){await server.close();await loader.close();rmSync(directory,{recursive:true,force:true});process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);setTimeout(close,900000).unref();
