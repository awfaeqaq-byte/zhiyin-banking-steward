import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it,vi} from 'vitest';
import {BillReports} from './bill-reports';
import type {ConnectedFinancialSource} from '../lib/financial-connections';
const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'***',scopes:['transactions'],syncedAt:'2026-10-08T12:00:00+08:00',autopays:[],transactions:[{id:'food',title:'餐馆',amount:-12000,category:'餐饮',occurredAt:'2026-09-10',kind:'payment'},{id:'shop',title:'商店',amount:-8000,category:'购物',occurredAt:'2026-08-10',kind:'payment'}]};
describe('月年报告页面',()=>{
 it('月度金额可下钻到交易，年度只含有记录月份',async()=>{
  const user=userEvent.setup();render(<BillReports connections={{wechat_pay:source}} onConnect={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'2026-09 月度账单'})).toBeInTheDocument();
  const report=screen.getByRole('region',{name:'账单报告'});
  expect(within(report).getByText('¥120')).toBeInTheDocument();
  await user.click(screen.getByText(/核对纳入统计的 1 笔交易/));
  expect(screen.getByText(/餐馆 · −¥120/)).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'年度'}));
  expect(screen.getByRole('heading',{name:'2026 年度账单'})).toBeInTheDocument();
  expect(screen.getByText(/覆盖 2 个有记录月份/)).toBeInTheDocument();
  expect(screen.getByText('¥200')).toBeInTheDocument();
 });
});
