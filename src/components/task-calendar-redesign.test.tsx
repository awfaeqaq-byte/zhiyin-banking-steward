import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {TaskCalendar} from './task-calendar';
import {dayKey,updateTasks,type Reminder,type TaskState} from '../lib/task-calendar';

const props={schedules:[],sources:[],onDraftConsumed:vi.fn(),onOpenTransfers:vi.fn(),onOpenSubscription:vi.fn()};
const start=()=>Date.parse(`${dayKey(Date.now()+86400000)}T09:00:00+08:00`);
function reminder(id:string,dueAt:number,status:Reminder['status']='pending'):Reminder{return {id,title:id,dueAt,status,createdAt:1,updatedAt:1};}
function serve(tasks:Reminder[]=[]){let state:TaskState={revision:0,tasks};const fetcher=vi.fn(async(_url,init)=>{if(init?.body)state=updateTasks(state,JSON.parse(init.body));return new Response(JSON.stringify(state));});vi.stubGlobal('fetch',fetcher);return {fetcher,state:()=>state};}
afterEach(()=>vi.unstubAllGlobals());

it('近期和类型筛选只调整展示，已结束安排按需展开且保留状态',async()=>{
 const now=start(),api=serve([reminder('核对账单',now),reminder('明天还书',now+86400000),reminder('已处理',now,'completed'),reminder('已撤回',now,'cancelled')]);
 const user=userEvent.setup();render(<TaskCalendar {...props} initialDate={now} schedules={[{id:'bank',recipientId:'mom',amount:20000,createdAt:1,executeAt:now+86400000,status:'pending'}]}/>);
 await screen.findByText('核对账单');expect(screen.queryByText('明天还书')).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'近期'}));expect(screen.getByText('明天还书')).toBeVisible();
 await user.selectOptions(screen.getByLabelText('筛选日程类型'),'reminder');expect(screen.queryByText('转账给妈妈')).not.toBeInTheDocument();expect(screen.getByText('明天还书')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'当天'}));await user.click(screen.getByText('已结束的安排（2）'));
 const completed=screen.getByRole('button',{name:/已处理.*已完成/});await user.click(completed);expect(screen.queryByRole('button',{name:'标记完成'})).not.toBeInTheDocument();
 expect(api.fetcher.mock.calls.every(([,init])=>!init?.body)).toBe(true);
});

it('跨年近期列表展示下一年的生日，筛选不会丢失年度记录',async()=>{
 const year=Number(dayKey(Date.now()).slice(0,4))+1;
 serve([{...reminder('元旦生日',Date.parse(`${year}-01-01T00:00:00+08:00`)),allDay:true,repeat:'yearly'}]);
 const user=userEvent.setup();render(<TaskCalendar {...props} initialDate={Date.parse(`${year-1}-12-31T09:00:00+08:00`)}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'添加提醒'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'近期'}));
 await user.selectOptions(screen.getByLabelText('筛选日程类型'),'birthday');expect(screen.getByRole('button',{name:/全天.*元旦生日.*每年公历/})).toBeVisible();
});

it('手动生日组件保存年度全天记录，取消仍需明确确认',async()=>{
 const api=serve(),user=userEvent.setup();render(<TaskCalendar {...props} initialDate={start()}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'添加提醒'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'添加提醒'}));await user.click(screen.getByRole('button',{name:'生日'}));
 await user.type(screen.getByLabelText('要做什么'),'妈妈生日');expect(screen.getByLabelText('生日日期（公历）')).toHaveValue(dayKey(start()));
 await user.click(screen.getByRole('button',{name:'确认保存生日'}));expect(api.state().tasks[0]).toMatchObject({title:'妈妈生日',allDay:true,repeat:'yearly'});
 await user.click(screen.getByRole('button',{name:/全天.*妈妈生日/}));await user.click(screen.getByRole('button',{name:'取消生日记录'}));expect(api.state().tasks[0].status).toBe('pending');
 await user.click(screen.getByRole('button',{name:'确认取消'}));await waitFor(()=>expect(api.state().tasks[0].status).toBe('cancelled'));
 await user.click(screen.getByText('已结束的安排（1）'));expect(screen.getByRole('button',{name:/妈妈生日.*已取消/})).toBeVisible();
});

it('服务缺失时不宣称没有安排，仍能查看已返回的银行记录',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'提醒暂时无法读取'}),{status:503})));
 render(<TaskCalendar {...props} initialDate={start()} bankError="银行更新失败" schedules={[{id:'failed',recipientId:'mom',amount:20000,createdAt:1,executeAt:start(),status:'failed',error:'余额不足'}]}/>);
 await screen.findByRole('alert');expect(screen.queryByText('这一天，暂时没有安排。')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/转账给妈妈.*执行失败/})).toBeVisible();
});

it('管家入口只交接输入草稿，月历可收起且保持所选日期',async()=>{
 const api=serve(),onDiscuss=vi.fn(),user=userEvent.setup();render(<TaskCalendar {...props} initialDate={start()} stewardName="阿衡" onDiscuss={onDiscuss}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'添加提醒'})).toBeEnabled());await user.click(screen.getByRole('button',{name:/和阿衡安排日程/}));expect(onDiscuss).toHaveBeenCalledWith(expect.stringContaining(dayKey(start())));
 await user.click(screen.getByRole('button',{name:'收起月历'}));expect(within(screen.getByRole('group',{name:'选择日期'})).getAllByRole('button')).toHaveLength(7);
 expect(screen.getByRole('button',{name:new RegExp(dayKey(start()))})).toHaveAttribute('aria-pressed','true');expect(api.fetcher.mock.calls.every(([,init])=>!init?.body)).toBe(true);
});
