/** Review guidance only. These entries never authorize, submit, or execute business actions. */
export type JudgePage = 'home'|'assets'|'spending'|'plan'|'risk'|'cards'|'connections'|'tasks'|'aa-history'|'merchant'|'subscriptions'|'automations';
export type JudgeTarget = {app:'zhiyin';page:JudgePage;prompt?:string;appearance?:'standard'|'elder'} | {app:'wechat';route:string};
export type JudgeStep = {title:string;instruction:string;expected:string;target:JudgeTarget;example?:string};
export type JudgeScenario = {id:string;group:string;title:string;summary:string;model:boolean;prepare?:string;steps:JudgeStep[]};
const page=(page:JudgePage):JudgeTarget=>({app:'zhiyin',page});
const chat=(prompt:string):JudgeTarget=>({app:'zhiyin',page:'home',prompt});
const wechat:JudgeTarget={app:'wechat',route:'/chat/zhiyin_ningning'};
export const judgeScenarios:JudgeScenario[]=[
  {id:'overview',group:'快速浏览',title:'资产总览与银行卡钱包',summary:'先看账户，再打开可切换的银行卡钱包。',model:false,steps:[
    {title:'查看资产',instruction:'打开资产页，查看余额和资产构成，可点选明细。',expected:'展示当前账本中的真实沙箱余额和资产分类。',target:page('assets')},
    {title:'查看银行卡钱包',instruction:'点击不同银行卡，查看尾号、余额与卡片状态。',expected:'不同卡片分别展示自己的余额和操作入口。',target:page('cards')},
  ]},
  {id:'transfer',group:'六大功能',title:'给妈妈转账，先核对再办理',summary:'体验自然语言生成转账方案与独立授权。',model:true,steps:[
    {title:'准备转账方案',instruction:'发送示例问题，按追问核对收款人和付款卡。',expected:'出现 100 元转账方案；付款前需确认，不能仅凭对话声称转账完成。',target:chat('现在给妈妈转账100元，先给我核对一下。')},
    {title:'查看办理后的账户',instruction:'如果上一阶段已确认办理，查看资产与对应银行卡记录。未确认时余额应保持原状。',expected:'记录与实际授权结果一致，不因打开本场景而自动扣款。',target:page('assets')},
  ]},
  {id:'transfer-risk',group:'六大功能',title:'大额与疑似重复转账',summary:'观察风险提示，并核对重复付款的识别范围。',model:true,steps:[
    {title:'大额核对',instruction:'发送示例，观察单笔达到 5,000 元时的提示。可停留在核对阶段。',expected:'出现大额风险核对，余额、限额或夜间保护等实际约束仍有效。',target:chat('给妈妈转账5000元，作为生活费。')},
    {title:'检查疑似重复',instruction:'仅当上一步确实成功后，在 10 分钟内发送同一事项、收款人和金额。未执行的草稿不等于成功转账。',expected:'相同或近似金额触发疑似重复提醒，要求重新核对；不会因本按钮直接再付款。',target:chat('再给妈妈转账5000元，还是刚才那笔生活费。')},
  ]},
  {id:'scheduled',group:'六大功能',title:'预约转账与任务日程',summary:'把未来付款变成可回看的预约事项。',model:true,steps:[
    {title:'提出预约',instruction:'发送示例并核对具体日期、时间与付款卡，按界面确认预约。',expected:'保存预约任务；尚未到期时不应显示已经付款。',target:chat('明天中午12点给妈妈转账100元。')},
    {title:'在日程中查看',instruction:'在日历中选择预约日期，打开对应任务。',expected:'显示上一阶段实际保存的预约及状态；未确认的预约不应伪装成已执行。',target:page('tasks')},
  ]},
  {id:'bills',group:'六大功能',title:'跨平台账单分析',summary:'先选授权范围，再看来源、去重与收支解释。',model:true,steps:[
    {title:'连接账单来源',instruction:'按界面授权微信或支付宝账单读取，也可只体验已有银行卡数据。',expected:'明确展示读取范围，需要用户授权；打开入口不会自动给予权限。',target:page('connections')},
    {title:'查看账单组件',instruction:'查看已有收支、分类与交易明细。无对应月份数据时选择有记录的月份。',expected:'组件展示实际来源数据，空数据和未授权状态可区分。',target:page('spending')},
    {title:'让宁宁分析',instruction:'发送示例，按追问选定账期；必要时补充「分析有账单的最近一个月」。',expected:'回答中的金额与明细相符，跨渠道同笔支付不重复累计；异常判断应有依据。',target:chat('帮我分析已授权来源中最近一个有账单的月份，看看主要支出和需要注意的扣费。')},
  ]},
  {id:'wealth',group:'六大功能',title:'风险测评与理财建议',summary:'从偏好、产品目录和资金需求形成方案。',model:true,steps:[
    {title:'查看产品与测评入口',instruction:'浏览财富页的产品、基金筛选及风险测评；需要时先完成问卷。',expected:'展示产品信息与风险要求，在线行情不可用时不应编造实时数据。',target:page('risk')},
    {title:'提出资金需求',instruction:'发送示例，结合实际风险测评继续选择。购买仍须独立核对。',expected:'说明金额、期限和风险匹配，给出依据；不会保证收益或自动买入。',target:chat('我想安排3000元，预计持有6个月，偏稳健，请结合我的风险测评和现有产品给一个方案。')},
  ]},
  {id:'cards',group:'六大功能',title:'银行卡管理与保护设置',summary:'直接进入卡包，体验每张卡的独立管理。',model:false,steps:[
    {title:'打开卡片管理',instruction:'选择一张银行卡，查看限额、挂失、境外或无卡支付及夜间保护入口。',expected:'设置属于当前卡片，资金相关变更有核对步骤。仅打开页面不改变卡控。',target:page('cards')},
  ]},
  {id:'subscriptions',group:'六大功能',title:'跨平台订阅与续费提醒',summary:'查看真实签约，再核对周期扣费线索。',model:true,prepare:'如需稳定的测试样例，进入「财务测试」，选择「临近续费提醒」或「账单中的疑似订阅」，先查看影响再确认准备。',steps:[
    {title:'授权订阅来源',instruction:'在连接设置中选择需要读取的订阅来源与范围，并在平台端确认。',expected:'未授权来源不会被静默读取；可自行选择微信或支付宝。',target:page('connections')},
    {title:'查看订阅中心',instruction:'查看签约、临近续费和潜在周期扣费；可先在财务测试中准备样例。',expected:'已签约项目与疑似周期扣费分开展示，取消前仍需确认。',target:page('subscriptions')},
    {title:'询问扣费安排',instruction:'发送示例，核对来源、日期和金额。',expected:'结合已授权数据解释续费，不将支付宝余额直接视作微信零钱。',target:chat('帮我看看最近有哪些订阅要扣费，账单里有没有疑似自动续费？')},
  ]},
  {id:'wechat',group:'跨场景',title:'在微信里找宁宁',summary:'直接打开沙箱微信中的宁宁联系人。',model:true,steps:[
    {title:'打开宁宁联系人',instruction:'在微信输入下方示例并发送；本入口只打开聊天。可点「复制示例」后粘贴。',expected:'宁宁以微信文字回应；办理需求可交给知银继续，不能在微信回复里伪称已经付款。',target:wechat,example:'我想明天给妈妈转100元，需要准备什么？'},
  ]},
  {id:'share',group:'跨场景',title:'选中微信消息，交给知银',summary:'把明确选择的消息带回同一办理现场。',model:true,steps:[
    {title:'选择要分享的消息',instruction:'打开宁宁聊天，发送示例，点击「交给知银继续」并选择相关文字消息。',expected:'只分享你勾选的消息，回到知银后可查看来源并继续核对。',target:wechat,example:'周末和朋友聚餐，晚饭220元，饮料20元，想记下来最后AA。'},
    {title:'回到知银继续',instruction:'完成分享后进入知银，按已收到的消息继续办理；未分享时先完成上一步。',expected:'使用实际选中的消息准备方案；仍需确认群成员及资金操作，不读取整段未授权聊天。',target:page('home')},
  ]},
  {id:'aa',group:'跨场景',title:'AA 分摊与历史账本',summary:'检验总额、个人消费和不同份额的处理。',model:true,steps:[
    {title:'开启聚餐账本',instruction:'发送示例，选择实际微信群并核对参与人，按界面完成群授权。',expected:'建立这次聚餐的关联事项；群成员来自授权选择，不凭空补人。',target:chat('帮我记录这次聚餐的AA费用，结束后在微信群收款。')},
    {title:'个人消费从总额中拆出',instruction:'在同一聚餐里发送示例。',expected:'这笔总共20元；可乐4元由我承担，啤酒16元平分，不能累计成40元。',target:chat('饮料总共20元，其中我自己买了4元可乐，剩下4瓶啤酒共16元，大家平分。')},
    {title:'核对半份分摊',instruction:'仅在已选群确有你、小王和李娜三人时发送；否则将名字改为实际成员。',expected:'在这三个参与人、只算本笔的情况下：我88元、小王88元、李娜44元，总计220元。',target:chat('这一笔夜宵220元，我和小王各一份，李娜半份。')},
    {title:'查看历史 AA',instruction:'打开本次账本明细，核对消费项目、成员分摊与结算状态，再按需发起微信群收款。',expected:'回看实际保存的记录；未收齐时不会显示已全部收款。',target:page('aa-history')},
  ]},
  {id:'memory',group:'扩展能力',title:'任务分流、偏好与日程',summary:'换话题再回来，观察任务和记忆边界。',model:true,steps:[
    {title:'保存明确偏好',instruction:'发送示例，观察宁宁如何处理用户明确要求记住的偏好。',expected:'保留可持续使用的偏好，后续建议可引用，用户可在记忆设置中查看或更正。',target:chat('请记住，我偏好稳健的资金安排，平时的解释尽量简短。')},
    {title:'创建日期提醒',instruction:'发送示例并核对日期与提醒时间；日期事件应进入日程。',expected:'日期提醒成为可查看的任务，不只是笼统写入长期偏好。',target:chat('明天下午3点提醒我给王芳准备生日礼物。')},
    {title:'换话题后查看日程',instruction:'可先到资产或卡片页，再打开日程中刚才的事项。',expected:'实际保存的提醒仍可恢复查看，不因切换页面丢失。',target:page('tasks')},
  ]},
  {id:'elder',group:'扩展能力',title:'长辈模式与大字对话',summary:'一键切换，查看首页和业务组件适配。',model:false,steps:[
    {title:'进入长辈版',instruction:'查看大字首页和常用服务，再点「和宁宁聊聊」。文字办理仍需配置模型。',expected:'字号、点击区域和业务入口适配长辈；银行卡状态沿用当前真实沙箱数据。',target:{app:'zhiyin',page:'home',appearance:'elder'}},
    {title:'回到普通版',instruction:'恢复普通版首页，继续体验其他场景。',expected:'切换样式保留现有业务与聊天记录。',target:{app:'zhiyin',page:'home',appearance:'standard'}},
  ]},
  {id:'merchant',group:'扩展能力',title:'小店点餐与菜品收入',summary:'从菜单、订单一路看到菜品销售统计。',model:false,steps:[
    {title:'进入小店',instruction:'已有店铺直接查看；首次输入一个店名并点击「开通我的小店」，会生成可编辑基础菜单。',expected:'展示真实店铺或开店引导，不用虚构营业额填充空店。',target:page('merchant')},
    {title:'体验菜单与点餐',instruction:'打开小店「菜单」，核对价格，使用点餐页入口或二维码创建订单；只需打开本机点餐页，无需真实手机联网扫码。',expected:'订单包含所选菜品和准确合计；创建订单不等于已收款。',target:page('merchant')},
    {title:'观察经营统计',instruction:'在订单中按实际沙箱流程记录收款，再查看概览的菜品销量与收入。',expected:'统计随实际订单状态变化，待付款订单不冒充实收收入。',target:page('merchant')},
  ]},
  {id:'merchant-funding',group:'扩展能力',title:'小店资金安排',summary:'把进货与固定支出整理成可核对的计划。',model:true,steps:[
    {title:'查看资金安排',instruction:'先开通小店，再点「资金安排」，查看支出项目与已有计划。',expected:'区分资金计划、预留与实际支付，展示真实可用资金。',target:page('merchant')},
    {title:'让宁宁整理支出',instruction:'发送示例，并按追问补充实际店铺情况。',expected:'形成可编辑的安排与资金缺口解释；计划不会自动转账或支付。',target:chat('帮我的小店安排资金：明天进货800元，下周交房租2000元，先给我核对计划。')},
  ]},
];
export function findJudgeStep(id:string,index:number){
  if(!Number.isInteger(index)||index<0)return undefined;
  return judgeScenarios.find(s=>s.id===id)?.steps[index];
}
export function parseJudgeRequest(value:unknown){
  if(!value||typeof value!=='object')return null;
  const r=value as Record<string,unknown>;
  if(r.channel!=='zhiyin-review'||r.version!==1||r.type!=='open'||typeof r.requestId!=='string'||!r.requestId||r.requestId.length>128||typeof r.scenarioId!=='string'||typeof r.stepIndex!=='number')return null;
  const step=findJudgeStep(r.scenarioId,r.stepIndex);
  return step?{requestId:r.requestId,scenarioId:r.scenarioId,stepIndex:r.stepIndex,step}:null;
}
export type JudgeNote={status:'observed'|'issue';at:number};
export type JudgeNotes=Record<string,JudgeNote>;
export function readJudgeNotes(raw:string|null):JudgeNotes{
  try{
    const value:unknown=JSON.parse(raw||'null');
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const result:JudgeNotes={};
    for(const s of judgeScenarios){const note=(value as Record<string,JudgeNote>)[s.id];if(note&&['observed','issue'].includes(note.status)&&Number.isFinite(note.at)&&note.at>=0)result[s.id]={status:note.status,at:note.at};}
    return result;
  }catch{return {};}
}
export function updateJudgeNote(notes:JudgeNotes,id:string,status:JudgeNote['status'],at:number):JudgeNotes{
  if(!judgeScenarios.some(s=>s.id===id)||!['observed','issue'].includes(status)||!Number.isFinite(at)||at<0)throw new Error('体验标记无效');
  return {...notes,[id]:{status,at}};
}
export function formatJudgeReport(notes:JudgeNotes){
  return ['# 知银评委体验记录','','本表为人工观察标记，不是自动测试结果，也不表示所有外部服务均验证通过。未标记的场景为未验证。','','| 场景 | 人工观察 | 标记时间（北京时间） |','| --- | --- | --- |',...judgeScenarios.map(s=>{const n=notes[s.id];return `| ${s.title} | ${n?(n.status==='observed'?'符合预期':'需要排查'):'未验证'} | ${n?new Date(n.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'} |`;})].join('\n')+'\n';
}
