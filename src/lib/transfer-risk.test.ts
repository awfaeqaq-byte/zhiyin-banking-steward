import {describe,it,expect} from 'vitest';
import {assessTransferRisk} from './transfer-risk';
import type {BankSnapshot,TransferIntent} from './bank-transfer';
const now=Date.parse('2026-10-19T12:00:00+08:00');
const intent:TransferIntent={workspaceId:'dinner',recipientId:'mom',amount:100000};
const receipt={...intent,id:'paid',completedAt:now-1000,balanceAfter:4000000};
const state:BankSnapshot={revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,contactless:true,overseas:false},transactions:[receipt]};
describe('转账相似性按事实判断',()=>{
 it('同一事项、对象及金额给出原成功回执',()=>expect(assessTransferRisk(state,intent,now)).toMatchObject({large:false,matches:[{id:'paid',kind:'completed',amount:100000}]}));
 it.each([99900,100100,101000])('相近金额%s仍提示',amount=>expect(assessTransferRisk(state,{...intent,amount},now).matches).toHaveLength(1));
 it('超过百分之一不提示',()=>expect(assessTransferRisk(state,{...intent,amount:101001},now).matches).toHaveLength(0));
 it('相差绝对金额上限为100元',()=>expect(assessTransferRisk({...state,transactions:[{...receipt,amount:2000000}]},{...intent,amount:2010001},now).matches).toHaveLength(0));
 it('十分钟包含边界，排除未来及窗口之外',()=>{
  expect(assessTransferRisk(state,intent,receipt.completedAt+600000).matches).toHaveLength(1);
  expect(assessTransferRisk(state,intent,receipt.completedAt+600001).matches).toHaveLength(0);
  expect(assessTransferRisk(state,intent,receipt.completedAt-1).matches).toHaveLength(0);
 });
 it('不同事项或对象不串单',()=>{
  expect(assessTransferRisk(state,{...intent,workspaceId:'rent'},now).matches).toHaveLength(0);
  expect(assessTransferRisk(state,{...intent,recipientId:'dad'},now).matches).toHaveLength(0);
 });
 it('没有事项的手工转账仅在无事项记录之间比较',()=>{
  expect(assessTransferRisk(state,{recipientId:'mom',amount:100000},now).matches).toHaveLength(0);
  expect(assessTransferRisk({...state,transactions:[{...receipt,workspaceId:undefined}]},{recipientId:'mom',amount:100000},now).matches).toHaveLength(1);
 });
 it('未执行预约是风险证据，取消和失败预约不是',()=>{
  const pending={...intent,id:'planned',executeAt:now+60000,createdAt:now-2000,status:'pending' as const};
  const s={...state,transactions:[],schedules:[pending,{...pending,id:'cancelled',status:'cancelled' as const},{...pending,id:'failed',status:'failed' as const}]};
  expect(assessTransferRisk(s,intent,now).matches).toMatchObject([{id:'planned',kind:'pending'}]);
  expect(assessTransferRisk(s,intent,now,{completedOnly:true}).matches).toEqual([]);
 });
 it('同笔回执核对不算新重复',()=>expect(assessTransferRisk(state,intent,now,{excludeId:'paid'}).matches).toEqual([]));
 it('大额阈值5000元，和重复判定独立',()=>{
  expect(assessTransferRisk({...state,transactions:[]},{...intent,amount:499999},now).large).toBe(false);
  expect(assessTransferRisk({...state,transactions:[]},{...intent,amount:500000},now)).toEqual({large:true,matches:[]});
 });
});
