import type {StewardReplyRequest,StewardReply} from './steward-chat';
import {wealthProducts} from './wealth-operation';
import {parseCardIntent,matchesFundingCard} from './card-intent';
export type WealthEntry={productId?:string;amount?:number;term?:number;holdingId?:string};
const ask=(text:string):StewardReply=>({text,waitingQuestion:text});
const money=(value:number)=>(value/100).toFixed(2);
export function operationFollowup(request:StewardReplyRequest):StewardReply|null{
 const turns=request.messages.filter(m=>m.role==='user').map(m=>m.content),latest=turns.at(-1)||'',all=turns.join('\n');
 // Existing identity, privacy and assessment guards own these requests. A
 // convenient continuation must never bypass them by returning an early action.
 if(!matchesFundingCard(latest)||/完整卡号|卡密|安全码|验证码|支付密码/.test(latest)||/(?:直接|跳过|不要|不用|无需).{0,20}(?:风险测评|做题|测评)/.test(latest)&&!/不要(?:改|修改|改变)测评|不改测评/.test(latest))return null;
 if(/转账|给.{0,15}转|银行AA|消费分析|取消订阅|生日|筹备|存款/.test(latest))return null;
 const wealth=/理财|申购|赎回|持仓|基金|目标规划|灵活现金管理|稳健固收组合|均衡低波组合|R[123]/i.test(all);
 if(wealth){
  if(/保证|保本|不会亏|净值|风险披露|只咨询|仅咨询/.test(latest))return null;
  if(/目标|规划/.test(all)&&/核查|核对|保存失败|重存|没保存|没看见|保存结果/.test(latest)){
   const goal=request.savedGoal;
   return {text:goal?`当前保存的目标是“${goal.name}”，目标金额${goal.target}元、已备${goal.current}元、期限${goal.months}个月，保存时间${new Date(goal.savedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}。未重复保存或改动目标。`:'当前没有读到已保存的目标，请进入目标规划核验，暂不重复保存。',action:{type:'open_wealth'}};
  }
  if(/7天|七天|一周/.test(latest)&&/6个月|六个月|半年/.test(latest)&&!/不能锁|不能接受锁|以7天.*为准/.test(latest))return ask('“7天后必须用钱”和“可以锁定6个月”有冲突。请确认以短期流动性为先，还是这笔资金可以持有满6个月？不会自动选择或申购。');
  const redeem=/赎回|卖出/.test(all)&&!/申购|买入/.test(latest);
  const named=(text:string)=>{const positive=text.replace(/(?:不要|不选|不买|放弃)\s*(?:R[123]|灵活现金管理|稳健固收组合|均衡低波组合)(?:了)?/gi,'');return wealthProducts.filter(p=>positive.includes(p.name)||new RegExp(`R${p.risk}(?!\\d)`,'i').test(positive));};
  let selected= named(latest);
  if(!selected.length){for(const t of turns.slice(0,-1).reverse()){const values=named(t);if(values.length){selected=values;break;}}}
  if(redeem){
   const snapshot=request.wealthSnapshot;
   if(!snapshot)return {text:'本轮未能读取理财账户，不能推断是否赎回成功。请核对原持仓和回执，暂不重复提交。',action:{type:'open_wealth'}};
   if(/失败|没到账|未到账|成功|再赎回|重复|核查|核对|没看见|还没/.test(latest)&&snapshot.redemptions?.length){
    const receipts=snapshot.redemptions.filter(r=>turns.some(t=>t.includes(r.id)||t.includes(r.holdingId))||snapshot.redemptions!.length===1);
    if(receipts.length===1){const r=receipts[0];return {text:`已查到原赎回回执${r.id}，对应持仓${r.holdingId}，赎回${money(r.amount)}元、费用${money(r.fee)}元，当前账户现金${snapshot.cashBalance===undefined?'待读取':money(snapshot.cashBalance)+'元'}。未再次赎回或重复入账。`,action:{type:'open_wealth'}};}
   }
   if(/赎回.*\d+(?:\.\d+)?\s*(?:[，。]|$)/.test(latest)&&!/(?:人民币|元|份)/.test(latest))return ask('这里的数量指人民币金额还是份额？当前入口按指定持仓全额赎回，请确认单位和具体持仓。');
   if(selected.length!==1)return ask('请明确要赎回的产品与具体持仓；同一产品的不同购买记录不会合并或猜选。');
   let holdings=(snapshot.holdings??[]).filter(h=>!h.redeemedAt&&h.productId===selected[0].id);
   const amount=[...turns].reverse().map(t=>t.match(/(\d+(?:\.\d{1,2})?)\s*元/)?.[1]).find(Boolean);
   if(amount)holdings=holdings.filter(h=>h.principal===Math.round(Number(amount)*100));
   const explicit=holdings.filter(h=>latest.includes(h.id));if(explicit.length)holdings=explicit;
   if(holdings.length!==1)return ask(`请选定一笔完整持仓：${holdings.length?holdings.map(h=>`${h.id}，本金${money(h.principal)}元`).join('；'):'本轮没有唯一匹配的有效持仓'}。不会用其他持仓代替。`);
   return {text:`仅准备核对${selected[0].name}的持仓${holdings[0].id}，全额${money(holdings[0].principal)}元。打开后仍须独立确认赎回，尚未入账。`,action:{type:'open_wealth',holdingId:holdings[0].id}};
  }
  const purchase=!/不申购|不购买|暂不购买|只比较|仅比较|放弃R3/.test(latest)&&/申购|购买|买|办理|按刚说的办/.test(all);
  const amountTurn=turns.slice().reverse().find(t=>/\d+(?:\.\d+)?\s*元/.test(t));
  const amountValue=amountTurn?.match(/(?:人民币\s*)?(\d+(?:\.\d+)?)\s*元/)?.[1];
  const amount=amountValue?Number(amountValue):undefined;
  const termTurn=turns.slice().reverse().find(t=>/\d+\s*个?月|7天|七天|一周|随时取/.test(t));
  const termValue=termTurn?.match(/(\d+)\s*个?月/)?.[1];const term=termTurn&&/7天|七天|一周|随时取/.test(termTurn)?0:termValue?Number(termValue):undefined;
  if(/(?:\d+|[一二两三四五六七八九十百千万]+)\s*份/.test(latest)&&!/人民币.*元/.test(latest))return ask('当前申购使用人民币金额，份额不能直接当成元。请给出本次投入的人民币金额；已指定的产品与付款卡会保留。');
  if(!purchase){
   if(amount===undefined||term===undefined)return ask('计划投入多少元、多久会用到这笔钱，以及是否需要随时取用？明确需求后再比较产品。');
   const risk=request.wealthSnapshot?.assessment;const rank=risk?.risk==='low'?1:risk?.risk==='medium'?2:risk?.risk==='high'?3:0;
   const products=wealthProducts.filter(p=>p.risk<=rank&&p.minTerm<=term&&p.minAmount<=amount);
   return {text:`按本次${amount.toFixed(2)}元、${term===0?'需要短期或随时取用':`计划持有${term}个月`}以及当前测评，仅比较${products.map(p=>p.name).join('、')||'暂无匹配产品'}。${term===0?'有锁定期的产品不符合本次流动性要求。':''}演示理财存在净值波动，不保本；没有申购或扣款。`,view:'wealth_compare'};
  }
  if(selected.length!==1)return ask('请明确选择一个产品后再核对申购；推荐或比较不等于已替你选择。可选择灵活现金管理、稳健固收组合或均衡低波组合。');
  const product=selected[0],assessment=request.wealthSnapshot?.assessment;
  if(!assessment||assessment.expiresAt<=Date.now())return {text:`${product.name}是R${product.risk}（${product.risk}级）产品，${product.riskDisclosure}请先完成有效风险测评再核对适配性。不会通过聊天设置风险等级或跳过评估，本次没有申购或扣款。`};
  const rank=assessment.risk==='low'?1:assessment.risk==='medium'?2:3;
  if(product.risk>rank)return ask(`${product.name}是R${product.risk}（${product.risk}级）产品，${product.riskDisclosure}当前风险测评与该产品不匹配，不能申购。要保留现有${assessment.risk==='low'?'谨慎型':assessment.risk==='medium'?'稳健型':'成长型'}测评并改选适配产品，还是如实重新测评？不会直接修改测评，本次没有申购或扣款。`);
  if(amount===undefined)return ask(`已保留${product.name}与常用卡8888；这次投入多少人民币？不会把银行卡尾号当成购买金额。`);
  if(!Number.isFinite(amount)||amount<product.minAmount||!Number.isSafeInteger(amount*100)||!Number.isInteger((amount-product.minAmount)/product.increment))return ask(`金额不符合${product.name}的要求：起购${product.minAmount}元，递增${product.increment}元，最多两位小数。请修改金额，产品与付款卡不变。`);
  if(term===undefined&&product.minTerm>0)return ask(`这款产品至少持有${product.minTerm}个月，请确认计划持有期限。`);
  if(term!==undefined&&term<product.minTerm)return ask(`这笔资金的使用期限短于产品要求的${product.minTerm}个月，请改选流动性合适的产品或更正期限。`);
  if(!turns.some(t=>/8888|常用卡/.test(t)))return ask('申购资金是否从常用卡8888转出？微信和支付宝不能代付；产品与金额会保留。');
  const fee=Math.round(amount*100*product.feeRate);
  return {text:`待核对${product.name}，申购${amount.toFixed(2)}元，费用${money(fee)}元，从常用卡8888付款。旧方案不再使用，请打开最新方案并独立确认；尚未申购或扣款。`,action:{type:'open_wealth',productId:product.id,amount:Math.round(amount*100),term:term??0}};
 }
 if(/银行卡|卡片|常用卡|这张卡|8888.*卡|支付限额|无卡支付|挂失|境外交易/.test(all)&&!/转账|汇款/.test(all)){
  const target=turns.slice().reverse().find(t=>/(?:卡(?:片)?|尾号|末四位|后四位)\s*\d{4}|\d{4}\s*(?:的卡|卡)/.test(t));
  if(target&&!matchesFundingCard(target))return {text:'原请求的卡片不是可操作的常用卡8888，请先核对卡片对象；不会把其他尾号替换成8888，也没有修改任何设置。'};
  const bank=request.bank;if(!bank)return null;
  if(/支付.*关掉|恢复使用/.test(latest)&&!parseCardIntent(latest))return ask(`当前卡8888${bank.frozen?'已挂失':'状态正常'}。你要调整无卡支付、境外交易、夜间保护，还是挂失/解挂？请明确单一操作范围。`);
  const limit=/限额/.test(all)&&(/\d+(?:\.\d+)?\s*元|负\s*\d+/.test(latest)||/限额/.test(latest));
  if(limit){
   const values=[...latest.matchAll(/(-?\d+(?:\.\d+)?)\s*元/g)];
   const raw=values.at(-1)?.[1];
   if(!raw)return ask(`当前支付限额${money(bank.limit)}元，想调整为多少元？其他开关保持原值。`);
   const yuan=Number(raw)*(/负/.test(latest)?-1:1);
   if(!Number.isFinite(yuan)||yuan<100||yuan>50000||!Number.isSafeInteger(yuan*100))return ask('支付限额须在100至50000元之间，最多两位小数。请更正数值，原卡片设置尚未改变。');
   return {text:`准备把常用卡8888支付限额从${money(bank.limit)}元调整为${yuan.toFixed(2)}元，其他设置保持原值。请打开核对并本人确认，尚未保存。`,action:{type:'open_cards',instruction:`常用卡8888支付限额改为${yuan}元`}};
  }
  const intent=parseCardIntent(latest);if(intent&&intent.kind==='control')return {text:'已明确当前卡片的指定支付开关，请打开核对确认。其他设置保持原值，尚未保存。',action:{type:'open_cards',instruction:latest}};
 }
 return null;
}
