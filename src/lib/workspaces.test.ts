import {describe,it,expect} from 'vitest';
import {changeWorkspaces,emptyWorkspaces,workspaceContext,validateRoutes,type WorkspaceCommand} from './workspaces';
describe('独立任务工作区',()=>{
  it('同类任务独立保存，消息幂等，不能靠完成任务来完成转账',()=>{
    let s=emptyWorkspaces();
    const apply=(op:object)=>s=changeWorkspaces(s,{...op,revision:s.revision,requestId:crypto.randomUUID()} as WorkspaceCommand);
    apply({type:'create',id:'dinner',kind:'aa',title:'今晚聚餐'});
    apply({type:'create',id:'trip',kind:'aa',title:'周末旅行'});
    const command={type:'turn' as const,id:'dinner',revision:s.revision,requestId:'one',user:'饮料18',assistant:'已记录',memoryRevision:0};
    s=changeWorkspaces(s,command);expect(changeWorkspaces(s,command)).toEqual(s);
    expect(s.items.find(w=>w.id==='trip')!.messages).toHaveLength(0);
    expect(workspaceContext(s.items[0],0)).toContain('饮料18');
    expect(workspaceContext(s.items[0],1)).not.toContain('饮料18');
    apply({type:'status',id:'dinner',status:'archived'});
    expect(s.items[0].status).toBe('archived');
    expect(()=>apply({type:'turn',id:'missing',user:'hi',assistant:'hi',memoryRevision:0})).toThrow();
  });
  it('路由只能引用已知任务、原文片段；混合请求必须覆盖全部原文',()=>{
    const s=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'dinner',kind:'aa',title:'今晚聚餐',revision:0,requestId:'create'});
    const prompt='明天给妈妈转500，刚才饮料改成16';
    const parts=[{taskId:null,kind:'transfer',title:'给妈妈转账',text:'明天给妈妈转500'},{taskId:'dinner',kind:'aa',title:'今晚聚餐',text:'刚才饮料改成16'}];
    expect(validateRoutes({parts},prompt,s.items).parts).toHaveLength(2);
    expect(()=>validateRoutes({parts:parts.slice(0,1)},prompt,s.items)).toThrow();
    expect(()=>validateRoutes({parts:[{...parts[0],text:'转1000'}]},prompt,s.items)).toThrow();
    expect(()=>validateRoutes({parts:[{...parts[0],taskId:'fake',text:prompt}]},prompt,s.items)).toThrow();
  });
});
