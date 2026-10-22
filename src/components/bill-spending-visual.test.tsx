import {useState} from 'react';
import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {buildBillAnalysis} from '../lib/bill-analysis';
import type {ConnectedFinancialSource} from '../lib/financial-connections';
import {BillSpendingVisual} from './bill-spending-visual';

const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],syncedAt:'2026-10-21',autopays:[],transactions:[
 {id:'meal1',title:'晚餐',category:'餐饮',amount:-4000,occurredAt:'2026-10-20'},
 {id:'meal2',title:'午餐',category:'餐饮',amount:-3000,occurredAt:'2026-10-19'},
 {id:'meal3',title:'早餐',category:'餐饮',amount:-2000,occurredAt:'2026-10-18'},
 {id:'meal4',title:'咖啡',category:'餐饮',amount:-1000,occurredAt:'2026-10-17'},
 {id:'shop',title:'文具',category:'购物',amount:-5000,occurredAt:'2026-10-16'},
 {id:'metro',title:'地铁',category:'交通',amount:-3000,occurredAt:'2026-10-15'},
 {id:'water',title:'水费',category:'生活缴费',amount:-2000,occurredAt:'2026-10-14'},
 {id:'income',title:'工资',category:'收入',kind:'income',amount:100000,occurredAt:'2026-10-01'},
 {id:'refund',title:'餐饮退款',category:'餐饮',kind:'refund',amount:500,occurredAt:'2026-10-21'},
 {id:'transfer',title:'朋友转账',category:'餐饮',kind:'transfer',amount:-90000,occurredAt:'2026-10-21'},
]};
const now=Date.parse('2026-10-21T12:00:00+08:00');
const bill=buildBillAnalysis({wechat_pay:source},'本月支出',now);

it('从已计算的真实收支与分类呈现比例，退款和转账不混入消费',()=>{
 render(<BillSpendingVisual bill={bill} onSelectCategory={vi.fn()}/>);
 expect(screen.getByText('消费支出').nextElementSibling).toHaveTextContent('¥200');
 expect(screen.getByText('普通入账').nextElementSibling).toHaveTextContent('¥1,000');
 expect(screen.getByRole('img',{name:'消费金额构成：餐饮 50%，购物 25%，交通 15%，生活缴费 10%'})).toBeVisible();
 expect(screen.getByRole('group',{name:'选择消费分类'}).querySelectorAll('button')).toHaveLength(3);
 expect(screen.queryByRole('button',{name:/查看生活缴费交易/})).not.toBeInTheDocument();
 expect(screen.queryByText('朋友转账')).not.toBeInTheDocument();
});

it('分类点选、取消和交易证据均就地完成，真实日期来源和管家名可访问',async()=>{
 const inspect=vi.fn();
 function Controlled(){const [category,setCategory]=useState('');return <BillSpendingVisual bill={bill} selectedCategory={category} onSelectCategory={setCategory} onInspect={inspect} stewardName="阿衡"/>;}
 render(<Controlled/>);
 const category=screen.getByRole('button',{name:'查看餐饮交易 ¥100'});
 expect(category).toHaveAttribute('aria-pressed','false');
 await userEvent.click(category);
 expect(category).toHaveAttribute('aria-pressed','true');
 const evidence=screen.getByRole('region',{name:'餐饮交易'});
 expect(evidence).toHaveTextContent('4 笔 · 最近 3 笔');
 expect(within(evidence).getAllByRole('button')).toHaveLength(3);
 expect(evidence).toHaveTextContent('2026-10-20 · 微信支付');
 expect(within(evidence).queryByText('咖啡')).not.toBeInTheDocument();
 expect(evidence).not.toHaveTextContent('餐饮退款');expect(evidence).not.toHaveTextContent('朋友转账');
 await userEvent.click(within(evidence).getByRole('button',{name:'请阿衡解释晚餐 ¥40'}));
 expect(inspect).toHaveBeenCalledWith({provider:'wechat_pay',id:'meal1'});
 await userEvent.click(category);expect(screen.queryByRole('region',{name:'餐饮交易'})).not.toBeInTheDocument();
});

it('外部选中的末位分类仍可见，范围变化时收起旧展开与不存在的选择',async()=>{
 const view=render(<BillSpendingVisual bill={bill} selectedCategory="生活缴费" onSelectCategory={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'查看生活缴费交易 ¥20'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('region',{name:'生活缴费交易'})).toHaveTextContent('水费');
 await userEvent.click(screen.getByRole('button',{name:'展开全部 4 类'}));
 expect(screen.getByRole('button',{name:'收起分类'})).toHaveAttribute('aria-expanded','true');
 view.rerender(<BillSpendingVisual bill={{...bill,from:'2026-10-14'}} onSelectCategory={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'展开全部 4 类'})).toHaveAttribute('aria-expanded','false');
 expect(screen.getByRole('group',{name:'选择消费分类'}).querySelectorAll('button')).toHaveLength(3);
 view.rerender(<BillSpendingVisual bill={bill} selectedCategory="不存在的分类" onSelectCategory={vi.fn()}/>);
 expect(screen.queryByRole('region',{name:'不存在的分类交易'})).not.toBeInTheDocument();
});

it('禁用时分类、展开和解释交易均不可触发',async()=>{
 const select=vi.fn(),inspect=vi.fn();
 render(<BillSpendingVisual bill={bill} selectedCategory="餐饮" onSelectCategory={select} onInspect={inspect} disabled/>);
 for(const button of screen.getAllByRole('button')){expect(button).toBeDisabled();await userEvent.click(button);}
 expect(select).not.toHaveBeenCalled();expect(inspect).not.toHaveBeenCalled();
});

it('不完整数据只能显示小计；完整对照使用实际金额和等长日期，缺数据不造曲线',()=>{
 const trend={previousFrom:'2026-09-10',previousTo:'2026-09-30',previousExpense:10000,currentExpense:20000,changePercent:100,label:'等长时段'};
 const compared={...bill,diagnosis:{...bill.diagnosis,trend}};
 const view=render(<BillSpendingVisual bill={compared} showTrend/>);
 const comparison=screen.getByRole('region',{name:'前期消费对照'});
 expect(comparison).toHaveTextContent('增加 100%');expect(comparison).toHaveTextContent('前期 2026-09-10 — 2026-09-30');
 expect(comparison).toHaveTextContent('¥100');expect(comparison).toHaveTextContent('¥200');expect(comparison).toHaveTextContent('两期记录完整性未知');
 view.rerender(<BillSpendingVisual bill={{...compared,coverageIncomplete:true}} showTrend/>);
 expect(screen.getByText('已返回消费小计')).toBeVisible();expect(screen.getByText('按已返回消费计算')).toBeVisible();
 expect(screen.queryByText('增加 100%')).not.toBeInTheDocument();expect(comparison).toHaveTextContent('记录尚未补全');
 view.rerender(<BillSpendingVisual bill={bill} showTrend/>);
 expect(comparison).toHaveTextContent('前期记录不足');expect(comparison.querySelector('.bill-visual-comparison-bar')).toBeNull();
});

it('无授权、未返回记录与待确认范围不显示零金额；只有真实无消费时显示无构成',()=>{
 const noRows=buildBillAnalysis({wechat_pay:{...source,transactions:[]}},'本月支出',now);
 const view=render(<BillSpendingVisual bill={noRows}/>);
 expect(screen.getByText(/未返回交易记录/)).toBeVisible();expect(screen.queryByText('¥0')).not.toBeInTheDocument();
 view.rerender(<BillSpendingVisual bill={buildBillAnalysis({},'本月支出',now)}/>);
 expect(screen.getByText(/授权读取账单后/)).toBeVisible();
 view.rerender(<BillSpendingVisual bill={{...bill,needsClarification:true}}/>);
 expect(screen.getByText(/确认日期范围后/)).toBeVisible();expect(screen.queryByRole('img')).not.toBeInTheDocument();
 view.rerender(<BillSpendingVisual bill={buildBillAnalysis({wechat_pay:{...source,transactions:[source.transactions[7]]}},'本月支出',now)}/>);
 expect(screen.getByText('消费支出').nextElementSibling).toHaveTextContent('¥0');
 expect(screen.getByText(/未返回消费类支出/)).toBeVisible();expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('分面只呈现请求的组件，负数交易采用已计算账本口径确保分类和依据对应',()=>{
 const adjusted=buildBillAnalysis({wechat_pay:{...source,transactions:[{id:'correction',title:'退款冲正',category:'购物',amount:-500,kind:'refund',occurredAt:'2026-10-20'}]}},'本月支出',now);
 const view=render(<BillSpendingVisual bill={adjusted} selectedCategory="购物" onInspect={vi.fn()} showOverview={false}/>);
 expect(screen.queryByText('消费支出')).not.toBeInTheDocument();
 expect(screen.getByRole('region',{name:'购物交易'})).toHaveTextContent('退款冲正');
 expect(screen.getByRole('region',{name:'购物交易'})).toHaveTextContent('¥5');
 view.rerender(<BillSpendingVisual bill={bill} showCategories={false}/>);
 expect(screen.getByText('消费支出')).toBeVisible();expect(screen.queryByRole('region',{name:'消费构成'})).not.toBeInTheDocument();
});
