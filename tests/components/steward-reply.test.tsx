import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { StewardReplyContent } from '../../src/components/steward-reply';
import { buildBillAnalysis } from '../../src/lib/bill-analysis';

const bill=buildBillAnalysis({alipay:{provider:'alipay',displayName:'支付宝',accountMasked:'测试',syncedAt:'',scopes:['transactions'],autopays:[],transactions:[
  {id:'a',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'},
  {id:'b',title:'地铁',amount:-500,category:'出行',occurredAt:'2026-09-20'},
]}},'本月账单',Date.parse('2026-09-24'));

it('把代码金额呈现为账单结果，而非模型文字中的金额',async()=>{
  const user=userEvent.setup();
  render(<StewardReplyContent content={'**餐饮是主要支出**\n\n建议先看看午餐明细。'} bill={bill} stewardName="宁宁" />);
  expect(screen.getByRole('region',{name:'账单分析结果'})).toBeInTheDocument();
  expect(screen.getByText('¥30')).toBeInTheDocument();
  expect(screen.getByText('2026-09-01 — 2026-09-24')).toBeInTheDocument();
  expect(screen.getByText('支付宝')).toBeInTheDocument();
  expect(screen.getByText('午餐')).not.toBeVisible();
  await user.click(screen.getByText('查看大额消费'));
  expect(screen.getByText('午餐')).toBeVisible();
  expect(screen.getByText('建议先看看午餐明细。')).toBeVisible();
  expect(screen.queryByText('宁宁的解读')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'这段支出，帮你理了一下'})).toBeInTheDocument();
  expect(screen.queryByText('**餐饮是主要支出**')).not.toBeInTheDocument();
});

it('表格保留横向行列，表头只出现一次，不重复标签',()=>{
  render(<StewardReplyContent content={'| 类别 | 金额 |\n| --- | --- |\n| 餐饮 | 25元 |'} stewardName="宁宁" />);
  expect(screen.queryByText(/\|/)).not.toBeInTheDocument();
  expect(screen.getByText('餐饮')).toBeInTheDocument();
  expect(screen.getByText('25元')).toBeInTheDocument();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(2);
});

it('长表默认显示四笔，可展开和收起；HTML仍作为文本',async()=>{
  const user=userEvent.setup();
  render(<StewardReplyContent content={'| 日期 | 金额 | 分类 | 备注 |\n| --- | --- | --- | --- |\n'+Array.from({length:8},(_,i)=>`| 9月${i+1}日 | 25元 | 其他 | 商户${i+1} |`).join('\n')} stewardName="宁宁"/>);
  expect(screen.getAllByRole('row')).toHaveLength(5);
  expect(screen.queryByText('商户8')).not.toBeInTheDocument();
  expect(screen.getAllByText('日期')).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'展开其余 4 条'}));
  expect(screen.getByText('商户8')).toBeVisible();
  await user.click(screen.getByRole('button',{name:'收起记录'}));
  expect(screen.queryByText('商户8')).not.toBeInTheDocument();
});

it('解释引用哪组证据才展示哪组，不默认堆出所有线索',async()=>{
  const user=userEvent.setup();
  const diagnosed=buildBillAnalysis({alipay:{provider:'alipay',displayName:'支付宝',accountMasked:'测试',syncedAt:'',scopes:['transactions'],autopays:[],transactions:[
    ...Array.from({length:5},(_,i)=>({id:String(i),title:'便利店',amount:-1000,category:'购物',occurredAt:'2026-09-20'})),
    {id:'large',title:'家电',amount:-200000,category:'购物',occurredAt:'2026-09-21'},
    {id:'previous',title:'上期购物',amount:-2000,category:'购物',occurredAt:'2026-08-25'},
  ]}},'本月支出',Date.parse('2026-09-24'));
  render(<StewardReplyContent bill={diagnosed} content={'先核对这笔家电是否计划内购买。\n[[evidence:1]]'} stewardName="宁宁"/>);
  expect(screen.getByText('先核对这笔家电是否计划内购买。')).toBeVisible();
  expect(screen.queryByRole('heading',{name:'同一天向便利店付款 5 次'})).not.toBeInTheDocument();
  expect(screen.getByText('2026-09-21 · 支付宝',{selector:'.bill-inline-evidence small'})).toBeVisible();
  expect(screen.queryByText(/\[\[evidence:/)).not.toBeInTheDocument();
  await user.click(screen.getByText('查看金额与消费分布'));
  expect(screen.getByText('消费支出')).toBeVisible();
  await user.click(screen.getByText('分析范围与数据质量'));
  expect(screen.getByText(/两期记录完整性未知/)).toBeVisible();
});

it('周期历史不是固定模块；引用时展示，重复或无效引用不会堆叠',()=>{
  const periodic=buildBillAnalysis({alipay:{provider:'alipay',displayName:'支付宝',accountMasked:'测试',syncedAt:'',scopes:['transactions'],autopays:[],transactions:
    ['07','08','09'].map(month=>({id:month,title:'测试云盘',amount:-2500,category:'服务',occurredAt:`2026-${month}-20`}))
  }},'本月支出',Date.parse('2026-09-24'));
  const props={bill:periodic,content:'先聊聊你的消费计划。',stewardName:'宁宁'};
  const view=render(<StewardReplyContent {...props}/>);
  expect(screen.queryByText('2026-07-20 · 支付宝')).not.toBeInTheDocument();
  view.rerender(<StewardReplyContent {...props} content={'这几笔看起来是固定支出。\n[[evidence:1]]\n你还在用吗？\n[[evidence:1]]\n[[evidence:99]]'}/>);
  expect(screen.getAllByText('2026-07-20 · 支付宝')).toHaveLength(1);
  expect(screen.getByText('2026-08-20 · 支付宝')).toBeVisible();
  expect(screen.getByText('你还在用吗？')).toBeVisible();
  expect(screen.queryByRole('button',{name:'还在用'})).not.toBeInTheDocument();
  expect(screen.queryByText(/\[\[evidence:/)).not.toBeInTheDocument();
});

it('未授权或范围不明时不呈现零元结论',()=>{
  render(<StewardReplyContent content="请先授权账单。" bill={buildBillAnalysis({},'账单')} stewardName="宁宁" />);
  expect(screen.queryByRole('region',{name:'账单分析结果'})).not.toBeInTheDocument();
  expect(screen.getByText('请先授权账单。')).toBeVisible();
});

it('普通回复按段落与列表呈现，HTML保持文本不执行',()=>{
  render(<StewardReplyContent content={'## 我帮你整理好了\n\n- **保留会员**\n- 明天再看\n\n<script>alert(1)</script>'} stewardName="阿衡" />);
  expect(screen.getByRole('heading',{name:'我帮你整理好了'})).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(document.querySelector('script')).toBeNull();
});
