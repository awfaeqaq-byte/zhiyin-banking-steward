import {expect,it} from 'vitest';
import {readVoiceMerchantReport} from '../../src/lib/voice-merchant-report';
import {emptyMerchantState,type MerchantOrder} from '../../src/lib/merchant';
const now=Date.parse('2026-10-30T18:00:00+08:00');
const item={menuItemId:'rice',name:'招牌炒饭',quantity:2,unitPrice:2200,amount:4400};
const order:MerchantOrder={id:'paid',table:'A1',items:[item],total:4400,status:'paid',createdAt:now-86400000,paidAt:now-86400000};
const state={...emptyMerchantState(),shop:{id:'wang-shop',name:'小王的家常小馆',publicToken:'wang-shop-public-token-001',menu:[],createdAt:now-10*86400000},orders:[order,{...order,id:'refunded',status:'refunded' as const,refundedAt:now-3600000},{...order,id:'pending',status:'pending' as const,paidAt:undefined}]};
export const report={kind:'merchant_report' as const,state,period:'week' as const,asOf:now};
it('按实际收款和退款日期汇总七天；待收款与已退款销量不混入排名',()=>{
 const result=readVoiceMerchantReport(report);expect(result?.summary.netCollected).toBe(4400);expect(result?.summary.collectedTotal).toBe(8800);expect(result?.summary.refundedTotal).toBe(4400);expect(result?.summary.pendingTotal).toBe(4400);expect(result?.summary.dishes[0].quantity).toBe(2);
 expect(result?.days).toHaveLength(7);expect(result?.days.reduce((sum,d)=>sum+d.amount,0)).toBe(4400);expect(result?.days.at(-1)?.amount).toBe(-4400);
});
it('今天不会冒用历史收款，不接受损坏或不属于小店的结果',()=>{
 expect(readVoiceMerchantReport({...report,period:'today'})?.days).toHaveLength(1);expect(readVoiceMerchantReport({...report,period:'today'})?.summary.netCollected).toBe(-4400);
 for(const value of [undefined,{}, {...report,period:'all'},{...report,asOf:NaN},{...report,state:{...state,shop:null}},{...report,state:{...state,orders:[{...order,total:1}]}}])expect(readVoiceMerchantReport(value)).toBeNull();
});
