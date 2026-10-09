// Only synthetic data goes to the configured model. No account, grant or task writes.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const loader=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>originalFetch(new URL(String(url),'http://127.0.0.1:3000'),options);
try {
 const {requestStewardReply}=await loader.ssrLoadModule('/src/lib/steward-chat.ts');
 const {buildBillAnalysis}=await loader.ssrLoadModule('/src/lib/bill-analysis.ts');
 const bill=buildBillAnalysis({wechat_pay:{provider:'wechat_pay',displayName:'微信支付',accountMasked:'合成测试账户',scopes:['transactions'],autopays:[],syncedAt:'2026-10-09',transactions:[{id:'synthetic-lunch',title:'合成午餐',amount:-2500,category:'餐饮',occurredAt:'2026-10-08'}]}},'本月支出',Date.parse('2026-10-09'));
 const reply=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'帮我看看本月支出，展示消费分布，并解释我点选的午餐。'}],billAnalysis:bill,billFocus:{provider:'wechat_pay',id:'synthetic-lunch'}});
 console.log('Synthetic bill reply:',reply.text);
 assert.ok(reply.billUI?.sections.length,'配置中的模型应输出可解析的账单展示模块');
 assert.ok(!reply.text.includes('[[bill-ui:'));
 console.log('PASS: configured live model selected validated bill UI modules:',reply.billUI.sections.join(', '));
} finally {globalThis.fetch=originalFetch;await loader.close();}
