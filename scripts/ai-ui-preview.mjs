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
const {changeExpenses,emptyExpenseState}=await loader.ssrLoadModule('/src/lib/expense-notebook.ts');
const {emptyMemory}=await loader.ssrLoadModule('/src/lib/steward-memory.ts');
const bank=createBankStore(join(directory,'bank.json'));
let tasks=emptyWorkspaces();
for(const [id,title,kind] of [['birthday','爱人生日','occasion'],['dinner','今晚聚餐AA','aa']])tasks=changeWorkspaces(tasks,{type:'create',id,title,kind,revision:tasks.revision,requestId:crypto.randomUUID()});
const group={id:'friends',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true,gender:'male'},{id:'li',name:'李娜',gender:'female'},{id:'wang',name:'小王',gender:'male'}]};
let expenses=changeExpenses(emptyExpenseState(),{type:'create',bookId:'dinner-book',title:'今晚聚餐AA',group,participants:['me','li','wang'],defaultPayerId:'me',revision:0,requestId:crypto.randomUUID()});
tasks=changeWorkspaces(tasks,{type:'link',id:'dinner',expenseBookId:'dinner-book',revision:tasks.revision,requestId:crypto.randomUUID()});
const draft={title:'爱人生日',recipient:'爱人',budget:100000,prepareAt:0,deliverAt:0,address:'',contact:'',note:'低甜',productIds:['cake-light','flowers-roses']};
const middleware={name:'isolated-ui-preview',enforce:'pre',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/__review'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<script>localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope','ui-review');localStorage.removeItem('zhiyin-steward-conversation-v1');localStorage.setItem('zhiyin-workspace-active','birthday');sessionStorage.setItem('zhiyin-occasion-draft:birthday',${JSON.stringify(JSON.stringify(draft))});location.replace('/');</script>`);return;}
 if(!path?.startsWith('/api/zhiyin/'))return next();
 let input='';for await(const chunk of req)input+=chunk;
 try{
  const body=input?JSON.parse(input):{};
  let result={};
  if(path.endsWith('/bank')){if(body.type)throw new Error('预览账户只读，不执行资金操作');result=bank.get();}
  else if(path.endsWith('/workspaces')){if(body.type)tasks=changeWorkspaces(tasks,body);result=tasks;}
  else if(path.endsWith('/steward-reply')){
    const text=body.input.at(-1).content;
    if(body.instructions.includes('任务分流器')){
      const parts=text.split('，').map(text=>{const kind=/饮料|午餐|AA/.test(text)?'aa':/生日|蛋糕|鲜花|预算/.test(text)?'occasion':/账单|支出|授权/.test(text)?'bills':'general';const task=tasks.items.find(w=>w.kind===kind);return {taskId:task?.id??null,kind,title:task?.title??(kind==='bills'?'本月账单':'日常交代'),text};});
      result={output_text:JSON.stringify({parts})};
    }else if(body.instructions.includes('持续记录零散消费'))result={output_text:JSON.stringify({action:'add',entry:{title:'饮料',amount:1800,payerId:'me',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))}})};
    else if(body.instructions.includes('patch'))result={output_text:JSON.stringify({text:'我先按低甜蛋糕和鲜花整理。定好送达时间后，再补收货信息。',patch:{recipient:'爱人',productIds:['cake-light','flowers-roses']},questions:[]})};
    else if(text==='？')result={output_text:'你刚才是想查看本月支出，我接着帮你核对微信账单的只读授权。[ZHIYIN_ACTION:OPEN_CONNECTIONS|wechat_pay]'};
    else if(body.instructions.includes('授权账单分析'))result={output_text:'先连接微信或支付宝的账单，就能继续看本月支出。授权范围由你决定。[ZHIYIN_ACTION:OPEN_CONNECTIONS]'};
    else result={output_text:'我在，想让我安排什么，直接告诉我就好。'};
  }
  else if(path.endsWith('/memory'))result=emptyMemory();
  else if(path.endsWith('/expenses')){if(body.type)expenses=changeExpenses(expenses,body);result=expenses;}
  else if(path.endsWith('/tasks'))result={revision:0,tasks:[]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
 });}};
const server=await createServer({plugins:[middleware],server:{host:'127.0.0.1',port:5178,strictPort:true}});
await server.listen();console.log('Isolated UI preview: http://127.0.0.1:5178/__review');
async function close(){await server.close();await loader.close();rmSync(directory,{recursive:true,force:true});process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);setTimeout(close,600000);
