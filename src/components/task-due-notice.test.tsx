import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {TaskDueNotice} from './task-due-notice';
import type {OccasionPlan} from '../lib/occasion-plans';
afterEach(()=>vi.unstubAllGlobals());
it('只显示已到时且未结束的提醒，点击跳转到对应日期',async()=>{
 const now=Date.now(),onOpen=vi.fn(),onAttention=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({revision:1,tasks:[
  {id:'due',title:'昨天安排的核账',dueAt:now-86400000,status:'pending',createdAt:now-100000000,updatedAt:now},
  {id:'future',title:'未来安排',dueAt:now+86400000,status:'pending',createdAt:now,updatedAt:now},
  {id:'done',title:'已完成安排',dueAt:now-1000,status:'completed',createdAt:now-2000,updatedAt:now},
 ]}))));
 render(<TaskDueNotice onOpen={onOpen} onAttention={onAttention}/>);
 await userEvent.click(await screen.findByRole('button',{name:/昨天安排的核账/}));expect(onOpen).toHaveBeenCalledWith(now-86400000);expect(onAttention).toHaveBeenCalledWith(true);expect(screen.queryByText('未来安排')).not.toBeInTheDocument();
});
it('服务失败不伪造提醒',async()=>{const onAttention=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:500})));render(<TaskDueNotice onOpen={vi.fn()} onAttention={onAttention}/>);await waitFor(()=>expect(onAttention).toHaveBeenCalledWith(false));expect(screen.queryByRole('button')).not.toBeInTheDocument();});
it('筹备到时间才提醒；日程服务失败仍显示已知筹备，取消后不再提醒',async()=>{
 const plan={id:'birthday',title:'爱人生日',status:'reserved',prepareAt:Date.now()-1000,deliverAt:Date.now()+86400000} as OccasionPlan;
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:500})));const onOccasion=vi.fn(),onAttention=vi.fn();
 const view=render(<TaskDueNotice occasions={[plan]} onOccasion={onOccasion} onOpen={vi.fn()} onAttention={onAttention}/>);
 await userEvent.click(await screen.findByRole('button',{name:/爱人生日/}));expect(onOccasion).toHaveBeenCalledWith('birthday');expect(onAttention).toHaveBeenCalledWith(true);
 view.rerender(<TaskDueNotice occasions={[{...plan,status:'cancelled'}]} onOccasion={onOccasion} onOpen={vi.fn()} onAttention={onAttention}/>);
 await waitFor(()=>expect(screen.queryByText('爱人生日')).not.toBeInTheDocument());
});
