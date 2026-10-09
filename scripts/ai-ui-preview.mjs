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
const foodMenu={storeId:'shop-aurora-kitchen',storeName:'橙子小馆·现炒便当',deliveryFee:300,discount:500,deliveryMinutes:32,address:'江湾金融中心 A 座 12 层',contact:'林晓 138****6608',products:[{id:'drink-plum-01',name:'黑糖珍珠鲜奶茶',description:'微糖 500ml，真茶现萃',price:880,image:'/mobilegym/apps/FoodDelivery/assets/food-milktea.jpg'}]};
const foodReviewPage=`<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离点餐UI测试</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0}dialog{max-width:300px;border:0;border-radius:16px;padding:24px;font:16px system-ui}button{min-height:44px}</style><iframe title="知银隔离测试" src="/?phone=mobilegym"></iframe><dialog><h2>待付款订单已准备</h2><p>隔离测试，仅模拟跳转，不执行扣款。</p><button onclick="this.closest('dialog').close()">返回知银</button></dialog><script>
localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope','food-ui-review');for(const key of ['zhiyin-steward-conversation-v1','zhiyin-bill-scenes-v1','zhiyin-connections','zhiyin-workspace-active'])localStorage.removeItem(key);
const frame=document.querySelector('iframe'),orders=[],catalog=${JSON.stringify(foodMenu)};window.addEventListener('message',e=>{const d=e.data;if(e.origin!==location.origin||e.source!==frame.contentWindow||d?.type!=='food-order-request')return;let result={status:'ok'};if(d.operation==='catalog')result.catalog=catalog;if(d.operation==='records')result.orders=orders.filter(o=>o.taskId===d.taskId);if(d.operation==='prepare'){result.orderId=d.orderId;if(!orders.some(o=>o.id===d.orderId))orders.push({id:d.orderId,taskId:d.taskId,status:'PENDING_PAYMENT',payable:d.quote.payable});document.querySelector('dialog').showModal();}if(d.operation==='open')document.querySelector('dialog').showModal();frame.contentWindow.postMessage({channel:'zhiyin-phone',version:1,type:'food-order-result',requestId:d.requestId,...result},location.origin);});</script></html>`;
const billSources=Object.fromEntries([['wechat_pay','微信支付'],['alipay','支付宝']].map(([provider,displayName])=>[provider,{provider,displayName,accountMasked:'隔离测试账户',syncedAt:'2026-10-09T10:00:00+08:00',autopays:[],transactions:provider==='wechat_pay'?[
 {id:'lunch',title:'午餐套餐',amount:-38800,category:'餐饮',occurredAt:'2026-10-08'},
 {id:'metro',title:'地铁',amount:-600,category:'出行',occurredAt:'2026-10-07'},
 {id:'drink',title:'便利店饮料',amount:-1800,category:'餐饮',occurredAt:'2026-10-06'},
]:[{id:'groceries',title:'盒马鲜生',amount:-13200,category:'购物',occurredAt:'2026-10-08'},{id:'taxi',title:'滴滴出行',amount:-4800,category:'出行',occurredAt:'2026-10-05'}]}]));
const billReviewPage=`<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离账单UI测试</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0}dialog{max-width:300px;border:0;border-radius:16px;padding:24px;font:16px system-ui}dialog::backdrop{background:#12232e88}button{min-height:44px;margin:8px;padding:8px 16px}small{color:#667}</style><iframe title="知银隔离测试" src="/?phone=mobilegym"></iframe><dialog><h2>合作平台确认</h2><p id="scope"></p><small>隔离UI测试，只提供合成账单，不操作真实账户。</small><p><button id="deny">拒绝</button><button id="approve">同意读取账单</button></p></dialog><script>
localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope','bill-ui-review');
for(const key of ['zhiyin-steward-conversation-v1','zhiyin-bill-scenes-v1','zhiyin-connections','zhiyin-workspace-active'])localStorage.removeItem(key);
const sources=${JSON.stringify(billSources)},grants={},frame=document.querySelector('iframe'),dialog=document.querySelector('dialog');let pending;
function reply(data){frame.contentWindow.postMessage({channel:'zhiyin-phone',version:1,...data},location.origin);}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.channel!=='zhiyin-phone')return;const data=event.data;
 if(data.type==='finance-source-request'){pending=data;document.querySelector('#scope').textContent=sources[data.provider].displayName+'：仅提供交易账单';dialog.showModal();}
 else if(data.type==='finance-source-refresh-request'){reply({type:'finance-source-result',requestId:data.requestId,status:grants[data.provider]?'granted':'denied',...(grants[data.provider]?{source:sources[data.provider]}:{})});}
});
document.querySelector('#approve').onclick=()=>{grants[pending.provider]=true;reply({type:'finance-source-result',requestId:pending.requestId,status:'granted',source:sources[pending.provider]});dialog.close();};
document.querySelector('#deny').onclick=()=>{reply({type:'finance-source-result',requestId:pending.requestId,status:'denied'});dialog.close();};
</script></html>`;
const middleware={name:'isolated-ui-preview',enforce:'pre',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/__food-review'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(foodReviewPage);return;}
 if(path==='/__bill-review'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(billReviewPage);return;}
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
    else if(body.instructions.includes('实际菜单'))result={output_text:JSON.stringify({text:'推荐这杯黑糖珍珠鲜奶茶，微糖、500ml。地址沿用默认，先给你核对。',draft:{items:[{productId:'drink-plum-01',quantity:1}],note:''},choices:[]})};
    else if(body.instructions.includes('patch'))result={output_text:JSON.stringify({text:'我先按低甜蛋糕和鲜花整理。定好送达时间后，再补收货信息。',patch:{recipient:'爱人',productIds:['cake-light','flowers-roses']},questions:[]})};
    else if(text==='？')result={output_text:'你刚才是想查看本月支出，我接着帮你核对微信账单的只读授权。[ZHIYIN_ACTION:OPEN_CONNECTIONS|wechat_pay]'};
    else if(body.instructions.includes('授权账单分析')){
      const analysis=JSON.parse(body.instructions.split('授权账单分析：')[1]);
      result={output_text:analysis.sources.length?(body.input.some(m=>m.content.includes('selectedTransaction'))?'这笔午餐可以先核对人数和是否包含垫付，不能仅凭金额判断异常。[[bill-ui:{"sections":["overview","categories","transactions"]}]]':'餐饮是这段支出的主要部分。可以点开分类看看明细，再判断是否符合预期。[[bill-ui:{"sections":["overview","categories","transactions"]}]]'):'确认这次的账单读取范围后，我接着看刚才的支出问题。[ZHIYIN_ACTION:OPEN_CONNECTIONS]'};
    }
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
