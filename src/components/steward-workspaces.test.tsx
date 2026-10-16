import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, afterEach } from 'vitest';
import { StewardWorkspaces } from './steward-workspaces';
import { changeWorkspaces, emptyWorkspaces } from '../lib/workspaces';
import type { StewardReplyRequest } from '../lib/steward-chat';
import * as expenseService from '../lib/expense-service';
import * as groupAA from '../lib/group-aa';
import { changeExpenses, emptyExpenseState, type ExpenseCommand } from '../lib/expense-notebook';
import type {routeWorkspacePrompt} from '../lib/workspace-service';
import type {ConnectedFinancialSource} from '../lib/financial-connections';
import {buildWechatShare} from '../lib/wechat-message-share';

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });
const props = { stewardName:'宁宁', stewardImage:'/n.png', connections:{}, disabledReminders:[], onToggleReminder:vi.fn(), onOpenSubscriptions:vi.fn(), onPrepareCancel:vi.fn() };
it('分流失败在用户消息旁给出说明和重试入口，重试成功才启动回复',async()=>{
 server();const user=userEvent.setup();
 const route=vi.fn<typeof routeWorkspacePrompt>().mockRejectedValueOnce(new Error('模型服务未返回有效内容')).mockImplementation(async text=>({parts:[{taskId:null,kind:'general',title:'闲聊',text}]}));
 const reply=vi.fn(async()=>({text:'这次收到你的消息了。'}));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('你好宁宁');const retry=await screen.findByRole('button',{name:'重试这条消息'});
 expect(retry.closest('.steward-message')).toHaveTextContent('模型服务未返回有效内容');expect(reply).not.toHaveBeenCalled();
 await user.click(retry);await screen.findByText('这次收到你的消息了。');
 expect(route).toHaveBeenCalledTimes(2);expect(reply).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'重试这条消息'})).not.toBeInTheDocument();
});
function server() {
  let state=emptyWorkspaces();
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
    if(String(url).includes('/messages')) {
      const body=init?.body?JSON.parse(String(init.body)):undefined;
      if(body){const types:Record<string,string>={submit:'message-submit',claim:'message-claim',complete:'message-complete',import:'conversation-import',append:'conversation-append'};
       if(types[body.type])state=changeWorkspaces(state,{...body,type:types[body.type],revision:state.revision,requestId:crypto.randomUUID()});}
      return new Response(JSON.stringify(state));
    }
    if(String(url).includes('/workspaces')) {
      if(init?.body) state=changeWorkspaces(state,JSON.parse(String(init.body)));
      return new Response(JSON.stringify(state));
    }
    if(String(url).includes('/steward-reply')) return new Response(JSON.stringify({output_text:JSON.stringify({text:'预算已改成800元，蛋糕保留。',patch:{recipient:'爱人',budget:80000,productIds:['cake-light']}})}));
    return new Response(JSON.stringify({revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]}));
  });
  return { state:()=>state, fetcher };
}
it('会话抽屉支持新建、查看、重命名、归档恢复和删除',async()=>{
 const api=server(),user=userEvent.setup();
 render(<StewardWorkspaces {...props} reply={async()=>({text:'收到。'})}/>);
 await user.click(screen.getByRole('button',{name:'＋ 新对话'}));
 await waitFor(()=>expect(api.state().items).toHaveLength(1));
 await user.click(screen.getByRole('button',{name:'打开会话列表'}));
 const sheet=screen.getByRole('dialog',{name:'会话管理'});
 expect(within(sheet).getByText('新对话')).toBeInTheDocument();
 await user.click(within(sheet).getByRole('button',{name:'重命名'}));
 const rename=screen.getByRole('dialog',{name:'重命名会话'});
 await user.clear(within(rename).getByRole('textbox',{name:'会话标题'}));
 await user.type(within(rename).getByRole('textbox',{name:'会话标题'}),'生日筹备');
 await user.click(within(rename).getByRole('button',{name:'保存'}));
 await waitFor(()=>expect(api.state().items[0].title).toBe('生日筹备'));
 await user.click(within(sheet).getByRole('button',{name:'归档'}));
 await waitFor(()=>expect(api.state().items[0].status).toBe('archived'));
 await user.click(within(sheet).getByRole('button',{name:'已归档'}));
 await user.click(within(sheet).getByRole('button',{name:'恢复'}));
 await waitFor(()=>expect(api.state().items[0].status).toBe('active'));
 await user.click(within(sheet).getByRole('button',{name:'最近对话'}));
 await user.click(within(sheet).getByRole('button',{name:'删除'}));
 await user.click(within(screen.getByRole('alertdialog',{name:'确认删除会话'})).getByRole('button',{name:'确认删除'}));
 await waitFor(()=>expect(api.state().items).toHaveLength(0));
});
it('历史会话可查看和续聊，首页对话与输入草稿始终连续',async()=>{
 const api=server(),user=userEvent.setup();
 for(const [id,title,userText,replyText] of [['first','转账场景','核对转账','尚未付款'],['second','卡片场景','查看卡片','尚未调额']]){
  const create={type:'create',id,title,kind:'general',revision:api.state().revision,requestId:crypto.randomUUID()};
  await fetch('/api/zhiyin/workspaces',{method:'POST',body:JSON.stringify(create)});
  const turn={type:'turn',id,user:userText,assistant:replyText,memoryRevision:0,revision:api.state().revision,requestId:crypto.randomUUID()};
  await fetch('/api/zhiyin/workspaces',{method:'POST',body:JSON.stringify(turn)});
 }
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:'first',kind:'general',title:'转账场景',text}]}));
 render(<StewardWorkspaces {...props} route={route} reply={async()=>({text:'甲的新回复，未执行转账。'})}/>);
 const input=await screen.findByRole('textbox',{name:'和宁宁说点什么'});
 await user.type(input,'这条草稿保留');
 await user.click(await screen.findByRole('button',{name:'打开会话列表'}));
 await user.click(screen.getByRole('button',{name:/转账场景 1 轮/}));
 expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
 expect(input).toHaveValue('这条草稿保留');
 expect(screen.getByText('尚未付款')).toBeInTheDocument();
 expect(screen.queryByText('尚未调额')).not.toBeInTheDocument();
 await say('继续核对第一段');
 await screen.findByText('甲的新回复，未执行转账。',{selector:'.steward-message.assistant p'});
 await waitFor(()=>expect(api.state().items.find(item=>item.id==='first')?.messages).toHaveLength(4));
 expect(api.state().items.find(item=>item.id==='second')?.messages).toHaveLength(2);
 await user.click(screen.getByRole('button',{name:'打开会话列表'}));
 await user.click(screen.getByRole('button',{name:/卡片场景 1 轮/}));
 expect(screen.getByText('尚未调额')).toBeInTheDocument();
 expect(within(screen.getByRole('region',{name:'当前会话记录'})).queryByText('甲的新回复，未执行转账。')).not.toBeInTheDocument();
 expect(screen.getByText('甲的新回复，未执行转账。',{selector:'.steward-message.assistant p'})).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'返回首页对话'}));
 expect(screen.queryByRole('region',{name:'当前会话记录'})).not.toBeInTheDocument();
 expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
});

async function seedConversation(api:ReturnType<typeof server>,id:string,title:string,userText:string,assistant:string){
 for(const operation of [{type:'create',id,title,kind:'general'},{type:'turn',id,user:userText,assistant,memoryRevision:0}]){
  await fetch('/api/zhiyin/workspaces',{method:'POST',body:JSON.stringify({...operation,revision:api.state().revision,requestId:crypto.randomUUID()})});
 }
}

it('验收标题不会隐式选中历史会话或替换首页',async()=>{
 const api=server();
 await seedConversation(api,'scenario','赛题验收·财富推荐','旧的理财提问','这条历史只应主动查看');
 render(<StewardWorkspaces {...props} route={async text=>({parts:[{taskId:null,kind:'general',title:'日常交代',text}]})} reply={async()=>({text:'收到。'})}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'＋ 新对话'})).toBeEnabled());
 expect(screen.getByText('与宁宁对话')).toBeInTheDocument();
 expect(screen.queryByText('这条历史只应主动查看')).not.toBeInTheDocument();
 expect(screen.queryByRole('region',{name:'当前会话记录'})).not.toBeInTheDocument();
});

it('后台回复期间查看其他会话不重新执行任务、不污染上下文或丢失草稿',async()=>{
 const api=server(),user=userEvent.setup();
 await seedConversation(api,'first','周末读书','之前想读一本书','读书计划待定');
 await seedConversation(api,'second','杭州出行','计划去杭州','出行时间待定');
 await seedConversation(api,'third','朋友聚会','计划和朋友聚会','聚会地点待定');
 let answer!:(value:{text:string})=>void;
 const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>(()=>new Promise(resolve=>{answer=resolve;}));
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:'second',kind:'general',title:'杭州出行',text}]}));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await user.click(screen.getByRole('button',{name:'打开会话列表'}));
 await user.click(await screen.findByRole('button',{name:/周末读书 1 轮/}));
 const input=await say('帮我整理出行清单');
 await waitFor(()=>expect(reply).toHaveBeenCalledOnce());
 await user.type(input,'下一条还在编辑');
 await user.click(screen.getByRole('button',{name:'打开会话列表'}));
 await user.click(screen.getByRole('button',{name:/朋友聚会 1 轮/}));
 expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
 expect(input).toHaveValue('下一条还在编辑');
 expect(reply).toHaveBeenCalledOnce();
 answer({text:'杭州清单已整理。'});
 await screen.findByText('杭州清单已整理。',{selector:'.steward-message.assistant p'});
 await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('completed'));
 expect(reply.mock.calls[0][0].messages).toEqual([{role:'user',content:'计划去杭州'},{role:'assistant',content:'出行时间待定'},{role:'user',content:'帮我整理出行清单'}]);
 expect(api.state().items.find(item=>item.id==='first')?.messages).toHaveLength(2);
 expect(api.state().items.find(item=>item.id==='third')?.messages).toHaveLength(2);
 expect(api.state().items.find(item=>item.id==='second')?.messages.at(-1)?.content).toBe('杭州清单已整理。');
 expect(input).toHaveValue('下一条还在编辑');
});

it('从历史会话自然换话题后，短答案继续最新事项而不是旧历史',async()=>{
 const api=server(),user=userEvent.setup();
 await seedConversation(api,'first','周末读书','之前想读一本书','读书计划待定');
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'general',title:'杭州出行',text}]}));
 const reply=vi.fn(async(request:StewardReplyRequest)=>request.messages.at(-1)?.content==='周六'?{text:'周六出发，记下了。'}:{text:'哪一天出发？',waitingQuestion:'哪一天出发？'});
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await user.click(screen.getByRole('button',{name:'打开会话列表'}));
 await user.click(await screen.findByRole('button',{name:/周末读书 1 轮/}));
 await say('帮我整理杭州出行');
 await screen.findByText('哪一天出发？',{selector:'.steward-message.assistant p'});
 await say('周六');
 await screen.findByText('周六出发，记下了。',{selector:'.steward-message.assistant p'});
 expect(route).toHaveBeenCalledOnce();
 expect(reply.mock.calls[1][0].messages).toEqual([{role:'user',content:'帮我整理杭州出行'},{role:'assistant',content:'哪一天出发？'},{role:'user',content:'周六'}]);
 expect(api.state().items).toHaveLength(2);
});
async function say(text:string) {
  const user=userEvent.setup();
  const input=await screen.findByRole('textbox',{name:'和宁宁说点什么'});
  await user.clear(input); await user.type(input,text);
  await waitFor(()=>expect(screen.getByRole('button',{name:'发送给宁宁'})).toBeEnabled());
  await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
  return input;
}

it('发送后立即清空，分流及回复晚到都不覆盖正在编辑的下一条',async()=>{
 server();const user=userEvent.setup();
 let routed!:(value:Awaited<ReturnType<typeof routeWorkspacePrompt>>)=>void;
 let answered!:(value:{text:string})=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>(()=>new Promise(resolve=>{routed=resolve;}));
 const reply=vi.fn(()=>new Promise<{text:string}>(resolve=>{answered=resolve;}));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 const input=await say('你好宁宁');await waitFor(()=>expect(route).toHaveBeenCalledOnce());
 expect(input).toHaveValue('');
 await user.type(input,'下一条还没写完');
 routed({parts:[{taskId:null,kind:'general',title:'闲聊',text:'你好宁宁'}]});
 await waitFor(()=>expect(reply).toHaveBeenCalledOnce());expect(input).toHaveValue('下一条还没写完');
 answered({text:'你好，我在。'});await screen.findByText('你好，我在。');
 expect(input).toHaveValue('下一条还没写完');
});
it('第一句尚在分流时仍可提交第二句，输入框立即清空并保持原节点',async()=>{
 const api=server(),user=userEvent.setup();let routed!:(value:Awaited<ReturnType<typeof routeWorkspacePrompt>>)=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>().mockImplementationOnce(()=>new Promise(resolve=>{routed=resolve;})).mockImplementation(async text=>({parts:[{taskId:null,kind:'general',title:text,text}]}));
 const reply=vi.fn(async(request:StewardReplyRequest)=>({text:`收到：${request.messages.at(-1)?.content}`}));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 const input=await say('安排周末读书');await waitFor(()=>expect(route).toHaveBeenCalledOnce());
 await user.type(input,'整理杭州出行');expect(screen.getByRole('button',{name:'发送给宁宁'})).toBeEnabled();
 await user.click(screen.getByRole('button',{name:'发送给宁宁'}));expect(input).toHaveValue('');
 await waitFor(()=>expect(api.state().runs).toHaveLength(2));expect(reply).not.toHaveBeenCalled();
 routed({parts:[{taskId:null,kind:'general',title:'安排周末读书',text:'安排周末读书'}]});
 await waitFor(()=>expect(api.state().runs?.every(run=>run.status==='completed')).toBe(true));
 expect(reply.mock.calls.map(([request])=>request.messages.at(-1)?.content)).toEqual(['安排周末读书','整理杭州出行']);
 expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
});
it('回复期间连续三句按序处理，各自上下文独立且不覆盖下一条草稿',async()=>{
 const api=server(),user=userEvent.setup();let firstAnswer!:(value:{text:string})=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'general',title:text,text}]}));
 const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>().mockImplementationOnce(()=>new Promise(resolve=>{firstAnswer=resolve;})).mockImplementation(async request=>({text:`已整理：${request.messages.at(-1)?.content}`}));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 const input=await say('安排周末读书');await waitFor(()=>expect(reply).toHaveBeenCalledOnce());
 for(const text of ['整理杭州出行','朋友聚会选址']){
  await user.type(input,text);expect(screen.getByRole('button',{name:'发送给宁宁'})).toBeEnabled();
  await user.click(screen.getByRole('button',{name:'发送给宁宁'}));expect(input).toHaveValue('');
 }
 await waitFor(()=>expect(api.state().runs).toHaveLength(3));expect(reply).toHaveBeenCalledOnce();
 await user.type(input,'第四句仍在编辑');firstAnswer({text:'读书计划已整理。'});
 await waitFor(()=>expect(api.state().runs?.every(run=>run.status==='completed')).toBe(true));
 expect(reply.mock.calls.map(([request])=>request.messages)).toEqual(['安排周末读书','整理杭州出行','朋友聚会选址'].map(content=>[{role:'user',content}]));
 expect(api.state().conversation?.filter(message=>message.role==='user').map(message=>message.content)).toEqual(['安排周末读书','整理杭州出行','朋友聚会选址']);
 expect(api.state().conversation?.filter(message=>message.role==='user').map(message=>message.messageId)).toEqual(api.state().runs?.map(run=>run.id));
 expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);expect(input).toHaveValue('第四句仍在编辑');
});
it.each(['current','legacy'])('多任务部分失败后刷新仍可重试，只继续失败部分且不重复原句（%s记录）',async version=>{
 const api=server(),user=userEvent.setup();
 const route=vi.fn<typeof routeWorkspacePrompt>(async()=>({parts:[{taskId:null,kind:'general',title:'读书',text:'安排读书'},{taskId:null,kind:'general',title:'出行',text:'整理出行'}]}));
 const reply=vi.fn<(request:StewardReplyRequest)=>Promise<{text:string}>>().mockResolvedValueOnce({text:'读书已整理。'}).mockRejectedValueOnce(new Error('出行服务暂时不可用')).mockResolvedValueOnce({text:'出行已恢复。'});
 const view=render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('安排读书，整理出行');await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('failed'));
 expect(screen.queryByRole('button',{name:'重新发送'})).not.toBeInTheDocument();
 if(version==='legacy')for(const message of api.state().conversation||[])delete message.retryRunId;
 view.unmount();render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await user.click(await screen.findByRole('button',{name:'重试这条消息'}));
 await screen.findByText('出行已恢复。');await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('completed'));
 expect(route).toHaveBeenCalledOnce();expect(reply.mock.calls.map(([request])=>request.messages.at(-1)?.content)).toEqual(['安排读书','整理出行','整理出行']);
 expect(api.state().runs).toHaveLength(1);expect(api.state().conversation?.filter(message=>message.role==='user')).toHaveLength(1);
 expect(api.state().items.every(task=>!task.pending?.length)).toBe(true);expect(screen.queryByRole('button',{name:'重试这条消息'})).not.toBeInTheDocument();
});
it('提交失败恢复发送框原文，有新草稿时不覆盖',async()=>{
 server();const user=userEvent.setup();let fail!:(reason:Error)=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>(()=>new Promise((_,reject)=>{fail=reject;}));
 render(<StewardWorkspaces {...props} route={route}/>);
 const input=await say('你好宁宁');await waitFor(()=>expect(route).toHaveBeenCalledOnce());expect(input).toHaveValue('');
 fail(new Error('暂时无法分流'));await waitFor(()=>expect(input).toHaveValue('你好宁宁'));
 await say('帮我看看');await waitFor(()=>expect(route).toHaveBeenCalledTimes(2));expect(input).toHaveValue('');
 await user.type(input,'这条草稿要保留');fail(new Error('仍然无法分流'));
 await screen.findByText(/仍然无法分流/);expect(input).toHaveValue('这条草稿要保留');
});
it('微信分享附言立即清空，失败只恢复附言且保留引用材料',async()=>{
 server();let fail!:(reason:Error)=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>(()=>new Promise((_,reject)=>{fail=reject;}));
 const share=buildWechatShare({id:'chat',name:'小林',kind:'direct'},[{id:'m',sender:'小林',text:'我的生日是8月20日。',sentAt:1791770000000}],['m'],'帮我记住生日','share');
 render(<StewardWorkspaces {...props} wechatShare={share} route={route}/>);
 const input=await say('先核对一下生日');await waitFor(()=>expect(route).toHaveBeenCalledOnce());expect(input).toHaveValue('');
 fail(new Error('暂时无法分流'));await waitFor(()=>expect(input).toHaveValue('先核对一下生日'));
 expect(screen.getByRole('region',{name:'来自微信的所选消息'})).toHaveTextContent('我的生日是8月20日。');
});

it('普通任务的模型追问落盘，刷新后短答案不重新分流或串入查账',async()=>{
 const api=server();
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'transfer',title:'给妈妈生活费',text}]}));
 const reply=vi.fn(async(request:StewardReplyRequest)=>({text:request.messages.at(-1)?.content==='200元'?'金额已收到，尚未付款。':'这次转多少元？',...(request.messages.at(-1)?.content==='200元'?{}:{waitingQuestion:'这次转多少元？'})}));
 const view=render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('给妈妈转账');await screen.findByText('这次转多少元？');
 await waitFor(()=>expect(api.state().items[0].progress?.waitingFor?.question).toBe('这次转多少元？'));
 view.unmount();render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('200元');await screen.findByText('金额已收到，尚未付款。');
 expect(route).toHaveBeenCalledTimes(1);expect(api.state().items).toHaveLength(1);
 expect(reply.mock.calls[1][0].messages).toEqual([{role:'user',content:'给妈妈转账'},{role:'assistant',content:'这次转多少元？'},{role:'user',content:'200元'}]);
 expect(reply.mock.calls[1][0].workspaceProgress?.goal).toBe('给妈妈生活费');
});
it.each(['error','pending'])('拒绝继续查账不再刷新平台，平台%s也能立即暂停并保存结果',async failure=>{
 const api=server();
 const refresh=vi.fn(async()=>({connections:{},error:''}));
 const reply=vi.fn(async()=>({text:'不应调用模型'}));
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'bills',title:'本月支出',text}]}));
 render(<StewardWorkspaces {...props} route={route} reply={reply} refreshSubscriptions={refresh} onConnectSource={vi.fn()}/>);
 await say('本月支出');await screen.findByRole('region',{name:'账单读取范围'});
 await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('completed'));
 refresh.mockClear().mockImplementation(()=>failure==='error'?Promise.reject(new Error('平台暂时不可用')):new Promise(()=>undefined));
 await say('不要');await screen.findByText('好，这次查账先不继续。没有撤回已有授权，也没有改动账户。');
 await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('completed'));
 expect(refresh).not.toHaveBeenCalled();expect(reply).not.toHaveBeenCalled();
 expect(api.state().items[0].progress?.stage).toBe('paused');
 expect(screen.queryByRole('region',{name:'账单读取范围'})).not.toBeInTheDocument();
});

const billSource:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],autopays:[],syncedAt:'2026-10-09',transactions:[{id:'lunch',title:'午餐套餐',amount:-2500,category:'餐饮',occurredAt:'2026-10-08'}]};
it('错误分为闲聊的查账意图修正为账单，平台/时间续答和授权后仍是同一现场',async()=>{
 const api=server(),user=userEvent.setup();
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'general',title:'查看支出',text}]}));
 const alipay={...billSource,provider:'alipay' as const,displayName:'支付宝'};
 const connect=vi.fn(async()=>alipay);
 const reply=vi.fn(async(request:StewardReplyRequest)=>({text:`分析完成 ${request.billAnalysis?.from} ${request.billAnalysis?.sources.join('、')}`}));
 render(<StewardWorkspaces {...props} route={route} reply={reply} onConnectSource={connect}/>);
 await say('帮我看看这个月的支出');await screen.findByRole('region',{name:'账单读取范围'});
 await say('支付宝');await waitFor(()=>expect(api.state().items[0].progress?.bill?.provider).toBe('alipay'));
 expect(screen.getByRole('checkbox',{name:'支付宝'})).toBeChecked();expect(screen.getByRole('checkbox',{name:'微信支付'})).not.toBeChecked();
 await say('就近一个月的');await waitFor(()=>expect(api.state().items[0].progress?.bill?.period).toBe('最近30天'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'继续到平台确认'})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 await waitFor(()=>expect(reply).toHaveBeenCalledTimes(1));
 expect(reply.mock.calls[0][0].billAnalysis).toMatchObject({from:'2026-09-10',sources:['支付宝']});
 expect(api.state().items).toHaveLength(1);expect(api.state().items[0].kind).toBe('bills');expect(route).toHaveBeenCalledTimes(1);
 expect(connect).toHaveBeenCalledWith('alipay',['transactions']);
 await waitFor(()=>expect(api.state().items[0].progress?.stage).toBe('ready'));
});
it('账单筛选仅保存原任务范围，不发消息；明确解释才续聊',async()=>{
 const api=server(),user=userEvent.setup();
 const route=vi.fn<typeof routeWorkspacePrompt>(async()=>({parts:[{taskId:null,kind:'bills',title:'本月账单',text:'本月支出'}]}));
 const reply=vi.fn(async(request:StewardReplyRequest)=>({text:`已整理 ${request.billAnalysis?.expense}`,billUI:{sections:['overview','categories','transactions'] as ('overview'|'categories'|'transactions')[],evidenceRefs:[]}}));
 render(<StewardWorkspaces {...props} connections={{wechat_pay:billSource}} reply={reply} route={route}/>);
 await say('本月支出');await screen.findByText('已整理 2500');
 await waitFor(()=>expect(api.state().items[0].messages).toHaveLength(2));
 await user.click(screen.getByRole('button',{name:'只看微信支付'}));
 await waitFor(()=>expect(api.state().items[0].progress?.bill?.provider).toBe('wechat_pay'));
 expect(reply).toHaveBeenCalledTimes(1);
 expect(api.state().items[0].messages).toHaveLength(2);
 expect(route).toHaveBeenCalledTimes(1);
 expect(screen.queryByText('只看微信支付',{selector:'.steward-message.user p'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'请宁宁解释午餐套餐 ¥25'}));
 await waitFor(()=>expect(reply).toHaveBeenCalledTimes(2));
 expect(reply.mock.calls[1][0].billAnalysis?.sources).toEqual(['微信支付']);
 expect(reply.mock.calls[1][0].billFocus).toEqual({provider:'wechat_pay',id:'lunch'});
 expect(route).toHaveBeenCalledTimes(1);expect(api.state().items).toHaveLength(1);
 expect(screen.getByText('解释这笔午餐套餐',{selector:'.steward-message.user p'})).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'账单工作区'})).toHaveTextContent('已选中「午餐套餐」');
});
it('平台确认后直接继续原账单任务，不重新分类或重复用户问题',async()=>{
 const api=server();const user=userEvent.setup();
 const route=vi.fn<typeof routeWorkspacePrompt>(async()=>({parts:[{taskId:null,kind:'bills',title:'本月账单',text:'本月支出'}]}));
 const reply=vi.fn(async()=>({text:'接着核对账单。'}));
 render(<StewardWorkspaces {...props} route={route} reply={reply} onConnectSource={async()=>billSource}/>);
 await say('本月支出');await screen.findByRole('region',{name:'账单读取范围'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'继续到平台确认'})).toBeEnabled());
 await user.click(screen.getByRole('checkbox',{name:'支付宝'}));await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 await waitFor(()=>expect(reply).toHaveBeenCalledTimes(1));expect(route).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(api.state().items[0].progress?.bill?.provider).toBe('wechat_pay'));
 expect(screen.getAllByText('本月支出',{selector:'.steward-message.user p'})).toHaveLength(1);
});

it('平台等待期间用户改了范围，晚到的确认不重放旧查询',async()=>{
 const api=server(),user=userEvent.setup();let grant!:(value:ConnectedFinancialSource)=>void;
 const route=vi.fn<typeof routeWorkspacePrompt>(async text=>({parts:[{taskId:null,kind:'bills',title:'查支出',text}]}));
 const reply=vi.fn(async()=>({text:'不应分析旧范围'}));
 render(<StewardWorkspaces {...props} route={route} reply={reply} onConnectSource={()=>new Promise(resolve=>{grant=resolve;})}/>);
 await say('本月微信支出');await screen.findByRole('region',{name:'账单读取范围'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'继续到平台确认'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 await say('上个月');await waitFor(()=>expect(api.state().items[0].progress?.bill?.period).toBe('上月'));
 grant(billSource);await screen.findByText(/范围已变化/);
 expect(reply).not.toHaveBeenCalled();expect(api.state().items[0].progress?.bill?.period).toBe('上月');
});

it('查账授权续答不会被错误分流成新的闲聊，后台保留同一任务现场',async()=>{
  server();
  const reply=vi.fn< (request:StewardReplyRequest)=>Promise<{text:string}> >(async request=>({text:request.messages.at(-1)!.content==='看看这个月的支出'?'需要先授权微信账单。':'接着核对微信授权。'}));
  const route=vi.fn<typeof routeWorkspacePrompt>(async(text:string)=>({parts:[{taskId:null,kind:'general' as const,title:'新事项',text}]}));
  render(<StewardWorkspaces {...props} reply={reply} route={route}/>);
  await say('看看这个月的支出');await screen.findByText('先选这次要看的账单来源，确认读取范围后我接着分析。');
  await say('授权一下微信吧');await screen.findByText('范围记下了，确认账单读取授权后，我接着分析。');
  expect(reply).not.toHaveBeenCalled();expect(route).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText('看看这个月的支出')).toHaveLength(1);
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
  const route=vi.fn<typeof routeWorkspacePrompt>(async(text,_tasks,_id,clarification)=> text==='改成30' ? {parts:[],clarification:'要改今晚聚餐的饮料，还是周末旅行的饮料？'} : {parts:[{taskId:null,kind:'general' as const,title:'今晚聚餐',text}],...(clarification?{continuesClarification:true}:{})});
  render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
  await say('改成30');
  await screen.findByText('要改今晚聚餐的饮料，还是周末旅行的饮料？');
  expect(reply).not.toHaveBeenCalled(); expect(api.state().items).toHaveLength(0);
  await say('今晚聚餐'); await screen.findByText('好，继续处理今晚聚餐。');
  expect(route.mock.calls[1][0]).toBe('今晚聚餐');
  expect(route.mock.calls[1][3]).toContain('改成30');
  expect(route.mock.calls[2][0]).toBe('改成30\n补充：今晚聚餐');
  expect(api.state().runs?.at(-1)?.prompt).toBe('今晚聚餐');
  expect(api.state().runs?.at(-1)?.sourcePrompt).toBe('改成30\n补充：今晚聚餐');
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
  expect(api.state().runs?.at(-1)?.jobs.map(job=>job.status)).toEqual(['failed','failed']);
  expect(api.state().items[1].pending).toHaveLength(0);
  expect(api.state().items[0].pending).toHaveLength(0);
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
  await say('改成300');await waitFor(()=>expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('¥300'));
  expect(screen.getAllByRole('button',{name:'核对银行转账'})).toHaveLength(1);
  await userEvent.click(screen.getByRole('button',{name:'核对银行转账'}));
  expect(onPrepareTransfer.mock.calls[0][0].amount).toBe(30000);
});

it('离开首页时晚到的回复仍落盘，返回首页不丢失且不重复请求',async()=>{
 const api=server();let resolve!:(value:{text:string})=>void;
 const reply=vi.fn(()=>new Promise<{text:string}>(done=>{resolve=done;}));
 const route:typeof routeWorkspacePrompt=async text=>({parts:[{taskId:null,kind:'general',title:'理财咨询',text}]});
 const view=render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('给我一些理财建议');await waitFor(()=>expect(reply).toHaveBeenCalledOnce());
 view.unmount();resolve({text:'先说说这笔钱的用途，我再帮你规划。'});
 await waitFor(()=>expect(api.state().items[0].messages).toHaveLength(2));
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await screen.findByText('先说说这笔钱的用途，我再帮你规划。');
 expect(reply).toHaveBeenCalledOnce();
});
it('已保存的后台回复补回缺失的首页消息，保留后续用户交代',async()=>{
 let state=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'finance',kind:'general',title:'理财咨询',revision:0,requestId:'create'});
 state=changeWorkspaces(state,{type:'turn',id:'finance',user:'给我一些理财建议',assistant:'先明确资金用途。',memoryRevision:0,revision:state.revision,requestId:'reply'});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{if(init?.body){const body=JSON.parse(String(init.body));const types:Record<string,string>={import:'conversation-import',append:'conversation-append'};state=changeWorkspaces(state,{...body,type:types[body.type]||body.type,revision:state.revision,requestId:crypto.randomUUID()});}return new Response(JSON.stringify(state));});
 localStorage.setItem('zhiyin-steward-conversation-v1',JSON.stringify([{id:'u',role:'user',content:'给我一些理财建议'},{id:'later',role:'user',content:'你说话啊'}]));
 const reply=vi.fn();render(<StewardWorkspaces {...props} reply={reply}/>);
 await screen.findByText('先明确资金用途。');
 expect(screen.getByText('你说话啊')).toBeInTheDocument();expect(reply).not.toHaveBeenCalled();
 expect(document.querySelectorAll('.steward-message')).toHaveLength(3);
});
it('离开后马上返回首页，仍能收到原请求随后完成的回复',async()=>{
 const api=server();let resolve!:(value:{text:string})=>void;
 const reply=vi.fn(()=>new Promise<{text:string}>(done=>{resolve=done;}));
 const route:typeof routeWorkspacePrompt=async text=>({parts:[{taskId:null,kind:'general',title:'闲聊',text}]});
 const view=render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await say('你在吗');await waitFor(()=>expect(reply).toHaveBeenCalledOnce());view.unmount();
 render(<StewardWorkspaces {...props} route={route} reply={reply}/>);
 await waitFor(()=>expect(screen.queryByText('正在为你处理…')).not.toBeInTheDocument());
 resolve({text:'在的，我收到你的消息了。'});
 await waitFor(()=>expect(api.state().items[0].messages).toHaveLength(2));
 await screen.findByText('在的，我收到你的消息了。');expect(reply).toHaveBeenCalledOnce();
});
it('领取时网络短暂失败后继续领取，首页不会永久卡在处理中',async()=>{
 const api=server(),original=api.fetcher.getMockImplementation()!;let failures=0;
 api.fetcher.mockImplementation(async(url,init)=>{const body=init?.body?JSON.parse(String(init.body)):null;if(body?.type==='message-claim'&&failures++<2)throw new TypeError('network temporarily unavailable');return original(url,init);});
 render(<StewardWorkspaces {...props} route={async text=>({parts:[{taskId:null,kind:'general',title:'闲聊',text}]})} reply={async()=>({text:'网络恢复后我在。'})}/>);
 await say('你好宁宁');expect(await screen.findByText('网络恢复后我在。',{}, {timeout:2200})).toBeInTheDocument();
 await waitFor(()=>expect(api.state().runs?.at(-1)?.status).toBe('completed'));
});
