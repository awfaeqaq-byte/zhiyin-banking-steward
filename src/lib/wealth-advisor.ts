import {wealthAdvisorPrompt} from '../prompts/runtime.generated';
import type {BankSnapshot} from './bank-transfer';
import type {MarketContext} from './market-context';
import type {FundSamples} from './fund-samples';
import {choiceInstructions} from './reply-choices';
import {wealthProducts,type WealthSnapshot} from './wealth-operation';
import type {SavedWealthGoal} from './wealth-goal';
import {realFundExamples} from './real-fund-examples';

export function buildWealthAdvisorInstructions(input:{stewardName:string;memoryContext?:string;bank?:BankSnapshot;wealthSnapshot?:WealthSnapshot;marketContext?:MarketContext;fundSamples?:FundSamples;savedGoal?:SavedWealthGoal}){
  const assessment=input.wealthSnapshot?.assessment;
  const assessmentValid=Boolean(assessment&&assessment.expiresAt>Date.now());
  const data=JSON.stringify({
    bankBalanceCents:input.bank?.balance??null,
    bankAssetsCents:input.bank?.assetSummary??null,
    termDeposits:input.bank?.termDeposits?.filter(d=>d.closedAt===undefined).slice(0,5).map(d=>({id:d.id,principalCents:d.amount,months:d.months,rateBps:d.rateBps,maturesAt:d.maturesAt}))??[],
    assessment:assessment?{risk:assessment.risk,valid:assessment.expiresAt>Date.now(),expiresAt:assessment.expiresAt}:null,
    savedGoal:input.savedGoal?{name:input.savedGoal.name,targetYuan:input.savedGoal.target,months:input.savedGoal.months,note:'用户保存的已准备金额未与银行核对'}:null,
    products:assessmentValid?wealthProducts.map(product=>({id:product.id,name:product.name,risk:product.risk,minAmountYuan:product.minAmount,incrementYuan:product.increment,minTermMonths:product.minTerm,liquidity:product.liquidity,feeRate:product.feeRate,open:product.open,disclosure:product.riskDisclosure,dataDate:product.dataDate,kind:'演示产品'})):[],
    realExamples:assessmentValid?realFundExamples.map(item=>({code:item.code,name:item.name,kind:item.kind,cost:item.cost,liquidity:item.liquidity,risk:item.risk,asOf:item.asOf,note:'只读资料样本，不可在本应用申购；核对发行方最新原文'})):[],
    market:assessmentValid&&input.marketContext?{provider:input.marketContext.provider,status:input.marketContext.status,stale:input.marketContext.stale??true,indicators:input.marketContext.indicators.slice(0,4).map(item=>({label:item.label,date:item.date,value:item.value,unit:item.unit,change:item.change}))}:null,
    fundSamples:assessmentValid&&input.fundSamples?input.fundSamples.records.map(item=>({code:item.code,metric:item.metric,status:item.status,date:item.date,crossCheck:item.crossCheck,stale:item.stale??false,...(item.status==='ready'&&!item.stale?{value:item.value,changePct:item.changePct,sevenDayAnnualizedPct:item.sevenDayAnnualizedPct}:{})})):null,
  });
  const instructions=wealthAdvisorPrompt.trim()
    .replace('{{stewardName}}',input.stewardName)
    .replace('{{memoryContext}}',input.memoryContext?.slice(0,450)||'长期记忆未启用；只使用本轮对话与下方数据。')
    .replace('{{choiceInstructions}}',assessmentValid?choiceInstructions:'测评未完成时不生成快捷产品选项；前端已有测评入口。')
    .replace('{{data}}',data);
  if(instructions.length>6000)throw new Error('理财建议上下文超出长度限制');
  return instructions;
}
