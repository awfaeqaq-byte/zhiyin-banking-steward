import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {TaskCalendar} from './task-calendar';
import {updateTasks,dayKey,type TaskState} from '../lib/task-calendar';
const props={schedules:[],sources:[],onDraftConsumed:vi.fn(),onOpenTransfers:vi.fn(),onOpenSubscription:vi.fn()};
afterEach(()=>vi.unstubAllGlobals());
it('日历选择、新增、修改、完成和取消均更新后端数据',async()=>{
 let state:TaskState={revision:0,tasks:[]};
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.body)state=updateTasks(state,JSON.parse(init.body));return new Response(JSON.stringify(state));}));
 const user=userEvent.setup();render(<TaskCalendar {...props}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'添加提醒'})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'添加提醒'}));await user.type(screen.getByLabelText('要做什么'),'查看账单');
 await user.click(screen.getByRole('button',{name:'确认保存提醒'}));await screen.findByText('查看账单');
 expect(state.tasks).toHaveLength(1);
 await user.click(screen.getByRole('button',{name:/查看账单.*待处理/}));await user.click(screen.getByRole('button',{name:'修改'}));
 await user.clear(screen.getByLabelText('要做什么'));await user.type(screen.getByLabelText('要做什么'),'核对账单');await user.click(screen.getByRole('button',{name:'确认保存提醒'}));
 await user.click(screen.getByRole('button',{name:/核对账单.*待处理/}));await user.click(screen.getByRole('button',{name:'标记完成'}));await waitFor(()=>expect(state.tasks[0].status).toBe('completed'));
 await user.click(screen.getByRole('button',{name:'添加提醒'}));await user.type(screen.getByLabelText('要做什么'),'取消测试');await user.click(screen.getByRole('button',{name:'确认保存提醒'}));
 await user.click(await screen.findByRole('button',{name:/取消测试.*待处理/}));await user.click(screen.getByRole('button',{name:'取消提醒'}));expect(state.tasks[1].status).toBe('pending');await user.click(screen.getByRole('button',{name:'确认取消'}));await waitFor(()=>expect(state.tasks[1].status).toBe('cancelled'));
 await user.click(screen.getByRole('button',{name:'下个月'}));await user.click(screen.getByRole('button',{name:'今天'}));expect(screen.getByRole('button',{name:new RegExp(dayKey(Date.now()))})).toHaveAttribute('aria-pressed','true');
});
it('模型草稿不自动写入；显示后端错误并保留表单',async()=>{
 const fetcher=vi.fn(async(_url,init)=>init?.body?new Response(JSON.stringify({error:'日程已变化，请重试'}),{status:409}):new Response(JSON.stringify({revision:0,tasks:[]})));vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();render(<TaskCalendar {...props} draft={{title:'明天查账',dueAt:Date.now()+86400000}}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'确认保存提醒'})).toBeEnabled());expect(fetcher.mock.calls.every(([,init])=>!init?.body)).toBe(true);
 await user.click(screen.getByRole('button',{name:'确认保存提醒'}));expect(await screen.findByRole('alert')).toHaveTextContent('日程已变化');expect(screen.getByLabelText('要做什么')).toHaveValue('明天查账');
});
it('来源任务打开对应管理，关闭草稿不保存，刷新失败可重试',async()=>{
 const user=userEvent.setup();const onOpenTransfers=vi.fn(),onOpenSubscription=vi.fn();let fails=true;
 vi.stubGlobal('fetch',vi.fn(async()=>fails?new Response(JSON.stringify({error:'服务暂不可用'}),{status:500}):new Response(JSON.stringify({revision:0,tasks:[]}))));
 render(<TaskCalendar {...props} onOpenTransfers={onOpenTransfers} onOpenSubscription={onOpenSubscription} draft={{title:'草稿',dueAt:Date.now()+100000}} schedules={[{id:'bank-one',recipientId:'mom',amount:20000,createdAt:Date.now(),executeAt:Date.now()+100000,status:'pending'}]} sources={[{provider:'wechat_pay',displayName:'微信支付',accountMasked:'',syncedAt:'',scopes:['autopay'],transactions:[],autopays:[{id:'music',title:'音乐会员',amount:2500,cycle:'月',nextChargeAt:Date.now()+100000}]}]}/>);
 await screen.findByRole('alert');fails=false;await user.click(screen.getByRole('button',{name:'重新加载'}));await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument());
 await user.click(screen.getByRole('button',{name:'关闭提醒编辑'}));expect(screen.queryByLabelText('要做什么')).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:/转账给妈妈/}));await user.click(screen.getByRole('button',{name:'管理预约转账'}));expect(onOpenTransfers).toHaveBeenCalledOnce();
 await user.click(screen.getByRole('button',{name:/音乐会员/}));await user.click(screen.getByRole('button',{name:'查看订阅'}));expect(onOpenSubscription).toHaveBeenCalledWith('wechat_pay','music');
 await user.click(screen.getByRole('button',{name:'上个月'}));await user.click(screen.getByRole('button',{name:'记下一件要做的事'}));expect(screen.getByLabelText('要做什么')).toBeInTheDocument();
});
