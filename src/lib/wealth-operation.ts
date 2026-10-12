export type WealthRisk = 'low' | 'medium' | 'high';

export type WealthProduct = {
  id: string;
  name: string;
  risk: 1 | 2 | 3;
  minAmount: number;
  minTerm: number;
  liquidity: string;
  description: string;
  feeRate: number;
  increment: number;
  open: boolean;
  riskDisclosure: string;
  dataDate: string;
  redemptionDays: number;
};

export type RiskAnswers={experience:0|1|2;loss:0|1|2;term:0|1|2;liquidity:0|1|2;income:0|1|2};
export type RiskAssessment={answers:RiskAnswers;risk:WealthRisk;assessedAt:number;expiresAt:number;version:1};
export function assessRisk(answers:RiskAnswers,now=Date.now()):RiskAssessment{
  if(!answers||!['experience','loss','term','liquidity','income'].every(key=>[0,1,2].includes(answers[key as keyof RiskAnswers])))throw new Error('请完成五项风险测评');
  const score=Object.values(answers).reduce<number>((sum,value)=>sum+value,0);
  const risk:WealthRisk=answers.loss===0||score<=3?'low':answers.loss===1||score<=7?'medium':'high';
  return {answers:{...answers},risk,assessedAt:now,expiresAt:now+365*86400000,version:1};
}

export type WealthDraft = {
  id: string;
  productId: string;
  amount: number;
  term: number;
  risk: WealthRisk;
  createdAt: number;
  expiresAt: number;
  fee?:number;
  balanceAtPrepare?:number;
};

export type WealthReceipt = WealthDraft & {
  completedAt: number;
  status: 'confirmed';
  balanceAfter?:number;
};
export type WealthHolding={id:string;productId:string;principal:number;units:number;purchasedAt:number;redeemedAt?:number};
export type RedemptionDraft={id:string;holdingId:string;amount:number;fee:number;createdAt:number;expiresAt:number};
export type RedemptionReceipt={id:string;holdingId:string;amount:number;fee:number;completedAt:number;status:'redeemed'};

export type WealthSnapshot = {
  version: 1;
  receipts: WealthReceipt[];
  cashBalance?:number;
  assessment?:RiskAssessment;
  holdings?:WealthHolding[];
  redemptions?:RedemptionReceipt[];
};

export const wealthProducts: WealthProduct[] = [
  {id:'cash-plus',name:'灵活现金管理',risk:1,minAmount:100,minTerm:0,liquidity:'可随时赎回',description:'重视流动性，适合作为短期备用资金。',feeRate:0,increment:1,open:true,riskDisclosure:'净值可能波动，投入资金不保本。',dataDate:'2026-10-08',redemptionDays:0},
  {id:'steady-income',name:'稳健固收组合',risk:2,minAmount:1000,minTerm:6,liquidity:'持有满 6 个月后可赎回',description:'以控制波动为先，净值仍可能发生变化。',feeRate:0.002,increment:100,open:true,riskDisclosure:'净值可能下跌，赎回金额可能低于本金。',dataDate:'2026-10-08',redemptionDays:180},
  {id:'balanced-fund',name:'均衡低波组合',risk:3,minAmount:1000,minTerm:12,liquidity:'持有满 12 个月后可赎回',description:'包含权益类资产，波动和亏损可能高于固收。',feeRate:0.005,increment:100,open:true,riskDisclosure:'权益资产波动较大，可能出现明显亏损。',dataDate:'2026-10-08',redemptionDays:365},
];

const riskLevel: Record<WealthRisk,number>={low:1,medium:2,high:3};

export function suitableWealthProducts(amount:number,term:number,risk:WealthRisk){
  if(!Number.isFinite(amount) || amount<=0 || !Number.isFinite(term) || term<0)return [];
  return wealthProducts.filter(product=>product.open && product.minAmount<=amount && product.minTerm<=term && product.risk<=riskLevel[risk] && Number.isSafeInteger((amount-product.minAmount)/product.increment));
}

export function validWealthDraft(value:unknown):value is WealthDraft {
  if(!value || typeof value!=='object')return false;
  const draft=value as WealthDraft;
  return typeof draft.id==='string' && draft.id.length<=80
    && wealthProducts.some(product=>product.id===draft.productId)
    && Number.isSafeInteger(draft.amount) && draft.amount>=10000 && draft.amount<=100000000
    && Number.isSafeInteger(draft.term) && draft.term>=0 && draft.term<=120
    && ['low','medium','high'].includes(draft.risk)
    && Number.isFinite(draft.createdAt) && Number.isFinite(draft.expiresAt);
}

export function validWealthSnapshot(value:unknown):value is WealthSnapshot {
  if(!value || typeof value!=='object')return false;
  const snapshot=value as WealthSnapshot;
  return snapshot.version===1 && Array.isArray(snapshot.receipts) && snapshot.receipts.every(receipt=>
    validWealthDraft(receipt) && receipt.status==='confirmed' && Number.isFinite(receipt.completedAt))
    && (snapshot.cashBalance===undefined || Number.isSafeInteger(snapshot.cashBalance) && snapshot.cashBalance>=0)
    && (snapshot.assessment===undefined || snapshot.assessment.version===1 && ['low','medium','high'].includes(snapshot.assessment.risk) && Number.isFinite(snapshot.assessment.assessedAt) && Number.isFinite(snapshot.assessment.expiresAt) && snapshot.assessment.expiresAt>snapshot.assessment.assessedAt && !!snapshot.assessment.answers && ['experience','loss','term','liquidity','income'].every(key=>[0,1,2].includes(snapshot.assessment!.answers[key as keyof RiskAnswers])))
    && (snapshot.holdings===undefined || Array.isArray(snapshot.holdings) && snapshot.holdings.every(item=>typeof item.id==='string' && wealthProducts.some(product=>product.id===item.productId) && Number.isSafeInteger(item.principal) && item.principal>0 && Number.isSafeInteger(item.units) && item.units>0 && Number.isFinite(item.purchasedAt) && (item.redeemedAt===undefined || Number.isFinite(item.redeemedAt))))
    && (snapshot.redemptions===undefined || Array.isArray(snapshot.redemptions) && snapshot.redemptions.every(item=>typeof item.id==='string' && typeof item.holdingId==='string' && Number.isSafeInteger(item.amount) && item.amount>0 && Number.isSafeInteger(item.fee) && item.fee>=0 && Number.isFinite(item.completedAt) && item.status==='redeemed'));
}

export async function wealthRequest<T>(body?:object):Promise<T>{
  const response=await fetch('/api/zhiyin/wealth',{cache:'no-store',signal:AbortSignal.timeout(8000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Wealth':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error || '理财沙箱暂时不可用');
  return data as T;
}
