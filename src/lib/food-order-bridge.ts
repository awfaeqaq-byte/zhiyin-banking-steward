import {validFoodCatalog,foodId,type FoodCatalog,type FoodDraft,type FoodQuote,type FoodReceipt} from './food-order';
export type FoodOrderResult={status:'ok';catalog?:FoodCatalog;orderId?:string;orders?:FoodReceipt[]};
export function foodOrderRequest(operation:'catalog'|'prepare'|'open'|'records',payload:{taskId:string;orderId?:string;draft?:FoodDraft;quote?:FoodQuote;authorized?:boolean}):Promise<FoodOrderResult>{
 if(window.parent===window)return Promise.reject(new Error('请从手机沙箱打开知银，才能读取外卖菜单和进入支付。'));
 const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const finish=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
  const receive=(event:MessageEvent)=>{const d=event.data;if(event.origin!==location.origin||event.source!==window.parent||d?.channel!=='zhiyin-phone'||d.version!==1||d.type!=='food-order-result'||d.requestId!==requestId)return;
   finish();if(d.status!=='ok')return reject(new Error(d.message||'点餐服务暂不可用，请重试。'));
   if(operation==='catalog'&&!validFoodCatalog(d.catalog)||operation==='prepare'&&!foodId(d.orderId)||operation==='records'&&(!Array.isArray(d.orders)||!d.orders.every((o:FoodReceipt)=>o&&foodId(o.id)&&o.taskId===payload.taskId&&typeof o.status==='string'&&Number.isSafeInteger(o.payable))))return reject(new Error('外卖数据无法核对，原方案未变。'));
   resolve(d);
  };
  const timer=setTimeout(()=>{finish();reject(new Error('外卖结果待核对，请重试原订单。'));},15000);
  window.addEventListener('message',receive);window.parent.postMessage({channel:'zhiyin-phone',version:1,type:'food-order-request',requestId,operation,...payload},location.origin);
 });
}
