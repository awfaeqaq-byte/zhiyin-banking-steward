import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import * as bank from '../lib/bank-transfer';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
import {emptyMerchantState} from '../lib/merchant';
const now=Date.now(),item={menuItemId:'rice',name:'招牌炒饭',quantity:2,unitPrice:2200,amount:4400};
const report={kind:'merchant_report' as const,period:'week' as const,asOf:now,state:{...emptyMerchantState(),shop:{id:'wang',name:'小王的家常小馆',publicToken:'wang-shop-public-token-001',createdAt:now,menu:[]},orders:[{id:'paid',table:'A1',items:[item],total:4400,status:'paid' as const,createdAt:now,paidAt:now}]}};
afterEach(()=>vi.restoreAllMocks());
async function setup(value=report){let business:VoiceBusiness=async()=>({text:''});vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>options.onState({...initialVoiceState,phase:'listening'}),stop:vi.fn(),setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={async()=>({text:'招牌炒饭卖得最好。',merchant:value})}/>);fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));await act(async()=>{await business('店里收了多少，哪个菜卖得好','shop',new AbortController().signal);});}
it('语音原页展示小王店名、净收款、每日数据和有效销量排行，不访问个人账户',async()=>{
 const request=vi.spyOn(bank,'bankRequest');await setup();const card=screen.getByRole('region',{name:'小王的小店经营结果'});
 expect(within(card).getByText('小王的家常小馆')).toBeVisible();expect(within(card).getByText('近7天')).toBeVisible();expect(within(card).getByText('净收款')).toBeVisible();expect(within(card).getAllByText('¥44.00').length).toBeGreaterThan(0);expect(within(card).getByText('招牌炒饭')).toBeVisible();expect(within(card).getByText('2份')).toBeVisible();expect(within(card).getByRole('img',{name:'每天净收款'})).toBeVisible();expect(request).not.toHaveBeenCalled();expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();
});
it('损坏的经营记录不能显示成已核对的小店统计',async()=>{await setup({...report,state:{...report.state,orders:[]},asOf:NaN});expect(screen.queryByRole('region',{name:'小王的小店经营结果'})).not.toBeInTheDocument();});
