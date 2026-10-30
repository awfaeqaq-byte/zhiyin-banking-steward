import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
import {reportFixture} from '../test/voice-trip-fixture';
import {VoiceTripReport} from './voice-trip-report';
afterEach(()=>vi.restoreAllMocks());
it('在持续语音页展示完整结算、成员应摊、个人排除和三期扣费证据，不拦住后续指令',async()=>{
 let business:VoiceBusiness=async()=>({text:''});vi.spyOn(transport,'createVoiceConnection').mockImplementation(o=>{business=o.business;return {start:async()=>o.onState({...initialVoiceState,phase:'listening'}),stop:vi.fn(),setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'账单汇总好了',trip:reportFixture()}));render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await act(async()=>{await business('整理账单','first',new AbortController().signal);});const card=screen.getByRole('region',{name:'旅行账单与续费'});expect(within(card).getAllByText('¥2,724.00')[0]).toBeVisible();expect(within(card).getByText('生日蛋糕 ¥206.00 · 你请客，不计AA')).toBeVisible();expect(within(card).getByText('星光视频会员')).toBeVisible();expect(within(card).getByText('8/28、9/28、10/28')).toBeVisible();
 fireEvent.click(within(card).getByText('查看账单明细'));expect(within(card).getByText('住宿等')).toBeVisible();
 await act(async()=>{await business('AA照这个，续费取消','second',new AbortController().signal);});expect(request).toHaveBeenCalledTimes(2);expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();
});
it('无效回执不呈现成成功状态',()=>{render(<VoiceTripReport report={{...reportFixture(),stage:'done'}}/>);expect(screen.queryByRole('region',{name:'旅行账单与续费'})).not.toBeInTheDocument();});

it('完成回执同时保留群收款待发送和单项续费取消，不称为已收齐或退款',async()=>{
 const r=reportFixture();const {changeExpenses}=await import('../lib/expense-notebook');
 const state=changeExpenses({revision:0,books:[r.book],applied:[]},{type:'prepare',bookId:r.book.id,batchId:'ready',entryIds:r.entryIds,revision:0,requestId:'ready'},r.asOf);
 render(<VoiceTripReport report={{...r,stage:'done',batchId:'ready',book:state.books[0],source:{...r.source,cancelledAutopayIds:['video'],autopays:r.source.autopays.map(a=>({...a,nextChargeAt:undefined}))}}}/>);
 expect(screen.getByText(/群收款已准备 · 待发送/)).toBeVisible();expect(screen.getByText('自动续费已取消')).toBeVisible();expect(screen.getByText('¥2,013.83')).toBeVisible();expect(screen.getByText('已停止后续自动扣费，历史款项不退款')).toBeVisible();
});
