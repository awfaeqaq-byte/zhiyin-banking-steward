import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import {MerchantOrderPage} from '../../src/components/merchant-order';
import {getPublicMerchant, submitMerchantOrder, MerchantSubmissionUnknownError} from '../../src/lib/merchant-service';

vi.mock('../../src/lib/merchant-service', async importOriginal => ({...await importOriginal<typeof import('../../src/lib/merchant-service')>(), getPublicMerchant: vi.fn(), submitMerchantOrder: vi.fn()}));
const menu = [
  {id: 'noodle', name: '番茄牛肉面', category: '主食', price: 2800, available: true},
  {id: 'tea', name: '桂花乌龙茶', category: '饮品', price: 650, available: true},
  {id: 'rice', name: '蛋炒饭', category: '主食', price: 1800, available: false},
];
const order = {id: 'order-001', table: 'A08', items: [{menuItemId: 'noodle', name: '番茄牛肉面', quantity: 2, unitPrice: 2800, amount: 5600}], total: 5600, status: 'pending' as const, createdAt: 1792746000000};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(getPublicMerchant).mockResolvedValue({shop: {name: '巷口小馆', menu}});
  vi.mocked(submitMerchantOrder).mockResolvedValue({order});
});

it('顾客按分类选菜，售罄不能添加，金额按分计算且桌号带入核对', async () => {
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  expect(await screen.findByRole('heading', {name: '巷口小馆'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: '添加蛋炒饭'})).toBeDisabled();
  await user.click(screen.getByRole('button', {name: '饮品'}));
  expect(screen.queryByRole('button', {name: '添加番茄牛肉面'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '添加桂花乌龙茶'}));
  await user.click(screen.getByRole('button', {name: '全部'}));
  await user.click(screen.getByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  expect(screen.getByRole('heading', {name: '核对点单'})).toBeInTheDocument();
  expect(screen.getByLabelText('桌号')).toHaveValue('A08');
  expect(screen.getByLabelText('订单合计')).toHaveTextContent('¥34.50');
  expect(submitMerchantOrder).not.toHaveBeenCalled();
});

it('明确提交后显示服务端待收款回执，不能重复提交或误报已付款', async () => {
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  expect(await screen.findByRole('heading', {name: '订单已提交'})).toBeInTheDocument();
  expect(screen.getByText('待收款')).toBeInTheDocument();
  expect(screen.getByText('请向店员付款，本页不会扣款。')).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: '确认提交订单'})).not.toBeInTheDocument();
  expect(submitMerchantOrder).toHaveBeenCalledWith('shop-token', {table: 'A08', items: [{menuItemId: 'noodle', quantity: 2}], requestId: expect.any(String)});
  expect(submitMerchantOrder).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('订单合计')).toHaveTextContent('¥56.00');
});

it('网络失败保留选择及请求ID，重试中禁止重复点单', async () => {
  let resolve!: (result: {order: typeof order}) => void;
  vi.mocked(submitMerchantOrder).mockRejectedValueOnce(new Error('连接中断，请重试')).mockImplementationOnce(() => new Promise(done => {resolve = done;}));
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('连接中断，请重试');
  const first = vi.mocked(submitMerchantOrder).mock.calls[0][1];
  await user.click(screen.getByRole('button', {name: '重试提交订单'}));
  expect(screen.getByRole('button', {name: '正在提交订单'})).toBeDisabled();
  expect(screen.getByRole('button', {name: '添加番茄牛肉面'})).toBeDisabled();
  expect(screen.getByLabelText('桌号')).toBeDisabled();
  expect(vi.mocked(submitMerchantOrder).mock.calls[1][1].requestId).toBe(first.requestId);
  resolve({order});
  expect(await screen.findByRole('heading', {name: '订单已提交'})).toBeInTheDocument();
});

it('失败后修改数量生成新请求，成功后再点一单也使用新请求', async () => {
  vi.mocked(submitMerchantOrder).mockRejectedValueOnce(new Error('暂不可用')).mockResolvedValue({order});
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  await screen.findByRole('heading', {name: '订单已提交'});
  expect(vi.mocked(submitMerchantOrder).mock.calls[1][1].requestId).not.toBe(vi.mocked(submitMerchantOrder).mock.calls[0][1].requestId);
  await user.click(screen.getByRole('button', {name: '再点一单'}));
  expect(screen.getByRole('button', {name: '查看已选菜品'})).toBeDisabled();
  await user.click(screen.getByRole('button', {name: '添加桂花乌龙茶'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  await screen.findByRole('heading', {name: '订单已提交'});
  const ids = vi.mocked(submitMerchantOrder).mock.calls.map(call => call[1].requestId);
  expect(new Set(ids).size).toBe(3);
});

it('菜单读取失败可重试，未填写桌号不能提交', async () => {
  vi.mocked(getPublicMerchant).mockRejectedValueOnce(new Error('点餐码暂时无法读取'));
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('点餐码暂时无法读取');
  await user.click(screen.getByRole('button', {name: '重新加载菜单'}));
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  expect(screen.getByRole('button', {name: '确认提交订单'})).toBeDisabled();
  await user.type(screen.getByLabelText('桌号'), 'A01');
  expect(screen.getByRole('button', {name: '确认提交订单'})).toBeEnabled();
});

it('空菜单给出明确状态；切换点餐码不会沿用上一家菜单或购物袋', async () => {
  const user = userEvent.setup(); const page = render(<MerchantOrderPage token="shop-token"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  vi.mocked(getPublicMerchant).mockResolvedValue({shop: {name: '新店', menu: []}});
  page.rerender(<MerchantOrderPage token="new-token"/>);
  expect(await screen.findByRole('heading', {name: '菜单准备中'})).toBeInTheDocument();
  expect(screen.queryByText('番茄牛肉面')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: '查看已选菜品'})).not.toBeInTheDocument();
  await waitFor(() => expect(getPublicMerchant).toHaveBeenCalledWith('new-token'));
});

it('购物袋可减少和移除菜品，不显示空核对页', async () => {
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '减少番茄牛肉面'}));
  expect(screen.getByRole('heading', {name: '巷口小馆'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: '查看已选菜品'})).toBeDisabled();
  const row = screen.getByRole('listitem', {name: '番茄牛肉面'});
  expect(within(row).queryByLabelText('番茄牛肉面数量')).not.toBeInTheDocument();
});


it('结果未知时锁定桌号、数量及返回，仅能用原请求重试', async () => {
  vi.mocked(submitMerchantOrder).mockRejectedValueOnce(new MerchantSubmissionUnknownError()).mockResolvedValue({order});
  const user = userEvent.setup(); render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('订单结果待核对');
  expect(screen.getByLabelText('桌号')).toBeDisabled();
  expect(screen.getByRole('button', {name: '添加番茄牛肉面'})).toBeDisabled();
  expect(screen.getByRole('button', {name: '减少番茄牛肉面'})).toBeDisabled();
  expect(screen.getByRole('button', {name: '继续选菜'})).toBeDisabled();
  expect(screen.getByRole('button', {name: '核对原订单'})).toBeEnabled();
  const input = vi.mocked(submitMerchantOrder).mock.calls[0][1];
  await user.click(screen.getByRole('button', {name: '核对原订单'}));
  await screen.findByRole('heading', {name: '订单已提交'});
  expect(vi.mocked(submitMerchantOrder).mock.calls[1][1]).toEqual(input);
});

it('刷新恢复未决请求，即使菜单已变也用原始请求核对，成功后刷新仍先获取新回执', async () => {
  vi.mocked(submitMerchantOrder).mockRejectedValueOnce(new MerchantSubmissionUnknownError()).mockResolvedValue({order});
  const user = userEvent.setup(); const first = render(<MerchantOrderPage token="shop-token" initialTable="A08"/>);
  await user.click(await screen.findByRole('button', {name: '添加番茄牛肉面'}));
  await user.click(screen.getByRole('button', {name: '查看已选菜品'}));
  await user.click(screen.getByRole('button', {name: '确认提交订单'}));
  await screen.findByRole('alert');
  const input = vi.mocked(submitMerchantOrder).mock.calls[0][1];
  first.unmount();
  vi.mocked(getPublicMerchant).mockResolvedValue({shop: {name: '巷口小馆', menu: []}});
  const recovered = render(<MerchantOrderPage token="shop-token" initialTable="OTHER"/>);
  expect(await screen.findByRole('heading', {name: '核对点单'})).toBeInTheDocument();
  expect(screen.getByLabelText('桌号')).toHaveValue('A08');
  expect(screen.getByLabelText('桌号')).toBeDisabled();
  expect(screen.getByText('番茄牛肉面')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('结果待核对');
  expect(submitMerchantOrder).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', {name: '核对原订单'}));
  await screen.findByRole('heading', {name: '订单已提交'});
  expect(vi.mocked(submitMerchantOrder).mock.calls[1][1]).toEqual(input);
  recovered.unmount();
  render(<MerchantOrderPage token="shop-token"/>);
  expect(await screen.findByRole('heading', {name: '核对点单'})).toBeInTheDocument();
  expect(screen.queryByText('请向店员付款，本页不会扣款。')).not.toBeInTheDocument();
  vi.mocked(submitMerchantOrder).mockResolvedValue({order: {...order, status: 'paid', paidAt: order.createdAt + 1000}});
  await user.click(screen.getByRole('button', {name: '核对原订单'}));
  expect(await screen.findByText('店员已登记收款')).toBeInTheDocument();
  expect(vi.mocked(submitMerchantOrder).mock.calls[2][1]).toEqual(input);
  await user.click(screen.getByRole('button', {name: '再点一单'}));
  expect(sessionStorage.length).toBe(0);
});
