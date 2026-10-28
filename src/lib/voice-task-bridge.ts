import type {WorkspaceState} from './workspaces';
import type {VoiceBusiness} from './realtime-voice';
export function voiceTaskResult(state:WorkspaceState,id:string):Awaited<ReturnType<VoiceBusiness>>|null {
 const run=state.runs?.find(r=>r.id===id);if(!run||!['completed','waiting_user','failed','interrupted'].includes(run.status))return null;
 if(['failed','interrupted'].includes(run.status))throw new Error('管家本轮未完成，请在首页核对实际状态。');
 const text=(state.conversation??[]).filter(m=>m.messageId===id&&m.role==='assistant').map(m=>m.content).join('\n').replace(/\[ZHIYIN_(?:ACTION|VIEW):[^\]]*\]/g,'').replace(/\[\[choices:[\s\S]*?\]\]/g,'').trim();
 if(!text)throw new Error('管家回执尚未保存，请在首页核对，不要重复资金操作。');return {text};
}
export function abortableVoicePause(signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
 const stop=()=>{clearTimeout(timer);reject(new Error('语音已结束，已提交的事项保留在首页。'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},350);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
});}
