import {afterEach,expect,it,vi} from 'vitest';
import {createVoiceConnection} from './voice-connection';
afterEach(()=>vi.unstubAllGlobals());
it('真实浏览器握手流程：只申请音频、等会话配置确认再收音，结束释放连接',async()=>{
 const sent:unknown[]=[],stop=vi.fn(),pause=vi.fn();const track={enabled:true,stop};const audio={muted:true,autoplay:false,srcObject:null,play:vi.fn(async()=>{}),pause};
 const txt={readyState:'open',onmessage:null as ((e:{data:string})=>void)|null,onclose:null as (()=>void)|null,close:vi.fn(),send:(raw:string)=>{const data=JSON.parse(raw);sent.push(data);if(data.type==='session.update')queueMicrotask(()=>txt.onmessage?.({data:JSON.stringify({type:'session.updated'})}));}};
 class Peer extends EventTarget {iceGatheringState='complete';connectionState='new';localDescription={sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'};ondatachannel:((e:{channel:typeof txt})=>void)|null=null;ontrack:null=null;onconnectionstatechange:null=null;closed=false;addTrack=vi.fn();createDataChannel(){return {...txt};}async createOffer(){return {type:'offer',sdp:this.localDescription.sdp};}async setLocalDescription(){}async setRemoteDescription(){this.ondatachannel?.({channel:txt});queueMicrotask(()=>txt.onmessage?.({data:JSON.stringify({type:'session.created'})}));}close(){this.closed=true;}}
 const peers:Peer[]=[];vi.stubGlobal('RTCPeerConnection',class extends Peer{constructor(){super();peers.push(this);}});vi.stubGlobal('Audio',function(){return audio;});vi.stubGlobal('isSecureContext',true);
 const media=vi.fn(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}));vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});
 const fetcher=vi.fn<typeof fetch>(async url=>new Response(JSON.stringify(String(url).endsWith('status')?{configured:true}:{answer:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',session:{instructions:'test-role',tools:[]}})));
 const business=vi.fn(()=>new Promise<{text:string}>(()=>{}));
 const c=createVoiceConnection({stewardName:'宁宁',business,onState:vi.fn(),fetcher});await c.start();await vi.waitFor(()=>expect(c.getState().phase).toBe('listening'));
 expect(media).toHaveBeenCalledWith({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});expect(sent).toContainEqual({type:'session.update',session:{instructions:'test-role',tools:[]}});expect(track.enabled).toBe(true);
 const receive=(event:object)=>txt.onmessage?.({data:JSON.stringify(event)});
 receive({type:'input_audio_buffer.speech_started',item_id:'user-1'});receive({type:'conversation.item.input_audio_transcription.completed',item_id:'user-1',transcript:'帮我看账单'});receive({type:'response.created',response:{id:'response-1'}});receive({type:'response.output_item.done',response_id:'response-1',item:{type:'function_call',call_id:'call-1',name:'ask_steward',arguments:'{"text":"帮我看账单"}'}});
 await vi.waitFor(()=>expect(business).toHaveBeenCalledOnce());expect(track.enabled).toBe(true);
 c.setMuted(true);expect(track.enabled).toBe(false);c.setMuted(false);expect(track.enabled).toBe(true);c.stop();expect(stop).toHaveBeenCalledOnce();expect(peers[0].closed).toBe(true);expect(pause).toHaveBeenCalled();
});
it('没有凭证不申请麦克风，没有 HTTPS 不创建远端会话',async()=>{
 const media=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({configured:false})));const state=vi.fn();const connection=createVoiceConnection({stewardName:'宁宁',business:vi.fn(),onState:state,fetcher});
 await connection.start();expect(media).not.toHaveBeenCalled();expect(state.mock.calls.at(-1)?.[0].error).toContain('尚未配置');
 vi.stubGlobal('isSecureContext',false);await connection.start();expect(fetcher).toHaveBeenCalledOnce();expect(state.mock.calls.at(-1)?.[0].error).toContain('HTTPS');
});
it('退出时即使麦克风授权迟到，也停止全部音轨',async()=>{
 let grant:(stream:MediaStream)=>void=()=>{};const stop=vi.fn();const stream={getTracks:()=>[{stop}],getAudioTracks:()=>[{stop,enabled:true}]} as unknown as MediaStream;
 const media=vi.fn(()=>new Promise<MediaStream>(r=>{grant=r;}));
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});
 const c=createVoiceConnection({stewardName:'宁宁',business:vi.fn(),onState:vi.fn(),fetcher:vi.fn(async()=>new Response(JSON.stringify({configured:true})))});
 const starting=c.start();await vi.waitFor(()=>expect(media).toHaveBeenCalledOnce());c.stop();grant(stream);await starting;expect(stop).toHaveBeenCalledOnce();
});
it('退出时配置查询迟到，不能再向用户申请麦克风权限',async()=>{
 let done:(r:Response)=>void=()=>{};const media=vi.fn(async()=>({getTracks:()=>[]}));vi.stubGlobal('isSecureContext',true);vi.stubGlobal('RTCPeerConnection',vi.fn());vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});
 const getContext=vi.fn(async()=>({recent:[],preferences:[]}));const fetcher=vi.fn(()=>new Promise<Response>(r=>{done=r;}));const c=createVoiceConnection({stewardName:'宁宁',business:vi.fn(),getContext,onState:vi.fn(),fetcher});const start=c.start();c.stop();done(new Response(JSON.stringify({configured:true})));await start;expect(media).not.toHaveBeenCalled();expect(getContext).not.toHaveBeenCalled();
});
