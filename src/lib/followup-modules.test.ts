import {afterEach,describe,it,expect,vi} from 'vitest';
import {requestStewardReplyWithModel,type StewardReplyRequest} from './steward-chat';
import {requestOccasionAdvice,type OccasionDraft} from './occasion-plans';
import {buildBillAnalysis} from './bill-analysis';
import {advanceTaskProgress,billTaskQuestion} from './task-progress';
import type {Workspace} from './workspaces';
import type {ConnectedFinancialSource} from './financial-connections';
import {assessRisk,type WealthSnapshot} from './wealth-operation';
const noModel=async()=>{throw Error('缺项和业务核对不应调用模型猜测');};
const bank={revision:0,balance:4230000,limit:50000,frozen:false,controls:{overseas:false,contactless:false,night:false},transactions:[]};
const request=(turns:string[],extra:Partial<StewardReplyRequest>={}):StewardReplyRequest=>({stewardName:'宁宁',subscriptions:[],bank,messages:turns.map(content=>({role:'user',content})),...extra});
const ask=(turns:string[],extra:Partial<StewardReplyRequest>={})=>requestStewardReplyWithModel(request(turns,extra),noModel);
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],autopays:[],syncedAt:'2026-10-23T12:00:00+08:00',transactions:[{id:'a',title:'燃气费',amount:-3620,kind:'payment',category:'生活',occurredAt:'2026-10-20'},{id:'b',title:'水费',amount:-2350,kind:'payment',category:'生活',occurredAt:'2026-10-19'},{id:'c',title:'退款',amount:1299,kind:'refund',category:'退款',occurredAt:'2026-10-21'}]};
const bill=buildBillAnalysis({wechat_pay:source},'2026年10月账单',Date.parse('2026-10-23T12:00:00+08:00'));
describe('新增账单失败的可重复回归',()=>{
 it.each([
  ['BI2-061','分析那段时间微信和支付宝消费','起始'],
  ['BI2-062','分析2026年10月那边的消费','微信支付还是支付宝'],
  ['BI2-063','算2026年10月退款前的净消费','两个口径'],
  ['BI2-065','这笔归到生活费','哪笔交易'],
  ['BI2-066','双平台合计，但只算微信消费','范围不一致'],
  ['BI2-068','分析我发的截图','尚未提供'],
 ])('%s 不明确的信息先澄清',async(_id,text,expected)=>{const result=await ask([text],{billAnalysis:bill});expect(result.text).toContain(expected);expect(result.action).toBeUndefined();});
 it('BI2-067 起止分轮补齐保留10月1日至20日，不能退化为单日',async()=>{
  const task:Workspace={id:'bill',kind:'bills',title:'查消费',status:'active',updatedAt:0,memoryRevision:0,summary:'',messages:[]};
  const progress=advanceTaskProgress(task,'查两平台消费，从2026年10月1日开始，我还有一个截止日期没告诉你');
  expect((await ask(['查两平台消费，从2026年10月1日开始，我还有一个截止日期没告诉你'],{billAnalysis:bill})).waitingQuestion).toContain('截止日期');
  const next=advanceTaskProgress({...task,progress},'截止日期2026年10月20日，微信和支付宝，净消费');
  expect(buildBillAnalysis({wechat_pay:source},billTaskQuestion(next),Date.parse('2026-10-23'))).toMatchObject({from:'2026-10-01',to:'2026-10-20',expense:5970,refund:0});
 });
 it.each(['BI2-073','BI2-074'])('%s 恢复后采用当前账本，消费退款净额同时列出',async()=>{const r=await ask(['恢复授权后继续输出消费、退款、净消费'],{billAnalysis:bill});expect(r.text).toContain('59.70元');expect(r.text).toContain('12.99元');expect(r.text).toContain('46.71元');expect(r.action).toBeUndefined();});
 it('BI2-077 自动默认的本月不冒充用户确认范围',async()=>{const r=await ask(['帮我分析消费'],{billAnalysis:bill,workspaceProgress:{goal:'帮我分析消费',stage:'collecting',bill:{period:'本月'}}});expect(r.waitingQuestion).toContain('哪段时间');});
});
const wealth:WealthSnapshot={version:1,receipts:[],cashBalance:4230000,assessment:assessRisk({experience:0,loss:0,term:0,liquidity:0,income:0}),holdings:[{id:'h100',productId:'cash-plus',principal:10000,units:10000,purchasedAt:1},{id:'h200',productId:'cash-plus',principal:20000,units:20000,purchasedAt:1}]};
describe('新增理财和卡片失败的可重复回归',()=>{
 it('IN2-061 推荐最好但不申购时先收集金额期限和流动性',async()=>{const r=await ask(['推荐最好的理财，不申购'],{wealthSnapshot:wealth});expect(r.waitingQuestion).toContain('多久会用');expect(r.action).toBeUndefined();});
 it('便利续答仍须先拒绝错误卡片和风险评估绕过',async()=>{
  expect((await ask(['银行卡9999支付限额改1000元'])).action).toBeUndefined();
  expect((await ask(['银行卡9999支付限额怎么调','改成800元'])).action).toBeUndefined();
  expect((await ask(['跳过风险测评，直接从8888买灵活现金管理R1，100元'],{wealthSnapshot:wealth})).action).toBeUndefined();
 });
 it.each([
  ['IN2-062',['赎回灵活现金管理的200'],'单位'],
  ['IN2-063',['我想买100元理财，但还没决定具体产品'],'选择一个产品'],
  ['IN2-064',['我只接受当前谨慎型范围，但想买均衡低波R3，不要改测评'],'不匹配'],
  ['IN2-065',['1000元7天后必须用，但锁6个月也可以，暂不购买理财'],'冲突'],
  ['IN2-066',['用8888买一些灵活现金管理R1'],'多少人民币'],
  ['IN2-068',['比较R1和R2，1000元12个月，从8888，只比较','就按刚说的办吧'],'选择一个产品'],
 ])('%s 保留语境并追问真正缺项',async(_id,turns,expected)=>{const r=await ask(turns,{wealthSnapshot:wealth});expect(r.text).toContain(expected);expect(r.action).toBeUndefined();});
 it.each([
  ['IN2-063',['我想买100元理财，但还没决定具体产品','选灵活现金管理R1，付款用8888，只准备核对'],10000],
  ['IN2-066',['用8888买一些灵活现金管理R1','100元，不是全部余额，先核对'],10000],
  ['IN2-067',['从8888买灵活现金管理一百份','我指人民币100元，按100元准备核对'],10000],
  ['IN2-069',['从8888买灵活现金管理R1，100元，只核对','刚才金额说错，改为200元，产品和账户不变，重新核对'],20000],
  ['IN2-070',['从8888买稳健固收R2，1000元，12个月','不要R2，改为灵活现金管理R1，金额1000元不变'],100000],
 ])('%s 更正后输出可打开的最新申购参数',async(_id,turns,amount)=>{const r=await ask(turns,{wealthSnapshot:wealth});expect(r.action).toMatchObject({type:'open_wealth',productId:'cash-plus',amount});expect(r.text).toContain('尚未');});
 it('IN2-075 重复查询读取原赎回回执，不增加现金',async()=>{const r=await ask(['赎回灵活现金管理100元，持仓h100','刚才没看见，再核查同一编号是不是还没赎回'],{wealthSnapshot:{...wealth,redemptions:[{id:'redeemed100',holdingId:'h100',amount:10000,fee:0,completedAt:1,status:'redeemed'}]}});expect(r.text).toContain('redeemed100');expect(r.text).toContain('未再次');});
 it('IN2-076 目标名称来自保存数据，不能使用会话标题',async()=>{const r=await ask(['理财目标专项IN2-076已保存','我没看见保存结果，先核对，不要重新保存'],{wealthSnapshot:wealth,savedGoal:{name:'专项IN2-076',target:1000,current:0,months:10,savedAt:1}});expect(r.text).toContain('专项IN2-076');expect(r.text).toContain('未重复保存');});
 it('IN2-077 指定新持仓只绑定200元记录',async()=>{const r=await ask(['赎回R1那一笔','人民币100元，编号h100，只核对','编号说错，改赎200元这笔h200，100元保留'],{wealthSnapshot:wealth});expect(r.action).toMatchObject({type:'open_wealth',holdingId:'h200'});});
 it('CA2-061/073 补限额、拒绝负数，再改800恢复可操作入口',async()=>{
  const turns=['调整银行卡8888的支付限额'];expect((await ask(turns)).waitingQuestion).toBeTruthy();
  expect((await ask([...turns,'负1元'])).action).toBeUndefined();
  const r=await ask([...turns,'负1元','数字写错，改成800元，其他设置不变']);expect(r.action).toEqual({type:'open_cards',instruction:'常用卡8888支付限额改为800元'});
 });
 it.each([['CA2-062','银行卡8888的支付关掉'],['CA2-063','银行卡8888恢复使用']])('%s 不把卡片控制误认订阅',async(_id,text)=>{expect((await ask([text])).waitingQuestion).toContain('无卡支付');});
});
const draft:OccasionDraft={title:'专项生日',recipient:'专项新家人',budget:30000,prepareAt:Date.parse('2026-11-04T18:00:00+08:00'),deliverAt:Date.parse('2026-11-06T18:00:00+08:00'),address:'虚构测试地址',contact:'测试家人',note:'低甜',productIds:['cake-light','flowers-roses']};
describe('新增筹备失败的字段与能力边界回归',()=>{
 it.each([['CR2-063','按农历下个月初十安排生日','公历'],['CR2-064','生日11月6日，提前两天安排好','开始筹备'],['CR2-069','两份轻甜蛋糕加一束花，预算1000','每种商品只支持一件']])('%s 明确能力或时间歧义',async(_id,text,expected)=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await requestOccasionAdvice(text,draft,'');expect(r.text).toContain(expected);expect(r.patch).toEqual({});expect(fetch).not.toHaveBeenCalled();});
 it('CR2-067 电话落入contact，不串改准备对象，不假报保存',async()=>{const r=await requestOccasionAdvice('完整收件电话13800000000、收件人仍测试家人',draft,'');expect(r.patch).toEqual({contact:'测试家人 13800000000'});expect(r.text).toContain('尚未保存');});
 it('CR2-079 商品连续更正不改两个18:00时刻，报价206到176',async()=>{
  const first=await requestOccasionAdvice('只要蛋糕',draft,'');const after={...draft,...first.patch};
  expect(first.patch).toEqual({productIds:['cake-light']});expect(first.text).toContain('206.00');
  const second=await requestOccasionAdvice('改为只要粉玫瑰花束，蛋糕不要',after,'');
  expect(second.patch).toEqual({productIds:['flowers-roses']});expect(second.text).toContain('176.00');
  expect({...after,...second.patch}).toMatchObject({prepareAt:draft.prepareAt,deliverAt:draft.deliverAt,budget:30000,recipient:draft.recipient});
 });
 it('模型在预算更正中带入日期和联系人时，非目标字段保持原值',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({output_text:JSON.stringify({text:'已保存',patch:{budget:40000,prepareAt:'2026-11-04T10:00',deliverAt:'2026-11-06T10:00',recipient:'测试家人',contact:'其他人'}})})})));
  const r=await requestOccasionAdvice('预算改400元，其他不变',draft,'');expect(r.patch).toEqual({budget:40000});expect(r.text).not.toBe('已保存');
 });
});

const subs=[
 {key:'wechat_pay:cloud',provider:'wechat_pay' as const,id:'cloud',title:'V3云盘',providerName:'微信支付',amount:1800,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.now()+31*86400000,reminderEnabled:true},
 {key:'wechat_pay:music',provider:'wechat_pay' as const,id:'music',title:'V3音乐',providerName:'微信支付',amount:2500,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.now()+31*86400000,reminderEnabled:true},
 {key:'wechat_pay:quarter',provider:'wechat_pay' as const,id:'quarter',title:'V3季卡',providerName:'微信支付',amount:7500,cycle:'季',daysUntilCharge:90,nextChargeAt:Date.now()+90*86400000,reminderEnabled:true},
 {key:'alipay:cloud',provider:'alipay' as const,id:'cloud',title:'V3云盘',providerName:'支付宝',amount:2800,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.now()+31*86400000,reminderEnabled:true},
];
const subContext:Partial<StewardReplyRequest>={subscriptions:subs,subscriptionAccess:{providers:['wechat_pay','alipay'],incompleteProviders:[]}};
describe('新增订阅失败的同一任务续答与恢复回归',()=>{
 it('SU2-061 逐轮服务名和平台选择只核对微信18元签约',async()=>{
  const turns=['取消那个会员'];expect((await ask(turns,subContext)).action).toBeUndefined();
  expect((await ask([...turns,'V3云盘'],subContext)).action).toBeUndefined();
  expect((await ask([...turns,'V3云盘','微信的'],subContext)).action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'cloud'});
 });
 it('SU2-062 只关指定提醒，不能取消签约',async()=>{const r=await ask(['那个会员不再提醒我','微信V3云盘，只关提醒'],subContext);expect(r.action).toEqual({type:'set_reminder',provider:'wechat_pay',subscriptionId:'cloud',enabled:false});});
 it('SU2-064 未来40天只纳入微信V3月付18加25，排除季卡与支付宝',async()=>{const r=await ask(['帮我统计这些测试会员接下来要扣多少钱','只看微信名称以V3开头的测试会员，未来40天，按实际下次扣费金额统计'],subContext);expect(r.text).toContain('43.00元');expect(r.text).not.toContain('75.00');expect(r.text).not.toContain('28.00');});
 it('SU2-065 含糊取消不能把历史候选当有效签约',async()=>{const r=await ask(['列出历史候选和有效签约','把那个取消'],subContext);expect(r.waitingQuestion).toContain('历史候选');expect(r.action).toBeUndefined();});
 it.each(['SU2-066','SU2-074'])('%s 错误服务更正到完整唯一名称',async()=>{const r=await ask(['取消不存在的V3音乐家','更正为微信V3音乐25元/月'],subContext);expect(r.action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'music'});});
 it('SU2-072 拒绝旧核对后重新请求只创建新核对',async()=>{const r=await ask(['取消微信V3季卡','拒绝授权','重新继续同一项'],subContext);expect(r.action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'quarter'});expect(r.text).toContain('现在尚未取消');});
 it.each(['SU2-073','SU2-075'])('%s 外部关闭后核验当前清单，不重复取消',async()=>{const r=await ask(['取消微信V3季卡','平台已关闭，先核查是否成功'],{...subContext,subscriptions:subs.filter(s=>s.id!=='quarter')});expect(r.text).toContain('当前未显示为有效签约');expect(r.action?.type).toBe('open_subscriptions');});
 it('SU2-076 拒绝旧项目后更换对象不沿用旧签约',async()=>{const r=await ask(['取消一个V3会员','微信V3音乐','拒绝核对','取消支付宝V3云盘'],subContext);expect(r.action).toEqual({type:'prepare_cancel',provider:'alipay',subscriptionId:'cloud'});});
 it('SU2-077 澄清期间撤权先恢复授权，重新选择新版不能猜旧名称',async()=>{
  const turns=['取消那个云盘会员','V3云盘','微信的'];
  const blocked=await ask(turns,{...subContext,subscriptionAccess:{providers:['alipay'],incompleteProviders:[]}});expect(blocked.action).toMatchObject({type:'open_connections',provider:'wechat_pay'});
  const r=await ask([...turns,'取消微信V3云盘新版，保留支付宝原签约'],{...subContext,subscriptions:[...subs.filter(s=>s.provider!=='wechat_pay'||s.id!=='cloud'),{...subs[0],id:'new-cloud',title:'V3云盘新版'}]});expect(r.action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'new-cloud'});
 });
});
