import {occasionProducts,validOccasionPlan,type OccasionPlan,type OccasionOrder} from '../../../src/lib/occasion-plans';
import {createOrder,type OrderRecord} from '../FoodDelivery/orderModel';

/** Pure conversion: preserve the quoted price and reservation's stable payment identity. */
export function buildOccasionFoodOrder(plan:OccasionPlan,link:OccasionOrder):OrderRecord {
 const product=occasionProducts.find(p=>p.id===link.productId);
 if(!product||!validOccasionPlan(plan)||!plan.orders.some(o=>JSON.stringify(o)===JSON.stringify(link))||link.amount!==product.price+product.deliveryFee)throw new Error('商品或筹备订单无法核对');
 return {...createOrder({id:link.orderId,storeId:'shop-birthday',lines:[{storeId:'shop-birthday',storeName:product.merchant,dishId:product.id,dishName:product.name,unitPrice:product.price,quantity:1}],deliveryFee:product.deliveryFee,discount:0,address:plan.address,contact:plan.contact}),occasionId:plan.id,bankPaymentId:link.paymentId,deliveryAt:plan.deliverAt,note:plan.note};
}
