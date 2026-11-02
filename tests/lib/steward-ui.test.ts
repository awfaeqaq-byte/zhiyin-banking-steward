import {expect,it} from 'vitest';
import {billLedgerFingerprint,billProvider,billScopeQuestion,evidenceRefs,parseBillUI,restoreBillScenes,validBillUI} from '../../src/lib/steward-ui';
import {parseStewardReply,requestStewardReply} from '../../src/lib/steward-chat';
import {buildBillAnalysis,billQuestionForMessages} from '../../src/lib/bill-analysis';
import {vi} from 'vitest';

it('模型只选择受支持的账单模块，不接受代码、金额或任意操作',()=>{
  const parsed=parseBillUI('主要看消费分布。[[bill-ui:{"sections":["categories","overview"],"evidenceRefs":[1]}]]');
  expect(parsed.text).toBe('主要看消费分布。');
  expect(parsed.ui).toEqual({sections:['categories','overview'],evidenceRefs:[1]});
  expect(validBillUI({sections:['pay'],amount:100})).toBeUndefined();
  expect(validBillUI({sections:['overview'],html:'<script/>'})).toBeUndefined();
});
it('非法、多重或超长界面描述降级为文字，不泄漏标记或执行动作',()=>{
  for(const raw of ['{broken}',JSON.stringify({sections:['overview'],evidenceRefs:[99]}),JSON.stringify({sections:['overview'],url:'https://x.test'})]){
    const parsed=parseBillUI(`说明[[bill-ui:${raw}]]`);
    expect(parsed.text).toBe('说明');expect(parsed.ui).toBeUndefined();
  }
  expect(parseBillUI('[[bill-ui:{"sections":["overview"]}]][[bill-ui:{"sections":["trend"]}]]').ui).toBeUndefined();
  expect(parseBillUI('[[bill-ui:'+ 'x'.repeat(1200)+']]').ui).toBeUndefined();
  expect(validBillUI(null)).toBeUndefined();
  expect(validBillUI({sections:['overview','overview']})).toBeUndefined();
});
it('普通动作与展示描述分别解析，不把展示当金融授权',()=>{
  const reply=parseStewardReply('请核对。[[bill-ui:{"sections":["overview"]}]][ZHIYIN_ACTION:OPEN_CONNECTIONS|wechat_pay]',[]);
  expect(reply.billUI).toEqual({sections:['overview'],evidenceRefs:[]});
  expect(reply.action).toEqual({type:'open_connections',provider:'wechat_pay'});
  expect(reply.text).toBe('请核对。');
});
it('点击的交易来自真实分析数据，作为只读界面上下文传给模型',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({output_text:'先核对这笔。[[bill-ui:{"sections":["transactions"]}]]'})));
  vi.stubGlobal('fetch',fetcher);
  const bill=buildBillAnalysis({alipay:{provider:'alipay',displayName:'支付宝',accountMasked:'测试',scopes:['transactions'],autopays:[],syncedAt:'2026-09-24',transactions:[{id:'metro',title:'地铁',amount:-500,category:'出行',occurredAt:'2026-09-20'}]}},'本月支出',Date.parse('2026-09-24'));
  const response=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'核对这笔账单'}],billAnalysis:bill,billFocus:{provider:'alipay',id:'metro'}});
  const body=JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.input.some((m:{content:string})=>m.content.includes('当前账单界面')&&m.content.includes('地铁')&&m.content.includes('-500'))).toBe(true);
  expect(response.billUI?.sections).toEqual(['transactions']);
  expect(body.instructions.length).toBeLessThanOrEqual(4000);
});
it('账单续聊切换平台时保留此前月份，而不是重置到本月',()=>{
  expect(billQuestionForMessages([{role:'user',content:'看看8月支出'},{role:'assistant',content:'已整理'},{role:'user',content:'只看微信'}])).toBe('看看8月支出；只看微信');
});
it('金额相同但流水明细改变时，账本解读指纹也改变',()=>{
 const source={provider:'alipay' as const,displayName:'支付宝',accountMasked:'测试',scopes:['transactions' as const],autopays:[],syncedAt:'2026-09-24',transactions:[{id:'one',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'}]};
 const original=buildBillAnalysis({alipay:source},'本月支出',Date.parse('2026-09-24'));
 const changed=buildBillAnalysis({alipay:{...source,transactions:[{...source.transactions[0],title:'超市'}]}},'本月支出',Date.parse('2026-09-24'));
 expect(original.expense).toBe(changed.expense);
 expect(billLedgerFingerprint(original)).not.toBe(billLedgerFingerprint(changed));
});
it('恢复只保留界面意图，丢弃非法结构与伪造的金额或交易对象',()=>{
 for(const raw of [null,'{','{}','null'])expect(restoreBillScenes(raw)).toEqual({});
 const common={key:'bill',anchorId:'answer',question:'本月支出'};
 expect(restoreBillScenes(JSON.stringify([null,{}, {...common,key:'x'.repeat(101)}, {...common,focus:{provider:'bank',id:'fake'}}, {...common,needsConsent:true,provider:'alipay',focus:{provider:'alipay',id:'real'},amount:999}])).bill).toEqual({...common,ui:undefined,needsConsent:true,provider:'alipay',focus:{provider:'alipay',id:'real'}});
 for(const focus of [{provider:'alipay',id:4},{provider:'alipay',id:'x'.repeat(201)}])expect(restoreBillScenes(JSON.stringify([{...common,focus}])).bill.focus).toBeUndefined();
 expect(billProvider('微信支出；只看支付宝')).toBe('alipay');
 expect(billProvider('微信支付宝')).toBeUndefined();
 expect(billScopeQuestion('微信')).toBe('本月支出；只看全部平台账单');
 expect(evidenceRefs('[[evidence:1]][[evidence:1]][[evidence:3]]')).toEqual([1,3]);
 for(const ui of [[],{sections:[]},{sections:['overview'],evidenceRefs:[1,1]},{sections:['overview'],evidenceRefs:'1'}])expect(validBillUI(ui)).toBeUndefined();
});
