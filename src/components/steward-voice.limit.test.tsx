import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import * as bank from '../lib/bank-transfer';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';

const now=Date.now();
const before={cardId:'primary' as const,revision:3,balance:2176000,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],schedules:[]};
const review={kind:'payment_limit' as const,cardId:'primary' as const,before,limit:200000,createdAt:now,expiresAt:now+300000};
const after={...before,limit:200000,revision:4};
afterEach(()=>vi.restoreAllMocks());
async function setup(value=review){
 let business:VoiceBusiness=async()=>({text:''});
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>options.onState({...initialVoiceState,phase:'listening'}),stop:vi.fn(),setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'单笔支付限额改为两千元，请确认。',review:value}));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await act(async()=>{await business('单笔支付限额调到两千','limit',new AbortController().signal);});return {business,request};
}
it('语音原页展示卡片、原限额和目标；生成方案不提交',async()=>{
 const request=vi.spyOn(bank,'bankRequest');await setup();
 expect(screen.getByRole('region',{name:'单笔支付限额方案'})).toBeVisible();
 expect(screen.getByText('日常支付卡 · 尾号 8888')).toBeVisible();
 expect(screen.getByText('¥20,000.00')).toBeVisible();expect(screen.getByRole('button',{name:'确认调整为 ¥2,000.00'})).toBeEnabled();expect(request).not.toHaveBeenCalled();
});
it('只提交一次限额设置，读回后原页显示生效，不停止语音',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockResolvedValueOnce(after).mockResolvedValueOnce(after);await setup();
 const button=screen.getByRole('button',{name:'确认调整为 ¥2,000.00'});fireEvent.click(button);fireEvent.click(button);
 await screen.findByText('已生效');expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();
 expect(request).toHaveBeenNthCalledWith(1,{type:'settings',revision:3,limit:200000},'primary');expect(request).toHaveBeenNthCalledWith(2,undefined,'primary');expect(request).toHaveBeenCalledTimes(2);
});
it('口头确认不能提交；取消不修改限额',async()=>{
 const request=vi.spyOn(bank,'bankRequest');const call=await setup();await act(async()=>{await call.business('确认','yes',new AbortController().signal);});
 expect(call.request).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'暂不调整'}));expect(request).not.toHaveBeenCalled();expect(screen.queryByRole('region',{name:'单笔支付限额方案'})).not.toBeInTheDocument();
});
it('过期方案禁止确认',async()=>{
 await setup({...review,createdAt:now-300001,expiresAt:now-1});expect(screen.getByRole('button',{name:'确认调整为 ¥2,000.00'})).toBeDisabled();
});
it('提交响应丢失仍先读回，不重复设置',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce(after);await setup();fireEvent.click(screen.getByRole('button',{name:'确认调整为 ¥2,000.00'}));await screen.findByText('已生效');expect(request).toHaveBeenCalledTimes(2);
});
it('旧版本或错误限额不算成功，只能重新读取结果',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockRejectedValueOnce(Error('账户已变化')).mockResolvedValueOnce(before).mockResolvedValueOnce(after);await setup();fireEvent.click(screen.getByRole('button',{name:'确认调整为 ¥2,000.00'}));await screen.findByRole('alert');expect(screen.queryByText('已生效')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'重新核对限额'}));await screen.findByText('已生效');expect(request.mock.calls.filter(a=>(a[0] as {type?:string})?.type==='settings')).toHaveLength(1);
});
it('不接受越界限额或不匹配卡片的方案',async()=>{
 await setup({...review,limit:1});expect(screen.queryByRole('region',{name:'单笔支付限额方案'})).not.toBeInTheDocument();
});
