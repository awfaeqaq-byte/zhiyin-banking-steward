import {describe,expect,it,vi} from 'vitest';
import {createVoiceEvents,voiceSessionInstructions,type VoiceBusiness} from './realtime-voice';
const tool=(id='call-1')=>({type:'response.output_item.done',response_id:'response-1',item:{type:'function_call',status:'completed',call_id:id,name:'ask_steward',arguments:'{"text":"转3000"}'}});
function fixture(){const send=vi.fn(),business=vi.fn<VoiceBusiness>(async()=>({text:'金额2000，等待你核对。'})),audio=vi.fn();const events=createVoiceEvents({send,business,audio,onState:vi.fn()});return {events,send,business,audio};}
function turn(f:ReturnType<typeof fixture>){f.events.receive({type:'input_audio_buffer.speech_started',item_id:'user-1'});f.events.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'user-1',transcript:'给妈妈转2000'});f.events.receive({type:'response.created',response:{id:'response-1'}});}
describe('语音业务桥',()=>{
 it('重复 response.created 不重置去重，结束的旧回复不覆盖新轮次',async()=>{
  const f=fixture();turn(f);f.events.receive(tool());f.events.receive({type:'response.done',response:{id:'response-1',status:'completed',output:[]}});await vi.waitFor(()=>expect(f.send.mock.calls.filter(([e])=>e.type==='response.create')).toHaveLength(1));
  f.events.receive({type:'response.created',response:{id:'response-1'}});f.events.receive(tool());f.events.receive({type:'response.done',response:{id:'response-1',status:'completed',output:[]}});await new Promise(r=>setTimeout(r,0));expect(f.send.mock.calls.filter(([e])=>e.type==='response.create')).toHaveLength(1);
 });
 it('提供者失败和上限不允许未核对的音频继续播放',()=>{
  const f=fixture();turn(f);f.events.receive({type:'error',error:{message:'failure'}});expect(f.events.getState().phase).toBe('error');expect(f.audio).toHaveBeenLastCalledWith(false);
 });
 it('语音转录晚于工具事件时等待原文；静音麦克风不关闭已经允许的播报',async()=>{
  const f=fixture();f.events.receive({type:'input_audio_buffer.speech_started',item_id:'user-1'});f.events.receive({type:'response.created',response:{id:'response-1'}});f.events.receive(tool());f.events.receive({type:'response.done',response:{id:'response-1',status:'completed',output:[]}});
  expect(f.business).not.toHaveBeenCalled();f.events.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'user-1',transcript:'给妈妈转2000'});
  await vi.waitFor(()=>expect(f.business).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(f.audio).toHaveBeenLastCalledWith(true));f.events.setMuted(true);expect(f.audio).toHaveBeenLastCalledWith(true);
 });
 it('角色与业务边界明确，不能把口头同意作为金融授权',()=>{
  expect(voiceSessionInstructions('宁宁')).toContain('ask_steward');expect(voiceSessionInstructions('阿衡')).toContain('阿衡');expect(voiceSessionInstructions('宁宁')).toContain('不能把口头');
 });
 it('采用最终语音原文，不采用模型改写的金额；重复工具事件只处理一次',async()=>{
  const f=fixture();turn(f);f.events.receive(tool());f.events.receive(tool());
  f.events.receive({type:'response.done',response:{id:'response-1',status:'completed',output:[tool().item]}});
  await vi.waitFor(()=>expect(f.business).toHaveBeenCalledOnce());expect(f.business.mock.calls[0][0]).toBe('给妈妈转2000');
  await vi.waitFor(()=>expect(f.send.mock.calls.filter(([e])=>e.type==='response.create')).toHaveLength(1));
  expect(f.send.mock.calls.filter(([e])=>e.item?.type==='function_call_output')).toHaveLength(1);
 });
 it('工具结果等本轮 response.done 后再续答，工具失败不伪造成功',async()=>{
  const f=fixture();turn(f);f.events.receive(tool());await vi.waitFor(()=>expect(f.business).toHaveBeenCalledOnce());expect(f.send.mock.calls.some(([e])=>e.type==='response.create')).toBe(false);
  f.events.receive({type:'response.done',response:{id:'response-1',status:'completed',output:[]}});await vi.waitFor(()=>expect(f.send.mock.calls.some(([e])=>e.type==='response.create')).toBe(true));
 });
 it('未知工具或没有语音原文时，不能调用金融后端',async()=>{
  const f=fixture();f.events.receive({type:'response.created',response:{id:'response-1'}});f.events.receive({...tool(),item:{...tool().item,name:'confirm_transfer'}});await Promise.resolve();expect(f.business).not.toHaveBeenCalled();
 });
 it('插话会停止旧音频并取消当前响应，关闭后迟到事件不能提交任务',async()=>{
  const f=fixture();turn(f);f.events.receive({type:'input_audio_buffer.speech_started',item_id:'user-2'});
  expect(f.audio).toHaveBeenLastCalledWith(false);expect(f.send).toHaveBeenCalledWith({type:'response.cancel'});
  f.events.close();f.events.receive(tool());expect(f.business).not.toHaveBeenCalled();
 });
});
