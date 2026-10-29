import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {MerchantFundingPanel} from './merchant-funding';
import {merchantRequest,hasPendingMerchantOperation,recoverMerchantOperation} from '../lib/merchant-service';
import {emptyMerchantState,type MerchantState} from '../lib/merchant';
vi.mock('../lib/merchant-service',()=>({merchantRequest:vi.fn(),hasPendingMerchantOperation:vi.fn(()=>false),recoverMerchantOperation:vi.fn()}));
const now=Date.now();
const fixture=():MerchantState=>({...emptyMerchantState(),revision:2,shop:{id:'s',name:'测试小馆',publicToken:'abcdefghijklmnopqrstuv',createdAt:now,menu:[]},funding:{cash:{amount:500000,confirmedAt:now,ledgerNet:0},plans:[{id:'rent',title:'房租',category:'房租',amount:300000,dueDate:'2026-11-01',status:'planned',createdAt:now,updatedAt:now}]}});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(hasPendingMerchantOperation).mockReturnValue(false);vi.mocked(merchantRequest).mockResolvedValue(fixture());});afterEach(cleanup);
it('先展示已知方案，缺日期就地补齐，确认前没有写账',async()=>{
 render(<MerchantFundingPanel draft={{intent:'plan',revision:2,planId:'stock',title:'进货',category:'进货',amount:250000}}/>);
 await screen.findByText('可用资金');expect(merchantRequest).toHaveBeenCalledTimes(1);
 expect(screen.getByLabelText('安排金额（元）')).toHaveValue(2500);
 fireEvent.change(screen.getByLabelText('到期日期'),{target:{value:'2026-11-03'}});
 fireEvent.click(screen.getByRole('button',{name:'确认保存安排'}));
 await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith({type:'save-funding-plan',id:'stock',title:'进货',category:'进货',amount:250000,dueDate:'2026-11-03'},2));
 expect(await screen.findByRole('status')).toHaveTextContent('已保存');
});
it('历史卡没有执行入口，版本变化必须重新核对',async()=>{
 const {rerender}=render(<MerchantFundingPanel active={false} draft={{intent:'plan',revision:1,planId:'new',title:'进货',amount:10000,dueDate:'2026-11-01'}}/>);
 expect(screen.queryByRole('button',{name:'确认保存安排'})).not.toBeInTheDocument();expect(merchantRequest).not.toHaveBeenCalled();
 rerender(<MerchantFundingPanel draft={{intent:'plan',revision:1,planId:'new',title:'进货',amount:10000,dueDate:'2026-11-01'}}/>);
 expect(await screen.findByRole('button',{name:'确认保存安排'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'已核对最新记录'}));
 expect(screen.getByRole('button',{name:'确认保存安排'})).not.toBeDisabled();
});
it('登记已付时让用户选择已有支出，避免重复记账',async()=>{
 const state=fixture();state.expenses=[{id:'expense',title:'租金',category:'房租',amount:300000,occurredAt:now}];vi.mocked(merchantRequest).mockResolvedValue(state);
 render(<MerchantFundingPanel draft={{intent:'paid',revision:2,planId:'rent',title:'房租',amount:300000}}/>);
 await screen.findByText('可用资金');expect(screen.getByRole('button',{name:'确认登记已支付'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('记账方式'),{target:{value:'existing'}});
 fireEvent.change(screen.getByLabelText('关联已有支出'),{target:{value:'expense'}});
 fireEvent.click(screen.getByRole('button',{name:'确认登记已支付'}));
 await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith({type:'pay-funding-plan',id:'rent',expenseId:'expense'},2));
});
it('结果不明时保留编辑并提供原请求恢复，不能重复提交',async()=>{
 vi.mocked(merchantRequest).mockImplementation(async operation=>{if(operation){vi.mocked(hasPendingMerchantOperation).mockReturnValue(true);throw new Error('上次结果待核对');}return fixture();});
 vi.mocked(recoverMerchantOperation).mockResolvedValue(fixture());
 render(<MerchantFundingPanel draft={{intent:'cash',revision:2,amount:800000}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'确认可用余额'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('待核对');expect(screen.getByRole('button',{name:'确认可用余额'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'核对上次记录'}));await waitFor(()=>expect(recoverMerchantOperation).toHaveBeenCalledTimes(1));
});
it('小店入口把自然需求交回统一对话，不另开一套会话',async()=>{
 const ask=vi.fn();render(<MerchantFundingPanel onAsk={ask} stewardName="阿衡"/>);
 await screen.findByText('可用资金');fireEvent.change(screen.getByLabelText('交代小店资金安排'),{target:{value:'下周五进货2000元'}});fireEvent.click(screen.getByRole('button',{name:'交给阿衡'}));
 expect(ask).toHaveBeenCalledWith('我的小店资金安排：下周五进货2000元');
});
it('从清单调整、取消均先展示核对，手动添加可编辑分类，余额允许为零',async()=>{
 render(<MerchantFundingPanel/>);await screen.findByText('可用资金');
 fireEvent.click(screen.getByText('房租',{selector:'.funding-plan-info strong'}));fireEvent.click(screen.getByRole('button',{name:'调整'}));
 fireEvent.change(screen.getByLabelText('支出事项'),{target:{value:'新租金'}});fireEvent.change(screen.getByLabelText('安排金额（元）'),{target:{value:'2800'}});fireEvent.change(screen.getByLabelText('安排分类'),{target:{value:'其他'}});
 fireEvent.click(screen.getByRole('button',{name:'确认保存安排'}));await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith(expect.objectContaining({id:'rent',title:'新租金',amount:280000,category:'其他'}),2));
 fireEvent.click(screen.getByRole('button',{name:'取消安排'}));expect(screen.getByText(/只释放计划中的预留/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'确认取消安排'}));await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith({type:'cancel-funding-plan',id:'rent'},2));
 fireEvent.click(screen.getByRole('button',{name:'核对余额'}));fireEvent.change(screen.getByLabelText('当前余额（元）'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'确认可用余额'}));await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith({type:'set-funding-cash',amount:0},2));
 fireEvent.click(screen.getByRole('button',{name:'手动添加'}));expect(screen.getByRole('button',{name:'确认保存安排'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'暂不处理'}));expect(screen.queryByLabelText('支出事项')).not.toBeInTheDocument();
});
it('新登记付款保存实际发生时间，已保存旧卡不重复执行，结束状态可回看',async()=>{
 const s=fixture();vi.mocked(merchantRequest).mockImplementation(async op=>{if(op?.type==='pay-funding-plan'){s.revision++;s.funding!.plans[0]={...s.funding!.plans[0],status:'paid',expenseId:'paid'};s.expenses.push({id:'paid',title:'房租',category:'房租',amount:300000,occurredAt:now-60000});}return structuredClone(s);});
 const proposal={intent:'paid' as const,revision:2,planId:'rent',title:'房租',amount:300000};
 const {unmount}=render(<MerchantFundingPanel draft={proposal}/>);await screen.findByText('可用资金');fireEvent.change(screen.getByLabelText('记账方式'),{target:{value:'new'}});
 fireEvent.change(screen.getByLabelText('实际付款时间'),{target:{value:'2026-01-01T12:00'}});fireEvent.click(screen.getByRole('button',{name:'确认登记已支付'}));
 await waitFor(()=>expect(merchantRequest).toHaveBeenCalledWith({type:'pay-funding-plan',id:'rent',occurredAt:Date.parse('2026-01-01T12:00:00+08:00')},2));
 fireEvent.click(screen.getByText('已完成与取消的安排'));expect(screen.getByText('已支付',{selector:'.funding-history span'})).toBeInTheDocument();
 unmount();render(<MerchantFundingPanel draft={proposal}/>);expect(await screen.findByText('这笔安排已支付')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'确认登记已支付'})).not.toBeInTheDocument();
});
it('读取失败可恢复；无余额不推算，无小店不能创建资金安排',async()=>{
 vi.mocked(merchantRequest).mockRejectedValueOnce(new Error('暂时断开'));
 const {unmount}=render(<MerchantFundingPanel/>);expect(await screen.findByRole('alert')).toHaveTextContent('暂时断开');
 const s=fixture();s.funding={plans:[]};vi.mocked(merchantRequest).mockResolvedValue(s);fireEvent.click(screen.getByRole('button',{name:'重新读取'}));expect(await screen.findByText('待测算')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'确认余额'}));expect(screen.getByRole('button',{name:'确认可用余额'})).toBeDisabled();unmount();
 vi.mocked(merchantRequest).mockResolvedValue(emptyMerchantState());render(<MerchantFundingPanel/>);expect(await screen.findByText(/先在“我的小店”创建店铺/)).toBeInTheDocument();
});
it('保存前随金额修改展示资金影响，预览不改变真实账本',async()=>{
 render(<MerchantFundingPanel draft={{intent:'plan',revision:2,planId:'stock',title:'进货',category:'进货',amount:250000,dueDate:'2026-11-03'}}/>);
 expect(await screen.findByText(/保存后预计缺口 ¥500.00/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('安排金额（元）'),{target:{value:'1500'}});
 expect(screen.getByText(/保存后预计可用 ¥500.00/)).toBeInTheDocument();expect(merchantRequest).toHaveBeenCalledTimes(1);
});
it.each(['cancelled','paid'] as const)('恢复%s安排的旧修改卡只显示最终记录，不再展示编辑和预测缺口',async status=>{
 const state=fixture();state.revision=4;state.funding!.plans[0]={...state.funding!.plans[0],status};
 vi.mocked(merchantRequest).mockResolvedValue(state);
 render(<MerchantFundingPanel draft={{intent:'plan',revision:2,planId:'rent',title:'房租',amount:800000,dueDate:'2026-11-01'}}/>);
 expect(await screen.findByText(status==='paid'?'这笔安排已支付':'这笔安排已取消')).toBeInTheDocument();
 expect(screen.queryByText(/保存后预计/)).not.toBeInTheDocument();
 expect(screen.queryByLabelText('安排金额（元）')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'确认保存安排'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'已核对最新记录'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'核对余额'})).toBeEnabled();
 expect(merchantRequest).toHaveBeenCalledTimes(1);
});
it('当前打开的修改方案在同步为取消状态后立即移除预测和编辑',async()=>{
 render(<MerchantFundingPanel draft={{intent:'plan',revision:2,planId:'rent',title:'房租',amount:800000,dueDate:'2026-11-01'}}/>);
 expect(await screen.findByText(/保存后预计缺口/)).toBeInTheDocument();
 const ended=fixture();ended.revision=3;ended.funding!.plans[0].status='cancelled';
 vi.mocked(merchantRequest).mockResolvedValue(ended);
 fireEvent.click(screen.getByRole('button',{name:'刷新资金安排'}));
 expect(await screen.findByText('这笔安排已取消')).toBeInTheDocument();
 expect(screen.queryByText(/保存后预计/)).not.toBeInTheDocument();
 expect(screen.queryByLabelText('安排金额（元）')).not.toBeInTheDocument();
});
