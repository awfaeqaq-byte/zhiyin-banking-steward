import {merchantSummary,validMerchantState,type MerchantState} from './merchant';
export type VoiceMerchantReport={kind:'merchant_report';state:MerchantState;period:'today'|'week';asOf:number};
export function readVoiceMerchantReport(value:unknown){
  const r=value as VoiceMerchantReport;
  if(!r||r.kind!=='merchant_report'||!validMerchantState(r.state)||!r.state.shop||!['today','week'].includes(r.period)||!Number.isSafeInteger(r.asOf)||r.asOf<=0)return null;
  const summary=merchantSummary(r.state,r.period,r.asOf),days=[];
  for(let at=summary.from;at<=r.asOf;at+=86400000)days.push({at,amount:merchantSummary(r.state,'today',Math.min(at+86400000-1,r.asOf)).netCollected});
  return {shopName:r.state.shop.name,summary,days};
}
