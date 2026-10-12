import type {BankSnapshot} from './bank-transfer';
import type {BillAnalysis} from './bill-analysis';
import type {FundingForecast} from './funding-forecast';
import type {WealthSnapshot} from './wealth-operation';
import type {SavedWealthGoal} from './wealth-goal';
import {choiceInstructions} from './reply-choices';
import {financialCoachPrompt as coachPrompt} from '../prompts/runtime.generated';

export type FinancialCoachInput={
  stewardName:string;
  memoryContext?:string;
  bank?:BankSnapshot;
  billAnalysis?:BillAnalysis;
  fundingForecast?:FundingForecast;
  wealthSnapshot?:WealthSnapshot;
  savedGoal?:SavedWealthGoal;
};

/** Routing only. The model chooses the actual topic and conversation path. */
export function isFinancialCoachingQuestion(text:string){
  return /预算|应急金|备用金|储蓄|存钱|攒钱|债务|还债|欠款|负债|贷款|房贷|加薪|谈薪|薪资谈判|工资谈判|副业|第二收入|多元收入|收入来源|增收|冲动消费|消费习惯|财务习惯|财务思维|财务自由|财务仪表盘|财务状况|支出漏洞|花钱习惯|资产配置|资金分配|钱.{0,4}(怎么用|怎么分配|如何分配)|生活费.*(安排|分配)|理财入门|理财规划|如何理财|怎么理财|理财建议|财务目标|短期目标|中期目标|长期目标|每月.*理财|先.*应急.*理财/.test(text)
    && !/(?:给|向).{1,25}(?:转|汇)|预约.*转|定时.*转|AA|aa|平摊|均摊/.test(text);
}

function dataContext({bank,billAnalysis,fundingForecast,wealthSnapshot,savedGoal}:FinancialCoachInput){
  const bill=billAnalysis?.sources.length?{
    period:`${billAnalysis.from}至${billAnalysis.to}`,
    sources:billAnalysis.sources.slice(0,4),
    recordCount:billAnalysis.count,
    expenseCents:billAnalysis.expense,
    ordinaryIncomeCents:billAnalysis.income,
    refundCents:billAnalysis.refund,
    transferInCents:billAnalysis.transferIn,
    transferOutCents:billAnalysis.transferOut,
    categories:billAnalysis.categories.slice(0,5).map(item=>({name:item.name.slice(0,24),amountCents:item.amount})),
    incomplete:billAnalysis.coverageIncomplete,
    coverage:billAnalysis.coverage.slice(0,250),
  }:null;
  const assessment=wealthSnapshot?.assessment;
  return {
    bank:bank?{availableCents:bank.balance,readFrom:'本机银行沙箱',frozen:bank.frozen}:null,
    bill,
    upcomingPayments:fundingForecast?.accounts.slice(0,3).map(account=>({source:account.providerName,knownNextCents:account.upcomingTotal,balanceCents:account.balance,status:account.status,warningCount:account.warnings.length}))||[],
    wealth:wealthSnapshot?{assessment:assessment&&assessment.expiresAt>Date.now()?{risk:assessment.risk,expiresAt:assessment.expiresAt}:null,activeHoldingCount:wealthSnapshot.holdings?.filter(item=>!item.redeemedAt).length||0}:null,
    savedGoal:savedGoal?{name:savedGoal.name.slice(0,20),targetYuan:savedGoal.target,alreadyPreparedYuan:savedGoal.current,months:savedGoal.months,savedAt:savedGoal.savedAt,note:'用户在本机目标规划页保存；已准备金额未与银行余额核对'}:null,
    missing:['债务本金、利率和最低还款额','稳定月收入与固定支出','住房、保险及其他未授权账户','完整资产负债与净资产'],
  };
}

export function buildFinancialCoachInstructions(input:FinancialCoachInput){
  const data=JSON.stringify(dataContext(input));
  const instructions=coachPrompt.trim()
    .replace('{{stewardName}}',input.stewardName)
    .replace('{{memoryContext}}',input.memoryContext?.slice(0,450)||'长期记忆未启用；只使用本轮对话和下面提供的数据。')
    .replace('{{choiceInstructions}}',choiceInstructions)
    .replace('{{data}}',data);
  if(instructions.length>4000)throw new Error('财务教练上下文超出长度限制');
  return instructions;
}
