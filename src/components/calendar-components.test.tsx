import {act,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CalendarEventCard} from './calendar-components';
import {TaskCalendar} from './task-calendar';
import type {CalendarEvent,TaskState} from '../lib/task-calendar';
import type {OccasionPlan} from '../lib/occasion-plans';

const now=Date.parse('2026-10-13T10:00:00+08:00');
const next=now+3600000;
const calendarProps={schedules:[],sources:[],initialDate:now,onDraftConsumed:vi.fn(),onOpenTransfers:vi.fn(),onOpenSubscription:vi.fn()};
const event=(patch:Partial<CalendarEvent>={}):CalendarEvent=>({id:'event-one',title:'核对账单',dueAt:next,kind:'reminder',status:'pending',...patch});
const cardProps=()=>({expanded:true,busy:false,confirmCancel:false,onToggle:vi.fn(),onEdit:vi.fn(),onComplete:vi.fn(),onCancel:vi.fn(),onConfirmCancel:vi.fn(),onKeep:vi.fn()});

beforeEach(()=>vi.spyOn(Date,'now').mockReturnValue(now));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks();});

it('银行预约和续费只打开原业务，生活筹备两个节点都定位同一计划',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({revision:0,tasks:[]})));
 vi.stubGlobal('fetch',fetcher);
 const onOpenTransfers=vi.fn(),onOpenSubscription=vi.fn(),onOpenOccasion=vi.fn();
 const occasion:OccasionPlan={id:'birthday-plan',title:'王芳生日',recipient:'王芳',budget:30000,prepareAt:next,deliverAt:next+3600000,address:'示例地址',contact:'王芳',note:'',productIds:['cake-light'],status:'reserved',createdAt:now,updatedAt:now,orders:[]};
 render(<TaskCalendar {...calendarProps} onOpenTransfers={onOpenTransfers} onOpenSubscription={onOpenSubscription} onOpenOccasion={onOpenOccasion} occasions={[occasion]} schedules={[{id:'bank-one',recipientId:'mom',amount:20000,createdAt:now,executeAt:next,status:'pending'}]} sources={[{provider:'alipay',displayName:'支付宝',accountMasked:'',syncedAt:'',scopes:['autopay'],transactions:[],autopays:[{id:'music',title:'音乐会员',amount:2500,cycle:'月',nextChargeAt:next}]}]}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'添加提醒'})).toBeEnabled());
 const user=userEvent.setup();
 for(const [name,action] of [[/转账给妈妈/,'管理预约转账'],[/音乐会员/,'查看订阅'],[/王芳生日 · 开始筹备/,'核对筹备安排'],[/王芳生日 · 期望送达/,'核对筹备安排']] as const){
  await user.click(screen.getByRole('button',{name}));
  const article=screen.getByRole('button',{name}).closest('article')!;
  expect(within(article).queryByRole('button',{name:'修改'})).not.toBeInTheDocument();
  expect(within(article).queryByRole('button',{name:'标记完成'})).not.toBeInTheDocument();
  expect(within(article).queryByRole('button',{name:/取消/})).not.toBeInTheDocument();
  await user.click(within(article).getByRole('button',{name:action}));
 }
 expect(onOpenTransfers).toHaveBeenCalledOnce();
 expect(onOpenSubscription).toHaveBeenCalledOnce();
 expect(onOpenSubscription).toHaveBeenCalledWith('alipay','music');
 expect(onOpenOccasion.mock.calls).toEqual([['birthday-plan'],['birthday-plan']]);
 expect(fetcher).toHaveBeenCalledOnce();
 expect(fetcher.mock.calls[0]).toEqual(['/api/zhiyin/tasks',expect.objectContaining({method:'GET'})]);
});

it('到期续费保留预计金额与待核实状态，不把时间到期当作成功扣款',()=>{
 render(<CalendarEventCard {...cardProps()} event={event({kind:'renewal',title:'音乐会员',dueAt:now-3600000,source:'wechat_pay',amount:2500,note:'微信支付 · 下次预计扣费，实际结果以平台账单为准。'})} onOpen={vi.fn()}/>);
 expect(screen.getByRole('button',{name:/音乐会员.*订阅续费.*扣费结果待核实/})).toBeInTheDocument();
 expect(screen.getByText('¥25')).toBeInTheDocument();
 expect(screen.getByText('预计扣费')).toBeInTheDocument();
 expect(screen.getByText('微信支付')).toBeInTheDocument();
 expect(screen.getByText(/实际结果以平台账单为准/)).toBeInTheDocument();
 expect(screen.queryByText(/已扣费|已付款|已完成/)).not.toBeInTheDocument();
});

it.each([['completed','已完成'],['cancelled','已取消']] as const)('已结束生日 %s 显示真实状态，不提供修改、完成或取消操作',(status,label)=>{
 render(<CalendarEventCard {...cardProps()} event={event({kind:'birthday',title:'王芳的生日',allDay:true,status})}/>);
 expect(screen.getByRole('button',{name:new RegExp(`全天.*王芳的生日.*${label}`)})).toBeInTheDocument();
 expect(screen.queryByText('每年公历')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/修改|标记完成|取消生日记录|确认取消/})).not.toBeInTheDocument();
});

it('未知银行状态提示核对并保留原业务入口，不误当已完成或待执行',async()=>{
 const onOpen=vi.fn();
 render(<CalendarEventCard {...cardProps()} event={event({kind:'transfer',title:'转账给妈妈',status:'reconciling',amount:20000})} onOpen={onOpen}/>);
 expect(screen.getByText('状态待核对')).toBeInTheDocument();
 expect(screen.queryByText(/已完成|等待执行/)).not.toBeInTheDocument();
 await userEvent.setup().click(screen.getByRole('button',{name:'管理预约转账'}));
 expect(onOpen).toHaveBeenCalledOnce();
 expect(screen.queryByRole('button',{name:/标记完成|取消提醒|修改/})).not.toBeInTheDocument();
});

it('生日取消需要二次确认，保存中禁用修改及所有取消操作',async()=>{
 const actions=cardProps(),birthday=event({kind:'birthday',title:'王芳的生日',allDay:true});
 const {rerender}=render(<CalendarEventCard {...actions} event={birthday}/>);
 const user=userEvent.setup();
 expect(screen.queryByRole('button',{name:'标记完成'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'确认取消'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'取消生日记录'}));
 expect(actions.onCancel).toHaveBeenCalledOnce();
 expect(actions.onConfirmCancel).not.toHaveBeenCalled();
 rerender(<CalendarEventCard {...actions} event={birthday} confirmCancel/>);
 expect(screen.getByText('取消后不再列入每年的生日安排。')).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'保留'}));
 expect(actions.onKeep).toHaveBeenCalledOnce();
 await user.click(screen.getByRole('button',{name:'确认取消'}));
 expect(actions.onConfirmCancel).toHaveBeenCalledOnce();
 rerender(<CalendarEventCard {...actions} event={birthday} confirmCancel busy/>);
 for(const name of ['修改','取消生日记录','确认取消','保留'])expect(screen.getByRole('button',{name})).toBeDisabled();
});

it('取消核对期间日程在后台已完成，重新查看记录不再显示可提交的取消操作',async()=>{
 let state:TaskState={revision:0,tasks:[{id:'reminder-one',title:'核对信用卡账单',dueAt:next,note:'',status:'pending',createdAt:now,updatedAt:now}]};
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify(state)));
 vi.stubGlobal('fetch',fetcher);
 render(<TaskCalendar {...calendarProps}/>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:/核对信用卡账单.*待处理/}));
 await user.click(screen.getByRole('button',{name:'取消提醒'}));
 expect(screen.getByRole('button',{name:'确认取消'})).toBeInTheDocument();
 state={revision:1,tasks:[{...state.tasks[0],status:'completed',updatedAt:now+1000}]};
 act(()=>window.dispatchEvent(new Event('zhiyin-tasks-updated')));
 await screen.findByText('已结束的安排（1）');
 await user.click(screen.getByText('已结束的安排（1）'));
 expect(screen.getByRole('button',{name:/核对信用卡账单.*已完成/})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'确认取消'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'修改'})).not.toBeInTheDocument();
 expect(fetcher.mock.calls.every(([,init])=>init?.method==='GET')).toBe(true);
});
