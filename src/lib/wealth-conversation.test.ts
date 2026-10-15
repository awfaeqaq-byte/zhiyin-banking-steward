import {describe, expect, it, vi} from 'vitest';
import {wealthCatalog, findWealthCatalogProduct} from './wealth-catalog';
import {extractWealthPlan, requestWealthConversation} from './wealth-conversation';
import {assessRisk, type WealthSnapshot} from './wealth-operation';
const snapshot:WealthSnapshot={version:1,receipts:[],assessment:assessRisk({experience:0,loss:0,term:0,liquidity:0,income:0})};
const reply=(data:object)=>vi.fn().mockResolvedValue(JSON.stringify(data));
describe('同一份财富目录和对话计划',()=>{
 it('共享14项但11项资料基金没有交易资格与虚构风险',()=>{
  expect(wealthCatalog).toHaveLength(14);
  expect(new Set(wealthCatalog.map(p=>p.id)).size).toBe(14);
  expect(wealthCatalog.filter(p=>p.source==='fund').every(p=>!p.purchasable&&p.risk===null)).toBe(true);
  expect(findWealthCatalogProduct('cash-plus')?.purchasable).toBe(true);
 });
 it('只从明确的金额期限提取计划，支持后续修改与中文时间',()=>{
  expect(extractWealthPlan('准备投入1.5万元，持有半年')).toEqual({amountYuan:15000,termMonths:6});
  expect(extractWealthPlan('金额改成5000元，放一年半')).toEqual({amountYuan:5000,termMonths:18});
  expect(extractWealthPlan('这个近一年表现如何')).toEqual({});
  expect(extractWealthPlan('我28岁，涨幅20%')).toEqual({});
  expect(extractWealthPlan('投入-5000元，持有121个月')).toEqual({});
  expect(extractWealthPlan('3万，1年')).toEqual({amountYuan:30000,termMonths:12});
  expect(extractWealthPlan('三万元，半年')).toEqual({amountYuan:30000,termMonths:6});
  expect(extractWealthPlan('一万块，放半年')).toEqual({amountYuan:10000,termMonths:6});
  expect(extractWealthPlan('我有3万，但只想投入1万')).toEqual({amountYuan:10000});
  expect(extractWealthPlan('我有3万，房贷还有20年')).toEqual({});
  expect(extractWealthPlan('先不考虑金额')).toEqual({});
  expect(extractWealthPlan('投入1,000元，持有一年')).toEqual({amountYuan:1000,termMonths:12});
  expect(extractWealthPlan('不想投入1万元，还是先看看')).toEqual({});
  expect(extractWealthPlan('不持有一年了，半年吧')).toEqual({termMonths:6});
  expect(extractWealthPlan('如果投入1万元会怎样')).toEqual({});
  expect(extractWealthPlan('不投入3000元，而是投入5000元')).toEqual({amountYuan:5000});
  expect(extractWealthPlan('投入1,00元')).toEqual({});
  expect(extractWealthPlan('投入1,0000元')).toEqual({});
  expect(extractWealthPlan('投入1000.123元')).toEqual({});
  expect(extractWealthPlan('6000','打算投入多少？')).toEqual({amountYuan:6000});
 });
 it('无有效测评时不把产品发给模型且拒绝模型候选',async()=>{
  const model=reply({text:'可以了解这只基金',patch:{amountYuan:30000},candidates:[{id:'bio-a',reason:'很适合'}]});
  const result=await requestWealthConversation({messages:[{role:'user',content:'帮我看看基金'}],plan:{},model});
  expect(result.candidates).toEqual([]);
  expect(result.plan).toEqual({});
  expect(result.text).toContain('风险测评');
  expect(model.mock.calls[0][0].instructions).not.toContain('汇添富');
 });
 it('剔除未知和风险不符的候选、忽略模型编造的计划并标明资料候选待核验',async()=>{
  const model=reply({text:'可以先比较现金与医疗方向。',patch:{amountYuan:99999,termMonths:60},candidates:[{id:'unknown',reason:'高收益'},{id:'balanced-fund',reason:'适合'},{id:'cash-plus',reason:'便于短期使用'},{id:'medical',reason:'与你关注的医疗主题相关'}]});
  const result=await requestWealthConversation({messages:[{role:'user',content:'投入1000元，持有3个月，关注医疗主题'}],plan:{},snapshot,model});
  expect(result.plan).toEqual({amountYuan:1000,termMonths:3});
  expect(result.candidates.map(c=>c.id)).toEqual(['cash-plus','medical']);
  expect(result.candidates[1].status).toBe('needs_verification');
  expect(model.mock.calls[0][0].instructions).toContain('medical');
 });
 it('没有明确计划时保留已知金额，不让account推荐绕过期限',async()=>{
  const result=await requestWealthConversation({messages:[{role:'user',content:'更关注流动性'}],plan:{amountYuan:5000},snapshot,model:reply({text:'还计划持有多久？',candidates:[{id:'cash-plus',reason:'可赎回'}]})});
  expect(result.plan).toEqual({amountYuan:5000});expect(result.candidates).toEqual([]);
 });
 it('拒绝不可解析响应并允许调用方重试',async()=>{
  await expect(requestWealthConversation({messages:[{role:'user',content:'投入1000元'}],plan:{},snapshot,model:vi.fn().mockResolvedValue('不是结构化内容')})).rejects.toThrow('重新发送');
 });
});
it('资料基金不能被回复冒充为通过适当性的在售产品',async()=>{
 await expect(requestWealthConversation({messages:[{role:'user',content:'我想了解医疗主题'}],plan:{},snapshot,model:reply({text:'这只符合你的风险偏好，可以直接申购。',candidates:[{id:'medical',reason:'已经通过适当性，可以直接买入'}]})})).rejects.toThrow('重新发送');
});
