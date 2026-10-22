import {describe,it,expect,vi} from 'vitest';
import {emptyMerchantState,type MerchantState} from './merchant';
import {isMerchantPrompt,merchantAnswer,validMerchantInsight} from './merchant-assistant';
import {routeWorkspacePrompt} from './workspace-service';
const now=Date.parse('2026-10-23T12:00:00+08:00');
const state:MerchantState={...emptyMerchantState(),shop:{id:'shop',name:'知味小馆',publicToken:'token',createdAt:now,menu:[]},orders:[{id:'one',table:'1',items:[{menuItemId:'a',name:'番茄面',quantity:2,unitPrice:1800,amount:3600}],total:3600,status:'paid',createdAt:now,paidAt:now},{id:'two',table:'2',items:[],total:5000,status:'pending',createdAt:now}],expenses:[{id:'e',title:'买菜',category:'进货',amount:1000,occurredAt:now}]};
describe('merchant conversation',()=>{
 it('routes shop revenue without invoking a model or personal bill permission',async()=>{
 const model=vi.fn();const result=await routeWorkspacePrompt('看看我的小店今天收入，什么菜卖得好',[],'','',[],{model});expect(result.parts?.[0].kind).toBe('merchant');expect(model).not.toHaveBeenCalled();
 });
 it('does not steal customer meals, personal bills or mixed financial actions',()=>{
  for(const text of ['今天在小店吃饭花了20，大家AA','看看本月账单','给供应商转账5000元，再看看小店收入','帮我点一份炒饭'])expect(isMerchantPrompt(text)).toBe(false);
  expect(isMerchantPrompt('那近7天呢',true)).toBe(true);expect(isMerchantPrompt('看看本月账单',true)).toBe(false);
 });
 it('grounds numbers in collected receipts, and labels cash difference rather than profit',()=>{
 const result=merchantAnswer(state,'我的小店今天收入多少',now);expect(result.merchantUI?.summary.netCollected).toBe(3600);expect(result.text).toContain('36.00');expect(result.text).toContain('50.00');expect(result.text).toContain('未计入收入');expect(result.text).toContain('不等于利润');expect(validMerchantInsight(result.merchantUI)).toBe(true);
 });
 it('answers procurement from procurement entries, not rent or all expenses',()=>{
 const data={...state,expenses:[...state.expenses,{id:'rent',title:'房租',category:'房租',amount:50000,occurredAt:now}]};
 const reply=merchantAnswer(data,'我的小店今天进货花多少',now);expect(reply.text).toContain('已记进货支出 ¥10.00，共 1 笔');expect(reply.text).toContain('最大一笔是买菜');
 });
 it('understands its own all-records choice and receipt nouns as read-only analysis',()=>{
 expect(merchantAnswer(state,'我的小店全部经营记录',now).merchantUI?.summary.period).toBe('all');
 expect(merchantAnswer(state,'看看我的小店今天的收款',now).merchantUI).toBeDefined();
 expect(isMerchantPrompt('帮我分析小店经营：有什么建议')).toBe(true);
 });
 it('does not substitute today for an unsupported period or invent expenses',()=>{
 expect(merchantAnswer(state,'小店上个月收入多少',now).merchantUI).toBeUndefined();
 expect(merchantAnswer(state,'帮我的小店记一笔买菜100元',now).text).toContain('经营支出');
 expect(merchantAnswer(emptyMerchantState(),'我的小店',now).text).toContain('创建');
 });
});
