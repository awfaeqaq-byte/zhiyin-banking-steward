import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {BillAnalysisCard} from './bill-analysis-card';
import {buildBillAnalysis} from '../lib/bill-analysis';
import type {ConnectedFinancialSource} from '../lib/financial-connections';

const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],syncedAt:'2026-10-13',autopays:[],transactions:[
 {id:'meal',title:'午餐',category:'餐饮',amount:-3000,occurredAt:'2026-10-12'},
 {id:'metro',title:'地铁',category:'交通',amount:-1000,occurredAt:'2026-10-11'},
 {id:'pay',title:'工资',category:'收入',kind:'income',amount:100000,occurredAt:'2026-10-01'},
 {id:'refund',title:'退款',category:'购物',kind:'refund',amount:500,occurredAt:'2026-10-12'},
 {id:'transfer',title:'转出',category:'转账',kind:'transfer',amount:-20000,occurredAt:'2026-10-12'},
]};
const bill=buildBillAnalysis({wechat_pay:source},'本月支出',Date.parse('2026-10-13'));
const props={bill,onInspect:vi.fn(),onAnalyze:vi.fn()};

it('BI2-014 年度逐月小计直接可见，缺失月份不补零',()=>{
 const annual=buildBillAnalysis({wechat_pay:{...source,transactions:[...source.transactions,{id:'jan',title:'一月消费',amount:-1234,category:'餐饮',occurredAt:'2026-01-12'}]}},'2026年度账单',Date.parse('2026-10-22'));
 render(<BillAnalysisCard {...props} bill={annual}/>);
 const monthly=screen.getByRole('region',{name:'逐月消费小计'});
 expect(monthly).toBeVisible();expect(monthly).toHaveTextContent('2026-01');expect(monthly).toHaveTextContent('¥12.34');expect(monthly).toHaveTextContent('2026-10');expect(monthly).toHaveTextContent('¥40');
 expect(monthly).not.toHaveTextContent('2026-02');expect(monthly).toHaveTextContent('不代表零消费');
});

it('固定结论由真实分类占比和最大消费生成，转出和退款不混入收支',async()=>{
 render(<BillAnalysisCard {...props}/>);
 const card=screen.getByRole('region',{name:'账单分析'});
 expect(card).toHaveTextContent('¥40');expect(card).toHaveTextContent('¥1,000');
 expect(card).toHaveTextContent('餐饮占本次消费的 75%');
 expect(card).toHaveTextContent('最大一笔消费');expect(card).not.toHaveTextContent('异常消费');
 await userEvent.click(screen.getByText('退款、转账与统计范围'));
 expect(card).toHaveTextContent('退款单列');expect(card).toHaveTextContent('转出');expect(card).toHaveTextContent('¥200');
});
it('点击真实交易才继续解释，完整明细和补充解读按需展开',async()=>{
 const inspect=vi.fn(),analyze=vi.fn();
 render(<BillAnalysisCard {...props} onInspect={inspect} onAnalyze={analyze} details={<p>原有平台切换面板</p>} explanation={<p>模型补充解释</p>}/>);
 expect(inspect).not.toHaveBeenCalled();expect(screen.getByText('模型补充解释')).not.toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:/解释午餐/}));expect(inspect).toHaveBeenCalledWith({provider:'wechat_pay',id:'meal'});
 await userEvent.click(screen.getByRole('button',{name:'请宁宁进一步分析'}));expect(analyze).toHaveBeenCalledOnce();
 await userEvent.click(screen.getByText('查看明细与切换平台'));expect(screen.getByText('原有平台切换面板')).toBeVisible();
});
it('同步失败和加载期间隐藏旧数字及分析入口',()=>{
 const view=render(<BillAnalysisCard {...props} error="平台暂不可用" explanation={<p>旧解读</p>}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('平台暂不可用');expect(screen.queryByText('¥40')).not.toBeInTheDocument();expect(screen.queryByText('旧解读')).not.toBeInTheDocument();
 view.rerender(<BillAnalysisCard {...props} loading/>);
 expect(screen.getByRole('status')).toHaveTextContent('正在核对');expect(screen.queryByRole('button',{name:'请宁宁进一步分析'})).not.toBeInTheDocument();
});
it('空账单、未授权和待明确日期不能伪造零消费结论',()=>{
 const view=render(<BillAnalysisCard {...props} bill={buildBillAnalysis({wechat_pay:{...source,transactions:[]}},'本月支出')}/>);
 expect(screen.getByText(/未返回交易记录/)).toBeVisible();expect(screen.queryByText('¥0')).not.toBeInTheDocument();
 view.rerender(<BillAnalysisCard {...props} bill={buildBillAnalysis({},'本月支出')}/>);expect(screen.getByText(/需要账单读取授权/)).toBeVisible();
 view.rerender(<BillAnalysisCard {...props} bill={{...bill,needsClarification:true}}/>);expect(screen.getByText(/确认月份或日期范围/)).toBeVisible();
});
it('不完整数据明确为小计，换范围后隐藏旧解读且不虚构消费趋势',()=>{
 render(<BillAnalysisCard {...props} bill={{...bill,coverageIncomplete:true,coverage:'数据不完整：仅返回部分交易。'}} interpretationChanged explanation={<p>旧范围解读</p>}/>);
 const card=screen.getByRole('region',{name:'账单分析'});
 expect(card).toHaveTextContent('已返回消费小计');expect(card).toHaveTextContent('数据不完整');
 expect(screen.queryByText('旧范围解读')).not.toBeInTheDocument();expect(card).toHaveTextContent('补充解读需重新生成');
 expect(card).not.toHaveTextContent('环比');
});
it('前期数据仅按等长时段比较，零消费样本不推断日常习惯',()=>{
 const view=render(<BillAnalysisCard {...props} bill={{...bill,diagnosis:{...bill.diagnosis,trend:{previousFrom:'2026-09-18',previousTo:'2026-09-30',previousExpense:2000,currentExpense:4000,changePercent:100,label:'等长时段'}}}}/>);
 expect(screen.getByText(/增加 100%/)).toBeVisible();expect(screen.getByText(/两期记录完整性未知/)).toBeVisible();
 view.rerender(<BillAnalysisCard {...props} bill={buildBillAnalysis({wechat_pay:{...source,transactions:[source.transactions[2]]}},'本月支出',Date.parse('2026-10-13'))}/>);
 expect(screen.getByText(/未返回消费类支出/)).toBeVisible();expect(within(screen.getByRole('region',{name:'账单分析'})).queryByText('最大一笔消费')).not.toBeInTheDocument();
});
