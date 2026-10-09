import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, afterEach } from 'vitest';
import { StewardWorkspaces } from './steward-workspaces';
import { changeWorkspaces, emptyWorkspaces } from '../lib/workspaces';
import type { StewardReplyRequest } from '../lib/steward-chat';
import * as expenseService from '../lib/expense-service';
import * as groupAA from '../lib/group-aa';
import { changeExpenses, emptyExpenseState, type ExpenseCommand } from '../lib/expense-notebook';
import type {routeWorkspacePrompt} from '../lib/workspace-service';

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

it('新建后台任务也保留最近对话的理解线索，但不混入任务执行历史',async()=>{
  server();
  const reply=vi.fn< (request:StewardReplyRequest)=>Promise<{text:string}> >(async request=>({text:request.messages.at(-1)!.content==='看看这个月的支出'?'需要先授权微信账单。':'接着核对微信授权。'}));
  const route=vi.fn<typeof routeWorkspacePrompt>(async(text:string)=>({parts:[{taskId:null,kind:'general' as const,title:'新事项',text}]}));
  render(<StewardWorkspaces {...props} reply={reply} route={route}/>);
  await say('看看这个月的支出');await screen.findByText('需要先授权微信账单。');
  await say('授权一下微信吧');await screen.findByText('接着核对微信授权。');
  expect(reply.mock.calls[1][0]).toMatchObject({recentConversation:expect.arrayContaining([{role:'assistant',content:'需要先授权微信账单。'}])});
  expect(reply.mock.calls[1][0].messages).toEqual([{role:'user',content:'授权一下微信吧'}]);
  expect(route.mock.calls[1]).toHaveLength(5);
  expect(route.mock.calls[1][4]).toEqual(expect.arrayContaining([{role:'assistant',content:'需要先授权微信账单。'}]));
});

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
  expect(screen.queryByText('0',{exact:true})).not.toBeInTheDocument();
  await say('今天查余额'); await screen.findByText('新的事情收到。');
  expect(reply.mock.calls[0][0].messages).toEqual([{role:'user',content:'今天查余额'}]);
});

it('一次交代AA和另一件事，选群核对不会被后一项隐藏，完成后仍记到正确后台账本',async()=>{
  const api=server();let expenses=emptyExpenseState();
  vi.spyOn(expenseService,'expenseRequest').mockImplementation(async(op,revision)=>{if(op)expenses=changeExpenses(expenses,{...op,revision,requestId:crypto.randomUUID()} as ExpenseCommand);return expenses;});
  vi.spyOn(groupAA,'groupAARequest').mockResolvedValue({group:{id:'group',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'}]}});
  vi.spyOn(expenseService,'requestExpenseReply').mockResolvedValue({action:'add',entry:{title:'饮料',amount:1800,payerId:'me',fixed:[],shares:[{memberId:'me',weight:1},{memberId:'li',weight:1}]}});
  render(<StewardWorkspaces {...props} onOpenGroupAA={vi.fn()} reply={async()=>({text:'另一件事已整理。'})} route={async()=>({parts:[{taskId:null,kind:'aa',title:'今日AA',text:'饮料18'},{taskId:null,kind:'general',title:'其他事情',text:'聊点别的'}]})}/>);
  await say('饮料18，聊点别的');await screen.findByText('另一件事已整理。');
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'从微信选择群'}));await user.click(await screen.findByRole('checkbox',{name:'李娜'}));await user.click(screen.getByRole('button',{name:'开始记录'}));
  await waitFor(()=>expect(expenses.books[0].entries).toHaveLength(1));
  await waitFor(()=>expect(api.state().items.find(w=>w.kind==='aa')!.expenseBookId).toBe(expenses.books[0].id));
  expect(api.state().items.find(w=>w.kind==='general')!.expenseBookId).toBeUndefined();
  await screen.findByText('记下了：饮料 ¥18.00。按这次参与人平分。');
});

it('后台遗留的未处理交代不能在刷新时重放；历史聊天不恢复付款按钮',async()=>{
  const api=server();
  await fetch('/api/zhiyin/workspaces',{method:'POST',body:JSON.stringify({type:'create',id:'old',title:'未完成事项',kind:'general',revision:0,requestId:'create'})});
  await fetch('/api/zhiyin/workspaces',{method:'POST',body:JSON.stringify({type:'enqueue',id:'old',token:'pending',text:'转200给妈妈',revision:1,requestId:'enqueue'})});
  localStorage.setItem('zhiyin-workspace-active','old');
  localStorage.setItem('zhiyin-steward-conversation-v1',JSON.stringify([{id:'old-reply',role:'assistant',content:'旧转账方案。',action:{type:'prepare_transfer',recipientId:'mom',amount:20000}}]));
  const reply=vi.fn(async()=>({text:'新回复'}));const route=vi.fn();
  render(<StewardWorkspaces {...props} reply={reply} route={route} onPrepareTransfer={vi.fn()}/>);
  await screen.findByText('旧转账方案。');
  expect(route).not.toHaveBeenCalled();expect(reply).not.toHaveBeenCalled();
  expect(api.state().items[0].pending).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'核对银行转账'})).not.toBeInTheDocument();
});

it('AA选群是必要核对，名称自动整理；回到AA后继续同一本后台账本',async()=>{
  const api=server();
  let expenses=emptyExpenseState();
  vi.spyOn(expenseService,'expenseRequest').mockImplementation(async(op,revision)=>{
    if(op)expenses=changeExpenses(expenses,{...op,revision,requestId:crypto.randomUUID()} as ExpenseCommand);
    return expenses;
  });
  vi.spyOn(groupAA,'groupAARequest').mockResolvedValue({group:{id:'dinner-group',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜',gender:'female'}]}});
  const model=vi.spyOn(expenseService,'requestExpenseReply').mockImplementation(async(book,text)=>({action:'add',entry:{title:text==='饮料18'?'饮料':'午餐',amount:text==='饮料18'?1800:38800,payerId:'me',fixed:[],shares:book.participants.map(memberId=>({memberId,weight:1}))},message:'消费记好了。'}));
  render(<StewardWorkspaces {...props} onOpenGroupAA={vi.fn()} reply={async()=>({text:'另一件事收到。'})} route={async(text,tasks)=>{
    const kind=text==='聊点别的'?'general' as const:'aa' as const;
    return {parts:[{taskId:tasks.find(w=>w.kind===kind)?.id||null,kind,title:kind==='aa'?'今天聚餐AA':'日常交代',text}]};
  }}/>);
  const input=await say('饮料18');
  await screen.findByRole('button',{name:'从微信选择群'});
  expect(screen.queryByRole('textbox',{name:'活动名称'})).not.toBeInTheDocument();
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'从微信选择群'}));await user.click(await screen.findByRole('checkbox',{name:'李娜'}));await user.click(screen.getByRole('button',{name:'开始记录'}));
  await waitFor(()=>expect(expenses.books[0].entries).toHaveLength(1));
  await waitFor(()=>expect(api.state().items[0].expenseBookId).toBe(expenses.books[0].id));
  await say('聊点别的');await screen.findByText('另一件事收到。');
  await say('午餐388平分');await waitFor(()=>expect(expenses.books[0].entries).toHaveLength(2));
  expect(expenses.books).toHaveLength(1);expect(expenses.books[0].title).toBe('今天聚餐AA');
  expect(model.mock.calls[1][0].id).toBe(expenses.books[0].id);
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
});

it('混合请求的转账方案仍可核对，后续回复不吃掉它；同一任务修改后旧按钮失效',async()=>{
  server();
  const onPrepareTransfer=vi.fn();
  render(<StewardWorkspaces {...props} onPrepareTransfer={onPrepareTransfer} reply={async request=>request.messages.at(-1)!.content==='查另一件事'?{text:'另一件事查好了。'}:{text:'转账方案待核对。',action:{type:'prepare_transfer',recipientId:'mom',amount:request.messages.at(-1)!.content==='改成300'?30000:20000}}} route={async(text,tasks)=>text==='转200，查另一件事'?{parts:[{taskId:null,kind:'general',title:'转账方案',text:'转200'},{taskId:null,kind:'general',title:'另一件事',text:'查另一件事'}]}:{parts:[{taskId:tasks.find(w=>w.title==='转账方案')!.id,kind:'general',title:'转账方案',text}]}}/>);
  await say('转200，查另一件事');await screen.findByText('另一件事查好了。');
  expect(onPrepareTransfer).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'核对银行转账'})).toBeEnabled();
  await say('改成300');await waitFor(()=>expect(screen.getAllByText('转账方案待核对。')).toHaveLength(2));
  expect(screen.getAllByRole('button',{name:'核对银行转账'})).toHaveLength(1);
  await userEvent.click(screen.getByRole('button',{name:'核对银行转账'}));
  expect(onPrepareTransfer.mock.calls[0][0].amount).toBe(30000);
});
