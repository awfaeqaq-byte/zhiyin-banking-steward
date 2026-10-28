import {expect,it} from 'vitest';
import {emptyWorkspaces,type WorkspaceState} from './workspaces';
import {voiceTaskResult,abortableVoicePause} from './voice-task-bridge';
it('等待业务结果可随结束语音中断，不重新提交任何任务',async()=>{
 const signal=new AbortController();const waiting=abortableVoicePause(signal.signal);signal.abort();await expect(waiting).rejects.toThrow('已结束');await expect(abortableVoicePause(signal.signal)).rejects.toThrow('已结束');
});
it('只取本次消息的实际业务回执，保持待授权含义，不带动作标记',()=>{
 const state:WorkspaceState={...emptyWorkspaces(),runs:[{id:'v',status:'completed'}] as unknown as WorkspaceState['runs'],conversation:[{id:'old',role:'assistant',content:'旧回复',messageId:'old'},{id:'a',role:'assistant',content:'方案已整理，等待你确认。[ZHIYIN_ACTION:OPEN_TASKS]\n[[choices:看看|不用]]',messageId:'v'}]};
 expect(voiceTaskResult(state,'v')).toEqual({text:'方案已整理，等待你确认。'});expect(voiceTaskResult(state,'unknown')).toBeNull();
 state.runs![0].status='failed';expect(()=>voiceTaskResult(state,'v')).toThrow('未完成');
});
