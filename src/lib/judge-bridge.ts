import {findJudgeStep,parseJudgeRequest,type JudgeStep} from './judge-scenarios';
const CHANNEL='zhiyin-review';
/** Accept only explicit, catalogued navigation from the same-origin phone host. */
export type JudgeOpenResult=void|'draft'|'busy';
export function connectJudgeEntry(host:Window,peer:Window,onOpen:(step:JudgeStep)=>JudgeOpenResult){
  const handled=new Map<string,{type:'opened'|'error';reason?:'draft'|'busy'}>();
  const receive=(event:MessageEvent)=>{
    if(event.origin!==host.location.origin||event.source!==peer)return;
    const request=parseJudgeRequest(event.data);
    if(!request||request.step.target.app!=='zhiyin')return;
    let result=handled.get(request.requestId);
    if(!result){
      try{const reason=onOpen(request.step);result=reason?{type:'error',reason}:{type:'opened'};}catch{result={type:'error'};}
      handled.set(request.requestId,result);
      if(handled.size>40)handled.delete(handled.keys().next().value!);
    }
    peer.postMessage({channel:CHANNEL,version:1,...result,requestId:request.requestId},host.location.origin);
  };
  host.addEventListener('message',receive);
  return()=>host.removeEventListener('message',receive);
}
type LaunchOptions={host:Window;openApp:(app:string,route?:string)=>void;getPeer:()=>Window|null;signal?:AbortSignal};
export function launchJudgeStep(scenarioId:string,stepIndex:number,options:LaunchOptions):Promise<void>{
  const step=findJudgeStep(scenarioId,stepIndex);
  if(!step)return Promise.reject(new Error('场景不存在，请重新选择。'));
  if(options.signal?.aborted)return Promise.reject(new Error('已取消打开场景。'));
  const {host}=options;
  if(step.target.app==='wechat'){
    try{options.openApp('wechat',step.target.route);return Promise.resolve();}catch{return Promise.reject(new Error('微信未能打开，请重试。'));}
  }
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    let finished=false;
    const finish=(error?:Error)=>{
      if(finished)return;finished=true;clearInterval(retry);clearTimeout(timeout);
      host.removeEventListener('message',receive);options.signal?.removeEventListener('abort',abort);
      if(error)reject(error);else resolve();
    };
    const receive=(event:MessageEvent)=>{
      if(event.origin!==host.location.origin||!options.getPeer()||event.source!==options.getPeer())return;
      const data=event.data;
      if(data?.channel!==CHANNEL||data.version!==1||data.requestId!==requestId)return;
      if(data.type==='opened')finish();
      else if(data.type==='error')finish(new Error(data.reason==='draft'?'知银输入框已有未发送的内容。请先发送或清空草稿，再选择新问题。':'知银暂未接受跳转，请关闭业务核对面板后重试。'));
    };
    const abort=()=>finish(new Error('已取消打开场景。'));
    const send=()=>{try{options.getPeer()?.postMessage({channel:CHANNEL,version:1,type:'open',requestId,scenarioId,stepIndex},host.location.origin);}catch{finish(new Error('知银连接中断，请重新打开场景。'));}};
    host.addEventListener('message',receive);options.signal?.addEventListener('abort',abort);
    const retry=setInterval(send,150);
    const timeout=setTimeout(()=>finish(new Error('知银未能及时打开。请确认已启动最新版本，再点击重试。')),8000);
    try{options.openApp('zhiyin');send();}catch{finish(new Error('知银未能打开，请从手机桌面打开后重试。'));}
  });
}
