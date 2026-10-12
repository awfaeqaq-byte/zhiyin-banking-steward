import {describe,it,expect} from 'vitest';
import {calendarDays,dayKey,updateTasks,calendarEvents} from './task-calendar';
import {createTaskStore} from '../../server/task-store';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isTaskRequest,parseStewardReply,buildStewardInstructions} from './steward-chat';

const now=Date.parse('2026-09-28T10:00:00+08:00');
describe('任务日历',()=>{
 it('宁宁先准备提醒而不直接保存，不把账单提醒误分流',()=>{
  const future=new Date(Date.now()+86400000).toISOString().slice(0,19)+'+08:00';
  expect(parseStewardReply(`[ZHIYIN_ACTION:PREPARE_TASK|核对账单|${future}]`,[]).action?.type).toBe('prepare_task');
  expect(parseStewardReply('[ZHIYIN_ACTION:PREPARE_TASK|核对账单|2020-01-01T10:00:00+08:00]',[]).action).toBeUndefined();
  const msgs=[{role:'user' as const,content:'明天早上9点提醒我看看这个月账单'}];
  expect(buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:msgs})).toContain('PREPARE_TASK');
  expect(isTaskRequest([...msgs,{role:'user',content:'取消网易云订阅'}])).toBe(false);
  expect(isTaskRequest([...msgs,{role:'user',content:'改成10点'}])).toBe(true);
 });
 it('按北京时间归日，跨年、闰年月网格完整',()=>{
  expect(dayKey(Date.parse('2026-09-28T17:00:00Z'))).toBe('2026-09-29');
  expect(calendarDays('2028-02')).toHaveLength(35);
  expect(calendarDays('2028-02')).toContain('2028-02-29');
  expect(calendarDays('2026-12').at(-1)).toBe('2027-01-03');
 });
 it('保存、完成、取消并阻止过期版本覆盖',()=>{
  const first=updateTasks({revision:0,tasks:[]},{type:'save',revision:0,id:'one',title:'核对账单',dueAt:now+3600000,note:''},now);
  expect(first.tasks[0].status).toBe('pending');
  expect(()=>updateTasks(first,{type:'status',revision:0,id:'one',status:'completed'},now)).toThrow('已变化');
  const completed=updateTasks(first,{type:'status',revision:1,id:'one',status:'completed'},now);
  expect(completed.tasks[0].status).toBe('completed');
  expect(()=>updateTasks(first,{type:'save',revision:1,id:'two',title:' ',dueAt:now-1},now)).toThrow();
  // @ts-expect-error An untrusted API caller can send an unknown status.
  expect(()=>updateTasks(first,{type:'status',revision:1,id:'one',status:'paid'},now)).toThrow();
 });
 it('后端重建后仍能读取，不丢失任务',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhiyin-calendar-test-'));
  try{const file=join(dir,'tasks.json');const store=createTaskStore(file);store.change({type:'save',revision:0,id:'one',title:'查看账单',dueAt:Date.now()+3600000,note:''});expect(createTaskStore(file).get().tasks[0].title).toBe('查看账单');}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('仅展示已授权续费，跳过取消项和无日期项',()=>{
  const source={provider:'wechat_pay' as const,displayName:'微信支付',accountMasked:'',scopes:['autopay' as const],transactions:[],syncedAt:'',cancelledAutopayIds:['gone'],autopays:[{id:'ok',title:'音乐',amount:2500,cycle:'月',nextChargeAt:now},{id:'gone',title:'取消',amount:1,cycle:'月',nextChargeAt:now}]};
  expect(calendarEvents([],[],[source])).toHaveLength(1);
  expect(calendarEvents([],[],[{...source,scopes:[]}])).toHaveLength(0);
 });
});
it('生日作为全天年度日历记录持久化，跨年显示且不生成虚假的2月29日',()=>{
 const draft={title:'王芳的生日',dueAt:Date.parse('2027-07-15T00:00:00+08:00'),allDay:true,repeat:'yearly' as const};
 const state=updateTasks({revision:0,tasks:[]},{type:'save',revision:0,id:'birthday',...draft},now);expect(state.tasks[0]).toMatchObject({allDay:true,repeat:'yearly'});
 expect(dayKey(calendarEvents(state.tasks,[],[],[],2028)[0].dueAt)).toBe('2028-07-15');expect(calendarEvents(state.tasks,[],[],[],2028)[0].kind).toBe('birthday');
 const leap=updateTasks({revision:0,tasks:[]},{type:'save',revision:0,id:'leap',...draft,dueAt:Date.parse('2028-02-29T00:00:00+08:00')},now);expect(calendarEvents(leap.tasks,[],[],[],2027)).toHaveLength(0);expect(dayKey(calendarEvents(leap.tasks,[],[],[],2028)[0].dueAt)).toBe('2028-02-29');
});
