import {afterEach,expect,it,vi} from 'vitest';
import {createVoiceConnection} from './voice-connection';
afterEach(()=>vi.unstubAllGlobals());
it('没有凭证不申请麦克风，没有 HTTPS 不创建远端会话',async()=>{
 const media=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({configured:false})));const state=vi.fn();const connection=createVoiceConnection({stewardName:'宁宁',business:vi.fn(),onState:state,fetcher});
 await connection.start();expect(media).not.toHaveBeenCalled();expect(state.mock.calls.at(-1)?.[0].error).toContain('尚未配置');
 vi.stubGlobal('isSecureContext',false);await connection.start();expect(fetcher).toHaveBeenCalledOnce();expect(state.mock.calls.at(-1)?.[0].error).toContain('HTTPS');
});
it('退出时即使麦克风授权迟到，也停止全部音轨',async()=>{
 let grant:(stream:MediaStream)=>void=()=>{};const stop=vi.fn();const stream={getTracks:()=>[{stop}],getAudioTracks:()=>[{stop,enabled:true}]} as unknown as MediaStream;
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(r=>{grant=r;})}});
 const c=createVoiceConnection({stewardName:'宁宁',business:vi.fn(),onState:vi.fn(),fetcher:vi.fn(async()=>new Response(JSON.stringify({configured:true})))});
 const starting=c.start();await vi.waitFor(()=>expect(grant.toString()).not.toBe('() => {}'));c.stop();grant(stream);await starting;expect(stop).toHaveBeenCalledOnce();
});
