import {expect,it} from 'vitest';
import {buildOccasionFoodOrder} from '../../mobilegym/apps/Zhiyin/occasion-food';
import type {OccasionPlan,OccasionOrder} from './occasion-plans';
it('外卖订单承接同一预算、商品、地址和送达时间，不改购物车，重复请求复用编号',()=>{
 const plan:OccasionPlan={id:'birthday',status:'reserved',title:'爱人生日',recipient:'爱人',budget:100000,prepareAt:1,deliverAt:1900000000000,address:'家里',contact:'叶先生 13800001234',note:'不要太甜',productIds:['cake-light'],orders:[],createdAt:1,updatedAt:1};
 const link:OccasionOrder={productId:'cake-light',orderId:'ZY-birthday-cake-light',paymentId:'occasion:birthday:cake-light',amount:20600,merchant:'好食送 · 生日精选',createdAt:1};plan.orders=[link];
 const order=buildOccasionFoodOrder(plan,link);
 expect(order.id).toBe(link.orderId);expect(order.payable).toBe(link.amount);expect(order.occasionId).toBe(plan.id);expect(order.bankPaymentId).toBe(link.paymentId);expect(order.deliveryAt).toBe(plan.deliverAt);expect(order.address).toBe('家里');
 expect(buildOccasionFoodOrder(plan,link)).toEqual(order);
 expect(()=>buildOccasionFoodOrder(plan,{...link,amount:1})).toThrow();
});
