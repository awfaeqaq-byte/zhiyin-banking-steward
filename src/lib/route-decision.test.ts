import {describe,it,expect} from 'vitest';
import {routingSegments,materializeRoutes,conversationRoute} from './route-decision';
import {sharePrompt,buildWechatShare} from './wechat-message-share';
import type {Workspace} from './workspaces';
const birthday:Workspace={id:'birthday',kind:'general',title:'朋友生日',status:'active',updatedAt:0,memoryRevision:0,summary:'',messages:[],progress:{goal:'生日',stage:'waiting_user',waitingFor:{field:'reply',question:'7月15号，对吗？'}}};
describe('系统持有原文的分流协议',()=>{
 it('单任务只使用分类信息，模型改写text也不会改变用户原话',()=>{
  expect(materializeRoutes({parts:[{taskId:null,kind:'general',title:'咨询',text:'旧消息里的另一句话'}]},'最近有点困惑',[]).parts[0].text).toBe('最近有点困惑');
 });
 it('多任务用系统片段编号完整覆盖，金额与顺序均来自原文',()=>{
  const prompt='给妈妈转500，饮料18；明天去杭州';
  expect(routingSegments(prompt).map(s=>s.text)).toEqual(['给妈妈转500','饮料18','明天去杭州']);
  const parts=[{taskId:null,kind:'transfer',title:'妈妈转账',segmentIds:[0]},{taskId:null,kind:'aa',title:'聚餐',segmentIds:[1,2]}];
  expect(materializeRoutes({parts},prompt,[]).parts.map(p=>p.text)).toEqual(['给妈妈转500','饮料18；明天去杭州']);
  expect(()=>materializeRoutes({parts:[{...parts[0],segmentIds:undefined}]},prompt,[])).not.toThrow(); // One part owns the entire original message.
  expect(materializeRoutes({parts:[{...parts[0],segmentIds:undefined}]},prompt,[]).parts[0].text).toBe(prompt);
  expect(()=>materializeRoutes({parts:[parts[0],{...parts[1],segmentIds:[2]}]},prompt,[])).toThrow();
  expect(()=>materializeRoutes({parts:[parts[0],{...parts[1],segmentIds:[0,1,2]}]},prompt,[])).toThrow();
  expect(()=>materializeRoutes({parts:[parts[1],parts[0]]},prompt,[])).toThrow();
 });
 it('拒绝虚构任务、非法类型与空原话；引用材料只能整体分类',()=>{
  expect(()=>materializeRoutes({parts:[{taskId:'fake',kind:'general',title:'旧事'}]},'你好',[])).toThrow('之前的交代');
  expect(()=>materializeRoutes({parts:[{taskId:null,kind:'payment',title:'付款'}]},'转500',[])).toThrow();
  expect(()=>materializeRoutes({parts:[]},'',[])).toThrow();
 });
 it('你好不需要分类模型，对与没错接明确追问，新增业务不误续接',()=>{
  expect(conversationRoute('你好',[birthday],birthday.id)?.parts[0]).toMatchObject({kind:'general',text:'你好'});
  for(const answer of ['对','没错','是的','嗯'])expect(conversationRoute(answer,[birthday],birthday.id)?.parts[0].taskId).toBe('birthday');
  expect(conversationRoute('对，给妈妈转500',[birthday],birthday.id)).toBeNull();
  expect(conversationRoute('对',[{...birthday,kind:'transfer',progress:undefined}],birthday.id)).toBeNull();
 });
});
it('当前生日事实确认后的“记忆”复用其来源事项，不让模型另问记什么',()=>{
 const task:Workspace={id:'birthday',kind:'general',title:'王芳生日',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[{id:'source',role:'user',memoryRevision:0,content:sharePrompt(buildWechatShare({id:'c',name:'王芳',kind:'direct'},[{id:'m',sender:'王芳',text:'我生日是7月15号。',sentAt:1791770000000}],['m'],'帮我记录王芳生日','s'))}],progress:{goal:'记录王芳生日',stage:'waiting_user',waitingFor:{field:'reply',question:'需要提前提醒你吗？'}}};
 expect(conversationRoute('记忆',[task],task.id)?.parts[0].taskId).toBe('birthday');expect(conversationRoute('记忆',[],task.id)).toBeNull();
});
