import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, afterEach } from 'vitest';
import { StewardWorkspaces } from './steward-workspaces';
import { changeWorkspaces, emptyWorkspaces } from '../lib/workspaces';
import type {StewardReplyRequest} from '../lib/steward-chat';
afterEach(() => vi.restoreAllMocks());
it('创建两个同类任务，切回后只恢复自己的对话，不复用旧首页聊天', async () => {
  let state = emptyWorkspaces();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('/workspaces')) {
      if (init?.body) state = changeWorkspaces(state, JSON.parse(String(init.body)));
      return new Response(JSON.stringify(state));
    }
    return new Response(JSON.stringify({ revision: 0, books: [] }));
  });
  const user = userEvent.setup(); const reply = vi.fn(async () => ({ text: '这是本次专属答复。' }));
  localStorage.setItem('zhiyin-steward-chat-v3', JSON.stringify([{ id: 'old', role: 'user', content: '不应混入的旧任务' }]));
  render(<StewardWorkspaces route={async(text,tasks,id)=>({parts:[{taskId:id,kind:'general',title:tasks.find(t=>t.id===id)!.title,text}]})} stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
  await user.click(await screen.findByRole('button', { name: '任务窗口' }));
  await user.type(screen.getByLabelText('任务名称'), '今晚聚餐');
  await user.click(screen.getByRole('button', { name: '开始任务' }));
  await user.type(screen.getByPlaceholderText(/交代|说点|说说|输入/), '先说结论');
  await user.click(screen.getByRole('button', { name: '发送给宁宁' }));
  await screen.findByText('这是本次专属答复。');
  await waitFor(() => expect(state.items[0].messages).toHaveLength(2));
  expect(reply.mock.calls[0]).not.toEqual(expect.arrayContaining([expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ content: '不应混入的旧任务' })]) })]));
  await user.click(screen.getByRole('button', { name: '任务窗口' }));
  await user.clear(screen.getByLabelText('任务名称')); await user.type(screen.getByLabelText('任务名称'), '周末旅行');
  await user.click(screen.getByRole('button', { name: '开始任务' }));
  expect(screen.queryByText('这是本次专属答复。')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '任务窗口' }));
  await user.click(screen.getByRole('button', { name: /打开今晚聚餐/ }));
  expect(await screen.findByText('这是本次专属答复。')).toBeInTheDocument();
});
it('混合交代逐项处理，第二个任务不会拿到第一个任务的聊天',async()=>{
  let state=emptyWorkspaces();
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
    if(String(url).includes('/workspaces')){if(init?.body)state=changeWorkspaces(state,JSON.parse(String(init.body)));return new Response(JSON.stringify(state));}
    return new Response(JSON.stringify({}));
  });
  const reply=vi.fn(async(_request:StewardReplyRequest)=>({text:'已整理，请核对。'}));
  const route=vi.fn(async()=>({parts:[{taskId:null,kind:'general' as const,title:'晚餐记录',text:'饮料18'},{taskId:null,kind:'general' as const,title:'出行安排',text:'明天去杭州'}]}));
  render(<StewardWorkspaces route={route} stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
  const user=userEvent.setup();await user.type(await screen.findByRole('textbox'),'饮料18，明天去杭州');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
  await screen.findByRole('button',{name:'继续：出行安排'});
  expect(reply).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button',{name:'继续：出行安排'}));
  await waitFor(()=>expect(reply).toHaveBeenCalledTimes(2));
  expect(reply.mock.calls[1][0].messages).toEqual([{role:'user',content:'明天去杭州'}]);
  await waitFor(()=>expect(state.items.every(w=>w.messages.length===2)).toBe(true));
});
