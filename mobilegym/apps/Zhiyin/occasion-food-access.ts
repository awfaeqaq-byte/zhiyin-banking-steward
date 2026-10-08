import {netFetch} from '../../os/NetworkService';
import * as TimeService from '../../os/TimeService';
import {validBankSnapshot,type BankSnapshot} from '../../../src/lib/bank-transfer';
import {type OccasionOrder,validOccasionId} from '../../../src/lib/occasion-plans';
import {useFoodDeliveryStore} from '../FoodDelivery/state';
import {buildOccasionFoodOrder} from './occasion-food';

async function bank(body?:object){const r=await netFetch('/api/zhiyin/bank',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'无法核对预算安排');return data;}
export async function accessOccasionFood(operation:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> {
 if(!validOccasionId(payload.planId))throw new Error('安排编号无效');
 const snapshot:BankSnapshot=await bank();if(!validBankSnapshot(snapshot))throw new Error('银行数据无法核对');
 const plan=snapshot.occasions?.find(p=>p.id===payload.planId);if(!plan)throw new Error('安排不存在');
 const store=useFoodDeliveryStore.getState();
 if(operation==='records')return {status:'ok',orders:store.orders.filter(o=>o.occasionId===plan.id).map(o=>({id:o.id,status:o.status,deliveryAt:o.deliveryAt,occasionId:o.occasionId}))};
 if(!window.__OS__)throw new Error('手机服务未就绪，请重试');
 if(operation==='open'){
  const order=store.orders.find(o=>o.id===payload.orderId&&o.occasionId===plan.id);if(!order)throw new Error('当前浏览器未找到订单，请保留数据后重试');
  window.__OS__.openApp('fooddelivery',order.status==='PENDING_PAYMENT'?`/payment?orderId=${encodeURIComponent(order.id)}`:`/orders/${encodeURIComponent(order.id)}`);return {status:'ok',orderId:order.id};
 }
 if(operation!=='prepare'||typeof payload.productId!=='string')throw new Error('不支持的外卖操作');
 if(plan.status!=='reserved'||plan.deliverAt<=TimeService.now())throw new Error('请先核对有效安排并预留预算');
 const link:OccasionOrder=await bank({type:'prepare-occasion-order',authorized:true,id:plan.id,productId:payload.productId,revision:snapshot.revision});
 const updated:BankSnapshot=await bank();const latest=updated.occasions?.find(p=>p.id===plan.id);if(!latest||latest.status!=='reserved')throw new Error('安排状态已变化，请重新核对');
 const order=buildOccasionFoodOrder(latest,link);const current=useFoodDeliveryStore.getState(),existing=current.orders.find(o=>o.id===order.id);
 if(existing&&(existing.occasionId!==order.occasionId||existing.payable!==order.payable||existing.bankPaymentId!==order.bankPaymentId))throw new Error('同一订单内容不一致，请保留数据核对');
 if(!existing)useFoodDeliveryStore.setState({orders:[order,...current.orders],activeOrderId:order.id});
 window.__OS__.openApp('fooddelivery',existing&&existing.status!=='PENDING_PAYMENT'?`/orders/${encodeURIComponent(order.id)}`:`/payment?orderId=${encodeURIComponent(order.id)}`);
 return {status:'ok',orderId:order.id};
}
