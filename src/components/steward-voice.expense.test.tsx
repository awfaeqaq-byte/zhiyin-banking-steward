import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import * as bank from '../lib/bank-transfer';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
import type {VoiceExpenseRecord as ExpenseRecord} from '../lib/voice-expense-record';
import {VoiceExpenseRecord} from './voice-expense-record';

const group={id:'trip-four',name:'海边四人行',revision:1,members:[{id:'self',name:'小叶',self:true},{id:'partner',name:'爱人'},{id:'wang',name:'小王'},{id:'li',name:'李娜'}]};
const entry={id:'drink-18',at:Date.now(),title:'饮料',amount:1800,payerId:'self',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))};
const book={id:'seaside-trip',title:'海边旅行',group,participants:group.members.map(m=>m.id),defaultPayerId:'self',entries:[entry],batches:[],at:Date.now()};
const expense:ExpenseRecord={kind:'expense_record',book,entryId:entry.id};
afterEach(()=>vi.restoreAllMocks());
async function setup(value=expense){
 let business:VoiceBusiness=async()=>({text:''});const stop=vi.fn();
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>options.onState({...initialVoiceState,phase:'listening'}),stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'记好了，饮料十八元，四个人每人四块五。',expense:value}));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await act(async()=>{await business('饮料十八，大家平分。','drink',new AbortController().signal);});return {business,request,stop};
}
it('已保存的饮料18元在语音原页显示四人各4.50元及你垫付',async()=>{
 const request=vi.spyOn(bank,'bankRequest');const call=await setup();const card=screen.getByRole('region',{name:'已记账消费'});
 expect(within(card).getByText('饮料')).toBeVisible();expect(within(card).getByText('¥18.00')).toBeVisible();expect(within(card).getByText('四人均摊')).toBeVisible();
 expect(within(card).getAllByText('¥4.50')).toHaveLength(4);for(const name of ['你','爱人','小王','李娜'])expect(within(card).getByText(name,{exact:true})).toBeVisible();
 expect(within(card).getByText('你先垫付')).toBeVisible();expect(within(card).queryByRole('button')).not.toBeInTheDocument();expect(request).not.toHaveBeenCalled();expect(call.stop).not.toHaveBeenCalled();
});
it('消费结果不拦住后续交代，不需要重复授权记账',async()=>{
 const call=await setup();await act(async()=>{await call.business('接着记晚饭','dinner',new AbortController().signal);});expect(call.request).toHaveBeenCalledTimes(2);expect(screen.getAllByRole('region',{name:'已记账消费'})).toHaveLength(1);
});
it('账本缺失该条消费时不显示已记账',async()=>{
 await setup({...expense,book:{...book,entries:[]}});expect(screen.queryByRole('region',{name:'已记账消费'})).not.toBeInTheDocument();
});
it('已发布到结算的旧消费不能冒充本轮刚记好的回执',async()=>{
 await setup({...expense,book:{...book,entries:[{...entry,batchId:'old'}]}});expect(screen.queryByRole('region',{name:'已记账消费'})).not.toBeInTheDocument();
});
it('直接展示时也拒绝缺失记录，并按实际人数、份数和垫付人呈现',()=>{
 const invalid={...expense,entryId:'missing'};const view=render(<VoiceExpenseRecord record={invalid}/>);expect(screen.queryByRole('region',{name:'已记账消费'})).not.toBeInTheDocument();
 const shares=entry.shares.slice(0,3).map((s,i)=>({...s,weight:i===0?2:1}));
 view.rerender(<VoiceExpenseRecord record={{...expense,book:{...book,entries:[{...entry,payerId:'wang',shares}]}}}/>);
 expect(screen.getByText('按约定分摊')).toBeVisible();expect(screen.getByText('小王先垫付')).toBeVisible();expect(screen.getByText('¥9.00')).toBeVisible();
 view.rerender(<VoiceExpenseRecord record={{...expense,book:{...book,entries:[{...entry,shares:shares.map(s=>({...s,weight:1}))}]}}}/>);expect(screen.getByText('3人均摊')).toBeVisible();
});
