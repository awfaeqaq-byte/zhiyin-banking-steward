import {afterAll, expect, it, vi} from 'vitest';
import {createServer} from 'node:http';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createMerchantStore, merchantMiddleware} from '../../server/merchant';
import {createMessageService} from '../../server/message-service';
import {fundingProjection} from '../../src/lib/merchant-funding';
import {merchantAnswer} from '../../src/lib/merchant-assistant';
import {merchantRequest, hasPendingMerchantOperation, recoverMerchantOperation} from '../../src/lib/merchant-service';
import {emptyMerchantState,type MerchantState} from '../../src/lib/merchant';

const clock = Date.parse('2026-10-29T12:00:00+08:00');
const nativeFetch = globalThis.fetch;
const reportPath = resolve(process.env.ZHIYIN_SCENARIO_REPORT || '.artifacts/test-results/merchant-scenarios-latest.json');
type Log = {id:string;scene:string;at:string;kind:string;action:string;input:unknown;actual:unknown;result:string;durationMs:number};
type Definition = {id:string;title:string;precondition:string;input:string;steps:string;expected:string;level:string};
type Result = Definition & {status:string;started:string;finished:string;durationMs:number;checks:number;conclusion:string;error:string;logFrom:string;logTo:string};
const logs:Log[]=[],results:Result[]=[];
const started=new Date().toISOString();
function sourceRevision(args:string[]){
 try{return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
 catch{return '源码交付包（无 Git 元数据）';}
}
const definitions:Definition[]=[
 {id:'MF-01',title:'首次开店与零余额确认',precondition:'独立新店，无订单、无资金安排。',input:'未开店时询问“小店资金安排”；开店后确认可用资金 0 元。',steps:'1. 读取空账户并询问资金安排。\n2. 创建小店。\n3. 检查未确认余额。\n4. 明确确认余额为 0。',expected:'未开店时引导创建；未确认余额为 null；确认后的 0 是有效余额；不产生支出。',level:'HTTP API＋对话规则＋计算'},
 {id:'MF-02',title:'一句话创建房租安排',precondition:'已开店，可用余额 5000 元；业务时钟固定为 2026-10-29 12:00 北京时间。',input:'“小店下周五房租3000元”',steps:'1. 通过消息服务分流并回复。\n2. 检查确认前没有资金计划。\n3. 使用草稿确认保存。\n4. 查询预算与账本。',expected:'分流到 merchant；到期日为 2026-11-06；金额 3000 元；保存后预留 3000、可用 2000；支出仍为 0。',level:'消息服务＋HTTP API＋计算'},
 {id:'MF-03',title:'补日期、改金额与重启续接',precondition:'已开店，无资金计划；同一商户任务。',input:'“小店预留进货款800元” → “11月5日” → 重启服务 → “改成1000元”',steps:'1. 生成缺少日期的草稿。\n2. 补充到期日。\n3. 重建消息服务并修改金额。\n4. 确认最后草稿并重新读取。',expected:'三轮沿用同一 planId；11 月 5 日保留；最终 1000 元；只保存一笔；无模型调用和自动付款。',level:'消息服务持久化＋HTTP API'},
 {id:'MF-04',title:'两笔支出的缺口与待收款隔离',precondition:'余额 5000 元；11 月 1 日房租 3000；11 月 3 日进货 2500。',input:'新增一份 22 元待收款点餐订单，随后登记收款，再登记退款。',steps:'1. 按日期测算两笔支出。\n2. 创建待收款订单。\n3. 登记收款。\n4. 登记退款。',expected:'初始首次缺口为 11 月 3 日、500 元；待收款不影响余额；收款后缺口 478 元；退款后恢复 500 元。',level:'HTTP API＋资金计算'},
 {id:'MF-05',title:'修改原安排、取消与逾期保留',precondition:'余额 5000；房租 3000；进货 2500；均为待付。',input:'进货改成 1800 元、到期 10 月 28 日；随后取消进货。',steps:'1. 用原 ID 修改金额和日期。\n2. 检查逾期项目仍在测算内。\n3. 取消进货。\n4. 查看余额与支出。',expected:'保持两笔记录、不另建计划；逾期计入预留；取消后仅预留房租 3000、可用 2000；不产生现金支出。',level:'HTTP API＋资金计算'},
 {id:'MF-06',title:'登记已付、重试与重启幂等',precondition:'余额 5000；待付房租 3000、进货 2500。',input:'房租在原渠道支付后登记；重放完全相同的请求；重启后再查询。',steps:'1. 登记房租已支付。\n2. 同 requestId 重放原请求。\n3. 用新 requestId 再次登记同一计划。\n4. 重建存储并查看账本。',expected:'只新增一笔 3000 元支出；房租为已支付；余额 2000、待付 2500、缺口 500；原请求可重放，新重复登记被拒绝。',level:'HTTP API＋磁盘恢复＋计算'},
 {id:'MF-07',title:'关联已有支出避免双重记账',precondition:'余额 5000；进货计划 1000；账本已登记买菜 1000 和水电 200。',input:'将进货计划关联已有买菜记录；尝试关联不等金额或已被占用的记录。',steps:'1. 先记录两笔实际支出。\n2. 关联进货与买菜。\n3. 创建另一笔计划并尝试复用支出。\n4. 尝试关联不等金额支出。',expected:'关联不新增支出、不再次扣减余额；余额保持 3800 元；重复关联与金额不符均拒绝。',level:'HTTP API＋账本关联'},
 {id:'MF-08',title:'并发版本、重复计划与账户隔离',precondition:'独立店主账户，另一个空账户。',input:'旧 revision 提交；刷新后重新提交；重复内容换 ID；缺少身份头；异源请求；访客菜单查询。',steps:'1. 用旧版本提交并检查 409。\n2. 用新版本保存后再次提交相同计划。\n3. 检查另一账户。\n4. 检查同源限制与访客返回字段。',expected:'旧版本拒绝，刷新后可保存；同名同金额同日期不重复；账户相互隔离；缺头及异源返回 403；公开菜单不泄露资金账本。',level:'HTTP API＋隔离边界'},
 {id:'MF-09',title:'非法输入与当前能力边界',precondition:'已开店并保存一笔 3000 元房租，保存原状态。',input:'2 月 30 日；负数、零支出、超过 100 万；未来付款时间；“每月1日房租3000元”；“房租3000元，进货200元”；“房租3500元已付”。',steps:'1. 逐项提交非法 API 输入。\n2. 每次读取并比较原状态。\n3. 测试重复周期、多笔句子及付款金额不一致。',expected:'非法输入返回 400 且原记录不变；周期、多笔和金额冲突返回待澄清概览；不静默写账。',level:'HTTP API＋自然语言边界'},
 {id:'MF-10',title:'提交回执丢失与原请求恢复',precondition:'已开店，无资金余额；使用真实本地 HTTP 服务和真实客户端请求代码。',input:'两次 POST 已被服务端保存但客户端均模拟丢失回执；随后重新恢复原请求。',steps:'1. 提交余额 5000 元并注入回执丢失。\n2. 检查待恢复记录和服务端 revision。\n3. 尝试另一笔写入。\n4. 恢复原请求并重新读取。',expected:'客户端显示结果待核对；服务端只应用一次；恢复前阻止新写入；恢复后清除待处理状态并保留余额 5000。',level:'客户端＋真实 HTTP＋故障注入'},
];

function record(scene:string,kind:string,action:string,input:unknown,actual:unknown,result='信息',durationMs=0){
 const item={id:`L${String(logs.length+1).padStart(4,'0')}`,scene,at:new Date().toISOString(),kind,action,input,actual,result,durationMs};logs.push(item);return item;
}
for(const definition of definitions)it(`${definition.id} ${definition.title}`,async()=>{
 const start=performance.now(), first=logs.length;
 const result:Result={...definition,status:'运行中',started:new Date().toISOString(),finished:'',durationMs:0,checks:0,conclusion:'',error:'',logFrom:'',logTo:''};results.push(result);
 const root=mkdtempSync(join(tmpdir(),'zhiyin-10-scenes-')),scope=randomUUID();
 const server=createServer(merchantMiddleware(root));let base='';
 const check=(action:string,actual:unknown,expected:unknown)=>{result.checks++;try{expect(actual).toEqual(expected);record(definition.id,'断言',action,expected,actual,'通过');}catch(error){record(definition.id,'断言',action,expected,actual,'失败');throw error;}};
 const call=async<T=MerchantState>(path:string,body?:unknown,headers:Record<string,string>={})=>{
  const start=performance.now();const response=await nativeFetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Merchant':'1','X-Zhiyin-Expense-Scope':scope,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json() as T;record(definition.id,'HTTP',`${body===undefined?'GET':'POST'} ${path}`,{body:body??null,headers}, {status:response.status,body:data},'信息',Math.round((performance.now()-start)*100)/100);return{status:response.status,data};
 };
 let state:MerchantState=emptyMerchantState();
 const change=async(op:Record<string,unknown>)=>{const r=await call('/owner',{...op,revision:state.revision,requestId:randomUUID()});check(`${op.type} 返回状态`,r.status,200);state=r.data;return state;};
 const prepare=async(cash?:number)=>{state=(await call('/owner')).data;await change({type:'create-shop',name:`场景测试店-${definition.id}`});if(cash!==undefined)await change({type:'set-funding-cash',amount:cash});};
 const plan=async(id:string,title:string,amount:number,dueDate:string)=>change({type:'save-funding-plan',id,title,category:title==='房租'?'房租':'进货',amount,dueDate});
 const projection=()=>{const p=fundingProjection(state,clock);record(definition.id,'计算','资金测算（金额单位：分）',{revision:state.revision},p);return p;};
 let currentId='';const model=vi.fn(async()=>{throw new Error('这些确定性商户场景不应调用外部模型');});let messages=createMessageService(root,model);
 const say=async(text:string)=>{const runId=randomUUID(),owner=randomUUID();messages.submit(scope,{id:runId,text,currentId,memoryRevision:0});await messages.idle(scope);const ws=messages.get(scope),run=ws.runs!.find(r=>r.id===runId)!;record(definition.id,'分流','消息任务分流',{text,currentId},run);const job=run.jobs[0];check('商户消息生成执行任务',!!job,true);currentId=job.taskId;check('任务归属',ws.items.find(t=>t.id===job.taskId)?.kind,'merchant');messages.claim(scope,runId,job.id,owner);const reply=await messages.reply(scope,{id:runId,jobId:job.id,owner,request:{stewardName:'宁宁',subscriptions:[],messages:[]}});record(definition.id,'回复','宁宁的实际回复',{text},reply);return reply;};
 try{
  vi.spyOn(Date,'now').mockReturnValue(clock);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('没有取得本地测试端口');base=`http://127.0.0.1:${address.port}`;
  record(definition.id,'环境','启动独立临时账本',{scope,businessTime:'2026-10-29 12:00:00 +08:00'},{isolation:'本地临时目录，结束后清理，不修改用户账本'});
  switch(definition.id){
   case 'MF-01':{
    state=(await call('/owner')).data;check('初次读取为空店',state.shop,null);
    const response=merchantAnswer(state,'小店资金安排',clock);record(definition.id,'回复','未开店引导','小店资金安排',response);check('提供开店引导',response.text.includes('创建'),true);
    await change({type:'create-shop',name:'零余额测试店'});check('未确认余额不可推断',projection().available,null);
    const draft=merchantAnswer(state,'小店可用资金0元',clock).merchantUI!.funding!;check('零金额草稿',draft.amount,0);check('生成草稿不写账',state.funding,undefined);
    await change({type:'set-funding-cash',amount:0});check('零余额有效',projection().available,0);check('未新增支出',state.expenses.length,0);result.conclusion='未开店时明确引导；未知余额与 0 元余额得到区分，草稿不自动写账。';break;
   }
   case 'MF-02':{
    await prepare(500000);const reply=await say('小店下周五房租3000元'),d=reply.merchantUI!.funding!;
    check('提取日期和金额',[d.title,d.amount,d.dueDate],['房租',300000,'2026-11-06']);check('确认前未存计划',createMerchantStore(root).get(scope).funding!.plans.length,0);
    await plan(d.planId!,d.title!,d.amount!,d.dueDate!);const p=projection();check('保存后资金安排',[p.required,p.free,state.expenses.length],[300000,200000,0]);check('未使用外部模型',model.mock.calls.length,0);result.conclusion='一句话正确识别 11 月 6 日房租 3000 元，用户确认后保存，剩余可用 2000 元。';break;
   }
   case 'MF-03':{
    await prepare();const a=(await say('小店预留进货款800元')).merchantUI!.funding!;check('缺少日期不编造',a.dueDate,undefined);
    const b=(await say('11月5日')).merchantUI!.funding!;messages=createMessageService(root,model);record(definition.id,'重启','重建消息服务',null,{preservedOnDisk:true});const c=(await say('改成1000元')).merchantUI!.funding!;
    check('跨轮和重启沿用草稿',[b.planId,c.planId,b.dueDate,c.dueDate,c.amount],[a.planId,a.planId,'2026-11-05','2026-11-05',100000]);
    await plan(c.planId!,c.title!,c.amount!,c.dueDate!);check('只存一个计划',createMerchantStore(root).get(scope).funding!.plans.length,1);check('没有外部模型调用',model.mock.calls.length,0);result.conclusion='日期补充和金额修改在重启后继续同一计划，最终仅保存 1000 元进货一笔。';break;
   }
   case 'MF-04':{
    await prepare(500000);await plan('rent','房租',300000,'2026-11-01');await plan('stock','进货',250000,'2026-11-03');let p=projection();check('初次缺口',[p.available,p.required,p.shortfall,p.firstShortfall],[500000,550000,50000,'2026-11-03']);
    const r=await call<{order:{id:string;total:number}}>(`/public/${state.shop!.publicToken}/orders`,{requestId:randomUUID(),table:'测试桌',items:[{menuItemId:'rice',quantity:1}]});check('点餐成功',r.status,200);state=(await call('/owner')).data;check('待收款不改变余额',projection().available,500000);
    await change({type:'record-payment',orderId:r.data.order.id});p=projection();check('实收后缺口',[p.available,p.shortfall],[502200,47800]);await change({type:'record-refund',orderId:r.data.order.id});check('退款后缺口',projection().shortfall,50000);result.conclusion='缺口按日期正确计算；22 元待收款被排除，实收与退款各准确调整一次。';break;
   }
   case 'MF-05':{
    await prepare(500000);await plan('rent','房租',300000,'2026-11-01');await plan('stock','进货',250000,'2026-11-03');await plan('stock','进货',180000,'2026-10-28');const p=projection();check('修改不新增且逾期计入',[state.funding!.plans.length,p.required,p.free,p.rows[0].overdue],[2,480000,20000,true]);
    await change({type:'cancel-funding-plan',id:'stock'});check('取消释放预算不动现金',[projection().required,projection().available,state.expenses.length,state.funding!.plans[1].status],[300000,500000,0,'cancelled']);result.conclusion='修改保持原计划 ID；逾期安排继续占用预算；取消后释放 1800 元预算且不发生付款。';break;
   }
   case 'MF-06':{
    await prepare(500000);await plan('rent','房租',300000,'2026-11-01');await plan('stock','进货',250000,'2026-11-03');const body={type:'pay-funding-plan',id:'rent',occurredAt:clock,revision:state.revision,requestId:randomUUID()};const first=await call('/owner',body);check('首次登记成功',first.status,200);state=first.data;const again=await call('/owner',body);check('原请求重放保持记录',[again.status,again.data.revision,again.data.expenses.length],[200,state.revision,1]);
    const duplicate=await call('/owner',{...body,revision:state.revision,requestId:randomUUID()});check('新的重复付款登记被拒绝',duplicate.status,400);state=createMerchantStore(root).get(scope);record(definition.id,'恢复','重新读取磁盘账本',null,state);const p=projection();check('重启后的账本与预算',[state.expenses.length,state.funding!.plans[0].status,p.available,p.required,p.shortfall],[1,'paid',200000,250000,50000]);result.conclusion='回执重放和重启均只保留一笔 3000 元支出；新重复登记被拒绝。';break;
   }
   case 'MF-07':{
    await prepare(500000);await plan('stock','进货',100000,'2026-11-03');await change({type:'add-expense',title:'买菜',category:'进货',amount:100000,occurredAt:clock});await change({type:'add-expense',title:'水电',category:'水电',amount:20000,occurredAt:clock});const expense=state.expenses[0].id;
    await change({type:'pay-funding-plan',id:'stock',expenseId:expense});check('关联不重复记账',[state.expenses.length,projection().available],[2,380000]);await plan('stock2','第二次进货',100000,'2026-11-05');const old=JSON.stringify(state);
    for(const expenseId of [expense,state.expenses[1].id]){const r=await call('/owner',{type:'pay-funding-plan',id:'stock2',expenseId,revision:state.revision,requestId:randomUUID()});check('非法关联被拒绝',r.status,400);}
    check('拒绝后状态不变',JSON.stringify((await call('/owner')).data),old);result.conclusion='已有支出关联没有再扣现金；已关联记录和金额不符记录均不可重复使用。';break;
   }
   case 'MF-08':{
    await prepare(500000);const body={type:'save-funding-plan',id:'rent',title:'房租',category:'房租',amount:300000,dueDate:'2026-11-01'};const stale=await call('/owner',{...body,revision:0,requestId:randomUUID()});check('旧版本拒绝',stale.status,409);await change(body);const duplicate=await call('/owner',{...body,id:'same',revision:state.revision,requestId:randomUUID()});check('重复计划拒绝',duplicate.status,400);
    check('另一账户不可读本店资金',(await call('/owner',undefined,{'X-Zhiyin-Expense-Scope':randomUUID()})).data.shop,null);check('缺少身份头拒绝',(await call('/owner',undefined,{'X-Zhiyin-Merchant':''})).status,403);check('异源拒绝',(await call('/owner',undefined,{'Origin':'https://unrelated.example'})).status,403);
    const publicResult=await call<{shop:Record<string,unknown>}>(`/public/${state.shop!.publicToken}`);check('公开内容仅菜单和店名',Object.keys(publicResult.data.shop).sort(),['menu','name']);result.conclusion='版本冲突和重复计划均阻止写入；账户分离、同源检查及公开菜单字段符合预期。';break;
   }
   case 'MF-09':{
    await prepare(500000);await plan('rent','房租',300000,'2026-11-01');const before=JSON.stringify(state);const basePlan={type:'save-funding-plan',id:'invalid',title:'进货',category:'进货',amount:10000,dueDate:'2026-11-03'};
    const invalid=[{...basePlan,dueDate:'2026-02-30'},{...basePlan,amount:-1},{...basePlan,amount:0},{...basePlan,amount:100000001},{type:'set-funding-cash',amount:-1},{type:'pay-funding-plan',id:'rent',occurredAt:clock+1},{type:'pay-funding-plan',id:'missing',occurredAt:clock}];
    for(const op of invalid){const r=await call('/owner',{...op,revision:state.revision,requestId:randomUUID()});check(`非法输入 ${JSON.stringify(op)}`,r.status,400);check('失败原子性：原状态不变',JSON.stringify((await call('/owner')).data),before);}
    for(const prompt of ['小店2月30日进货300元','小店每月1日房租3000元','小店房租3000元，进货200元','房租3500元已付']){const reply=merchantAnswer(state,prompt,clock);record(definition.id,'回复','边界语句实际回复',prompt,reply);check('返回待澄清概览',reply.merchantUI?.funding?.intent,'overview');}
    check('自然语言处理没有改账',JSON.stringify(createMerchantStore(root).get(scope)),before);result.conclusion='7 类非法请求全部拒绝且账本不变。周期与一条多笔仍需逐笔核对，这是已验证的当前能力边界。';break;
   }
   case 'MF-10':{
    await prepare();localStorage.setItem('zhiyin-expense-scope',scope);sessionStorage.clear();let drops=2,posts=0;
    record(definition.id,'环境','Node/jsdom信号适配',null,{timeoutAPI:typeof AbortSignal.timeout,note:'Node fetch不接受jsdom的AbortSignal。测试传输层移除该信号；仅验证回执丢失与幂等恢复，不验证15秒超时。'});
    vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input).replace('/api/zhiyin/merchant','');const transportInit={...init};delete transportInit.signal;let response:Response;try{response=await nativeFetch(base+path,transportInit);}catch(error){record(definition.id,'环境错误','Node传输适配错误',null,(error as Error).message,'失败');throw error;}if(init?.method==='POST'){posts++;const clone=await response.clone().json();record(definition.id,'故障注入','真实服务端返回',{request:JSON.parse(String(init.body)),attempt:posts},{status:response.status,body:clone});if(drops>0){drops--;record(definition.id,'故障注入','丢弃已成功响应',null,{fault:'TypeError: 模拟回执丢失'},'预期故障');throw new TypeError('模拟回执丢失');}}return response;});
    let failure='';try{await merchantRequest({type:'set-funding-cash',amount:500000},state.revision);}catch(error){failure=(error as Error).message;}record(definition.id,'客户端','请求失败后反馈',null,failure);check('提示结果待核对',failure.includes('待核对'),true);check('保留原请求',hasPendingMerchantOperation(),true);
    const saved=createMerchantStore(root).get(scope);check('两次网络尝试仅应用一次',[posts,saved.revision,saved.funding?.cash?.amount],[2,state.revision+1,500000]);
    try{await merchantRequest({type:'set-funding-cash',amount:600000},saved.revision);}catch(error){record(definition.id,'客户端','恢复前新写入被阻止',null,(error as Error).message,'预期拒绝');}check('被阻止的请求没有发往服务器',posts,2);
    state=await recoverMerchantOperation();record(definition.id,'恢复','客户端原请求恢复',null,state);check('恢复后原请求已清除',hasPendingMerchantOperation(),false);check('恢复后不重复应用',[state.revision,state.funding?.cash?.amount],[saved.revision,500000]);result.conclusion='真实服务端保存后模拟两次回执丢失，仍只写一次；恢复前禁止新写入，恢复后准确读取原结果。';break;
   }
  }
  result.status='通过';
 }catch(error){result.status='失败';result.error=error instanceof Error?`${error.message}\n${error.stack??''}`:String(error);result.conclusion=`本场景未通过：${(error as Error).message}`;record(definition.id,'错误','场景终止',null,result.error,'失败');throw error;}
 finally{result.finished=new Date().toISOString();result.durationMs=Math.round((performance.now()-start)*100)/100;record(definition.id,'结论',definition.title,null,{status:result.status,checks:result.checks,conclusion:result.conclusion},result.status,result.durationMs);result.logFrom=logs[first]?.id??'';result.logTo=logs.at(-1)?.id??'';vi.restoreAllMocks();vi.stubGlobal('fetch',nativeFetch);sessionStorage.clear();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});}
});
afterAll(()=>{
 const sourceFiles=['server/merchant.ts','server/merchant-funding.ts','server/message-service.ts','src/lib/merchant.ts','src/lib/merchant-funding.ts','src/lib/merchant-assistant.ts','src/lib/merchant-service.ts','src/components/merchant-funding.tsx','tests/lib/merchant-funding-scenarios.test.ts'];
 const report={title:'知银商户资金安排10场景测试',started,finished:new Date().toISOString(),businessClock:'2026-10-29 12:00:00 +08:00',commit:sourceRevision(['rev-parse','HEAD']),branch:sourceRevision(['branch','--show-current']),node:process.version,platform:process.platform,command:'npx vitest run tests/lib/merchant-funding-scenarios.test.ts --reporter=verbose --reporter=json --outputFile=<测试输出目录>/vitest.json',method:'新执行的确定性消息服务、真实本地HTTP、客户端故障注入与持久化集成测试；不等同于10次浏览器端到端操作。各场景使用独立临时账本。',externalModel:'未请求外部大模型；商户已实现路径为确定性处理。',sourceFiles:sourceFiles.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),results,logs};
 mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,(_key,value)=>value===undefined?'[undefined]':value,2));writeFileSync(reportPath.replace(/\.json$/,'.ndjson'),logs.map(log=>JSON.stringify(log,(_key,value)=>value===undefined?'[undefined]':value)).join('\n')+'\n');
});
