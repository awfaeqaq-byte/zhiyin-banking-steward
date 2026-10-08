// Disposable UI review server: isolated account/tasks and deterministic model replies.
// No browser automation here; interact through the normal preview controls.
import {createServer} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'zhiyin-ui-review-'));
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {createBankStore}=await loader.ssrLoadModule('/server/bank-store.ts');
const {changeWorkspaces,emptyWorkspaces}=await loader.ssrLoadModule('/src/lib/workspaces.ts');
const bank=createBankStore(join(directory,'bank.json'));
let tasks=emptyWorkspaces();
for(const [id,title,kind] of [['birthday','爱人生日','occasion'],['dinner','今晚聚餐AA','aa']])tasks=changeWorkspaces(tasks,{type:'create',id,title,kind,revision:tasks.revision,requestId:crypto.randomUUID()});
const draft={title:'爱人生日',recipient:'爱人',budget:100000,prepareAt:0,deliverAt:0,address:'',contact:'',note:'低甜',productIds:['cake-light','flowers-roses']};
const middleware={name:'isolated-ui-preview',enforce:'pre',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/__review'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<script>localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-workspace-active','birthday');sessionStorage.setItem('zhiyin-occasion-draft:birthday',${JSON.stringify(JSON.stringify(draft))});location.replace('/');</script>`);return;}
 if(!path?.startsWith('/api/zhiyin/'))return next();
 let input='';for await(const chunk of req)input+=chunk;
 try{
  const body=input?JSON.parse(input):{};
  let result={};
  if(path.endsWith('/bank')){if(body.type)throw new Error('预览账户只读，不执行资金操作');result=bank.get();}
  else if(path.endsWith('/workspaces')){if(body.type)tasks=changeWorkspaces(tasks,body);result=tasks;}
  else if(path.endsWith('/steward-reply'))result={output_text:JSON.stringify({text:'我先按低甜蛋糕和鲜花整理。定好送达时间后，再补收货信息。',patch:{recipient:'爱人',productIds:['cake-light','flowers-roses']},questions:[]})};
  else if(path.endsWith('/memory'))result={version:1,revision:0,enabled:false,items:[],requests:[]};
  else if(path.endsWith('/expenses'))result={revision:0,books:[]};
  else if(path.endsWith('/tasks'))result={revision:0,tasks:[]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
 });}};
const server=await createServer({plugins:[middleware],server:{host:'127.0.0.1',port:5178,strictPort:true}});
await server.listen();console.log('Isolated UI preview: http://127.0.0.1:5178/__review');
async function close(){await server.close();await loader.close();rmSync(directory,{recursive:true,force:true});process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);setTimeout(close,600000);
