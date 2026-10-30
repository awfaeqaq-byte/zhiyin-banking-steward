import {expect,it} from 'vitest';
import {changeExpenses} from './expense-notebook';
import {readVoiceTripReport} from './voice-trip-report';
import {reportFixture} from '../test/voice-trip-fixture';
const now=Date.parse('2026-10-30T19:00:00+08:00');
it('从原账本汇总AA、特殊份额和个人请客；从三期账单识别周期',()=>{
 const r=readVoiceTripReport(reportFixture());expect(r?.total).toBe(272400);expect(r?.collectAmount).toBe(201383);expect(r?.members.map(m=>m.amount)).toEqual([71017,65183,71017,65183]);expect(r?.personal[0].amount).toBe(20600);expect(r?.candidate.evidence).toHaveLength(3);expect(r?.cancelled).toBe(false);
});
it('完成状态必须有保存的待发批次和当前签约取消回读，不能把推断或旧回复当成功',()=>{
 const r=reportFixture();expect(readVoiceTripReport({...r,stage:'done'})).toBeNull();
 let state={revision:0,books:[r.book],applied:[]};state=changeExpenses(state,{type:'prepare',bookId:'trip',batchId:'trip-batch',entryIds:r.entryIds,revision:0,requestId:'prepare'},now);
 const done={...r,stage:'done' as const,book:state.books[0],batchId:'trip-batch'};expect(readVoiceTripReport(done)).toBeNull();
 expect(readVoiceTripReport({...done,source:{...r.source,cancelledAutopayIds:['video'],autopays:[]}})).toBeNull();
 const cancelled={...done,source:{...r.source,cancelledAutopayIds:['video'],autopays:r.source.autopays.map(a=>({...a,nextChargeAt:undefined}))}};
 expect(readVoiceTripReport(cancelled)?.cancelled).toBe(true);
 expect(readVoiceTripReport({...cancelled,entryIds:['dinner']})).toBeNull();
});
it('缺失消费、金额损坏、不规则账单或无签约权限都不显示已核对结果',()=>{
 const r=reportFixture();for(const value of [null,{...r,asOf:NaN},{...r,entryIds:['missing']},{...r,entryIds:['cake']},{...r,source:{...r.source,scopes:['transactions']}},{...r,source:{...r.source,transactions:r.source.transactions.slice(1)}},{...r,book:{...r.book,entries:r.book.entries.map(e=>({...e,amount:-1}))}}])expect(readVoiceTripReport(value)).toBeNull();
});
