import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {TransferFollowUp} from '../../src/components/transfer-follow-up';
import type {BankSnapshot} from '../../src/lib/bank-transfer';
const hook=vi.hoisted(()=>({state:null as BankSnapshot|null,error:''}));
vi.mock('../../src/lib/use-bank-account',()=>({useBankAccount:()=>hook}));
const now=Date.now();
function state(status:'pending'|'completed'|'failed'|'cancelled'='pending'):BankSnapshot{
 return {revision:0,balance:300000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],schedules:[{id:'task',recipientId:'mom',amount:20000,executeAt:now+60000,createdAt:now,status}]};
}
afterEach(()=>{localStorage.clear();hook.state=null;hook.error='';vi.restoreAllMocks();});
it('没有任务或账户读取失败时保持安静',()=>{
 const view=render(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.queryByRole('region')).toBeNull();
 hook.state=state();hook.error='连接失败';view.rerender(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.queryByRole('region')).toBeNull();
});
it('临近预约可以收起，状态变成失败后会再次提示',async()=>{
 hook.state=state();const view=render(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.getByText('有一笔转账将在24小时内执行')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'知道了'}));expect(screen.queryByRole('region')).toBeNull();
 hook.state=state('failed');view.rerender(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.getByText(/执行条件不满足/)).toBeVisible();
});
it('完成必须有对应回执，历史完成和远期预约不占首页',()=>{
 hook.state=state('completed');const view=render(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.queryByRole('region')).toBeNull();
 hook.state.transactions=[{id:'task',recipientId:'mom',amount:20000,completedAt:now,balanceAfter:300000}];
 view.rerender(<TransferFollowUp onOpen={vi.fn()}/>);expect(screen.getByText('你安排的转账已完成')).toBeVisible();
 hook.state.transactions[0].completedAt=now-2*86400000;view.rerender(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.queryByRole('region')).toBeNull();
 hook.state=state();hook.state.schedules![0].executeAt=now+2*86400000;view.rerender(<TransferFollowUp onOpen={vi.fn()}/>);
 expect(screen.queryByRole('region')).toBeNull();
});
it('持久化已读且容忍无效存储，多条事件优先展示失败',()=>{
 localStorage.setItem('zhiyin-transfer-notices-seen-v1','broken');hook.state=state();
 hook.state.schedules!.push({...hook.state.schedules![0],id:'failed',status:'failed',error:'限额不足'});
 const onAttention=vi.fn();render(<TransferFollowUp onOpen={vi.fn()} onAttention={onAttention}/>);
 expect(screen.getByText(/限额不足/)).toBeVisible();expect(screen.getByRole('button',{name:'查看安排（2）'})).toBeVisible();
 expect(onAttention).toHaveBeenCalledWith(true);
});
