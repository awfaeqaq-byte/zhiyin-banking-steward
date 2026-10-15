import {foodId,foodQuote,validFoodDraft,type FoodCatalog,type FoodReceipt} from '../../../src/lib/food-order';
import {FOOD_DELIVERY_CONFIG as config} from '../FoodDelivery/data';
import {createOrder} from '../FoodDelivery/orderModel';
import {useFoodDeliveryStore} from '../FoodDelivery/state';
import {productImage} from '../FoodDelivery/assets';

/** Prepare is a user-confirmed, unpaid draft. Only FoodDelivery's payment flow moves money. */
export async function accessFoodOrder(operation:string,payload:Record<string,unknown>):Promise<{status:'ok';catalog?:FoodCatalog;orders?:FoodReceipt[];orderId?:string}> {
 if(!foodId(payload.taskId))throw new Error('点餐事项编号无效');
 const merchant=config.merchant;
 const catalog:FoodCatalog={storeId:merchant.id,storeName:merchant.name,deliveryFee:merchant.deliveryFee,discount:merchant.discount,deliveryMinutes:merchant.deliveryMinutes,address:config.user.address,contact:`${config.user.name} ${config.user.phone}`,products:merchant.products.map(p=>({id:p.id,name:p.name,description:p.description,price:p.price,image:new URL(productImage(p.id),window.location.href).href}))};
 if(operation==='catalog')return {status:'ok',catalog};
 const store=useFoodDeliveryStore.getState();
 if(operation==='records')return {status:'ok',orders:store.orders.filter(o=>o.stewardTaskId===payload.taskId).map(o=>({id:o.id,taskId:o.stewardTaskId!,status:o.status,payable:o.payable,...(o.paymentRecordId&&o.paidAt&&o.status!=='PENDING_PAYMENT'?{payment:{id:o.paymentRecordId,amount:o.payable,refundedAmount:o.refundRecordId&&o.refundedAt?o.payable:0,paidAt:o.paidAt,merchant:o.lines[0]?.storeName||config.merchant.name}}:{})}))};
 if(!window.__OS__)throw new Error('手机服务未就绪，请重试');
 if(operation==='open'){
  const order=store.orders.find(o=>o.id===payload.orderId&&o.stewardTaskId===payload.taskId);if(!order)throw new Error('当前事项未找到订单，请重新核对');
  window.__OS__.openApp('fooddelivery',order.status==='PENDING_PAYMENT'?`/payment?orderId=${encodeURIComponent(order.id)}`:`/orders/${encodeURIComponent(order.id)}`);return {status:'ok',orderId:order.id};
 }
 if(operation!=='prepare')throw new Error('不支持的点餐操作');
 if(payload.authorized!==true)throw new Error('请先本人核对点餐方案');
 if(!foodId(payload.orderId)||!validFoodDraft(payload.draft)||payload.draft.orderId)throw new Error('点餐方案无效');
 const draft=payload.draft,quote=foodQuote(catalog,draft);
 if(JSON.stringify(payload.quote)!==JSON.stringify(quote))throw new Error('菜单价格或费用已变化，请重新核对');
 const order={...createOrder({id:payload.orderId,storeId:catalog.storeId,lines:draft.items.map(i=>{const p=catalog.products.find(p=>p.id===i.productId)!;return {storeId:catalog.storeId,storeName:catalog.storeName,dishId:p.id,dishName:p.name,unitPrice:p.price,quantity:i.quantity};}),deliveryFee:quote.deliveryFee,discount:quote.discount,address:draft.address||catalog.address,contact:draft.contact||catalog.contact}),stewardTaskId:payload.taskId,note:draft.note};
 const existing=store.orders.find(o=>o.id===order.id);
 if(existing&&(existing.stewardTaskId!==order.stewardTaskId||existing.payable!==order.payable||existing.address!==order.address||existing.contact!==order.contact||existing.note!==order.note||JSON.stringify(existing.lines)!==JSON.stringify(order.lines)))throw new Error('同一订单内容不一致，请保留原订单核对');
 const other=store.orders.find(o=>o.stewardTaskId===payload.taskId&&o.id!==order.id&&o.status!=='CANCELLED'&&o.status!=='REFUNDED');
 if(!existing&&other)throw new Error('这个事项已经有订单，请回到原订单核对');
 if(!existing)useFoodDeliveryStore.setState({orders:[order,...store.orders],activeOrderId:order.id});
 window.__OS__.openApp('fooddelivery',existing&&existing.status!=='PENDING_PAYMENT'?`/orders/${encodeURIComponent(order.id)}`:`/payment?orderId=${encodeURIComponent(order.id)}`);
 return {status:'ok',orderId:order.id};
}
