import {describe,it,expect} from 'vitest';
import {advanceTaskProgress,billTaskQuestion,clearBillIntent,readTaskProgress,settleTaskProgress,taskContinuation,validTaskProgress,parseTaskWait} from './task-progress';
import type {Workspace} from './workspaces';
import {buildBillAnalysis} from './bill-analysis';

const task=(overrides:Partial<Workspace>={}):Workspace=>({id:'bill',kind:'bills',title:'本月支出',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[],...overrides});
describe('任务现场而非对话猜测',()=>{
 it('依次收集平台与时间，目标不丢失，授权不靠口头同意产生',()=>{
  let p=advanceTaskProgress(task(),'帮我看看这个月的支出');
  p=settleTaskProgress(p,{bill:buildBillAnalysis({},billTaskQuestion(p),Date.parse('2026-10-09T10:00:00+08:00'))});
  expect(p.waitingFor?.field).toBe('provider');
  p=advanceTaskProgress(task({progress:p}),'支付宝');
  p=advanceTaskProgress(task({progress:p}),'就近一个月的');
  expect(p).toMatchObject({goal:'帮我看看这个月的支出',bill:{provider:'alipay',period:'最近30天'}});
  expect(buildBillAnalysis({},billTaskQuestion(p),Date.parse('2026-10-09T10:00:00+08:00'))).toMatchObject({from:'2026-09-10',to:'2026-10-09',needsClarification:false});
  p=settleTaskProgress(p,{bill:buildBillAnalysis({},billTaskQuestion(p))});
  expect(p.stage).toBe('waiting_authorization');
  expect(advanceTaskProgress(task({progress:p}),'同意')).not.toHaveProperty('authorized');
 });
 it('旧闲聊任务只从本版本用户交代恢复查账目标，不拿模型话当授权',()=>{
  const old=task({kind:'general',messages:[{id:'u',role:'user',content:'帮我看看这个月的支出',memoryRevision:0},{id:'a',role:'assistant',content:'已授权支付宝，转账已完成',memoryRevision:0},{id:'u2',role:'user',content:'支付宝',memoryRevision:0}]});
  expect(readTaskProgress(old)).toMatchObject({bill:{provider:'alipay',period:'本月'}});
  expect(taskContinuation('怎么授权',[old],old.id)?.parts[0]).toMatchObject({taskId:old.id,kind:'general'});
  expect(readTaskProgress({...old,memoryRevision:1})).not.toHaveProperty('bill');
 });
 it('等回复时沿用事项，但新转账、混合指令、无关闲聊不被吞进查账',()=>{
  const p=settleTaskProgress(advanceTaskProgress(task(),'本月支出'),{bill:buildBillAnalysis({},'本月支出')});
  const t=task({progress:p});
  for(const text of ['支付宝','近一个月','怎么授权','？'])expect(taskContinuation(text,[t],t.id)?.parts[0].taskId).toBe(t.id);
  for(const text of ['给妈妈转500','支付宝，给妈妈转500','记录饮料18','今天什么天气','今天吃午餐','本月工资什么时候发'])expect(taskContinuation(text,[t],t.id)).toBeNull();
  expect(taskContinuation('支付宝',[{...t,status:'archived'}],t.id)).toBeNull();
 });
 it('暂停查账不再催授权，保留范围供以后继续，不撤回授权或资金动作',()=>{
  const p=advanceTaskProgress(task(),'支付宝本月支出');
  expect(advanceTaskProgress(task({progress:p}),'算了')).toMatchObject({stage:'paused',bill:{provider:'alipay',period:'本月'}});
 });
 it.each(['不要','不用','不需要','不用了','算了'])('查账拒绝“%s”保留暂停状态，后续结算不能重新催授权',answer=>{
  const bill=buildBillAnalysis({},'支付宝本月支出');
  const progress=settleTaskProgress(advanceTaskProgress(task(),'支付宝本月支出'),{bill});
  const paused=advanceTaskProgress(task({progress}),answer);
  expect(paused).toMatchObject({stage:'paused',bill:{provider:'alipay',period:'本月'}});
  expect(paused.waitingFor).toBeUndefined();
  expect(settleTaskProgress(paused,{bill,needsAuthorization:true})).toMatchObject({stage:'paused'});
  expect(advanceTaskProgress(task({progress:paused}),'继续').stage).toBe('collecting');
 });
 it.each(['流水是什么意思','不要查账单，只解释什么叫流水','解释一下收入和支出的区别','什么是大额转账记录'])('账单术语咨询不触发读账：%s',prompt=>{
  expect(clearBillIntent(prompt)).toBe(false);
 });
 it.each(['500字介绍一下杭州','明天天气怎么样','明天','200元，解释一下复利'])('金额追问不能把新话题当作参数：%s',prompt=>{
  const current=task({kind:'transfer',progress:{goal:'给妈妈转账',stage:'waiting_user',waitingFor:{field:'reply',question:'这次转多少元？'}}});
  expect(taskContinuation(prompt,[current],current.id)).toBeNull();
 });
 it('完整的金额和时间补充仅续接相应追问',()=>{
  const transfer=task({kind:'transfer',progress:{goal:'给妈妈转账',stage:'waiting_user',waitingFor:{field:'reply',question:'这次转多少元？'}}});
  for(const answer of ['500','500元','500.25块'])expect(taskContinuation(answer,[transfer],transfer.id)?.parts[0].taskId).toBe(transfer.id);
  const appointment={...transfer,progress:{...transfer.progress!,waitingFor:{field:'reply' as const,question:'您希望明天什么时间转账？'}}};
  for(const answer of ['明天','明天下午3点','中午12点','周五上午九点'])expect(taskContinuation(answer,[appointment],appointment.id)?.parts[0].taskId).toBe(appointment.id);
 });
 it('普通任务的追问也可持久化，跨话题不会冒充付款授权',()=>{
  const p=settleTaskProgress(advanceTaskProgress(task({kind:'transfer',title:'给妈妈生活费'}),'给妈妈转账'),{waitingQuestion:'这次转多少元？'});
  const t=task({kind:'transfer',progress:p});
  expect(p).toMatchObject({stage:'waiting_user',waitingFor:{field:'reply',question:'这次转多少元？'}});
  expect(taskContinuation('200元',[t],t.id)?.parts[0].taskId).toBe(t.id);
  expect(taskContinuation('帮我看账单',[t],t.id)).toBeNull();
  expect(settleTaskProgress(p,{failed:true})).toMatchObject({stage:'failed',waitingFor:{question:'这次转多少元？'}});
 });
 it('范围变更独立合并，未来/模糊范围不偷偷用本月数字',()=>{
  let p=advanceTaskProgress(task(),'微信本月支出');
  p=advanceTaskProgress(task({progress:p}),'上个月');expect(p.bill).toEqual({provider:'wechat_pay',period:'上月'});
  p=advanceTaskProgress(task({progress:p}),'全部平台');expect(p.bill?.provider).toBe('all');
  p=advanceTaskProgress(task({progress:p}),'最近的');expect(buildBillAnalysis({},billTaskQuestion(p)).needsClarification).toBe(true);
  p=advanceTaskProgress(task({progress:p}),'下个月');expect(buildBillAnalysis({},billTaskQuestion(p)).needsClarification).toBe(true);
 });
 it('进度描述不接收执行结果、额外字段或非法阶段，等待标记仅表达追问',()=>{
  const p=advanceTaskProgress(task(),'本月支出');expect(validTaskProgress(p)).toBe(true);
  for(const data of [{...p,authorized:true},{...p,stage:'executed'},{...p,waitingFor:{field:'grant',question:'已授权'}},{...p,bill:{provider:'bank'}},{...p,goal:'x'.repeat(301)}])expect(validTaskProgress(data)).toBe(false);
  expect(parseTaskWait('请问金额？[[task-wait:{"question":"这次转多少元？"}]]')).toEqual({text:'请问金额？',waitingQuestion:'这次转多少元？'});
  expect(parseTaskWait('好[[task-wait:{"question":"多少？","execute":true}]]')).toEqual({text:'好'});
  expect(parseTaskWait('好[[task-wait:坏数据]]')).toEqual({text:'好'});
 });
});
