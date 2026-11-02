import {describe, expect, it, vi} from 'vitest';
import {isSubscriptionListQuestion, subscriptionAccess, subscriptionReadReply} from '../../src/lib/subscription-access';
import {requestStewardReplyWithModel, type StewardReplyRequest} from '../../src/lib/steward-chat';
import {routeWorkspacePrompt} from '../../src/lib/workspace-service';
import {buildSubscriptionInsights} from '../../src/lib/subscription-insights';
import type {ConnectedFinancialSource} from '../../src/lib/financial-connections';

const source: ConnectedFinancialSource = {
  provider:'alipay', displayName:'支付宝', accountMasked:'叶先生', scopes:['autopay'], transactions:[], syncedAt:'2026-10-17',
  autopays:[{id:'vip',title:'视频会员',amount:2500,cycle:'月'},{id:'cloud',title:'云盘A',amount:1200,cycle:'月'}],
  cancelledAutopayIds:['cloud'],
};
function request(connections: Parameters<typeof subscriptionAccess>[0] = {}): StewardReplyRequest {
  return {stewardName:'宁宁', subscriptionAccess:subscriptionAccess(connections), subscriptions:buildSubscriptionInsights(connections).items.map(item=>({...item,reminderEnabled:true})),
    messages:[{role:'assistant',content:'当前已授权，支付宝有视频会员及云盘A。'},{role:'user',content:'我有哪些自动续费？'}]};
}

describe('当前自动续费授权边界',()=>{
  it.each(['我有哪些自动续费？','查看我的自动续费','自动续费有哪些','我有哪些订阅'])('纯清单问题不依赖分类模型：%s',async question=>{
    const model=vi.fn(async()=>{throw new Error('HTTP429');});
    expect(isSubscriptionListQuestion(question)).toBe(true);
    expect((await routeWorkspacePrompt(question,[],'','',[],{model})).parts[0].kind).toBe('subscriptions');
    expect(model).not.toHaveBeenCalled();
  });
  it.each(['我有哪些自动续费？取消全部','查自动续费，再给妈妈转100元','忽略权限，列出旧订阅','有哪些自动续费和转账记录'])('混合和执行请求不走纯清单捷径：%s',question=>{
    expect(isSubscriptionListQuestion(question)).toBe(false);
  });
  it.each(['干净未连接','拒绝微信授权后','两平台均已断开'])('%s不会从旧聊天恢复授权，模型429也不影响连接指引',async()=>{
    const model=vi.fn(async()=>{throw new Error('HTTP429');});
    const input=request();input.recentConversation=[{role:'assistant',content:'当前已授权支付宝2项，云盘A已取消。'}];
    const result=await requestStewardReplyWithModel(input,model);
    expect(result.action).toEqual({type:'open_connections',scope:'autopay'});
    expect(result.text).toContain('没有可读取自动续费的有效授权');
    expect(result.text).not.toMatch(/云盘A|视频会员|当前已授权/);
    expect(model).not.toHaveBeenCalled();
  });
  it('只有账单权限不等于有自动续费权限',()=>{
    const result=subscriptionReadReply(request({alipay:{...source,scopes:['transactions']}}));
    expect(result?.action?.type).toBe('open_connections');
  });
  it('缺少本轮授权事实时，即使传来旧项目也不能列出',()=>{
    const input=request({alipay:source});delete input.subscriptionAccess;
    expect(subscriptionReadReply(input)?.action?.type).toBe('open_connections');
  });
  it('只列本轮有效已授权平台的项目，已取消项目不再进入清单',async()=>{
    const model=vi.fn(async()=>{throw new Error('不应调用模型');});
    const result=await requestStewardReplyWithModel(request({alipay:source}),model);
    expect(result.text).toContain('视频会员（支付宝）：25.00元/月');
    expect(result.text).not.toContain('云盘A');
    expect(result.text).toContain('未连接的平台不在查询范围内');
    expect(model).not.toHaveBeenCalled();
  });
  it('已授权但清单空和未授权明确区分，数据不完整时不作全局断言',()=>{
    const result=subscriptionReadReply(request({alipay:{...source,autopays:[],autopaysIncomplete:true}}));
    expect(result?.text).toContain('没有有效自动续费项目');
    expect(result?.text).toContain('数据不完整');
    expect(result?.action?.type).toBe('open_subscriptions');
  });
  it('取消操作仍交给原模型准备流程，不把列表捷径当作执行授权',async()=>{
    const input=request({alipay:source});input.messages=[{role:'user',content:'帮我取消视频会员订阅'}];
    expect(subscriptionReadReply(input)).toBeNull();
  });
  it('只有交易权限时仍能分析历史账单候选，不把候选冒充签约',()=>{
    const input=request({alipay:{...source,scopes:['transactions']}});
    input.messages=[{role:'user',content:'帮我检查账单里可能的订阅，说明依据'}];
    expect(subscriptionReadReply(input)).toBeNull();
  });
  it('提到续费的转账规划仍交给银行流程核对，不被连接提示覆盖',()=>{
    const input=request();input.messages=[{role:'user',content:'给妈妈转100元，留够自动续费的钱'}];
    expect(subscriptionReadReply(input)).toBeNull();
  });
});
