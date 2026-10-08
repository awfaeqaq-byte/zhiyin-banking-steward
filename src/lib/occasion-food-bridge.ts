export type OccasionFoodResult={status:'ok';orderId?:string;orders?:Array<{id:string;status:string;deliveryAt?:number;occasionId?:string}>};
export function occasionFoodRequest(operation:'prepare'|'open'|'records',payload:{planId:string;productId?:string;orderId?:string}):Promise<OccasionFoodResult>{
 if(window.parent===window)return Promise.reject(new Error('请从手机沙箱打开知银，再进入外卖核对订单。'));
 const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{
  const finish=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
  const receive=(event:MessageEvent)=>{const d=event.data;if(event.origin!==location.origin||event.source!==window.parent||d?.channel!=='zhiyin-phone'||d.version!==1||d.type!=='occasion-food-result'||d.requestId!==requestId)return;finish();if(d.status!=='ok')reject(new Error(d.message||'外卖未能打开，请重试'));else resolve(d);};
  const timer=setTimeout(()=>{finish();reject(new Error('外卖结果待核对，请重试原订单'));},15000);
  window.addEventListener('message',receive);window.parent.postMessage({channel:'zhiyin-phone',version:1,type:'occasion-food-request',requestId,operation,...payload},location.origin);
 });
}
