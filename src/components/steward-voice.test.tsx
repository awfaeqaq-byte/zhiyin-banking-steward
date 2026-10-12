import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import {StewardChatHome} from './steward-chat-home';
afterEach(()=>vi.restoreAllMocks());
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
