import {existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {validBankPayment,type BankPayment,type BankPaymentReceipt} from '../src/lib/bank-transfer';
import {validTransfer,validBankSnapshot,type TransferIntent,type BankDraft,type BankReceipt,type BankSnapshot,type BankSettings} from '../src/lib/bank-transfer';
import {authorizeSchedule,executeDue,createAA,settleAA,checkTransferBudget,type SmartState} from './smart-bank';
import type {AAIntent,BankRecipientId} from '../src/lib/bank-transfer';
import {availableBankFunds, heldOccasionBudget, occasionTotals, occasionProducts, validateOccasionDraft, validOccasionId, type OccasionDraft, type OccasionOrder, type OccasionPlan} from '../src/lib/occasion-plans';
type State=SmartState & {version:1};
function snapshot(s:State):BankSnapshot {const {revision,balance,limit,frozen,controls,transactions,payments=[],schedules=[],aaRequests=[],collections=[],occasions=[]}=s;return {revision,balance,limit,frozen,controls,transactions,payments,schedules,aaRequests,collections,occasions};}
function occasion(s:State,id:string){const plan=s.occasions?.find(p=>p.id===id);if(!plan)throw new Error('筹备安排不存在');return plan;}
function checkOccasionFunds(s:State,amount:number,excludeId?:string){
 const pending=(s.schedules??[]).filter(p=>p.status==='pending');
 const obligations=pending.reduce((sum,p)=>sum+p.amount,0)+Math.max(0,...pending.map(p=>p.protectedAmount??0));
 if(s.balance-heldOccasionBudget(s,excludeId)-obligations<amount)throw new Error('扣除已有预约和预留后资金不足，请调整预算');
}
const initial=():State=>({version:1,revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true},transactions:[],drafts:[],received:{mom:0,dad:0}});
function guard(s:SmartState,now:number){
 if(s.frozen)throw new Error('付款卡已挂失，请先恢复沙箱卡');
 const hour=new Date(now+8*3600000).getUTCHours();
 if(s.controls.night && (hour>=23 || hour<6))throw new Error('夜间保护生效中（北京时间23:00—06:00），请在银行卡设置核对');
}
export function createBankStore(file:string) {
 const read=():State=>{
  if(!existsSync(file))return initial();
  const s=JSON.parse(readFileSync(file,'utf8')) as State;
  if(!s || s.version!==1 || !validBankSnapshot(s) || !Array.isArray(s.drafts) || !s.drafts.every(d=>validTransfer(d) && typeof d.id==='string' && Number.isSafeInteger(d.revision) && Number.isSafeInteger(d.balance) && Number.isFinite(d.expiresAt)) || !s.received || !Number.isSafeInteger(s.received.mom) || !Number.isSafeInteger(s.received.dad))throw new Error('银行账本损坏，已停止操作，请保留文件检查');
  return s;
 };
 function mutate<T>(fn:(s:State)=>T):T {
  let lock:number;try{lock=openSync(file+'.lock','wx',0o600);}catch{throw Object.assign(new Error('账户正在处理，请稍后重试'),{code:'BANK_BUSY'});}
  try{const s=read(),result=fn(s);writeFileSync(file+'.tmp',JSON.stringify(s),{mode:0o600});renameSync(file+'.tmp',file);return result;}finally{closeSync(lock);unlinkSync(file+'.lock');}
 }
 return {
  saveOccasion(input:{id:string;revision:number;draft:OccasionDraft},now=Date.now()){return mutate(s=>{
   if(input.revision!==s.revision)throw new Error('安排或账户已变化，请刷新后重试');
   if(!validOccasionId(input.id))throw new Error('安排编号无效');validateOccasionDraft(input.draft,now);
   const plans=s.occasions??=[];const old=plans.find(p=>p.id===input.id);
   if(old&&old.status!=='draft'&&old.status!=='reserved')throw new Error('安排已结束，请新建');
   if(old?.orders.length)throw new Error('已准备订单，修改需取消当前安排后重新核对；已付款订单请单独退款');
   if(!old&&plans.length>=100)throw new Error('筹备安排已达上限');
   if(old?.status==='reserved')checkOccasionFunds(s,input.draft.budget,old.id);
   const plan:OccasionPlan={...input.draft,id:input.id,productIds:[...input.draft.productIds],title:input.draft.title.trim(),status:old?.status??'draft',orders:[],createdAt:old?.createdAt??now,updatedAt:now};
   s.occasions=old?plans.map(p=>p.id===plan.id?plan:p):[...plans,plan];s.revision++;return snapshot(s);
  });},
  reserveOccasion(id:string,revision:number,now=Date.now()){return mutate(s=>{
   const plan=occasion(s,id);if(plan.status==='reserved')return snapshot(s);
   if(revision!==s.revision)throw new Error('安排或账户已变化，请刷新后重试');
   if(plan.status!=='draft')throw new Error('安排已经结束');validateOccasionDraft(plan,now);guard(s,now);checkOccasionFunds(s,plan.budget);
   plan.status='reserved';plan.updatedAt=now;s.revision++;return snapshot(s);
  });},
  cancelOccasion(id:string,revision:number,now=Date.now()){return mutate(s=>{
   const plan=occasion(s,id);if(plan.status==='cancelled')return snapshot(s);
   if(revision!==s.revision)throw new Error('安排或账户已变化，请刷新后重试');
   if(plan.status==='completed')throw new Error('安排已完成');plan.status='cancelled';plan.updatedAt=now;s.revision++;return snapshot(s);
  });},
  completeOccasion(id:string,revision:number,now=Date.now()){return mutate(s=>{
   const plan=occasion(s,id);if(plan.status==='completed')return snapshot(s);
   if(revision!==s.revision)throw new Error('安排或账户已变化，请刷新后重试');
   if(plan.status!=='reserved'||!plan.orders.length||plan.orders.some(o=>!s.payments?.some(p=>p.id===o.paymentId&&p.refundedAt===undefined)))throw new Error('还有商品未付款或已退款，请先核对订单');
   if(plan.orders.length!==plan.productIds.length)throw new Error('还有商品未准备订单');
   plan.status='completed';plan.updatedAt=now;s.revision++;return snapshot(s);
  });},
  prepareOccasionOrder(id:string,productId:string,revision:number,now=Date.now()):OccasionOrder{return mutate(s=>{
   const plan=occasion(s,id);if(plan.status!=='reserved')throw new Error('请先确认预留预算，安排不能已经结束');
   if(plan.deliverAt<=now)throw new Error('送达时间已过，请取消后重新安排');
   const existing=plan.orders.find(o=>o.productId===productId);if(existing)return existing;
   if(revision!==s.revision)throw new Error('安排或账户已变化，请刷新后重试');
   const product=occasionProducts.find(p=>p.id===productId&&p.available);if(!product||!plan.productIds.includes(productId))throw new Error('商品不在本次安排中');
   const order={productId,orderId:`ZY-${id}-${productId}`,paymentId:`occasion:${id}:${productId}`,amount:product.price+product.deliveryFee,merchant:product.merchant,createdAt:now};
   plan.orders.push(order);plan.updatedAt=now;s.revision++;return order;
  });},
  schedule(id:string,now=Date.now()){return mutate(s=>{const existing=s.schedules?.find(item=>item.id===id);if(existing)return existing;guard(s,now);return authorizeSchedule(s,id,now);});},
  cancelSchedule(id:string){return mutate(s=>{const item=s.schedules?.find(x=>x.id===id);if(!item)throw new Error('预约不存在');if(item.status==='cancelled')return item;if(item.status!=='pending')throw new Error('预约已经执行或结束');item.status='cancelled';s.revision++;return item;});},
  runDue(now=Date.now()){
   if(!read().schedules?.some(s=>s.status==='pending' && s.executeAt<=now))return [];
   return mutate(s=>executeDue(s,now,guard));
  },
  createAA(input:AAIntent & {requestId:string;title:string},now=Date.now()){return mutate(s=>createAA(s,input,now));},
  settleAA(id:string,recipientId:BankRecipientId,now=Date.now()){return mutate(s=>settleAA(s,id,recipientId,now));},
  cancelAA(id:string){return mutate(s=>{const item=s.aaRequests?.find(x=>x.id===id);if(!item)throw new Error('收款不存在');if(item.status==='cancelled')return item;if(item.status!=='pending')throw new Error('收款已结束');item.status='cancelled';s.revision++;return item;});},
  pay(input:BankPayment,now=Date.now()):BankPaymentReceipt {return mutate(s=>{
   if(!validBankPayment(input))throw new Error('付款信息无效');
   const payments=s.payments??=[];
   const existing=payments.find(p=>p.id===input.id);
   if(existing){
    if(existing.amount!==input.amount || existing.channel!==input.channel || existing.merchant!==input.merchant || existing.occasionId!==input.occasionId)throw new Error('同一订单的付款信息不一致');
    if(existing.occasionId&&existing.refundedAt!==undefined)throw new Error('订单已退款，不能再次付款');
    return existing;
   }
   guard(s,now);
   if(input.amount>s.limit)throw new Error('超过银行卡单笔限额');
   if(input.amount>s.balance)throw new Error('银行卡余额不足，不会改用其他账户');
   if(input.occasionId!==undefined){
    const plan=occasion(s,input.occasionId),order=plan.orders.find(o=>o.paymentId===input.id);
    if(plan.status!=='reserved')throw new Error('安排已取消或结束，不能付款');
    if(!order||order.amount!==input.amount||order.merchant!==input.merchant)throw new Error('付款与筹备订单不一致');
    if(plan.deliverAt<=now)throw new Error('送达时间已过，请重新核对安排');
    if(input.amount>occasionTotals(plan,s).held)throw new Error('本次预留预算不足');
    if(s.balance-heldOccasionBudget(s,plan.id)<input.amount)throw new Error('银行卡可用资金不足');
   }else{
    if(input.id.startsWith('occasion:'))throw new Error('缺少筹备任务关联');
    if(input.amount>availableBankFunds(s))throw new Error('扣除已预留预算后，可用余额不足');
   }
   if(payments.length>=5000)throw new Error('沙箱账本已满');
   s.balance-=input.amount;s.revision++;
   const receipt={...input,completedAt:now,balanceAfter:s.balance};
   payments.push(receipt);return receipt;
  });},
  refundPayment(id:string,now=Date.now()):BankPaymentReceipt {return mutate(s=>{
   const payment=s.payments?.find(p=>p.id===id);
   if(!payment)throw new Error('未找到原付款，不能退款');
   if(payment.refundedAt!==undefined)return payment;
   s.balance+=payment.amount;s.revision++;
   payment.refundedAt=now;payment.refundBalanceAfter=s.balance;
   return payment;
  });},
  status(id:string){const s=read();return {receipt:s.transactions.find(r=>r.id===id),draft:s.drafts.find(d=>d.id===id),schedule:s.schedules?.find(d=>d.id===id)};},
  get():BankSnapshot {return snapshot(read());},
  configure(input:BankSettings){return mutate(s=>{
   if(input.revision!==s.revision)throw new Error('账户已变化，请刷新后重试');
   const next={...s,...(input.limit===undefined?{}:{limit:input.limit}),...(input.frozen===undefined?{}:{frozen:input.frozen}),...(input.controls===undefined?{}:{controls:input.controls})};
   if(!validBankSnapshot(next))throw new Error('银行卡设置无效，限额范围100—50,000元');
   s.limit=next.limit;s.frozen=next.frozen;s.controls=next.controls;s.revision++;return snapshot(s);
  });},
  prepare(input:TransferIntent|unknown,now=Date.now()):BankDraft {return mutate(s=>{
   guard(s,now);
   if(!validTransfer(input))throw new Error('请核对已登记收款人和转账金额（至少1分）');
   if(input.executeAt!==undefined && (input.executeAt<=now || input.executeAt>now+366*86400000))throw new Error('预约时间须在未来一年内');
   if(input.amount>s.limit)throw new Error(`超过沙箱单笔限额${s.limit/100}元`);
   if(input.amount>s.balance)throw new Error('付款账户余额不足，不会使用其他平台资金');
   const impact=checkTransferBudget(s,input);
   const draft={recipientId:input.recipientId,amount:input.amount,...(input.executeAt===undefined?{}:{executeAt:input.executeAt}),...(input.protectedAmount===undefined?{}:{protectedAmount:input.protectedAmount}),impact,id:crypto.randomUUID(),revision:s.revision,balance:s.balance,createdAt:now,expiresAt:now+300000};
   s.drafts=[...s.drafts.filter(d=>d.expiresAt>now).slice(-19),draft];return draft;
  });},
  confirm(id:string,now=Date.now()):BankReceipt {return mutate(s=>{
   const existing=s.transactions.find(r=>r.id===id);if(existing)return existing;
   guard(s,now);
   const draft=s.drafts.find(d=>d.id===id);if(!draft)throw new Error('方案不存在，请重新核对');
   if(draft.executeAt!==undefined)throw new Error('预约方案须授权预约，不能立即扣款');
   if(draft.expiresAt<=now)throw new Error('方案已过期，请重新核对');
   if(draft.revision!==s.revision)throw new Error('账户余额已变化，请重新核对');
   if(draft.amount>s.balance || draft.amount>s.limit)throw new Error('余额或限额不足');
   checkTransferBudget(s,draft);
   if(s.transactions.length>=5000)throw new Error('沙箱账本已满，请联系开发者归档');
   s.balance-=draft.amount;s.received[draft.recipientId]=(s.received[draft.recipientId]??0)+draft.amount;s.revision++;
   const receipt={id:draft.id,recipientId:draft.recipientId,amount:draft.amount,...(draft.protectedAmount===undefined?{}:{protectedAmount:draft.protectedAmount}),completedAt:now,balanceAfter:s.balance};
   s.transactions.push(receipt);s.drafts=s.drafts.filter(d=>d.id!==id);return receipt;
  });},
 };
}
export function bankMiddleware(store:ReturnType<typeof createBankStore>) {
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  try{
   if(req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
   if(req.method==='GET')return send(200,store.get());
   if(req.method!=='POST')return send(405,{error:'不支持的方法'});
   if(req.headers['x-zhiyin-bank']!=='1' || !req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
   let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>8192)return send(413,{error:'请求过大'});}
   const data=JSON.parse(body);
   if(data?.type!=='save-occasion'&&Buffer.byteLength(body)>2048)return send(413,{error:'请求过大'});
   if(data?.type==='save-occasion')return send(200,store.saveOccasion(data));
   if(data?.type==='reserve-occasion'&&data.authorized===true)return send(200,store.reserveOccasion(data.id,data.revision));
   if(data?.type==='cancel-occasion'&&data.authorized===true)return send(200,store.cancelOccasion(data.id,data.revision));
   if(data?.type==='complete-occasion'&&data.authorized===true)return send(200,store.completeOccasion(data.id,data.revision));
   if(data?.type==='prepare-occasion-order'&&data.authorized===true)return send(200,store.prepareOccasionOrder(data.id,data.productId,data.revision));
   if(data?.type==='schedule' && data.authorized===true && typeof data.draftId==='string')return send(200,store.schedule(data.draftId));
   if(data?.type==='cancel-schedule' && data.authorized===true && typeof data.id==='string')return send(200,store.cancelSchedule(data.id));
   if(data?.type==='create-aa' && data.authorized===true)return send(200,store.createAA(data));
   if(data?.type==='settle-aa' && data.authorized===true && typeof data.id==='string' && typeof data.recipientId==='string')return send(200,store.settleAA(data.id,data.recipientId));
   if(data?.type==='cancel-aa' && data.authorized===true && typeof data.id==='string')return send(200,store.cancelAA(data.id));
   if(data?.type==='payment' && data.authorized===true)return send(200,store.pay(data.payment));
   if(data?.type==='refund-payment' && data.authorized===true && typeof data.paymentId==='string' && data.paymentId.length<=180)return send(200,store.refundPayment(data.paymentId));
   if(data?.type==='status' && typeof data.draftId==='string' && data.draftId.length<=80)return send(200,store.status(data.draftId));
   if(data?.type==='prepare')return send(200,store.prepare(data));
   if(data?.type==='settings')return send(200,store.configure(data));
   if(data?.type==='confirm' && data.authorized===true && typeof data.draftId==='string' && data.draftId.length<=80)return send(200,store.confirm(data.draftId));
   return send(400,{error:'请在确认面板明确授权'});
  }catch(error){return send(error instanceof Error && 'code' in error?500:400,{error:error instanceof Error?error.message:'银行沙箱暂时不可用'});}
 };
}
