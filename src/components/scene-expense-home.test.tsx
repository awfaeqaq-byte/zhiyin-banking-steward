import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardWorkspaces} from './steward-workspaces';
import {changeWorkspaces,emptyWorkspaces,type WorkspaceState} from '../lib/workspaces';
import {routeWorkspacePrompt} from '../lib/workspace-service';
import {emptyExpenseState} from '../lib/expense-notebook';

afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it('首页实付入口原子续接AA，不丢原事项、不创建订单或发送收款',async()=>{
 let state:WorkspaceState={...changeWorkspaces(emptyWorkspaces(),{type:'create',id:'birthday',kind:'general',title:'王芳生日',revision:0,requestId:'create'}),scenes:[{id:'birthday',title:'王芳生日',workspaceIds:['birthday'],links:[],records:[{kind:'food_order',id:'order',workspaceId:'birthday',status:'PAID',label:'蛋糕已付款'}],stage:'waiting_user',summary:'有一笔实付可整理',orders:[],checkedAt:1,fingerprint:'one',expenses:{pendingCount:1,netAmount:20600,sourceIds:['payment']}}],conversation:[{id:'notice',role:'assistant',content:'有一笔实付可整理',workspaceId:'birthday',sceneId:'birthday'}]};
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url).includes('/workspaces')){if(init?.body)state=changeWorkspaces(state,JSON.parse(String(init.body)));return new Response(JSON.stringify(state));}
  if(String(url).includes('/scene-expenses'))return new Response(JSON.stringify({sources:[],state:emptyExpenseState()}));
  if(String(url).includes('/expenses'))return new Response(JSON.stringify(emptyExpenseState()));
  if(String(url).includes('/scenes'))return new Response(JSON.stringify(state));
  throw new Error(`Unexpected request ${url}`);
 });
 render(<StewardWorkspaces stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onOpenGroupAA={vi.fn()} route={routeWorkspacePrompt}/>);
 await userEvent.click(await screen.findByRole('button',{name:'整理本次费用'}));
 await waitFor(()=>expect(state.items.find(t=>t.kind==='aa')?.messages.some(m=>m.role==='assistant')).toBe(true));
 const task=state.items.find(t=>t.kind==='aa')!;
 expect(task.sceneId).toBe('birthday');expect(task.expenseBookId).toBeUndefined();
 expect(state.items.filter(t=>t.kind==='aa')).toHaveLength(1);
 expect(task.messages.find(m=>m.role==='user')?.content).toBe('整理本次实付费用');
 expect(fetcher.mock.calls.filter(([url,init])=>String(url).includes('/expenses')&&init?.method==='POST')).toHaveLength(0);
});
