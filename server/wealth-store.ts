import {existsSync,readFileSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {assessRisk,suitableWealthProducts,validWealthSnapshot,wealthProducts,type RiskAnswers,type WealthDraft,type WealthReceipt,type WealthRisk,type WealthSnapshot,type RedemptionDraft,type RedemptionReceipt} from '../src/lib/wealth-operation';
import type {createBankStore} from './bank-store';

export type WealthBookState=WealthSnapshot & {cashBalance:number;drafts:WealthDraft[];redemptionDrafts:RedemptionDraft[];holdings:NonNullable<WealthSnapshot['holdings']>;redemptions:RedemptionReceipt[]};
type State=WealthBookState;
const initial=():State=>({version:1,cashBalance:4230000,drafts:[],redemptionDrafts:[],receipts:[],holdings:[],redemptions:[]});
const clean=(raw:WealthSnapshot & Partial<State>):State=>{
  const legacy=raw.cashBalance===undefined&&raw.holdings===undefined;
  const legacyPrincipal=legacy?raw.receipts.reduce((sum,item)=>sum+item.amount,0):0;
  if(legacyPrincipal>4230000)throw new Error('旧版理财申购总额超过演示资金，请先核对历史回执');
  const holdings=legacy?raw.receipts.map(item=>({id:item.id,productId:item.productId,principal:item.amount,units:item.amount,purchasedAt:item.completedAt})):raw.holdings??[];
  return {...initial(),...raw,cashBalance:raw.cashBalance??4230000-legacyPrincipal,drafts:raw.drafts??[],redemptionDrafts:raw.redemptionDrafts??[],holdings,redemptions:raw.redemptions??[]};
};

export function createWealthStore(bank:ReturnType<typeof createBankStore>,legacyFile?:string){
  if(legacyFile&&existsSync(legacyFile)){
    const raw=JSON.parse(readFileSync(legacyFile,'utf8')) as WealthSnapshot & Partial<State>;
    if(!validWealthSnapshot(raw))throw new Error('旧理财沙箱数据损坏，无法合并资金账本');
    bank.importLegacyWealth(clean(raw));
  }
  const read=():State=>bank.wealthRead();
  const mutate=<T,>(fn:(state:State)=>T):T=>bank.wealthMutate(fn);
  return {
    get:():WealthSnapshot=>{const {version,receipts,cashBalance,assessment,holdings,redemptions}=read();return {version,receipts,cashBalance,assessment,holdings,redemptions};},
    assess(answers:RiskAnswers,now=Date.now()){return mutate(state=>{state.assessment=assessRisk(answers,now);state.drafts=[];return state.assessment;});},
    prepare(input:{productId:string;amount:number;term:number;risk?:WealthRisk},now=Date.now()):WealthDraft{return mutate(state=>{
      if(!Number.isSafeInteger(input.amount)||input.amount<10000||input.amount>100000000)throw new Error('计划投入金额需在 100—1,000,000 元之间');
      if(!Number.isSafeInteger(input.term)||input.term<0||input.term>120)throw new Error('请核对持有期限');
      const assessment=state.assessment;
      if(!assessment||assessment.expiresAt<=now)throw new Error('请先完成有效风险测评');
      const product=suitableWealthProducts(input.amount/100,input.term,assessment.risk).find(item=>item.id===input.productId);
      if(!product)throw new Error('该产品不符合当前金额、期限或风险约束');
      const fee=Math.round(input.amount*product.feeRate);
      if(input.amount+fee>state.cashBalance)throw new Error('理财沙箱可用资金不足');
      const draft:WealthDraft={productId:input.productId,amount:input.amount,term:input.term,risk:assessment.risk,id:crypto.randomUUID(),createdAt:now,expiresAt:now+300000,fee,balanceAtPrepare:state.cashBalance};
      state.drafts=[...state.drafts.filter(item=>item.expiresAt>now).slice(-19),draft];return draft;
    });},
    confirm(id:string,now=Date.now()):WealthReceipt{return mutate(state=>{
      const existing=state.receipts.find(receipt=>receipt.id===id);if(existing)return existing;
      const draft=state.drafts.find(item=>item.id===id);if(!draft)throw new Error('方案不存在，请重新核对');
      if(draft.expiresAt<=now)throw new Error('方案已过期，请重新核对');
      if(!state.assessment||state.assessment.expiresAt<=now||state.assessment.risk!==draft.risk||state.assessment.assessedAt>draft.createdAt)throw new Error('风险测评已变化，请重新核对');
      const product=suitableWealthProducts(draft.amount/100,draft.term,draft.risk).find(item=>item.id===draft.productId);
      if(!product)throw new Error('产品状态或适当性已变化，请重新核对');
      const fee=Math.round(draft.amount*product.feeRate);
      if(state.cashBalance!==draft.balanceAtPrepare||state.cashBalance<draft.amount+fee)throw new Error('资金状态已变化，请重新核对');
      if(state.receipts.length>=1000)throw new Error('理财沙箱回执已满');
      state.cashBalance-=draft.amount+fee;
      const receipt:WealthReceipt={...draft,fee,completedAt:now,status:'confirmed',balanceAfter:state.cashBalance};
      state.receipts.push(receipt);state.holdings.push({id:draft.id,productId:draft.productId,principal:draft.amount,units:draft.amount,purchasedAt:now});state.drafts=state.drafts.filter(item=>item.id!==id);return receipt;
    });},
    prepareRedemption(holdingId:string,now=Date.now()):RedemptionDraft{return mutate(state=>{
      const holding=state.holdings.find(item=>item.id===holdingId&&!item.redeemedAt);if(!holding)throw new Error('没有可赎回持仓');
      const product=wealthProducts.find(item=>item.id===holding.productId)!;
      if(now<holding.purchasedAt+product.redemptionDays*86400000)throw new Error('持仓仍在最低持有期内');
      const draft={id:crypto.randomUUID(),holdingId,amount:holding.principal,fee:0,createdAt:now,expiresAt:now+300000};
      state.redemptionDrafts=[...state.redemptionDrafts.filter(item=>item.expiresAt>now).slice(-19),draft];return draft;
    });},
    confirmRedemption(id:string,now=Date.now()):RedemptionReceipt{return mutate(state=>{
      const existing=state.redemptions.find(item=>item.id===id);if(existing)return existing;
      const draft=state.redemptionDrafts.find(item=>item.id===id);if(!draft||draft.expiresAt<=now)throw new Error('赎回方案不存在或已过期，请重新核对');
      const holding=state.holdings.find(item=>item.id===draft.holdingId&&!item.redeemedAt);if(!holding||holding.principal!==draft.amount)throw new Error('持仓状态已变化，请重新核对');
      const product=wealthProducts.find(item=>item.id===holding.productId)!;
      if(now<holding.purchasedAt+product.redemptionDays*86400000)throw new Error('持仓仍在最低持有期内');
      if(state.cashBalance+draft.amount-draft.fee>Number.MAX_SAFE_INTEGER)throw new Error('账户金额超出范围');
      state.cashBalance+=draft.amount-draft.fee;holding.redeemedAt=now;
      const receipt:RedemptionReceipt={id,holdingId:draft.holdingId,amount:draft.amount,fee:draft.fee,completedAt:now,status:'redeemed'};
      state.redemptions.push(receipt);state.redemptionDrafts=state.redemptionDrafts.filter(item=>item.id!==id);return receipt;
    });},
  };
}

export function wealthMiddleware(store:ReturnType<typeof createWealthStore>){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(code:number,data:unknown)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try{
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'仅允许同源访问'});
      if(req.method==='GET')return send(200,store.get());
      if(req.method!=='POST')return send(405,{error:'不支持的方法'});
      if(req.headers['x-zhiyin-wealth']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>2048)return send(413,{error:'请求过大'});}
      const data=JSON.parse(body);
      if(data?.type==='assess')return send(200,store.assess(data.answers));
      if(data?.type==='prepare')return send(200,store.prepare(data));
      if(data?.type==='confirm'&&data.authorized===true&&typeof data.draftId==='string'&&data.draftId.length<=80)return send(200,store.confirm(data.draftId));
      if(data?.type==='prepare-redemption'&&typeof data.holdingId==='string'&&data.holdingId.length<=80)return send(200,store.prepareRedemption(data.holdingId));
      if(data?.type==='confirm-redemption'&&data.authorized===true&&typeof data.draftId==='string'&&data.draftId.length<=80)return send(200,store.confirmRedemption(data.draftId));
      return send(400,{error:'请在确认面板明确授权'});
    }catch(error){return send(error instanceof Error&&'code' in error?500:400,{error:error instanceof Error?error.message:'理财沙箱暂时不可用'});}
  };
}
