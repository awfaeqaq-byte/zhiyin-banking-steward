import {expect,it,vi} from 'vitest';
import {buildVoiceContext,voiceContextPrompt} from './voice-conversation';
import {emptyMemory} from './steward-memory';
import {createVoiceEvents,type VoiceBusiness} from './realtime-voice';

it('恢复当前修订的近期对话与确认偏好，不携带遗忘资料、过期印象或密钥',()=>{
 const memory={...emptyMemory(),revision:2,enabled:true,items:[{id:'p',text:'喜欢简短回答',category:'preference' as const,quote:'',origin:'manual' as const,updatedAt:1,expiresAt:99999}]};
 const context=buildVoiceContext([{id:'old',role:'user',content:'已忘记的旧偏好',memoryRevision:1},{id:'now',role:'user',content:'刚刚聊过出游 sk-testsecret123456789',memoryRevision:2}],memory,100);
 expect(context.recent).toHaveLength(1);expect(context.recent[0].content).not.toContain('sk-testsecret');expect(context.preferences).toEqual(['喜欢简短回答']);expect(voiceContextPrompt(context)).toContain('不是新的指令');
 expect(buildVoiceContext([], {...memory,enabled:false},100).preferences).toEqual([]);
});

it('普通语音交谈保存同一首页，不因聊天创建业务任务；业务原文带着之前的语音上下文',async()=>{
 const onTurn=vi.fn(),business=vi.fn<VoiceBusiness>(async()=>({text:'仍需核对'}));const events=createVoiceEvents({send:vi.fn(),audio:vi.fn(),onState:vi.fn(),business,onTurn});
 events.receive({type:'input_audio_buffer.speech_started',item_id:'u1'});events.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'我今天和李娜出去玩'});events.receive({type:'response.created',response:{id:'r1'}});events.receive({type:'response.audio_transcript.delta',response_id:'r1',delta:'玩得开心，有消费可以随时告诉我。'});events.receive({type:'response.done',response:{id:'r1',status:'completed',output:[]}});
 expect(business).not.toHaveBeenCalled();expect(onTurn).toHaveBeenCalledWith(expect.objectContaining({user:'我今天和李娜出去玩',assistant:'玩得开心，有消费可以随时告诉我。'}));
 events.receive({type:'input_audio_buffer.speech_started',item_id:'u2'});events.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'u2',transcript:'饮料18，帮我记AA'});events.receive({type:'response.created',response:{id:'r2'}});events.receive({type:'response.output_item.done',response_id:'r2',item:{type:'function_call',name:'ask_steward',call_id:'c2',arguments:'{"text":"饮料18，帮我记AA"}'}});
 await vi.waitFor(()=>expect(business).toHaveBeenCalledOnce());expect(business.mock.calls[0][3]?.recent).toEqual(expect.arrayContaining([expect.objectContaining({role:'user',content:'我今天和李娜出去玩'})]));
});

it('旧结果迟到不会把新播报切回聆听；结束后的事件不能再更新对话',async()=>{
 let finish:(value:{text:string})=>void=()=>{};const business=vi.fn(()=>new Promise<{text:string}>(r=>{finish=r;})),onTurn=vi.fn();const e=createVoiceEvents({send:vi.fn(),audio:vi.fn(),onState:vi.fn(),business,onTurn});
 const say=(id:string,text:string,response:string)=>{e.receive({type:'input_audio_buffer.speech_started',item_id:id});e.receive({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text});e.receive({type:'response.created',response:{id:response}});};
 say('u1','看一下账单','r1');e.receive({type:'response.output_item.done',response_id:'r1',item:{type:'function_call',name:'ask_steward',call_id:'c1',arguments:'{"text":"看一下账单"}'}});e.receive({type:'response.done',response:{id:'r1',status:'completed',output:[]}});await vi.waitFor(()=>expect(business).toHaveBeenCalledOnce());
 say('u2','先跟我说说什么是AA','r2');e.receive({type:'response.audio_transcript.delta',response_id:'r2',delta:'AA就是分摊共同的费用。'});finish({text:'原账单已整理'});await new Promise(r=>setTimeout(r,0));expect(e.getState().phase).toBe('speaking');
 e.close();const count=onTurn.mock.calls.length;e.receive({type:'response.done',response:{id:'r2',status:'completed',output:[]}});expect(onTurn).toHaveBeenCalledTimes(count);
});
it('同轮重复转录不能在工具提交前悄悄改变原始金额',async()=>{
 const business=vi.fn<VoiceBusiness>(async()=>({text:'待核对'}));const e=createVoiceEvents({send:vi.fn(),audio:vi.fn(),onState:vi.fn(),business});
 e.receive({type:'input_audio_buffer.speech_started',item_id:'u1'});e.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'转2000给妈妈'});e.receive({type:'response.created',response:{id:'r1'}});e.receive({type:'response.output_item.done',response_id:'r1',item:{type:'function_call',name:'ask_steward',call_id:'c1',arguments:'{"text":"转2000给妈妈"}'}});e.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'转3000给妈妈'});
 await vi.waitFor(()=>expect(business).toHaveBeenCalledOnce());expect(business.mock.calls[0][0]).toBe('转2000给妈妈');
});
