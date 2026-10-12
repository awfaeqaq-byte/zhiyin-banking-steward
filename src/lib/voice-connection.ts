import {createVoiceEvents,initialVoiceState,type VoiceBusiness,type VoiceState} from './realtime-voice';
type Options={stewardName:string;business:VoiceBusiness;onState:(state:VoiceState)=>void;fetcher?:typeof fetch};
/** Owns microphone/media resources, never credentials or financial execution. */
export function createVoiceConnection({stewardName,business,onState,fetcher=fetch}:Options){
 let epoch=0,pc:RTCPeerConnection|null=null,media:MediaStream|null=null,audio:HTMLAudioElement|null=null,channel:RTCDataChannel|null=null;
 let events:ReturnType<typeof createVoiceEvents>|null=null,abort:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null,muted=false,working=false;
 let state={...initialVoiceState};
 const update=(patch:Partial<VoiceState>)=>{state={...state,...patch};onState({...state});};
 function cleanup(){epoch++;abort?.abort();abort=null;if(timer)clearTimeout(timer);timer=null;events?.close();events=null;channel?.close();channel=null;if(pc){pc.onconnectionstatechange=null;pc.close();pc=null;}media?.getTracks().forEach(track=>track.stop());media=null;if(audio){audio.pause();audio.srcObject=null;audio=null;}working=false;}
 function stop(notice=''){cleanup();muted=false;update({...initialVoiceState,heard:state.heard,answer:state.answer,notice});}
 function fail(error:string){cleanup();update({phase:'error',error});}
 return {async start(){
  cleanup();const run=epoch;muted=false;update({...initialVoiceState,phase:'connecting'});abort=new AbortController();const signal=abort.signal;
  try{
   if(!globalThis.isSecureContext)throw new Error('麦克风需要 HTTPS，或在电脑本机 localhost 打开。手机局域网 HTTP 页面不能录音。');
   if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')throw new Error('当前浏览器不支持实时语音，请用最新版 Chrome 或 Safari 打开。');
   const status=await fetcher('/api/zhiyin/voice/status',{cache:'no-store',signal});if(!status.ok)throw new Error('语音服务暂不可用，请重试');
   const available=await status.json();if(available.configured!==true)throw new Error(typeof available.error==='string'?available.error:'尚未配置实时语音。请在本机沙箱控制台 → 模型配置 → 实时语音，填写百炼凭证。');
   if(run!==epoch)return;
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(run!==epoch){stream.getTracks().forEach(track=>track.stop());return;}media=stream;media.getAudioTracks().forEach(track=>{track.enabled=false;});
   const peer=new RTCPeerConnection({iceServers:[]});pc=peer;audio=new Audio();audio.autoplay=true;audio.muted=true;
   let configured=false;const channels=new Set<RTCDataChannel>();
   const send=(event:Record<string,unknown>)=>{if(channel?.readyState==='open')channel.send(JSON.stringify(event));};
   events=createVoiceEvents({business,onState:next=>{if(run===epoch)update(next);},send,audio:enabled=>{if(audio)audio.muted=!enabled;},onWorking:busy=>{working=busy;media?.getAudioTracks().forEach(track=>{track.enabled=!muted&&!busy&&configured;});}});
   const settings:{session?:Record<string,unknown>}={};let sessionSent=false;
   function configure(){if(!sessionSent&&settings.session&&channel?.readyState==='open'){sessionSent=true;send({type:'session.update',session:settings.session});}}
   function bind(data:RTCDataChannel){channels.add(data);data.onmessage=message=>{
    if(run!==epoch||typeof message.data!=='string'||message.data.length>100000)return;
    let event:Record<string,unknown>;try{event=JSON.parse(message.data);if(!event||typeof event!=='object')return;}catch{return;}
    channel=data;configure();
    if(event.type==='session.updated'&&!configured){configured=true;media?.getAudioTracks().forEach(track=>{track.enabled=!muted;});events?.connected();timer=setTimeout(()=>stop('本次语音已达5分钟，已结束收音；需要时可重新开始。'),300000);}
    events?.receive(event);if(events?.getState().phase==='error')fail(events.getState().error);
   };data.onclose=()=>{if(run===epoch&&configured)fail('语音连接已断开，麦克风已关闭；请先核对首页事项再重试。');};};
   bind(peer.createDataChannel('oai-events'));peer.ondatachannel=event=>bind(event.channel);
   peer.ontrack=event=>{if(audio){audio.srcObject=event.streams[0]??new MediaStream([event.track]);void audio.play().catch(()=>{if(run===epoch)update({notice:'浏览器暂停了声音，请点“播放声音”。'});});}};
   peer.onconnectionstatechange=()=>{if(run===epoch&&['failed','closed','disconnected'].includes(peer.connectionState))fail('语音连接中断，麦克风已关闭；请检查网络后重试。');};
   stream.getAudioTracks().forEach(track=>peer.addTrack(track,stream));await peer.setLocalDescription(await peer.createOffer());
   if(peer.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{
    const deadline=setTimeout(()=>{clear();reject(new Error('音频连接准备超时，请检查网络'));},10000);
    const ready=()=>{if(peer.iceGatheringState==='complete'){clear();resolve();}},cancel=()=>{clear();reject(new Error('语音已结束'));};
    function clear(){clearTimeout(deadline);peer.removeEventListener('icegatheringstatechange',ready);signal.removeEventListener('abort',cancel);}peer.addEventListener('icegatheringstatechange',ready);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();else ready();
   });
   if(run!==epoch)return;
   const response=await fetcher('/api/zhiyin/voice/offer',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Voice':'1'},body:JSON.stringify({offer:peer.localDescription?.sdp,stewardName}),signal});const result=await response.json();
   if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'语音连接失败');
   if(typeof result.answer!=='string'||!result.answer.startsWith('v=0')||!result.session||typeof result.session.instructions!=='string')throw new Error('语音会话返回无效，请重试');
   if(run!==epoch)return;settings.session=result.session;await peer.setRemoteDescription({type:'answer',sdp:result.answer});configure();
   // Only the server's txt channel (or a channel with received events) is used
   // for configuration; microphone stays off until session.updated confirms it.
   const deadline=setTimeout(()=>{if(run===epoch&&!configured)fail('语音会话没有就绪，麦克风已关闭；请检查模型权限后重试。');},15000);
   signal.addEventListener('abort',()=>clearTimeout(deadline),{once:true});
  }catch(cause){if(run!==epoch)return;const denied=cause instanceof DOMException&&cause.name==='NotAllowedError';fail(denied?'麦克风未获允许。请在浏览器权限中允许麦克风，再重新开始。':cause instanceof Error?cause.message:'语音连接失败，请重试');}
 },stop,setMuted(next:boolean){muted=next;media?.getAudioTracks().forEach(track=>{track.enabled=!muted&&!working&&state.phase!=='connecting';});events?.setMuted(muted);update({muted});},async play(){try{await audio?.play();update({notice:''});}catch{update({notice:'声音仍被浏览器阻止，请检查网站声音权限。'});}},getState:()=>({...state})};
}
