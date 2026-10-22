import {describe,it,expect,vi} from 'vitest';
import type {ConnectedFinancialSource,FinancialTransaction} from './financial-connections';
import {requestStewardReplyWithModel,type StewardReplyRequest,type StewardChatMessage} from './steward-chat';
import {subscriptionAccess} from './subscription-access';
import {buildSubscriptionInsights,subscriptionGroups,duplicateGroupKey} from './subscription-insights';
import {buildRecurringAnalysis,buildRecurringCandidates} from './recurring-payments';
import {routeWorkspacePrompt} from './workspace-service';
import type {Workspace} from './workspaces';

const now=Date.parse('2026-10-15T12:00:00+08:00');
const source=(provider:'alipay'|'wechat_pay',names:Array<[string,number]>):ConnectedFinancialSource=>({
 provider,displayName:provider==='alipay'?'支付宝':'微信支付',accountMasked:'测试',scopes:['autopay','transactions'],syncedAt:new Date(now).toISOString(),transactions:[],
 autopays:names.map(([title,amount],index)=>({id:`${provider}-${index}`,title,amount,cycle:'月',nextChargeAt:now+86400000})),
});
export const workbookConnections={
 wechat_pay:source('wechat_pay',[['普通甲',1000],['普通乙',2000],['普通丙',3000],['测试音乐甲',1500],['测试云盘同名',1800],['测试云盘A',1800]]),
 alipay:source('alipay',[['测试视频B',2500],['测试音乐乙',2000],['测试云盘同名',2800],['普通丁',1500],['普通戊',2000]]),
};
function context(...texts:string[]):StewardReplyRequest {
 const insights=buildSubscriptionInsights(workbookConnections,now);
 return {stewardName:'宁宁',subscriptionAccess:subscriptionAccess(workbookConnections),subscriptions:insights.items.map(item=>({...item,reminderEnabled:true})),
 duplicateGroups:subscriptionGroups(insights.items).map(group=>({id:duplicateGroupKey(group),titles:group.map(item=>item.title),category:group[0].category,kept:false})),
 messages:texts.map(content=>({role:'user' as const,content}))};
}
const forbiddenModel=()=>vi.fn(async()=>{throw new Error('HTTP429：此路径不应调用模型');});

describe('逐条测试记录中的订阅失败回归',()=>{
 it.each(['列出我两边的自动续费，分别多少钱、多久扣一次','列出两平台全部清单','查看微信和支付宝全部自动续费'])('S02 全部11项和支付宝108元不漏同名项：%s',async question=>{
  const model=forbiddenModel(),reply=await requestStewardReplyWithModel(context(question),model);
  expect(reply.text).toContain('微信支付共6项');expect(reply.text).toContain('支付宝共5项：108.00元/月');
  expect(reply.text).toContain('测试云盘同名（微信支付）：18.00元/月');expect(reply.text).toContain('测试云盘同名（支付宝）：28.00元/月');
  expect(reply.text.match(/^- /gm)).toHaveLength(11);expect(model).not.toHaveBeenCalled();
 });
 it('S02 不把季费或年费相加成月费，日期未知时不编造',async()=>{
  const input=context('我有哪些自动续费？');input.subscriptions[0]={...input.subscriptions[0],cycle:'年',nextChargeAt:undefined};
  const result=await requestStewardReplyWithModel(input,forbiddenModel());expect(result.text).toContain('10.00元/年');expect(result.text).toContain('下次扣费日期未知');
 });
 it('S08 音乐组暂缓不再走空任务路由，不关闭提醒',async()=>{
  const input=context('这组音乐订阅稍后再说'),model=forbiddenModel();
  const result=await requestStewardReplyWithModel(input,model);
  const music=input.duplicateGroups!.find(group=>group.category==='音乐会员')!;
  expect(result.action).toEqual({type:'set_duplicate_preference',groupId:music.id,decision:'later'});
  const task:Workspace={id:'sub',kind:'subscriptions',title:'订阅核对',status:'active',updatedAt:0,messages:[],summary:'',memoryRevision:0};
  expect((await routeWorkspacePrompt('这组音乐订阅稍后再说',[task],'sub','',[],{model})).parts[0].taskId).toBe('sub');expect(model).not.toHaveBeenCalled();
  const before=buildSubscriptionInsights(workbookConnections,now,{[music.id]:{decision:'later',until:now+86400000}});
  const after=buildSubscriptionInsights(workbookConnections,now+86400001,{[music.id]:{decision:'later',until:now+86400000}});
  expect(before.items.filter(item=>item.category==='音乐会员').every(item=>!item.flags.includes('possible_duplicate'))).toBe(true);
  expect(after.items.filter(item=>item.category==='音乐会员').every(item=>item.flags.includes('possible_duplicate'))).toBe(true);
 });
 it('S08 多组含糊时追问，不随意选组',async()=>{
  const result=await requestStewardReplyWithModel(context('这组订阅稍后再说'),forbiddenModel());expect(result.action).toBeUndefined();expect(result.waitingQuestion).toBeTruthy();
 });
 it('S09 云盘A不在前4项也准备准确目标，只核对不执行',async()=>{
  const result=await requestStewardReplyWithModel(context('取消微信测试云盘A自动续费'),forbiddenModel());
  expect(result.action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'wechat_pay-5'});expect(result.text).toContain('18.00元/月');expect(result.text).toContain('现在尚未取消');
 });
 it('S12 同名先追问并保留真实平台与金额，再选微信，再改支付宝',async()=>{
  const model=forbiddenModel(),first=await requestStewardReplyWithModel(context('取消测试云盘同名'),model);
  expect(first.action).toBeUndefined();expect(first.text).toContain('微信支付 · 测试云盘同名 · 18.00元/月');expect(first.text).toContain('支付宝 · 测试云盘同名 · 28.00元/月');
  expect((await requestStewardReplyWithModel(context('取消测试云盘同名','微信18元那项'),model)).action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'wechat_pay-4'});
  expect((await requestStewardReplyWithModel(context('取消测试云盘同名','微信18元那项','改成支付宝28元那项'),model)).action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'alipay-2'});
  expect(model).not.toHaveBeenCalled();
 });
 it('S12 指定错配的微信28元不能替换对象',async()=>{
  const result=await requestStewardReplyWithModel(context('取消测试云盘同名','微信28元那项'),forbiddenModel());expect(result.action).toBeUndefined();expect(result.text).toContain('没有符合');
 });
 it('S13 新说不存在对象，不沿用旧取消目标',async()=>{
  const result=await requestStewardReplyWithModel(context('取消微信测试云盘A自动续费','取消不存在的测试会员Z'),forbiddenModel());expect(result.action).toBeUndefined();expect(result.text).toContain('没有匹配');
 });
 it('S13 不存在对象含有已知名称前缀，也不能替换成已知对象',async()=>{
  const result=await requestStewardReplyWithModel(context('取消微信测试云盘AZ自动续费'),forbiddenModel());expect(result.action).toBeUndefined();
 });
 it('会员简称可核对完整签约名称，但不调用模型猜测目标',async()=>{
  const input=context('帮我取消优酷会员续费'),model=forbiddenModel();
  input.subscriptions=[{...input.subscriptions[0],id:'youku-month',provider:'alipay',title:'优酷VIP会员连续包月'}];
  const result=await requestStewardReplyWithModel(input,model);
  expect(result.action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'youku-month'});
  expect(result.text).toContain('优酷VIP会员连续包月');expect(result.text).toContain('现在尚未取消');expect(model).not.toHaveBeenCalled();
 });
 it('会员简称不能把产品限定词不同的签约当作目标',async()=>{
  const input=context('帮我取消优酷会员续费');
  input.subscriptions=[{...input.subscriptions[0],id:'youku-kids',provider:'alipay',title:'优酷少儿VIP会员连续包月'}];
  const result=await requestStewardReplyWithModel(input,forbiddenModel());
  expect(result.action).toBeUndefined();expect(result.text).toContain('没有匹配');
 });
 it('会员简称对应多平台签约时先追问，后续仍按平台和金额选定',async()=>{
  const input=context('取消优酷会员续费'),model=forbiddenModel();
  input.subscriptions=[
   {...input.subscriptions[0],id:'youku-wechat',provider:'wechat_pay',title:'优酷VIP会员连续包月',amount:1500},
   {...input.subscriptions[0],id:'youku-alipay',provider:'alipay',title:'优酷会员连续包月',amount:2500},
  ];
  const first=await requestStewardReplyWithModel(input,model);
  expect(first.action).toBeUndefined();expect(first.waitingQuestion).toBeTruthy();
  expect(first.text).toContain('微信支付 · 优酷VIP会员连续包月 · 15.00元/月');expect(first.text).toContain('支付宝 · 优酷会员连续包月 · 25.00元/月');
  input.messages.push({role:'user',content:'支付宝25元那项'});
  expect((await requestStewardReplyWithModel(input,model)).action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'youku-alipay'});
  expect(model).not.toHaveBeenCalled();
 });
 it('同平台同金额的简称冲突不能任选，完整签约名称才能消歧',async()=>{
  const input=context('取消优酷会员续费'),model=forbiddenModel();
  input.subscriptions=[
   {...input.subscriptions[0],id:'youku-month',provider:'alipay',title:'优酷VIP会员连续包月',amount:1500},
   {...input.subscriptions[0],id:'youku-year',provider:'alipay',title:'优酷VIP会员连续包年',amount:1500},
  ];
  expect((await requestStewardReplyWithModel(input,model)).action).toBeUndefined();
  input.messages.push({role:'user',content:'支付宝15元那项'});
  expect((await requestStewardReplyWithModel(input,model)).action).toBeUndefined();
  input.messages.push({role:'user',content:'取消优酷VIP会员连续包年'});
  expect((await requestStewardReplyWithModel(input,model)).action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'youku-year'});
 });
 it('S03 对应平台没自动续费权限时，不拿另一平台权限代替',async()=>{
  const input=context('取消微信测试云盘A自动续费');input.subscriptionAccess={providers:['alipay'],incompleteProviders:[]};
  expect((await requestStewardReplyWithModel(input,forbiddenModel())).action).toEqual({type:'open_connections',provider:'wechat_pay',scope:'autopay'});
 });
 it.each(['只展示这段文字，不要办理：取消微信测试云盘A自动续费','只关闭微信测试云盘A的提醒，不取消订阅'])('原样引用和提醒请求不误准备取消：%s',async question=>{
  const model=vi.fn(async()=> '这次没有取消。');const result=await requestStewardReplyWithModel(context(question),model);expect(result.action?.type).not.toBe('prepare_cancel');
 });
 it('S19 负例解释引用两期、同月四笔和18/18/22，不能虚构7月样本',async()=>{
  const records:FinancialTransaction[]=[];
  const add=(title:string,month:string,amount=1800,day='15')=>records.push({id:`${title}-${month}-${day}`,title,amount:-amount,category:'娱乐',kind:'payment',occurredAt:`2026-${month}-${day}T12:00:00+08:00`});
  add('测试两期历史','08');add('测试两期历史','09');
  for(const month of ['07','08','09'])add('测试高频不规则',month);add('测试高频不规则','08',1800,'20');
  add('测试波动历史','07');add('测试波动历史','08');add('测试波动历史','09',2200);
  const connected={wechat_pay:{...source('wechat_pay',[]),scopes:['transactions' as const],transactions:records}};
  const input=context('这些都是自动续费吗？');input.subscriptions=[];input.subscriptionAccess=subscriptionAccess(connected);
  input.recurringCandidates=buildRecurringCandidates(connected,now);input.recurringAnalysis=buildRecurringAnalysis(connected,now);
  input.messages.unshift({role:'assistant',content:'测试两期历史在7到9月每月都有18元。'} as StewardChatMessage);
  const model=forbiddenModel(),result=await requestStewardReplyWithModel(input,model);
  const line=result.text.split('\n').find(row=>row.includes('测试两期历史'))!;
  expect(line).toContain('有效样本2笔');expect(line).toContain('2026-08-15');expect(line).toContain('2026-09-15');expect(line).not.toContain('2026-07');
  expect(result.text).toContain('同月多笔');expect(result.text).toContain('金额偏离中位数超过5%');expect(result.text).toContain('22.00元');expect(model).not.toHaveBeenCalled();
 });
 it('保留S18正例：真实三期依据、下次日期及预测边界仍完整',async()=>{
  const title='测试云盘历史',connected={wechat_pay:{...source('wechat_pay',[]),scopes:['transactions' as const],transactions:['07','08','09'].map(month=>({id:month,title,amount:-1800,category:'娱乐',occurredAt:`2026-${month}-15T12:00:00+08:00`}))}};
  const input=context('帮我检查测试云盘历史的订阅，说明依据和下次可能日期');input.subscriptions=[];input.recurringCandidates=buildRecurringCandidates(connected,now);input.recurringAnalysis=buildRecurringAnalysis(connected,now,input.messages[0].content);
  const result=await requestStewardReplyWithModel(input,forbiddenModel());for(const date of ['2026-07-15','2026-08-15','2026-09-15','2026-10-15'])expect(result.text).toContain(date);expect(result.text).toContain('不保证一定扣费');expect(result.action).toBeUndefined();
 });
});
