import {netFetch} from '../../../os/NetworkService';

export type FundingSource = 'balance'|'bank_8888';
export interface BankFundingBackend {
  pay(input:{id:string;channel:'wechat'|'alipay';amount:number;merchant:string;occasionId?:string}):Promise<unknown>;
  refund(id:string):Promise<unknown>;
}
async function request(body:object) {
  const response=await netFetch('/api/zhiyin/bank',{
    method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(8000),
  });
  const data=await response.json();
  if(!response.ok){
    const error=new Error(data.error || '银行卡支付结果待核对，请用原付款方式重试');
    error.name=response.status===400?'BankRejection':'BankUnavailable';
    throw error;
  }
  return data;
}
export const bankFunding:BankFundingBackend={
  async pay(payment){
    const data=await request({type:'payment',authorized:true,payment});
    if(!data || data.id!==payment.id || data.channel!==payment.channel || data.amount!==payment.amount || data.merchant!==payment.merchant || !Number.isFinite(data.completedAt) || !Number.isSafeInteger(data.balanceAfter))throw new Error('银行回执无法核对，请重试原付款');
    if(data.refundedAt!==undefined)throw new Error('该订单已退款，不能再次付款，请新建订单');
    return data;
  },
  async refund(paymentId){
    const data=await request({type:'refund-payment',authorized:true,paymentId});
    if(!data || data.id!==paymentId || !Number.isFinite(data.refundedAt) || !Number.isSafeInteger(data.refundBalanceAfter))throw new Error('银行退款回执无法核对，请重试');
    return data;
  },
};
