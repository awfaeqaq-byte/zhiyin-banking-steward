import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from '../../src/components/steward-voice';
import * as transport from '../../src/lib/voice-connection';
import * as wealth from '../../src/lib/wealth-operation';
import {initialVoiceState,type VoiceBusiness} from '../../src/lib/realtime-voice';

const short={id:'short-3000',productId:'cash-plus',principal:300000,units:300000,purchasedAt:Date.now()-86400000};
const long={id:'long-20000',productId:'steady-income',principal:2000000,units:2000000,purchasedAt:Date.now()-86400000};
const draft={id:'redeem-s01',holdingId:short.id,amount:300000,fee:0,createdAt:Date.now(),expiresAt:Date.now()+300000};
const review=()=>({kind:'wealth_redemption' as const,draft:{...draft},holding:{...short},protectedHoldings:[{...long}]});
const receipt={id:draft.id,holdingId:short.id,amount:300000,fee:0,completedAt:Date.now(),status:'redeemed'};
const snapshot=(protectedHolding=long)=>({version:1,receipts:[],cashBalance:4230000,holdings:[{...short,redeemedAt:receipt.completedAt},protectedHolding],redemptions:[receipt]});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
async function setup(value=review()){
 let business:VoiceBusiness=async()=>({text:''});
 const stop=vi.fn();
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>{options.onState({...initialVoiceState,phase:'listening'});},stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const onRequest=vi.fn(async()=>({text:'长期那笔不动，先核对三千元旅费方案。',review:value}));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={onRequest}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));
 fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await act(async()=>{await business('这趟预算三千，长期那笔别动','voice-s01',new AbortController().signal);});
 return {business,stop,onRequest};
}
it('方案在语音页展开，展示来源、费用、到账卡与保护持仓，不自动执行',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest');await setup();
 const call=screen.getByRole('region',{name:'语音对话'});
 expect(within(call).getByRole('region',{name:'旅费赎回方案'})).toBeVisible();
 expect(within(call).getByText('灵活现金管理')).toBeVisible();expect(within(call).getByText('稳健固收组合')).toBeVisible();
 expect(within(call).getByText('常用卡 8888')).toBeVisible();expect(within(call).getByRole('button',{name:'确认赎回 ¥3,000.00'})).toBeEnabled();
 expect(request).not.toHaveBeenCalled();expect(screen.queryByText('已到账')).not.toBeInTheDocument();
});
it('点击一次才执行并复查到账和长期持仓，保留通话，不能重复赎回',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest').mockResolvedValueOnce(receipt).mockResolvedValueOnce(snapshot());const {stop}=await setup();
 const confirm=screen.getByRole('button',{name:'确认赎回 ¥3,000.00'});fireEvent.click(confirm);fireEvent.click(confirm);
 await screen.findByText('已到账');expect(request).toHaveBeenCalledTimes(2);
 expect(request).toHaveBeenNthCalledWith(1,{type:'confirm-redemption',draftId:draft.id,authorized:true});expect(request).toHaveBeenNthCalledWith(2);
 expect(screen.getByText('长期持仓未变动')).toBeVisible();expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();expect(stop).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'确认赎回 ¥3,000.00'})).not.toBeInTheDocument();
});
it('口头确认不会授权或重做方案',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest');const {business,onRequest}=await setup();
 const result=await business('好，确认','voice-yes',new AbortController().signal);
 expect(result.text).toContain('点击');expect(request).not.toHaveBeenCalled();expect(onRequest).toHaveBeenCalledOnce();
});
it('方案过期后禁止执行，取消仅关闭当前方案',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest');const value=review();value.draft.createdAt=Date.now()-300000;value.draft.expiresAt=Date.now()-1;await setup(value);
 expect(screen.getByRole('button',{name:'确认赎回 ¥3,000.00'})).toBeDisabled();expect(screen.getByText(/方案已过期/)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'暂不赎回'}));expect(screen.queryByRole('region',{name:'旅费赎回方案'})).not.toBeInTheDocument();expect(request).not.toHaveBeenCalled();
});
it('长期持仓复查不一致时不能显示全部核对成功',async()=>{
 vi.spyOn(wealth,'wealthRequest').mockResolvedValueOnce(receipt).mockResolvedValueOnce(snapshot({...long,principal:1900000}));await setup();
 fireEvent.click(screen.getByRole('button',{name:'确认赎回 ¥3,000.00'}));await screen.findByRole('alert');
 expect(screen.queryByText('已到账')).not.toBeInTheDocument();expect(screen.queryByText('长期持仓未变动')).not.toBeInTheDocument();
 expect(screen.getByRole('alert')).toHaveTextContent('复查');
});
it('提交返回丢失只查原回执，不再次执行赎回',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest').mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce(snapshot());await setup();
 fireEvent.click(screen.getByRole('button',{name:'确认赎回 ¥3,000.00'}));await screen.findByText('已到账');
 expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.filter(args=>(args[0] as {type?:string})?.type==='confirm-redemption')).toHaveLength(1);
});
it('复查也失败时只允许重新核对结果',async()=>{
 const request=vi.spyOn(wealth,'wealthRequest').mockRejectedValueOnce(new Error('连接中断')).mockRejectedValueOnce(new Error('离线')).mockResolvedValueOnce(snapshot());await setup();
 fireEvent.click(screen.getByRole('button',{name:'确认赎回 ¥3,000.00'}));const retry=await screen.findByRole('button',{name:'重新核对结果'});fireEvent.click(retry);await screen.findByText('已到账');
 expect(request.mock.calls.filter(args=>(args[0] as {type?:string})?.type==='confirm-redemption')).toHaveLength(1);
});
it('被取消的旧语音请求不能重新展示可执行方案',async()=>{
 let resolve:(v:unknown)=>void=()=>{};const pending=new Promise(r=>{resolve=r;});let business:VoiceBusiness=async()=>({text:''});
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:vi.fn(async()=>{}),stop:vi.fn(),setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>initialVoiceState};});
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={async()=>await pending as {text:string}}/>);
 const abort=new AbortController();const result=business('准备旅费','old',abort.signal);abort.abort();await act(async()=>{resolve({text:'核对',review:review()});await result;});
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));expect(screen.queryByRole('region',{name:'旅费赎回方案'})).not.toBeInTheDocument();
});
