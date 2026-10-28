import {afterEach,describe,it,expect,vi} from 'vitest';
import {requestStewardReplyWithModel,isBankRequest,isWealthQuestion,type StewardReplyRequest,type StewardChatMessage} from './steward-chat';
import {routeWorkspacePrompt} from './workspace-service';
import {parseCardIntent} from './card-intent';
import {buildBillAnalysis} from './bill-analysis';
import {advanceTaskProgress,billTaskQuestion} from './task-progress';
import {requestOccasionAdvice,type OccasionDraft} from './occasion-plans';
import {assessRisk,type WealthSnapshot} from './wealth-operation';
import type {Workspace} from './workspaces';
import type {ConnectedFinancialSource} from './financial-connections';

const noModel=async()=>{throw Error('明确字段或状态查询不应交给模型猜测');};
const bank={revision:1,balance:4208999,limit:50000,frozen:false,controls:{overseas:true,contactless:true,night:true},transactions:[]};
const messages=(turns:string[]):StewardChatMessage[]=>turns.map(content=>({role:'user',content}));
const reply=(turns:string[],extra:Partial<StewardReplyRequest>={})=>requestStewardReplyWithModel({stewardName:'宁宁',subscriptions:[],bank,messages:messages(turns),...extra},noModel);
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('浏览器失败原句：转账和AA',()=>{
 it('TR2-084 切换话题查询总资产只读同一银行汇总，不跳到账单授权',async()=>{
  const prompt='查询我的总资产，只读查看';
  expect((await routeWorkspacePrompt(prompt,[],'','',[],{model:noModel})).parts[0].kind).toBe('general');expect(isBankRequest(messages([prompt]))).toBe(true);
  const r=await reply([prompt],{bank:{...bank,assetSummary:{cash:4208999,availableCash:4208999,reservedCash:0,wealth:30000,deposits:10000,total:4248999,holdingCount:2,depositCount:1}}});
  expect(r.text).toContain('42,489.99');expect(r.action).toBeUndefined();expect(r.text).not.toContain('授权');
 });
 it('TR2-064 泛指转钱后按原句分轮补齐，不转成查账',async()=>{
  const turns=['帮我转一笔钱','收款人是妈妈','金额10元','付款账户8888，不写备注，只核对'];
  expect((await routeWorkspacePrompt(turns[0],[],'','',[],{model:noModel})).parts[0].kind).toBe('transfer');
  for(let n=1;n<4;n++)expect((await reply(turns.slice(0,n))).action).toBeUndefined();
  expect((await reply(turns)).action).toMatchObject({type:'prepare_transfer',recipientId:'mom',amount:1000,sourceAccountId:'demo-8888'});
 });
 it.each(['TR2-071','TR2-076'])('%s 拒绝补金额或明确取消都停止旧准备',async(id)=>{
  const first=id==='TR2-071'?'从8888给妈妈转账':'从8888给妈妈转10元，不写备注';
  const stop=id==='TR2-071'?'我不想提供金额，这次先不办了':'取消刚才给妈妈的10元，不转了';
  const stopped=await reply([first,stop]);expect(stopped.text).toContain('停止准备');expect(stopped.action).toBeUndefined();
  const status=await reply([first,stop,'这笔现在是什么状态']);expect(status.text).toContain('放弃准备');expect(status.waitingQuestion).toBeUndefined();
  expect((await reply([first,stop,'现在从8888给爸爸转1元，无备注，先核对'])).action).toMatchObject({recipientId:'dad',amount:100});
 });
 it('TR2-069 识别人数字段与四人名单的冲突，更正后100元守恒',async()=>{
  const first='我们三个人AA，名单我、妈妈、爸爸、张三，总共100元，只核对';
  expect((await reply([first])).waitingQuestion).toContain('不一致');
  const r=await reply([first,'按我、妈妈、爸爸三个人，去掉张三，包含我自己']);
  expect(r.action).toMatchObject({type:'prepare_aa',amount:10000,recipientIds:['mom','dad'],includeSelf:true});expect(r.text).toContain('33.34');
 });
 it('TR2-070 只追问本人是否参加，并保留原100元',async()=>{
  const first='妈妈和爸爸这顿饭100元做AA，我要不要参与分摊还没定';
  expect((await reply([first])).waitingQuestion).toContain('本人');
  expect((await reply([first,'包含我自己，三个人均摊，说明写本轮AA核对'])).action).toMatchObject({type:'prepare_aa',amount:10000,recipientIds:['mom','dad'],includeSelf:true,title:'本轮AA核对'});
 });
 it('TR2-078 去掉爸爸重新计算两人50元，不保留负向名单',async()=>{
  const r=await reply(['银行AA100元，我、妈妈、爸爸三人，说明写本轮AA核对','这顿饭爸爸不参加，改成我和妈妈两个人均摊100元，说明不变']);
  expect(r.action).toMatchObject({type:'prepare_aa',title:'本轮AA核对',amount:10000,recipientIds:['mom'],includeSelf:true});expect(r.text).toContain('50.00');
 });
 it.each(['TR2-080','TR2-083'])('%s 误报失败只绑定当前事项真实回执，不重新付款',async()=>{
  const receipt={id:'receipt-current',workspaceId:'current',recipientId:'dad' as const,amount:100,completedAt:5,balanceAfter:4208999};
  const r=await reply(['从8888给爸爸转1元，无备注，只核对','刚才那笔没看到，先核查，不要再付'],{workspaceId:'current',bank:{...bank,transactions:[{...receipt,id:'other',workspaceId:'other',completedAt:99},receipt]}});
  expect(r.action?.type).toBe('open_transfer_records');expect(r.text).toContain('receipt-current');expect(r.text).not.toContain('回执other');
 });
 it('TR2-084 未执行预约不采用另一会话同额已取消记录',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T00:00:00+08:00'));
  const prepared=await reply(['从8888给爸爸预约转1元，2026年11月1日09:00执行，不写备注，只核对']);
  expect(prepared.action).toMatchObject({type:'prepare_transfer',recipientId:'dad',amount:100,executeAt:Date.parse('2026-11-01T09:00:00+08:00')});
  const r=await reply(['从8888给爸爸预约1元，2026年11月1日09:00，不写备注，只核对','继续刚才的预约，是什么状态'],{workspaceId:'current',bank:{...bank,schedules:[{id:'old',workspaceId:'other',recipientId:'dad',amount:100,executeAt:99,createdAt:1,status:'cancelled'}]}});
  expect(r.text).toContain('未执行核对');expect(r.text).toContain('09:00');expect(r.text).not.toContain('本轮已取消');
 });
 it('TR2-087 拒绝非法精度后改回1元恢复唯一核对入口',async()=>{
  const turns=['从8888转1元，无备注，先核对','爸爸','金额我写错了，应是1.001元'];
  expect((await routeWorkspacePrompt(turns[0],[],'','',[],{model:noModel})).parts[0].kind).toBe('transfer');
  const invalid=await reply(turns);expect(invalid.action).toBeUndefined();expect(invalid.text).toContain('两位小数');
  expect((await reply([...turns,'改回1元，还是爸爸和8888'])).action).toMatchObject({type:'prepare_transfer',amount:100,recipientId:'dad'});
 });
});

const source:ConnectedFinancialSource={provider:'alipay',displayName:'支付宝',accountMasked:'测试',scopes:['transactions'],autopays:[],syncedAt:'2026-10-28T12:00:00+08:00',transactions:[{id:'gas',title:'燃气费',amount:-3620,kind:'payment',category:'生活',occurredAt:'2026-10-25'},{id:'water',title:'水费',amount:-2350,kind:'payment',category:'生活',occurredAt:'2026-10-24'}]};
const bill=buildBillAnalysis({alipay:source},'2026年10月支付宝账单',Date.parse('2026-10-28'));
describe('浏览器失败原句：账单范围与证据',()=>{
 it('BI2-065 分类反馈不把月度范围改为目标交易日期',async()=>{
  const task:Workspace={id:'bill',kind:'bills',title:'本月账单',status:'active',updatedAt:0,memoryRevision:0,summary:'',messages:[]};
  const progress=advanceTaskProgress(task,'分析2026年10月支付宝账单');
  const next=advanceTaskProgress({...task,progress},'支付宝2026年10月25日燃气费36.20元，只改A归到生活费，重列水费23.50元');
  expect(billTaskQuestion(next)).toContain('2026年10月账单');
  const r=await reply(['分析2026年10月支付宝账单','这笔归到生活费，这次分析用','支付宝2026年10月25日燃气费36.20元，只改A归到生活费，重列水费23.50元'],{billAnalysis:bill,billFocus:{provider:'alipay',id:'gas'}});
  expect(r.text).toContain('生活费');expect(r.text).toContain('水费');expect(r.text).toContain('59.70元');expect(r.text).toContain('未持久');
 });
 it('BI2-066 两个实际平台名与只算微信冲突先澄清',async()=>{
  const prompt='分析2026年10月微信和支付宝合计，但只算微信';
  expect((await routeWorkspacePrompt(prompt,[],'','',[],{model:noModel})).parts[0].kind).toBe('bills');
  expect((await reply([prompt],{billAnalysis:bill})).waitingQuestion).toContain('范围不一致');
 });
 it('BI2-073 重连微信续查双平台，不变成单微信',()=>{
  const task:Workspace={id:'b',kind:'bills',title:'双平台账单',status:'active',updatedAt:0,memoryRevision:0,summary:'',messages:[]};
  const progress=advanceTaskProgress(task,'查询微信和支付宝2026年10月1日至23日净消费');
  const next=advanceTaskProgress({...task,progress},'微信已重连，继续刚才双平台范围，净消费口径');
  expect(next.bill?.provider).toBe('all');expect(next.bill?.period).toContain('10月1日至23日');
  const missing=buildBillAnalysis({alipay:source},billTaskQuestion(next),Date.parse('2026-10-28'));expect(missing.coverage).toContain('缺少微信支付');expect(missing.coverageIncomplete).toBe(true);
 });
 it('BI2-076 13月明确报无效而非泛问最近一个月',async()=>{expect((await reply(['查询2026年13月微信消费'],{billAnalysis:bill})).text).toContain('月份无效');});
 it('BI2-077 默认报告不代替确认，补日期后仍主动问缺少的平台',async()=>{
  expect((await reply(['帮我分析消费。'],{billAnalysis:bill})).waitingQuestion).toContain('哪段时间');
  const r=await reply(['帮我分析消费。','2026年10月1日至20日'],{billAnalysis:bill});expect(r.waitingQuestion).toContain('这次看微信支付');expect(r.action).toBeUndefined();
 });
});

const wealth:WealthSnapshot={version:1,cashBalance:4178999,receipts:[],assessment:assessRisk({experience:0,loss:0,term:0,liquidity:0,income:0}),holdings:[{id:'h100',productId:'cash-plus',principal:10000,units:10000,purchasedAt:1},{id:'h200',productId:'cash-plus',principal:20000,units:20000,purchasedAt:1}],redemptions:[{id:'old-redemption',holdingId:'old-holding',amount:20000,fee:0,completedAt:1,status:'redeemed'}]};
describe('浏览器失败原句：理财与卡片',()=>{
 it('IN2-062 补充原申购回执不是切换申购意图',async()=>{const r=await reply(['赎回灵活现金管理的200。','人民币200元，对应今天唯一的灵活现金管理R1 200元持仓；公开申购回执purchase200。全额赎回，先核对，100元那笔保留。'],{wealthSnapshot:wealth});expect(r.action).toMatchObject({type:'open_wealth',holdingId:'h200'});});
 it('IN2-064 只比较已指定R1时给可用比较，不重问购买金额',async()=>{const r=await reply(['我只接受当前谨慎型范围，但想买均衡低波R3，不要改测评','保留谨慎型，放弃R3，只比较R1，不申购'],{wealthSnapshot:wealth});expect(r.text).toContain('灵活现金管理');expect(r.text).toContain('可随时赎回');expect(r.action).toBeUndefined();});
 it('IN2-065 期限冲突澄清后保留七天、1000元与不购买',async()=>{
  const first='1000元7天后必须用，但锁6个月也可以，暂不购买';expect(isWealthQuestion(first)).toBe(true);
  expect((await reply([first],{wealthSnapshot:wealth})).waitingQuestion).toContain('冲突');
  const r=await reply([first,'以7天后必须用为准，不能锁6个月'],{wealthSnapshot:wealth});
  expect(r.text).toContain('1000.00元');expect(r.text).toContain('短期');expect(r.text).toContain('有锁定期的产品不符合');expect(r.action).toBeUndefined();expect(r.waitingQuestion).toBeUndefined();
 });
 it('IN2-074 买到了没有只读核验持仓，不转到支付账单授权',async()=>{const r=await reply(['没看到成功结果，先查刚才100元是否买到了，不要重复买'],{wealthSnapshot:wealth});expect(r.action).toEqual({type:'open_wealth'});expect(r.text).toContain('持仓');});
 it('IN2-075 提供真实赎回回执才绑定对应历史完成记录',async()=>{const r=await reply(['核查灵活现金管理是否已赎回，回执old-redemption，不要重复兑付'],{wealthSnapshot:wealth});expect(r.text).toContain('old-redemption');expect(r.action).toEqual({type:'open_wealth'});});
 it('IN2-077 先核对不等于查询无关已赎回记录，真实两持仓先消歧',async()=>{const r=await reply(['赎回R1那一笔，先核对'],{wealthSnapshot:wealth});expect(r.waitingQuestion).toContain('持仓');expect(r.text).toContain('h100');expect(r.text).toContain('h200');expect(r.text).not.toContain('old-redemption');});
 it('CA2-062 我的卡/这张卡读取银行状态并询问单一范围',async()=>{expect(isBankRequest(messages(['帮我把这张卡的支付关掉。']))).toBe(true);expect((await reply(['帮我把这张卡的支付关掉。'])).waitingQuestion).toContain('无卡支付');});
 it('CA2-063 恢复无卡不误解为整卡解挂，也不被不改限额截走',async()=>{const text='我说的是恢复无卡支付，境外不要开，也不要改限额';expect(parseCardIntent(text)).toEqual({kind:'control',key:'contactless',enabled:true});expect((await reply(['我的卡要恢复使用，帮我恢复一下',text])).action).toEqual({type:'open_cards',instruction:text});});
 it('CA2-064 正确500加300且带800进入独立确认',async()=>{expect((await reply(['把单笔限额提高一些','在你刚查到的当前限额上加300元'])).action).toEqual({type:'open_cards',instruction:'常用卡8888支付限额改为800元'});});
 it('CA2-065 随便定不猜5000，继续要求本人明确金额',async()=>{const r=await reply(['把支付限额改一下','随便你定，直接办']);expect(r.waitingQuestion).toContain('多少元');expect(r.action).toBeUndefined();});
 it('卡片和理财原句路由不依赖分类器或切入账单',async()=>{for(const text of ['我的卡要恢复使用，帮我恢复一下','把单笔限额提高一些','1000元7天后必须用，但锁6个月也可以，暂不购买'])expect((await routeWorkspacePrompt(text,[],'','',[],{model:noModel})).parts[0].kind).toBe('general');});
});

const subs=[{key:'wechat_pay:c',provider:'wechat_pay' as const,id:'wc-cloud',title:'V3云盘',providerName:'微信支付',amount:1800,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.parse('2026-11-28'),reminderEnabled:true},{key:'alipay:c',provider:'alipay' as const,id:'ali-cloud',title:'V3云盘',providerName:'支付宝',amount:2800,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.parse('2026-11-28'),reminderEnabled:true},{key:'wechat_pay:m',provider:'wechat_pay' as const,id:'music',title:'V3音乐',providerName:'微信支付',amount:2500,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.parse('2026-11-28'),reminderEnabled:true},{key:'alipay:v',provider:'alipay' as const,id:'video',title:'V3视频乙',providerName:'支付宝',amount:2500,cycle:'月',daysUntilCharge:31,nextChargeAt:Date.parse('2026-11-28'),reminderEnabled:true}];
const subContext={subscriptions:subs,subscriptionAccess:{providers:['wechat_pay','alipay'] as ('wechat_pay'|'alipay')[],incompleteProviders:[]}};
describe('浏览器失败原句：订阅更正和状态变化',()=>{
 it('SU2-061 名称后只补微信的平台短答案保留云盘目标',async()=>{expect((await reply(['取消那个会员','V3云盘','微信的'],subContext)).action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'wc-cloud'});});
 it('SU2-063 明确比较的两个同价项目先问选择，不重问签约或候选',async()=>{const r=await reply(['比较微信V3音乐和支付宝V3视频乙并把这两个里面贵的那个取消'],subContext);expect(r.text).toContain('价格相同');expect(r.text).toContain('取消支付宝V3视频乙');expect(r.action).toBeUndefined();});
 it.each(['SU2-066','SU2-074'])('%s 自然纠正前缀不被当作服务名',async()=>{expect((await reply(['取消微信V3音乐家自动续费','名称记错了，是你列表中的微信V3音乐25元/月'],subContext)).action).toEqual({type:'prepare_cancel',provider:'wechat_pay',subscriptionId:'music'});});
 it('SU2-067 查询扣费日期和金额优先于其他都保留',async()=>{const r=await reply(['帮我处理一下微信V3音乐这个订阅','我只是想知道下一次什么时候扣、扣多少，其他都保留'],subContext);expect(r.text).toContain('2026-11-28');expect(r.text).toContain('25.00');expect(r.action?.type).toBe('open_subscriptions');});
 it('SU2-073 首句查询外部季卡取消状态也返回清单事实',async()=>{const r=await reply(['微信V3季卡刚才可能没取消成功，先查这项状态，不要重复操作'],subContext);expect(r.text).toContain('当前未显示为有效签约');expect(r.action?.type).toBe('open_subscriptions');});
 it('SU2-075 仅微信目标外部已关闭时不被支付宝同名掩盖',async()=>{const r=await reply(['取消微信的V3云盘自动续费','继续刚才的操作'],{...subContext,subscriptions:subs.filter(s=>s.id!=='wc-cloud')});expect(r.text).toContain('当前未显示为有效签约');expect(r.action?.type).toBe('open_subscriptions');});
 it.each(['SU2-076','SU2-077'])('%s 泛指V3会员或云盘先产生候选澄清',async(id)=>{const r=await reply([id==='SU2-076'?'取消一个V3会员':'取消那个云盘会员'],subContext);expect(r.waitingQuestion).toContain('服务');expect(r.action).toBeUndefined();});
});

const draft:OccasionDraft={title:'专项CR2-066',recipient:'测试家人',budget:100000,prepareAt:Date.parse('2026-11-04T18:00:00+08:00'),deliverAt:Date.parse('2026-11-06T18:00:00+08:00'),address:'上海市测试区沙箱路1号101室',contact:'测试家人 13800000000',note:'',productIds:['cake-light','flowers-roses']};
describe('浏览器失败原句：筹备合并',()=>{
 it('CR2-063 明确公历送达先落字段，随后只补筹备不覆盖送达',async()=>{const a=await requestOccasionAdvice('我已核对，使用公历2026年11月11日18点送达',{...draft,prepareAt:0,deliverAt:0},'');expect(a.patch?.deliverAt).toBe(Date.parse('2026-11-11T18:00:00+08:00'));const b=await requestOccasionAdvice('筹备2026年11月9日18:00，其他已确认时间不变',{...draft,...a.patch,prepareAt:0},'');expect(b.patch?.prepareAt).toBe(Date.parse('2026-11-09T18:00:00+08:00'));expect(b.patch?.deliverAt).toBeUndefined();});
 it('CR2-065 完整请求先落准备对象，替代蛋糕不抹掉已有对象和时间',async()=>{const a=await requestOccasionAdvice('帮我安排测试家人生日，安排名专项CR2-065。预算380元，2026年11月4日18:00开始筹备，11月6日18:00送达，收件人测试家人13800000000，地址上海市测试区沙箱路1号101室。',{...draft,recipient:''},'');expect(a.patch?.recipient).toBe('测试家人');const b=await requestOccasionAdvice('预算不加，仍380元，只保留一份轻甜鲜果蛋糕，花束不要',{...draft,...a.patch},'');expect(b.patch).toMatchObject({productIds:['cake-light'],budget:38000});expect(b.patch?.recipient).toBeUndefined();});
 it('CR2-070 选择存量方案续用澄清前900预算，不受另一个计划影响',async()=>{const r=await requestOccasionAdvice('专项CR2-066，071不要动',draft,'',[{role:'user',content:'我已有专项CR2-071预算1000和专项CR2-066预算1000，把那个生日计划预算改900元'},{role:'assistant',content:'选择哪份计划？'}]);expect(r.patch).toEqual({budget:90000});expect(r.text).toContain('尚未保存');});
});
