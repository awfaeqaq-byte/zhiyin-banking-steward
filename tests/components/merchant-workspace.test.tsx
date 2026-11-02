import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it, vi} from 'vitest';
import {MerchantWorkspace} from '../../src/components/merchant-workspace';
import {MerchantInsightCard} from '../../src/components/merchant-insight-card';
import * as service from '../../src/lib/merchant-service';
import {merchantSummary, type MerchantState} from '../../src/lib/merchant';

vi.mock('../../src/components/merchant-qr', () => ({MerchantQRCode: ({url}: {url:string}) => <span data-testid="qr">{url}</span>}));
const now = Date.now();
const base: MerchantState = {version: 1, revision: 2, shop: {id:'shop', name:'巷口小馆', publicToken:'public-token', createdAt:now, menu:[{id:'dish',name:'番茄炒蛋',category:'热菜',price:1800,available:true}]}, orders:[{id:'order-1',table:'3',items:[{menuItemId:'dish',name:'番茄炒蛋',quantity:2,unitPrice:1800,amount:3600}],total:3600,status:'pending',createdAt:now}],expenses:[]};
const copy = ():MerchantState => structuredClone(base);
function setup(state=copy()) {return vi.spyOn(service,'merchantRequest').mockResolvedValue(state);}
afterEach(() => vi.restoreAllMocks());

it('读取失败提供重试，不能把失败伪装成尚未开店', async () => {
 const request=setup();request.mockRejectedValueOnce(new Error('小店暂时无法连接'));
 const user=userEvent.setup();render(<MerchantWorkspace stewardName="阿衡" onAsk={vi.fn()}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('小店暂时无法连接');
 expect(screen.queryByRole('button',{name:'开通我的小店'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'重新读取'}));
 expect(await screen.findByRole('heading',{name:'巷口小馆'})).toBeInTheDocument();
});

it('开店只要求店名，明确基础菜单可编辑且没有虚构营业额', async () => {
 const request=setup({...base,revision:0,shop:null,orders:[]});const user=userEvent.setup();
 render(<MerchantWorkspace stewardName="阿衡" onAsk={vi.fn()}/>);
 await user.type(await screen.findByRole('textbox',{name:'店铺名称'}),'巷口小馆');
 expect(screen.getByText(/可编辑的基础菜单/)).toBeInTheDocument();
 request.mockResolvedValueOnce({...base,orders:[]});
 await user.click(screen.getByRole('button',{name:'开通我的小店'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith({type:'create-shop',name:'巷口小馆'},0));
 expect(await screen.findByRole('heading',{name:'巷口小馆'})).toBeInTheDocument();
});

it('待收款订单不会计入实收，确认记录之前不改变账本', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'订单'}));
 await user.click(screen.getByText('3 桌'));
 await user.click(screen.getByRole('button',{name:'记录已收款'}));
 const confirm=screen.getByRole('region',{name:'确认收款记录'});
 expect(confirm).toHaveTextContent('已实际收到');
 expect(request).toHaveBeenCalledTimes(1);
 request.mockResolvedValueOnce({...base,revision:3,orders:[{...base.orders[0],status:'paid',paidAt:now}]});
 await user.click(within(confirm).getByRole('button',{name:'确认已收到 ¥36.00'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith({type:'record-payment',orderId:'order-1'},2));
 expect(await screen.findByText('收款已记录')).toBeInTheDocument();
});

it('刷新保留未保存菜单，版本变化要求重新核对再保存', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'菜单'}));
 await user.click(screen.getByLabelText('编辑菜品：番茄炒蛋'));
 const input=screen.getByRole('textbox',{name:'菜品1名称'});
 await user.clear(input);await user.type(input,'家常炒蛋');
 request.mockResolvedValue({...base,revision:3});
 await user.click(screen.getByRole('button',{name:'刷新小店'}));
 await waitFor(()=>expect(screen.getByText(/菜单编辑已保留/)).toBeInTheDocument());
 expect(input).toHaveValue('家常炒蛋');
 expect(screen.getByRole('button',{name:'保存菜单'})).toBeDisabled();
 await user.click(screen.getByRole('button',{name:'已核对，保留我的编辑'}));
 await user.click(screen.getByRole('button',{name:'保存菜单'}));
 await waitFor(()=>expect(request).toHaveBeenLastCalledWith({type:'save-menu',menu:[{...base.shop!.menu[0],name:'家常炒蛋'}]},3));
});

it('记支出保存分值与时间，管家入口回到统一对话', async () => {
 const request=setup();const ask=vi.fn();const user=userEvent.setup();render(<MerchantWorkspace stewardName="阿衡" onAsk={ask}/>);
 await user.click(await screen.findByRole('button',{name:'记一笔支出'}));
 await user.type(screen.getByRole('textbox',{name:'支出事项'}),'早市进货');
 await user.type(screen.getByRole('spinbutton',{name:'支出金额（元）'}),'86.5');
 await user.click(screen.getByRole('button',{name:'保存支出'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({type:'add-expense',title:'早市进货',amount:8650}),2));
 await user.type(screen.getByRole('textbox',{name:'问阿衡小店经营'}),'今天哪道菜最受欢迎？');
 await user.click(screen.getByRole('button',{name:'问阿衡'}));
 expect(ask).toHaveBeenCalledWith('帮我分析小店经营：今天哪道菜最受欢迎？');
});

it('后台更新只刷新账本，不覆盖正在填写的经营支出', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'记一笔支出'}));
 await user.type(screen.getByRole('textbox',{name:'支出事项'}),'晚市进货');
 request.mockResolvedValue({...base,revision:3});
 act(()=>window.dispatchEvent(new Event('zhiyin-merchant-updated')));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
 expect(screen.getByRole('textbox',{name:'支出事项'})).toHaveValue('晚市进货');
});

it('分析卡保留统计口径和快照时间，不把现金差额叫作利润', () => {
 const state={...base,orders:[{...base.orders[0],status:'paid' as const,paidAt:now}]};
 render(<MerchantInsightCard shopName="巷口小馆" summary={merchantSummary(state,'all',now)} onOpen={vi.fn()}/>);
 expect(screen.getByText('净收款')).toBeInTheDocument();
 expect(screen.getByText(/本次查询快照/)).toBeInTheDocument();
 expect(screen.getByText('番茄炒蛋')).toBeInTheDocument();
 expect(screen.queryByText('净利润')).not.toBeInTheDocument();
});

it('收款写入失败保留确认与待收款状态，不显示成功', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'订单'}));await user.click(screen.getByText('3 桌'));
 await user.click(screen.getByRole('button',{name:'记录已收款'}));
 request.mockRejectedValueOnce(new Error('记录未完成，请重新核对'));
 await user.click(screen.getByRole('button',{name:'确认已收到 ¥36.00'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('记录未完成');
 expect(screen.getByRole('region',{name:'确认收款记录'})).toBeInTheDocument();
 expect(screen.queryByText('收款已记录')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'记录退款'})).not.toBeInTheDocument();
});

it('退款必须确认实际已经全额退回，操作只记退款账目', async () => {
 const paid={...base,orders:[{...base.orders[0],status:'paid' as const,paidAt:now}]};
 const request=setup(paid);const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'订单'}));await user.click(screen.getByText('3 桌'));
 expect(screen.queryByRole('button',{name:'取消订单'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'记录退款'}));
 const region=screen.getByRole('region',{name:'确认退款记录'});
 expect(region).toHaveTextContent('已在原渠道全额退回');expect(region).toHaveTextContent('不会代你转出资金');
 expect(request).toHaveBeenCalledTimes(1);
 await user.click(within(region).getByRole('button',{name:'确认已退回 ¥36.00'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith({type:'record-refund',orderId:'order-1'},2));
});

it('取消未付款订单也先核对，保留原订单记录', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'订单'}));await user.click(screen.getByText('3 桌'));
 await user.click(screen.getByRole('button',{name:'取消订单'}));
 expect(screen.getByRole('region',{name:'确认取消订单'})).toHaveTextContent('订单记录仍然保留');
 expect(request).toHaveBeenCalledTimes(1);
 request.mockResolvedValueOnce({...base,revision:3,orders:[{...base.orders[0],status:'cancelled'}]});
 await user.click(screen.getByRole('button',{name:'确认取消订单'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith({type:'cancel-order',orderId:'order-1'},2));
 expect(screen.getByText('3 桌')).toBeInTheDocument();
 expect(screen.getByText('订单已取消')).toBeInTheDocument();
});

it('菜单保存冲突后保留草稿，能展开最新菜单后明确采用服务器版本', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'菜单'}));
 await user.click(screen.getByLabelText('编辑菜品：番茄炒蛋'));
 const input=screen.getByRole('textbox',{name:'菜品1名称'});await user.clear(input);await user.type(input,'我的炒蛋');
 request.mockRejectedValueOnce(new Error('版本冲突，请重新读取'));
 await user.click(screen.getByRole('button',{name:'保存菜单'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('版本冲突');expect(input).toHaveValue('我的炒蛋');
 request.mockResolvedValueOnce({...base,revision:3,shop:{...base.shop!,menu:[{...base.shop!.menu[0],name:'最新炒蛋'}]}});
 await user.click(screen.getByRole('button',{name:'重新读取'}));
 await user.click(await screen.findByText('查看最新已保存菜单'));
 expect(screen.getByText(/最新炒蛋 · ¥18.00/)).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'放弃编辑，改用最新菜单'}));
 expect(input).toHaveValue('最新炒蛋');expect(screen.getByRole('button',{name:'保存菜单'})).toBeDisabled();
});

it('失联后先核对同一笔记录，普通刷新不能解锁或重复提交支出', async () => {
 const request=setup(), pending=vi.spyOn(service,'hasPendingMerchantOperation').mockReturnValue(false);
 const recovery=vi.spyOn(service,'recoverMerchantOperation');
 const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'记一笔支出'}));
 await user.type(screen.getByRole('textbox',{name:'支出事项'}),'早市进货');
 await user.type(screen.getByRole('spinbutton',{name:'支出金额（元）'}),'86.5');
 request.mockImplementationOnce(async()=>{pending.mockReturnValue(true);throw new Error('网络中断，结果待确认');});
 await user.click(screen.getByRole('button',{name:'保存支出'}));
 expect(await screen.findByRole('region',{name:'上次记录结果待核对'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'保存支出'})).toBeDisabled();
 await user.click(screen.getByRole('button',{name:'刷新小店'}));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
 expect(screen.getByRole('button',{name:'保存支出'})).toBeDisabled();
 const recovered={...base,revision:3,expenses:[{id:'expense',title:'早市进货',category:'进货',amount:8650,occurredAt:now}]};
 recovery.mockImplementationOnce(async()=>{pending.mockReturnValue(false);return recovered;});
 await user.click(screen.getByRole('button',{name:'核对上次记录'}));
 expect(await screen.findByText(/上次记录结果已核对/)).toBeInTheDocument();
 expect(recovery).toHaveBeenCalledOnce();expect(request).toHaveBeenCalledTimes(3);
 expect(screen.queryByRole('region',{name:'上次记录结果待核对'})).not.toBeInTheDocument();
 expect(screen.getByText('早市进货')).toBeInTheDocument();
});

it('菜单按需展开，隐藏的未填菜品会展开核对而不会提交', async () => {
 const request=setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'菜单'}));
 expect(screen.getByLabelText('菜品1名称')).not.toBeVisible();
 await user.click(screen.getByRole('button',{name:'添加菜品'}));
 expect(screen.getByRole('textbox',{name:'菜品2名称'})).toBeVisible();
 await user.click(screen.getByLabelText('编辑菜品：新菜品'));
 expect(screen.getByLabelText('菜品2名称')).not.toBeVisible();
 await user.click(screen.getByRole('button',{name:'保存菜单'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('请为每道菜填写');
 expect(screen.getByRole('textbox',{name:'菜品2名称'})).toBeVisible();
 expect(screen.getByRole('textbox',{name:'菜品2名称'})).toHaveFocus();
 expect(request).toHaveBeenCalledTimes(1);
});

it('概览记支出入口定位填写处，筛选空态解释对应状态', async () => {
 setup();const user=userEvent.setup();render(<MerchantWorkspace stewardName="宁宁" onAsk={vi.fn()}/>);
 await user.click(await screen.findByRole('button',{name:'记支出'}));
 expect(screen.getByRole('textbox',{name:'支出事项'})).toHaveFocus();
 await user.click(screen.getByRole('button',{name:'订单'}));
 await user.click(screen.getByRole('button',{name:'已退款'}));
 expect(screen.getByText('登记已实际退回的款项后，会显示在这里。')).toBeInTheDocument();
});
