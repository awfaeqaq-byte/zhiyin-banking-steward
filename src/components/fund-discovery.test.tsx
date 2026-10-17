import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';

beforeEach(() => { localStorage.clear(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}')); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('opens selection from wealth, switches rankings, searches, saves and makes a local demo record', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(within(screen.getByRole('navigation', { name:'主导航' })).getByRole('button', { name:'财富' }));
  await user.click(screen.getByRole('button', { name:/大数据选基 人气/ }));
  expect(screen.getByRole('heading', { name:'大数据选基' })).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name:'业绩表现' }));
  expect(screen.getByRole('heading', { name:'近3个月涨幅领先的基金' })).toBeInTheDocument();
  await user.click(screen.getAllByRole('button', { name:/更多/ })[0]);
  await user.selectOptions(screen.getByRole('combobox', { name:'筛选周涨跌' }), 'positive');
  await user.click(screen.getByRole('button', { name:'返回选基首页' }));
  await user.type(screen.getByRole('textbox', { name:'搜索基金名称或代码' }), 'DEMO008');
  await user.click(screen.getByRole('button', { name:'搜索' }));
  expect(screen.getByText(/找到 1 项演示样本/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name:/加入自选 天弘中证油气产业指数发起A/ }));
  await user.click(screen.getByRole('button', { name:'查看我的自选' }));
  await user.click(screen.getByRole('button', { name:'买一笔' }));
  await user.clear(screen.getByRole('spinbutton', { name:'演示申购金额' }));
  await user.type(screen.getByRole('spinbutton', { name:'演示申购金额' }), '300');
  await user.click(screen.getByRole('button', { name:'确认模拟申购' }));
  expect(within(screen.getByRole('dialog', { name:'模拟申购核对' })).getByText(/未发生真实交易/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name:'完成' }));
  expect(screen.getByRole('heading', { name:'模拟申购记录' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('zhiyin-fund-demo-orders') || '[]')).toHaveLength(1);
});
