import {validMerchantState,validMerchantOrder,type MerchantState,type MerchantOperation,type MerchantMenuItem,type MerchantOrder} from './merchant';
export class MerchantSubmissionUnknownError extends Error {
 constructor(){super('订单结果待核对，请重试获取原回执，或向店员核对，避免重复点单');this.name='MerchantSubmissionUnknownError';}
}
export class MerchantOwnerUnknownError extends Error {
 constructor(){super('上次记录结果待核对，请先核对原记录，避免重复记账');this.name='MerchantOwnerUnknownError';}
}
class MerchantHTTPError extends Error {}
export type MerchantOrderInput={table:string;items:{menuItemId:string;quantity:number}[];requestId:string};
function ownerScope(){let scope=localStorage.getItem('zhiyin-expense-scope');if(!scope){scope=crypto.randomUUID();localStorage.setItem('zhiyin-expense-scope',scope);}return scope;}
const pendingKey=()=>`zhiyin-merchant-pending-${ownerScope()}`;
export function hasPendingMerchantOperation(){return sessionStorage.getItem(pendingKey())!==null;}
async function request(path:string,init:RequestInit,retry=false,submission=false):Promise<unknown>{
 const perform=()=>fetch(`/api/zhiyin/merchant${path}`,{...init,signal:AbortSignal.timeout(15000)});
 let response:Response;try{response=await perform();}catch(error){if(!retry)throw error;try{response=await perform();}catch(retryError){if(submission)throw new MerchantSubmissionUnknownError();throw retryError;}}
 let data;try{data=await response.json();}catch(error){if(submission)throw new MerchantSubmissionUnknownError();throw error;}
 if(!response.ok){if(submission&&(response.status>=500||response.status===409))throw new MerchantSubmissionUnknownError();if(response.status>=500)throw new Error(data.error||'小店暂时无法连接');throw new MerchantHTTPError(data.error||'小店暂时无法连接，请稍后重试');}return data;
}
async function ownerRequest(body?:string):Promise<MerchantState>{
 const key=pendingKey();
 try{
  const data=await request('/owner',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Zhiyin-Merchant':'1','X-Zhiyin-Expense-Scope':ownerScope()},...(body?{body}:{})},Boolean(body));
  if(!validMerchantState(data))throw new Error('小店数据格式有误，原记录已保留');
  if(body){sessionStorage.removeItem(key);window.dispatchEvent(new Event('zhiyin-merchant-updated'));}return data;
 }catch(error){if(body){if(error instanceof MerchantHTTPError)sessionStorage.removeItem(key);else throw new MerchantOwnerUnknownError();}throw error;}
}
export async function merchantRequest(operation?:MerchantOperation,revision?:number):Promise<MerchantState>{
 if(!operation)return ownerRequest();
 if(hasPendingMerchantOperation())throw new MerchantOwnerUnknownError();
 const body=JSON.stringify({...operation,revision,requestId:crypto.randomUUID()});
 // Persist before sending: a reload must not turn an uncertain receipt into a new write.
 try{sessionStorage.setItem(pendingKey(),body);}catch{throw new Error('浏览器暂不能保留操作记录，请启用会话存储后重试');}
 return ownerRequest(body);
}
export async function recoverMerchantOperation():Promise<MerchantState>{
 const body=sessionStorage.getItem(pendingKey());return ownerRequest(body||undefined);
}
export async function getPublicMerchant(token:string):Promise<{shop:{name:string;menu:MerchantMenuItem[]}}>{
 const data=await request(`/public/${encodeURIComponent(token)}`,{method:'GET',credentials:'omit'}) as {shop?:{name:string;menu:MerchantMenuItem[]}};
 if(!data?.shop||typeof data.shop.name!=='string'||!Array.isArray(data.shop.menu)||!data.shop.menu.every(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&typeof item.category==='string'&&Number.isSafeInteger(item.price)&&item.price>0&&item.available===true))throw new Error('点餐菜单暂不可用，请联系店员');
 return {shop:data.shop};
}
export async function submitMerchantOrder(token:string,input:MerchantOrderInput):Promise<{order:MerchantOrder}>{
 const data=await request(`/public/${encodeURIComponent(token)}/orders`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)},true,true) as {order:MerchantOrder};
 if(!validMerchantOrder(data?.order))throw new MerchantSubmissionUnknownError();return data;
}
export function merchantOrderUrl(token:string,table=''):string{
 const url=new URL('./index.html',window.location.href);
 url.search='';url.hash='';url.searchParams.set('merchant',token);if(table.trim())url.searchParams.set('table',table.trim());return url.toString();
}
