import {expect,it,vi} from 'vitest';
import {buildBillAnalysis} from './bill-analysis';
import {requestStewardReplyWithModel,type StewardReplyRequest} from './steward-chat';
import type {ConnectedFinancialSource} from './financial-connections';

const source:ConnectedFinancialSource={provider:'alipay',displayName:'支付宝',accountMasked:'测试',scopes:['transactions'],autopays:[],syncedAt:'2026-10-13',transactions:[
 {id:'food',title:'餐饮订单',amount:-18650,category:'餐饮',occurredAt:'2026-10-12'},
 {id:'other',title:'其他消费',amount:-12500,category:'其他',occurredAt:'2026-10-12'},
 {id:'life',title:'生活消费',amount:-5970,category:'生活',occurredAt:'2026-10-12'},
 {id:'traffic',title:'交通消费',amount:-4200,category:'交通',occurredAt:'2026-10-12'},
 {id:'shop',title:'购物消费',amount:-3288,category:'购物',occurredAt:'2026-10-12'},
 {id:'income',title:'普通入账',amount:1580000,category:'收入',kind:'income',occurredAt:'2026-10-12'},
 {id:'transfer',title:'跨平台转账',amount:-20000,category:'转账',kind:'transfer',occurredAt:'2026-10-12'},
]};
const bill=buildBillAnalysis({alipay:source,wechat_pay:{...source,provider:'wechat_pay',displayName:'微信支付',transactions:[]}},'本月账单；全部平台',Date.parse('2026-10-13'));
const request:StewardReplyRequest={stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'请分析当前账单的支出结构'}],billAnalysis:bill};

it.each([
 '已按支付宝账单返回，数据范围与上次一致。如需查看其他平台可补充授权。',
 '收入15800元含跨平台转账200元，餐饮是主要消费。',
 '餐饮和其他两项合计超过七成，建议先核对这两类消费。',
 '普通入账16000元，消费支出446.08元，餐饮是主要部分。',
 '已返回全部平台账单。消费支出446.08元。',
])('账单回复出现口径错误或只报返回状态时重试一次：%s',async wrong=>{
 const correct='餐饮与其他消费合计占69.8%，可以先核对这两类明细。前期记录不足，不能判断是否花得更多。';
 const model=vi.fn().mockResolvedValueOnce(wrong).mockResolvedValueOnce(correct);
 const result=await requestStewardReplyWithModel(request,model);
 expect(model).toHaveBeenCalledTimes(2);expect(result.text).toBe(correct);
 const packet=JSON.stringify(model.mock.calls[0][0]);
 expect(packet).toContain('69.8');expect(packet).toContain('普通入账');expect(packet).toContain('转出');
});
it('两次错误后用核对过的支出结构降级，不展示模型的错误或伪授权',async()=>{
 const model=vi.fn().mockResolvedValue('收入15800元含跨平台转账200元。已按支付宝账单返回。[ZHIYIN_ACTION:OPEN_CONNECTIONS|alipay]');
 const result=await requestStewardReplyWithModel(request,model);
 expect(model).toHaveBeenCalledTimes(2);
 expect(result.text).toContain('69.8%');expect(result.text).toContain('15,800');
 expect(result.text).not.toContain('含跨平台转账');expect(result.action).toBeUndefined();
 expect(result.text).toContain('前期');
});
it('核对正确的解释只调用一次，不把交易追问强行改写成概览',async()=>{
 const model=vi.fn().mockResolvedValue('这笔餐饮订单在10月12日记录。仅凭账单无法确认是否为预期消费。');
 const result=await requestStewardReplyWithModel({...request,billFocus:{provider:'alipay',id:'food'},messages:[{role:'user',content:'这笔什么时候付的？'}]},model);
 expect(model).toHaveBeenCalledOnce();expect(result.text).toContain('10月12日');
});
it('纠正调用失败时仍返回核对过的结果，而不是让整条账单回复失败',async()=>{
 const model=vi.fn().mockResolvedValueOnce('收入15800元含转账200元。').mockRejectedValueOnce(new Error('模型暂时不可用'));
 const result=await requestStewardReplyWithModel(request,model);
 expect(result.text).toContain('69.8%');expect(result.action).toBeUndefined();
});
it('裁剪长对话时保留当前账本事实，不让旧回复挤掉核对口径',async()=>{
 const model=vi.fn().mockResolvedValue('餐饮是主要部分，先核对用途。');
 await requestStewardReplyWithModel({...request,messages:[...Array.from({length:23},()=>({role:'assistant' as const,content:'历史材料'.repeat(490)})),...request.messages]},model);
 expect(model.mock.calls[0][0].input.some((m:{content:string})=>m.content.startsWith('本轮账本核对事实'))).toBe(true);
});
