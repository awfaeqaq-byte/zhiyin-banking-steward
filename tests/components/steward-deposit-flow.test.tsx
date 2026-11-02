import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardChatHome} from '../../src/components/steward-chat-home';
import type {StewardReplyFn} from '../../src/lib/steward-chat';
import {emptyMemory} from '../../src/lib/steward-memory';
import {buildWechatShare,readonlyWechatShare} from '../../src/lib/wechat-message-share';
afterEach(()=>vi.restoreAllMocks());
it('只解释微信中的定存文字，即使模型给出定存视图也不展示办理入口',async()=>{
 const shared=buildWechatShare({id:'friend',name:'朋友',kind:'direct'},[{id:'quote',sender:'朋友',text:'存1000元，6个月定期',sentAt:1791770000000}],['quote'],'解释一下','readonly-deposit');
 const reply=vi.fn<StewardReplyFn>(async()=>({text:'这是朋友提到的一笔定存安排。',view:'term_deposit'}));
 const requests=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(emptyMemory())));
 render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply} wechatShare={shared}/>);
 fireEvent.change(screen.getByLabelText('和宁宁说点什么'),{target:{value:'解释一下'}});
 fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 await screen.findByText('这是朋友提到的一笔定存安排。');
 expect(readonlyWechatShare(reply.mock.calls[0][0].messages.at(-1)!.content)).toBe(true);
 expect(screen.queryByRole('region',{name:'定期存款办理'})).not.toBeInTheDocument();
 expect(reply.mock.calls[0][0].bank).toBeUndefined();
 expect(requests.mock.calls.filter(([url])=>String(url).includes('/bank'))).toHaveLength(0);
});
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
