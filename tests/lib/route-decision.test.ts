import {describe,it,expect} from 'vitest';
import {routingSegments,materializeRoutes,conversationRoute} from '../../src/lib/route-decision';
import {sharePrompt,buildWechatShare} from '../../src/lib/wechat-message-share';
import type {Workspace} from '../../src/lib/workspaces';
const birthday:Workspace={id:'birthday',kind:'general',title:'朋友生日',status:'active',updatedAt:0,memoryRevision:0,summary:'',messages:[],progress:{goal:'生日',stage:'waiting_user',waitingFor:{field:'reply',question:'7月15号，对吗？'}}};
const dinner:Workspace={...birthday,id:'dinner',kind:'aa',title:'周末聚餐',progress:undefined};
it('同一AA事项的总额和个人明细保留为完整的一次处理，模型分句不能重复记账',()=>{
 const prompt='饮料20，我可乐4块，然后买了4瓶啤酒16aa';
 const parts=['饮料','个人可乐','啤酒'].map((title,id)=>({taskId:dinner.id,kind:'aa',title,segmentIds:[id]}));
 const result=materializeRoutes({parts},prompt,[dinner]);
 expect(result.parts).toHaveLength(1);expect(result.parts[0]).toMatchObject({taskId:dinner.id,kind:'aa',text:prompt});
});
it('新AA的总额明细也一起处理，但不同活动和独立消费不能按数字碰巧相等合并',()=>{
 const breakdown='饮料20，我可乐4块，然后买了4瓶啤酒16aa';
 const parts=['饮料','可乐','啤酒'].map((title,id)=>({taskId:null,kind:'aa',title,segmentIds:[id]}));
 expect(materializeRoutes({parts},breakdown,[]).parts).toHaveLength(1);
 const independent='午餐20，停车4，晚饭16';
 expect(materializeRoutes({parts},independent,[]).parts).toHaveLength(3);
 const other={...dinner,id:'other'};
 expect(materializeRoutes({parts:parts.map((p,i)=>({...p,taskId:i===0?dinner.id:other.id}))},breakdown,[dinner,other]).parts).toHaveLength(3);
});
it('含总额字样的不同餐次仍保持为两个新事项',()=>{
 const prompt='早餐共20，其中咖啡4；晚饭啤酒16';
 const parts=[{taskId:null,kind:'aa',title:'早餐',segmentIds:[0,1]},{taskId:null,kind:'aa',title:'晚饭',segmentIds:[2]}];
 expect(materializeRoutes({parts},prompt,[]).parts.map(part=>part.text)).toEqual(['早餐共20，其中咖啡4','晚饭啤酒16']);
});
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
 it('中文句末标点允许多任务拆分，金额小数与原文范围不变',()=>{
  const prompt='饮料18.50。给妈妈转500！明天提醒我开会？';
  expect(routingSegments(prompt).map(segment=>segment.text)).toEqual(['饮料18.50','给妈妈转500','明天提醒我开会']);
  const parts=[{taskId:null,kind:'aa',title:'饮料',segmentIds:[0]},{taskId:null,kind:'transfer',title:'转账',segmentIds:[1]},{taskId:null,kind:'reminder',title:'开会',segmentIds:[2]}];
  expect(materializeRoutes({parts},prompt,[]).parts.map(part=>part.text)).toEqual(['饮料18.50','给妈妈转500','明天提醒我开会']);
  expect(()=>materializeRoutes({parts:[parts[0],{...parts[1],segmentIds:[0,1,2]}]},prompt,[])).toThrow();
 });
 it('你好不需要分类模型，对与没错接明确追问，新增业务不误续接',()=>{
  expect(conversationRoute('你好',[birthday],birthday.id)?.parts[0]).toMatchObject({kind:'general',text:'你好'});
  for(const answer of ['对','没错','是的','嗯'])expect(conversationRoute(answer,[birthday],birthday.id)?.parts[0].taskId).toBe('birthday');
  expect(conversationRoute('对，给妈妈转500',[birthday],birthday.id)).toBeNull();
  expect(conversationRoute('对',[{...birthday,kind:'transfer',progress:undefined}],birthday.id)).toBeNull();
 });
});
it.each(['记忆','记录到日历'])('当前生日事实确认后的%s复用其来源事项，不让模型另问记什么',prompt=>{
 const task:Workspace={id:'birthday',kind:'general',title:'王芳生日',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[{id:'source',role:'user',memoryRevision:0,content:sharePrompt(buildWechatShare({id:'c',name:'王芳',kind:'direct'},[{id:'m',sender:'王芳',text:'我生日是7月15号。',sentAt:1791770000000}],['m'],'帮我记录王芳生日','s'))}],progress:{goal:'记录王芳生日',stage:'waiting_user',waitingFor:{field:'reply',question:'需要提前提醒你吗？'}}};
 expect(conversationRoute(prompt,[task],task.id)?.parts[0].taskId).toBe('birthday');expect(conversationRoute('记忆',[],task.id)).toBeNull();
});
