import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import {StewardChatHome} from './steward-chat-home';
import * as transport from '../lib/voice-connection';
import {initialVoiceState,type VoiceBusiness} from '../lib/realtime-voice';
afterEach(()=>vi.restoreAllMocks());
it('连续对话可以静音、恢复、播放被浏览器阻止的声音并结束，回到键盘仍保留首页',async()=>{
 const request=vi.fn(async()=>({text:'核对方案'}));let current={...initialVoiceState};const stop=vi.fn(),play=vi.fn();
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>({start:async()=>{await options.business('你好','voice-test',new AbortController().signal);current={...initialVoiceState,phase:'listening',notice:'浏览器暂停了声音，请点播放声音。'};options.onState(current);},stop:()=>{stop();current={...initialVoiceState};options.onState(current);},setMuted:muted=>{current={...current,muted};options.onState(current);},play:async()=>{play();options.onState({...current,notice:''});},getState:()=>current}));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));await screen.findByText('正在聆听');expect(request).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'静音麦克风'}));expect(screen.getByText('麦克风已静音')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'恢复麦克风'}));fireEvent.click(screen.getByRole('button',{name:'播放声音'}));expect(play).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'结束对话'}));expect(stop).toHaveBeenCalled();expect(screen.getByRole('button',{name:'开始语音对话'})).toBeInTheDocument();
});
it('不可信后台消息不能停麦；可信的父窗口消息与可见性变化会停麦',()=>{
 const stop=vi.fn();vi.spyOn(transport,'createVoiceConnection').mockReturnValue({start:vi.fn(async()=>{}),stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>initialVoiceState});render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={vi.fn()}/>);
 window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',data:{type:'zhiyin-voice-stop'},source:window.parent}));expect(stop).not.toHaveBeenCalled();window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,data:{type:'zhiyin-voice-stop'},source:window.parent}));expect(stop).toHaveBeenCalledOnce();
 const old=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));expect(stop).toHaveBeenCalledTimes(2);if(old)Object.defineProperty(document,'visibilityState',old);else delete (document as unknown as {visibilityState?:string}).visibilityState;
});
it('处理器仍挂载但离开首页时停止收音，回来不能自动重新开启',async()=>{
 const stop=vi.fn(),start=vi.fn();vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>({start:async()=>{start();options.onState({...initialVoiceState,phase:'listening'});},stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>initialVoiceState}));
 const props={stewardName:'宁宁',stewardImage:'/n.png',onRequest:vi.fn()};const view=render(<StewardVoice {...props} enabled/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));await screen.findByText('正在聆听');
 view.rerender(<StewardVoice {...props} enabled={false}/>);expect(stop).toHaveBeenCalled();expect(screen.queryByRole('region',{name:'语音对话'})).not.toBeInTheDocument();
 view.rerender(<StewardVoice {...props} enabled/>);expect(start).toHaveBeenCalledOnce();
});
it('首页可找到连续语音入口，不能在页面载入时自行录音',()=>{
 const media=vi.fn();Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media}});
 render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onVoiceRequest={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'和宁宁语音对话'})).toBeInTheDocument();expect(media).not.toHaveBeenCalled();
});
it('未配置如实提示恢复路径，可以收起，不能伪装正在通话',async()=>{
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({configured:false})));
 render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));
 fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('尚未配置'));
 expect(screen.queryByText('正在聆听')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'收起语音面板'}));expect(screen.queryByRole('region',{name:'语音对话'})).not.toBeInTheDocument();vi.unstubAllGlobals();
});
it('收起通话回首页不挂断，进入核对时在对话框内保留静音和结束入口',async()=>{
 const stop=vi.fn();let business:VoiceBusiness|undefined;vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=vi.fn(options.business);return {start:async()=>{options.onState({...initialVoiceState,phase:'listening'});},stop,setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'业务结果'}));const props={stewardName:'宁宁',stewardImage:'/n.png',onRequest:request};const view=render(<StewardVoice {...props}/>);fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));await screen.findByText('正在聆听');fireEvent.click(screen.getByRole('button',{name:'收起语音面板'}));expect(stop).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'结束对话'})).toBeInTheDocument();
 view.rerender(<><div role="dialog" aria-modal="true" data-state="open" aria-label="转账核对"/><StewardVoice {...props} reviewing/></>);
 const dialog=screen.getByRole('dialog',{name:'转账核对'});await waitFor(()=>expect(dialog.querySelector('button[aria-label="结束对话"]')).not.toBeNull());
 await business!('确认付款','test',new AbortController().signal);expect(request).not.toHaveBeenCalled();
});
