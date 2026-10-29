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
