import {expect,it,vi} from 'vitest';
import {routeWorkspacePrompt} from './workspace-service';
import type {Workspace} from './workspaces';

const task=(id:string,question:string):Workspace=>({id,kind:'reminder',title:'王芳生日',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[{id:`${id}-u`,role:'user',content:'帮我记录王芳生日',memoryRevision:0},{id:`${id}-a`,role:'assistant',content:question,memoryRevision:0}]});
it('没有等待标记的旧追问也能续接，首页最新问题优先于滞留的当前任务',async()=>{
 const birthday=task('birthday','王芳的生日是7月15号，对吗？'),old=task('old','想看哪个月账单？');
 const model=vi.fn().mockRejectedValue(new Error('不应重拆短答'));
 const result=await routeWorkspacePrompt('对',[old,birthday],old.id,'',[{role:'assistant',content:birthday.messages[1].content}],{model});
 expect(result.parts).toEqual([{taskId:'birthday',kind:'reminder',title:'王芳生日',text:'对'}]);expect(model).not.toHaveBeenCalled();
});
it('没有最近对话时可恢复当前任务的旧追问',async()=>{
 const birthday=task('birthday','王芳的生日是7月15号，对吗？');
 const model=vi.fn().mockRejectedValue(new Error('不应重拆短答'));
 expect((await routeWorkspacePrompt('对',[birthday],birthday.id,'',[],{model})).parts[0].taskId).toBe(birthday.id);
});
it.each(['都执行','对'])('无法确定%s的归属时只追问，不猜当前任务',async prompt=>{
 const birthday=task('birthday','王芳的生日是7月15号，对吗？');
 const model=vi.fn().mockRejectedValue(new Error('不应重拆短答'));
 const result=await routeWorkspacePrompt(prompt,[birthday],birthday.id,'',[{role:'assistant',content:'你好，我在。'}],{model});
 expect(result.parts).toEqual([]);expect(result.clarification).toBeTruthy();expect(model).not.toHaveBeenCalled();
});
it('同一句问题存在于多个任务时不按最近更新时间猜归属',async()=>{
 const first=task('one','是7月15号，对吗？'),second=task('two','是7月15号，对吗？');
 const model=vi.fn().mockRejectedValue(new Error('不应猜归属'));
 expect((await routeWorkspacePrompt('对',[first,second],first.id,'',[{role:'assistant',content:first.messages[1].content}],{model})).clarification).toBeTruthy();
});
it('模型判断为澄清续答时只判断归属，不把都执行重复拆成两个原文片段',async()=>{
 const model=vi.fn().mockResolvedValue(JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'旧转账',segmentIds:[0]},{taskId:null,kind:'transfer',title:'新转账',segmentIds:[0]}],continuesClarification:true}));
 const result=await routeWorkspacePrompt('都执行',[],'',JSON.stringify({original:'现在给妈妈转2000',question:'替代原来的1000元，还是两笔都执行？'}),[],{model});
 expect(result).toMatchObject({parts:[],continuesClarification:true});expect(model).toHaveBeenCalledOnce();
});
it('换话题仍正常分类，不能把完整新请求吞作生日确认',async()=>{
 const birthday=task('birthday','是7月15号，对吗？');
 const model=vi.fn().mockResolvedValue(JSON.stringify({parts:[{taskId:null,kind:'transfer',title:'妈妈生活费',segmentIds:[0]}]}));
 expect((await routeWorkspacePrompt('现在给妈妈转2000',[birthday],birthday.id,'',[{role:'assistant',content:birthday.messages[1].content}],{model})).parts[0]).toMatchObject({taskId:null,kind:'transfer'});
 expect(model).toHaveBeenCalledOnce();
});
it('分类重试明确反馈重复片段原因，而不是仅重复格式提示',async()=>{
 const model=vi.fn().mockResolvedValueOnce(JSON.stringify({parts:[{taskId:null,kind:'aa',title:'聚餐',segmentIds:[0]},{taskId:null,kind:'transfer',title:'转账',segmentIds:[0]}]})).mockImplementationOnce(async payload=>{
 expect(payload.input.at(-1).content).toContain('分类片段编号无效');
 return JSON.stringify({parts:[{taskId:null,kind:'aa',title:'聚餐',segmentIds:[0]},{taskId:null,kind:'transfer',title:'转账',segmentIds:[1]}]});
 });
 expect((await routeWorkspacePrompt('饮料18，给妈妈转500',[],'','',[],{model})).parts).toHaveLength(2);
});
