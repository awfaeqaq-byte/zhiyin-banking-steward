import {fundingReply,isFundingPrompt,validFundingDraft,type FundingDraft} from './merchant-funding';
import {merchantSummary,type MerchantPeriod,type MerchantState,type MerchantSummary} from './merchant';
export type MerchantInsight={shopName:string;summary:MerchantSummary;funding?:FundingDraft};
export function validMerchantInsight(value:unknown):value is MerchantInsight{
 const v=value as MerchantInsight,s=v?.summary;
 return !!v&&(v.funding===undefined||validFundingDraft(v.funding))&&typeof v.shopName==='string'&&v.shopName.length<=80&&!!s&&['today','week','all'].includes(s.period)&&Number.isSafeInteger(s.from)&&Number.isSafeInteger(s.to)&&s.from<=s.to&&['orderCount','pendingTotal','collectedTotal','refundedTotal','expenseTotal'].every(key=>Number.isSafeInteger(s[key as keyof MerchantSummary])&&(s[key as keyof MerchantSummary] as number)>=0)&&Number.isSafeInteger(s.netCollected)&&Number.isSafeInteger(s.cashDifference)&&s.netCollected===s.collectedTotal-s.refundedTotal&&s.cashDifference===s.netCollected-s.expenseTotal&&Array.isArray(s.dishes)&&s.dishes.length<=100&&s.dishes.every(d=>d&&typeof d.id==='string'&&typeof d.name==='string'&&d.name.length<=80&&Number.isSafeInteger(d.quantity)&&d.quantity>=0&&Number.isSafeInteger(d.amount)&&d.amount>=0);
}
/** Explicit owner questions only; personal spending and compound payment requests retain normal routing. */
export function isMerchantPrompt(prompt:string,inMerchantContext=false):boolean{
 if(/\[微信分享|ZHIYIN_WECHAT_SHARE|AA|aa|均摊|平摊|转账|汇款|银行卡|基金|理财|订阅|提醒我/.test(prompt))return false;
 const owner=/帮我分析小店经营|我的小店|我(?:的)?店(?:里|铺)?|我们店|经营(?:账本|账目|支出|收入|分析)|小店.{0,18}(?:收入|营业|菜品|利润|赚|账|进货|实收)|菜品.{0,12}(?:销量|收入|排行|贡献)|什么(?:菜)?卖得好|哪(?:道|个|些)菜.{0,10}(?:卖|收入)|生成.{0,5}点餐码/.test(prompt);
 return owner||/(?:小店|店里|经营)/.test(prompt)&&isFundingPrompt(prompt)||inMerchantContext&&isFundingPrompt(prompt)||inMerchantContext&&/^(?:那|再|看看|看一下|帮我看|帮我看看)?(?:今天|今日|近7天|最近7天|近七天|全部|支出|收入|菜品|销量|账本|经营支出|订单|点餐码)(?:的)?(?:呢|情况|收入|支出|销量|排行|分析|怎么样|多少|什么卖得好)?[？?。！!\s]*$/.test(prompt.trim());
}
const money=(value:number)=>`¥${(value/100).toFixed(2)}`;
export function merchantAnswer(state:MerchantState,prompt:string,now=Date.now(),previous?:FundingDraft):{text:string;merchantUI?:MerchantInsight;action:{type:'open_merchant'}}{
 const action={type:'open_merchant' as const};
 if(!state.shop)return {text:'先创建你的小店、核对菜单与价格，再把点餐码给顾客。之后我就能根据订单和你确认的收付款分析经营情况。',action};
 const funding=fundingReply(state,prompt,now,previous);
 if(funding)return {text:funding.text,merchantUI:{shopName:state.shop.name,summary:merchantSummary(state,'all',now),funding:funding.draft},action};
 if(/记一|记下|记笔|记账|添加|新增|修改|删除|记录.{0,8}(?:支出|收款|退款|付款)|收款了|收到钱|退了|取消订单|确认.{0,5}(?:收款|退款|付款)/.test(prompt)&&!/实收|收款多少|已收款|退款多少/.test(prompt))return {text:'这次还没有修改账目。经营支出请在“我的小店”填写金额与发生时间；订单收款或退款请打开对应订单，核对实际发生的金额后记录。',action};
 if(/资金安排|现金流预测|备货建议|昨日|昨天|前天|上周|本周|上月|本月|个月|月\d|\d月|明天|下周|未来|下月|半年|今年|去年|[二三四五六八九十\d]+天/.test(prompt.replace(/近7天|最近7天/g,'')))return {text:'目前可以按今天、近7天或全部记录核对小店经营。你想看哪一段？未来资金安排还需要到期支出和可用余额，不能直接用营业额推算。\n[[choices:我的小店今天收入|我的小店近7天收入|我的小店全部经营记录]]',action};
 const period:MerchantPeriod=/近7天|最近7天|近七天/.test(prompt)?'week':/全部|所有|累计/.test(prompt)?'all':'today';
 const summary=merchantSummary(state,period,now),label=period==='today'?'今天':period==='week'?'近7天':'全部记录中';
 const leader=summary.dishes[0],revenueLeader=[...summary.dishes].sort((a,b)=>b.amount-a.amount)[0];
 const lines=[`${state.shop.name}${label}已记录实收 ${money(summary.collectedTotal)}，退款 ${money(summary.refundedTotal)}，净收款 ${money(summary.netCollected)}。`];
 if(summary.pendingTotal)lines.push(`还有 ${money(summary.pendingTotal)} 待收款，未计入收入。`);
 if(leader)lines.push(`已收款且未退款的订单里，${leader.name}销量最多，共 ${leader.quantity} 份；${revenueLeader.name}的菜品收入最高，为 ${money(revenueLeader.amount)}。`);
 else lines.push('这个范围还没有可计入菜品排行的实收订单，先核对待收款订单。');
 lines.push(`已记录经营支出 ${money(summary.expenseTotal)}，收付差额 ${money(summary.cashDifference)}。这只反映已记录的现金收付，不等于利润，未录入的原料、房租等成本还未计算。`);
 if(/进货|支出|花了|采购/.test(prompt)){
  const purchase=/进货|采购/.test(prompt);
  const expenses=state.expenses.filter(e=>e.occurredAt>=summary.from&&e.occurredAt<=summary.to&&(!purchase||e.category==='进货')).sort((a,b)=>b.amount-a.amount);
  if(purchase)lines.push(`其中已记进货支出 ${money(expenses.reduce((sum,e)=>sum+e.amount,0))}，共 ${expenses.length} 笔；只统计标为进货的记录。`);
  if(expenses.length)lines.push(`其中最大一笔是${expenses[0].title}，${money(expenses[0].amount)}，分类为${expenses[0].category}。`);
 }
 return {text:lines.join('\n'),merchantUI:{shopName:state.shop.name,summary},action};
}
