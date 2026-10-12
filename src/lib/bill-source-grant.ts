import type {ExternalFinancialProvider} from './financial-connections';

export async function updateBillSourceGrant(provider:ExternalFinancialProvider,authorized:boolean){
  const response=await fetch('/api/zhiyin/bill-source',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json','X-Zhiyin-Bill-Source':'1'},body:JSON.stringify({provider,authorized})});
  if(!response.ok){const value=await response.json().catch(()=>({}));throw new Error(value.error||'后台账单授权同步失败');}
}
