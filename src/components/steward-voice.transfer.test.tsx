import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import * as bank from '../lib/bank-transfer';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
const now=Date.now();
const draft={id:'mom-500',recipientId:'mom' as const,amount:50000,sourceAccountId:'demo-8888' as const,remark:'生活费',executeAt:now+86400000,revision:0,balance:4000000,createdAt:now,expiresAt:now+300000};
const schedule={...draft,createdAt:now,status:'pending'};
const snapshot=(updates={})=>({revision:1,balance:4000000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],schedules:[schedule],...updates});
afterEach(()=>vi.restoreAllMocks());
async function setup(value={...draft}){
 let business:VoiceBusiness=async()=>({text:''});const stop=vi.fn();
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>options.onState({...initialVoiceState,phase:'listening'}),stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'明早八点给妈妈转五百生活费，先核对。',review:{kind:'scheduled_transfer' as const,draft:value}}));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await act(async()=>{await business('明早给妈妈转五百生活费','s02',new AbortController().signal);});return {business,request,stop};
}
it('语音页原地展示妈妈、账户、金额、时间、备注；生成方案不创建预约',async()=>{
 const request=vi.spyOn(bank,'bankRequest');await setup();expect(screen.getByRole('region',{name:'预约转账方案'})).toBeVisible();
 expect(screen.getByText('妈妈 · 尾号 6621')).toBeVisible();expect(screen.getByText('常用卡 8888')).toBeVisible();expect(screen.getByText('生活费')).toBeVisible();
 expect(screen.getByRole('button',{name:'确认预约 ¥500.00'})).toBeEnabled();expect(request).not.toHaveBeenCalled();
});
it('只预约，不立即转账；复查待执行状态和未扣款余额后显示成功',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockResolvedValueOnce(schedule).mockResolvedValueOnce(snapshot());const {stop}=await setup();
 const confirm=screen.getByRole('button',{name:'确认预约 ¥500.00'});fireEvent.click(confirm);fireEvent.click(confirm);
 await screen.findByText('预约成功');expect(screen.getByText('等待执行，当前未扣款')).toBeVisible();expect(screen.queryByText('已到账')).not.toBeInTheDocument();
 expect(request).toHaveBeenCalledTimes(2);expect(request).toHaveBeenNthCalledWith(1,{type:'schedule',draftId:draft.id,authorized:true});expect(request).toHaveBeenNthCalledWith(2);
 expect(stop).not.toHaveBeenCalled();expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();
});
it('口头确认不执行，取消方案不发预约请求',async()=>{
 const request=vi.spyOn(bank,'bankRequest');const call=await setup();await call.business('确认','yes',new AbortController().signal);expect(call.request).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'暂不预约'}));expect(request).not.toHaveBeenCalled();expect(screen.queryByRole('region',{name:'预约转账方案'})).not.toBeInTheDocument();
});
it('过期方案不能预约',async()=>{
 const request=vi.spyOn(bank,'bankRequest');await setup({...draft,createdAt:now-600000,expiresAt:now-1});expect(screen.getByRole('button',{name:'确认预约 ¥500.00'})).toBeDisabled();expect(request).not.toHaveBeenCalled();
});
it('金额或时间不一致不能当成预约成功',async()=>{
 vi.spyOn(bank,'bankRequest').mockResolvedValueOnce(schedule).mockResolvedValueOnce(snapshot({schedules:[{...schedule,amount:60000}]}));await setup();fireEvent.click(screen.getByRole('button',{name:'确认预约 ¥500.00'}));
 await screen.findByRole('alert');expect(screen.queryByText('预约成功')).not.toBeInTheDocument();
});
it('提交响应丢失只核对原预约，不再次提交',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockRejectedValueOnce(Error('网络中断')).mockResolvedValueOnce(snapshot());await setup();fireEvent.click(screen.getByRole('button',{name:'确认预约 ¥500.00'}));await screen.findByText('预约成功');expect(request).toHaveBeenCalledTimes(2);
});
it('结果核对失败只允许查原记录；尚无回执不能说成功',async()=>{
 const request=vi.spyOn(bank,'bankRequest').mockResolvedValueOnce(schedule).mockResolvedValueOnce(snapshot({schedules:[]})).mockResolvedValueOnce(snapshot());await setup();fireEvent.click(screen.getByRole('button',{name:'确认预约 ¥500.00'}));
 fireEvent.click(await screen.findByRole('button',{name:'重新核对预约'}));await screen.findByText('预约成功');expect(request.mock.calls.filter(a=>(a[0] as {type?:string})?.type==='schedule')).toHaveLength(1);
});
it('出现风险复核时不提供简化确认入口',async()=>{
 const request=vi.spyOn(bank,'bankRequest');await setup({...draft,review:{token:'review',large:false,matches:[]} } as typeof draft);expect(screen.queryByRole('button',{name:'确认预约 ¥500.00'})).not.toBeInTheDocument();expect(request).not.toHaveBeenCalled();
});
