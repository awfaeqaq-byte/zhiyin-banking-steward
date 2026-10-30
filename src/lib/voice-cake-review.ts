import {validBankSnapshot,type BankSnapshot} from './bank-transfer';
import {occasionProducts,validateOccasionDraft,validOccasionId,type OccasionDraft} from './occasion-plans';
import type {OrderRecord} from '../../mobilegym/apps/FoodDelivery/orderModel';

export type VoiceCakeReview={kind:'cake_preorder';id:string;planId:string;draft:OccasionDraft;revision:number;balance:number;createdAt:number;expiresAt:number};
export type CakeSelection={productId:string;deliverAt:number};
export type VoiceCakeResult={bank:BankSnapshot;order:OrderRecord};
export const cakeProducts=occasionProducts.filter(p=>p.kind==='cake');
export function validVoiceCakeReview(value:unknown):value is VoiceCakeReview {
  const r=value as VoiceCakeReview;
  try{
    if(!r||r.kind!=='cake_preorder'||!validOccasionId(r.id)||!validOccasionId(r.planId))return false;
    validateOccasionDraft(r.draft,r.createdAt);
    return r.draft.budget<=30000 && r.draft.productIds.length===1 && cakeProducts.some(p=>p.id===r.draft.productIds[0])
      && r.draft.note.includes('个人承担') && r.draft.note.includes('不计入旅行AA')
      && Number.isSafeInteger(r.revision)&&r.revision>=0&&Number.isSafeInteger(r.balance)&&r.balance>=r.draft.budget
      && Number.isSafeInteger(r.createdAt)&&r.createdAt>0&&Number.isSafeInteger(r.expiresAt)&&r.expiresAt>r.createdAt&&r.expiresAt<=r.createdAt+300000;
  }catch{return false;}
}
export function validCakeSelection(review:VoiceCakeReview,selection:CakeSelection){
  const product=cakeProducts.find(p=>p.id===selection?.productId);
  return !!product && product.price+product.deliveryFee<=review.draft.budget
    && [review.draft.deliverAt,review.draft.deliverAt+3600000].includes(selection.deliverAt);
}
export function verifyVoiceCakeResult(review:VoiceCakeReview,selection:CakeSelection,value:unknown):VoiceCakeResult {
  const result=value as VoiceCakeResult,product=cakeProducts.find(p=>p.id===selection.productId);
  const fail=()=>{throw new Error('蛋糕原订单、配送信息或付款回执尚未核实，请核对原订单，勿重复支付。');};
  if(!validVoiceCakeReview(review)||!validCakeSelection(review,selection)||!product||!result||!validBankSnapshot(result.bank))return fail();
  const amount=product.price+product.deliveryFee,plan=result.bank.occasions?.find(p=>p.id===review.planId),order=result.order;
  const link=plan?.orders.find(o=>o.productId===product.id),payment=result.bank.payments?.find(p=>p.id===link?.paymentId);
  if(!plan||plan.status!=='reserved'||plan.productIds.length!==1||plan.productIds[0]!==product.id
    ||plan.budget!==review.draft.budget||plan.deliverAt!==selection.deliverAt
    ||(['title','recipient','address','contact','note'] as const).some(k=>plan[k]!==review.draft[k])
    ||!link||!payment||payment.amount!==amount||payment.occasionId!==plan.id||payment.refundedAt!==undefined||payment.merchant!==product.merchant
    ||result.bank.balance!==review.balance-amount||!order||order.status!=='PAID'||order.id!==link.orderId||order.occasionId!==plan.id
    ||order.bankPaymentId!==payment.id||order.paidAt!==payment.completedAt||order.payable!==amount||order.deliveryFee!==product.deliveryFee
    ||order.deliveryAt!==selection.deliverAt||order.address!==plan.address||order.contact!==plan.contact||order.note!==plan.note
    ||order.lines?.length!==1||order.lines[0].dishId!==product.id||order.lines[0].unitPrice!==product.price||order.lines[0].quantity!==1)return fail();
  return result;
}
export async function voiceCakeRequest(body?:object,reviewId?:string):Promise<unknown>{
  const response=await fetch('/api/zhiyin/voice-cake'+(body?'':`?reviewId=${encodeURIComponent(reviewId??'')}`),{cache:'no-store',signal:AbortSignal.timeout(12000),...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Cake':'1'},body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'预订结果待核对，请查原订单');return result;
}
