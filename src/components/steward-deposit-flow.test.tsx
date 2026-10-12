import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardChatHome} from './steward-chat-home';
import type {StewardReplyFn} from '../lib/steward-chat';
import {emptyMemory} from '../lib/steward-memory';
afterEach(()=>vi.restoreAllMocks());
it('首页一句定存请求就地显示方案，宁宁拿到资产快照，不跳去填写功能表',async()=>{
 const summary={cash:4230000,wealth:0,deposits:0,total:4230000,holdingCount:0,depositCount:0,availableCash:4230000,reservedCash:0};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/bank')?{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],assetSummary:summary,termDeposits:[]}:emptyMemory())));
 const reply=vi.fn<StewardReplyFn>(async()=>({text:'先核对金额、期限和可用资金，确认前不会扣款。',view:'term_deposit' as const}));
 render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
 fireEvent.change(screen.getByLabelText('和宁宁说点什么'),{target:{value:'存1000元，6个月定期'}});
 fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 await screen.findByRole('region',{name:'定期存款办理'});
 expect(screen.getByLabelText('存入金额（元）')).toHaveValue('1000');expect(screen.getByRole('radio',{name:/6个月/})).toBeChecked();
 await waitFor(()=>expect(reply.mock.calls.at(-1)?.[0]).toMatchObject({bank:{assetSummary:{total:4230000}}}));
});
it('刷新回来恢复只读定存方案，不自动确认或重放扣款',async()=>{
 const state={revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],assetSummary:{cash:4230000,wealth:0,deposits:0,total:4230000,holdingCount:0,depositCount:0,availableCash:4230000,reservedCash:0},termDeposits:[]};
 localStorage.setItem('zhiyin-steward-conversation-v1',JSON.stringify([{id:'user-deposit',role:'user',content:'存1000元，6个月定期'},{id:'assistant-deposit',role:'assistant',content:'先核对再确认。',view:'term_deposit'}]));
 const requests=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(state)));
 render(<StewardChatHome seamless stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()}/>);
 await screen.findByRole('region',{name:'定期存款办理'});expect(screen.getByLabelText('存入金额（元）')).toHaveValue('1000');
 expect(requests.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0);
});
