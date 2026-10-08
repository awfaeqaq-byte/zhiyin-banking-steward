import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, afterEach } from 'vitest';
import { StewardWorkspaces } from './steward-workspaces';
import { changeWorkspaces, emptyWorkspaces } from '../lib/workspaces';
import type { StewardReplyRequest } from '../lib/steward-chat';

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });
const props = { stewardName:'宁宁', stewardImage:'/n.png', connections:{}, disabledReminders:[], onToggleReminder:vi.fn(), onOpenSubscriptions:vi.fn(), onPrepareCancel:vi.fn() };
function server() {
  let state=emptyWorkspaces();
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
    if(String(url).includes('/workspaces')) {
      if(init?.body) state=changeWorkspaces(state,JSON.parse(String(init.body)));
      return new Response(JSON.stringify(state));
    }
    if(String(url).includes('/steward-reply')) return new Response(JSON.stringify({output_text:JSON.stringify({text:'预算已改成800元，蛋糕保留。',patch:{recipient:'爱人',budget:80000,productIds:['cake-light']}})}));
    return new Response(JSON.stringify({revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]}));
  });
  return { state:()=>state, fetcher };
}
async function say(text:string) {
  const user=userEvent.setup();
  const input=await screen.findByRole('textbox',{name:'和宁宁说点什么'});
  await user.clear(input); await user.type(input,text);
  await waitFor(()=>expect(screen.getByRole('button',{name:'发送给宁宁'})).toBeEnabled());
  await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
  return input;
}

it('首页只有一个对话入口，后台自动拆分并连续处理，不要求用户切任务',async()=>{
  const api=server();
  const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>(async request=>({text:request.messages.at(-1)!.content==='饮料18'?'饮料已记好。':'出行已整理。'}));
  render(<StewardWorkspaces {...props} reply={reply} route={async()=>({parts:[{taskId:null,kind:'general',title:'晚餐记录',text:'饮料18'},{taskId:null,kind:'general',title:'出行安排',text:'明天去杭州'}]})}/>);
  const input=await say('饮料18，明天去杭州');
  await screen.findByText('出行已整理。');
  expect(screen.getByText('饮料已记好。')).toBeInTheDocument();
  expect(screen.getAllByText('饮料18，明天去杭州')).toHaveLength(1);
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
  expect(screen.queryByRole('button',{name:'任务窗口'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('任务类型')).not.toBeInTheDocument();
  expect(screen.queryByText(/整理到对应任务|继续：出行安排/)).not.toBeInTheDocument();
  expect(reply.mock.calls[1][0].messages).toEqual([{role:'user',content:'明天去杭州'}]);
  await waitFor(()=>expect(api.state().items.every(w=>w.messages.length===2 && !w.pending?.length)).toBe(true));
});

it('聊其他事再回来，前台聊天不断，模型只拿到所属任务的上下文',async()=>{
  const api=server();
  const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>(async request=>({text:`收到：${request.messages.at(-1)!.content}`}));
  render(<StewardWorkspaces {...props} reply={reply} route={async(text,tasks)=>{
    const title=text==='先说结论'||text==='简短一点'?'账单分析':'周末出行';
    return {parts:[{taskId:tasks.find(w=>w.title===title)?.id||null,kind:'general',title,text}]};
  }}/>);
  const input=await say('先说结论'); await screen.findByText('收到：先说结论');
  await say('明天去杭州'); await screen.findByText('收到：明天去杭州');
  await say('简短一点'); await screen.findByText('收到：简短一点');
  expect(screen.getByText('收到：先说结论')).toBeInTheDocument();
  expect(screen.getByText('收到：明天去杭州')).toBeInTheDocument();
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
  expect(reply.mock.calls[2][0].messages).toEqual([{role:'user',content:'先说结论'},{role:'assistant',content:'收到：先说结论'},{role:'user',content:'简短一点'}]);
  await waitFor(()=>expect(api.state().items.map(w=>w.messages.length)).toEqual([4,2]));
});

it('有歧义就直接在对话里追问，不执行；用户补充后后台接着整理',async()=>{
  const api=server();
  const reply=vi.fn(async()=>({text:'好，继续处理今晚聚餐。'}));
  const route=vi.fn(async(text:string)=> text==='改成30' ? {parts:[],clarification:'要改今晚聚餐的饮料，还是周末旅行的饮料？'} : {parts:[{taskId:null,kind:'general' as const,title:'今晚聚餐',text}]});
  render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
  await say('改成30');
  await screen.findByText('要改今晚聚餐的饮料，还是周末旅行的饮料？');
  expect(reply).not.toHaveBeenCalled(); expect(api.state().items).toHaveLength(0);
  await say('今晚聚餐'); await screen.findByText('好，继续处理今晚聚餐。');
  expect(route.mock.calls[1][0]).toBe('改成30；补充：今晚聚餐');
  expect(screen.getByText('改成30')).toBeInTheDocument();
});

it('分流失败保留原输入，不执行业务或让用户手动选择窗口',async()=>{
  server();
  const reply=vi.fn(async()=>({text:'不会执行'}));
  render(<StewardWorkspaces {...props} reply={reply} route={async()=>{throw new Error('暂时无法理解，请重试');}}/>);
  const input=await say('饮料18');
  await screen.findByRole('alert');
  expect(input).toHaveValue('饮料18'); expect(reply).not.toHaveBeenCalled();
  expect(screen.queryByText(/手动选择|任务窗口/)).not.toBeInTheDocument();
});

it('一项失败后停止后续处理，交代保留后台，不假装都已完成',async()=>{
  const api=server();
  const reply=vi.fn(async()=>{throw new Error('数据暂时不可用');});
  render(<StewardWorkspaces {...props} reply={reply} route={async()=>({parts:[{taskId:null,kind:'general',title:'事项甲',text:'查看甲'},{taskId:null,kind:'general',title:'事项乙',text:'查看乙'}]})}/>);
  await say('查看甲，查看乙'); await screen.findByText('数据暂时不可用');
  await waitFor(()=>expect(api.state().items[0].messages).toHaveLength(2));
  expect(reply).toHaveBeenCalledTimes(1);
  expect(api.state().items[1].pending).toHaveLength(1);
  expect(api.state().items[0].pending).toHaveLength(1);
});

it('生活筹备也在同一个首页输入，不换对话页、不自动付款',async()=>{
  const api=server();
  render(<StewardWorkspaces {...props} reply={async()=>({text:'另件事也收到。'})} route={async(text,tasks)=>({parts:[{taskId:tasks.find(w=>w.kind==='occasion')?.id||null,kind:'occasion',title:'爱人生日',text}]})}/>);
  const input=await say('预算800，只要蛋糕');
  await screen.findByText('预算已改成800元，蛋糕保留。');
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
  expect(screen.queryByLabelText('交给宁宁整理')).not.toBeInTheDocument();
  await waitFor(()=>expect(api.state().items[0].messages).toHaveLength(2));
  expect(api.fetcher.mock.calls.filter(([url,init])=>String(url).includes('/bank')&&init?.method==='POST')).toHaveLength(0);
});

it('刷新恢复统一聊天，但不把整段首页对话串到新的后台任务',async()=>{
  server();
  localStorage.setItem('zhiyin-steward-conversation-v1',JSON.stringify([{id:'old-u',role:'user',content:'昨天的AA'},{id:'old-a',role:'assistant',content:'昨天已整理。'}]));
  const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>(async()=>({text:'新的事情收到。'}));
  render(<StewardWorkspaces {...props} reply={reply} route={async text=>({parts:[{taskId:null,kind:'general',title:'新事情',text}]})}/>);
  expect(await screen.findByText('昨天已整理。')).toBeInTheDocument();
  await say('今天查余额'); await screen.findByText('新的事情收到。');
  expect(reply.mock.calls[0][0].messages).toEqual([{role:'user',content:'今天查余额'}]);
});
