import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {accessFoodOrder} from '../apps/Zhiyin/food-order-access';
import {FOOD_DELIVERY_CONFIG as config} from '../apps/FoodDelivery/data';
import {foodQuote} from '../../src/lib/food-order';
import {createMemoryFoodDeliveryPaymentBackend} from '../apps/FoodDelivery/payments/backend';
import type {OrderRecord} from '../apps/FoodDelivery/orderModel';
const state=vi.hoisted(()=>({orders:[] as OrderRecord[],cart:[{dishId:'untouched'}],activeOrderId:null as string|null}));
vi.mock('../apps/FoodDelivery/state',()=>({useFoodDeliveryStore:{getState:()=>state,setState:(patch:object)=>Object.assign(state,patch)}}));
beforeEach(()=>{state.orders=[];state.activeOrderId=null;vi.stubGlobal('window',{location:{href:'http://localhost:3000/'},__OS__:{openApp:vi.fn()}});});
afterEach(()=>vi.unstubAllGlobals());
const draft={items:[{productId:'drink-plum-01',quantity:1}],note:'少冰'};
it('读取的是真菜单；确认前不生成订单，生成订单不扣款且保留用户购物车',async()=>{
 const r=await accessFoodOrder('catalog',{taskId:'task'});expect(r.catalog.products).toHaveLength(config.merchant.products.length);expect(state.orders).toHaveLength(0);
 await expect(accessFoodOrder('prepare',{taskId:'task',orderId:'order',draft,quote:foodQuote(r.catalog,draft)})).rejects.toThrow('核对');
 const p={taskId:'task',orderId:'order',draft,quote:foodQuote(r.catalog,draft),authorized:true};await accessFoodOrder('prepare',p);await accessFoodOrder('prepare',p);
 expect(state.orders).toHaveLength(1);expect(state.orders[0]).toMatchObject({status:'PENDING_PAYMENT',payable:680,stewardTaskId:'task',note:'少冰'});expect(state.cart[0].dishId).toBe('untouched');expect(window.__OS__.openApp).toHaveBeenCalledWith('fooddelivery','/payment?orderId=order');
});
it.each(['wechat_pay','alipay'] as const)('宁宁整理的真实订单使用%s支付时扣余额、写账单，重复支付不重复扣款',async method=>{
 const {catalog}=await accessFoodOrder('catalog',{taskId:'daily-food'});
 await accessFoodOrder('prepare',{taskId:'daily-food',orderId:'daily-order',draft,quote:foodQuote(catalog,draft),authorized:true});
 const backend=createMemoryFoodDeliveryPaymentBackend({orders:state.orders,wechat:{wallet:{balanceCents:20000,transfers:[]},payLedger:{transactions:[],monthlyHistory:[],settings:{dailyReport:true,includeManualRecords:true}}},alipay:{balance:{total:200,dailyIncome:0},transferRecords:[]}});
 const before=await backend.getSnapshot();expect(before.wechat.wallet.balanceCents).toBe(20000);expect(before.alipay.balance.total).toBe(200);
 await backend.pay('daily-order',method,1791513000000);await backend.pay('daily-order',method,1791513000001);
 const after=await backend.getSnapshot();expect(after.orders[0]).toMatchObject({status:'ACCEPTED',payable:680,stewardTaskId:'daily-food',paymentMethod:method});
 expect(after.wechat.wallet.balanceCents).toBe(method==='wechat_pay'?19320:20000);
 expect(after.alipay.balance.total).toBe(method==='alipay'?193.2:200);
 expect(after.wechat.payLedger.transactions).toHaveLength(method==='wechat_pay'?1:0);
 expect(after.alipay.transferRecords).toHaveLength(method==='alipay'?1:0);
});
it('拒绝伪造核价、同一订单变价、跨任务跳转；只返回本事项状态',async()=>{
 const r=await accessFoodOrder('catalog',{taskId:'task'});const quote=foodQuote(r.catalog,draft);const p={taskId:'task',orderId:'order',draft,quote,authorized:true};
 await expect(accessFoodOrder('prepare',{...p,quote:{...quote,payable:1}})).rejects.toThrow('变化');expect(state.orders).toHaveLength(0);
 await accessFoodOrder('prepare',p);
 await expect(accessFoodOrder('prepare',{...p,draft:{...draft,note:'改了'}})).rejects.toThrow('不一致');
 await expect(accessFoodOrder('open',{taskId:'other',orderId:'order'})).rejects.toThrow('未找到');
 state.orders[0].status='ACCEPTED';const records=await accessFoodOrder('records',{taskId:'task'});expect(records.orders[0].status).toBe('ACCEPTED');expect((await accessFoodOrder('records',{taskId:'other'})).orders).toEqual([]);
 await accessFoodOrder('open',{taskId:'task',orderId:'order'});expect(window.__OS__.openApp).toHaveBeenLastCalledWith('fooddelivery','/orders/order');
});
