import {act, render, screen, waitFor, within} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import type {ComponentProps} from 'react';
import {StewardWorkspaces} from '../../src/components/steward-workspaces';
import {emptyWorkspaces, type WorkspaceState} from '../../src/lib/workspaces';
import type {StewardChatHome} from '../../src/components/steward-chat-home';

const mocks=vi.hoisted(()=>({request:vi.fn(),chat:vi.fn()}));
vi.mock('../../src/lib/workspace-service',()=>({workspaceRequest:mocks.request,routeWorkspacePrompt:vi.fn()}));
vi.mock('../../src/lib/use-scene-continuation',()=>({useSceneContinuation:vi.fn()}));
vi.mock('../../src/components/steward-chat-home',()=>({
  readConversationSnapshot:()=>[],
  StewardChatHome:(props:ComponentProps<typeof StewardChatHome>)=>{
    mocks.chat(props);
    return <div>{props.conversationMessages?.map(message=><p key={message.id} data-workspace-id={message.workspaceId}>{message.content}</p>)}<input id="steward-chat-input" aria-label="对话输入"/><output aria-label="当前事项">{props.workspace?.id}</output></div>;
  },
}));
const route=vi.fn(async()=>({parts:[]}));
const props={stewardName:'宁宁',stewardImage:'/n.png',connections:{},disabledReminders:[],onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn(),route};
function state(status:'active'|'archived'='active',inTimeline=true):WorkspaceState {
  return {...emptyWorkspaces(),revision:2,items:[{id:'aa-task',kind:'aa',title:'周末聚餐',status,expenseBookId:'aa-book',updatedAt:2,memoryRevision:0,summary:'',messages:[{id:'origin',role:'user',content:'夜宵220，女生半份',memoryRevision:0},{id:'answer',role:'assistant',content:'你88元，小王88元，李娜44元',memoryRevision:0}]}],conversation:inTimeline?[{id:'aa-reply',workspaceId:'aa-task',role:'assistant',content:'你88元，小王88元，李娜44元'}]:[]};
}
beforeEach(()=>{vi.clearAllMocks();});

it('从历史账本重新核对并定位进行中的原对话，不发送消息或写入业务状态',async()=>{
  const initial={...emptyWorkspaces(),conversation:[]},latest=state(),consumed=vi.fn();
  mocks.request.mockResolvedValueOnce(initial).mockResolvedValue(latest);
  render(<StewardWorkspaces {...props} conversationRequest={{id:'aa-task',token:'open-1'}} onConversationRequestConsumed={consumed}/>);
  await waitFor(()=>expect(consumed).toHaveBeenCalledOnce());
  const original=await screen.findByText('你88元，小王88元，李娜44元');
  await waitFor(()=>expect(original).toHaveFocus());
  expect(screen.getByLabelText('当前事项')).toHaveTextContent('aa-task');
  expect(screen.queryByRole('region',{name:'当前会话记录'})).not.toBeInTheDocument();
  expect(mocks.request.mock.calls.every(args=>args.length===0)).toBe(true);
  expect(route).not.toHaveBeenCalled();
  expect(mocks.chat.mock.calls.at(-1)?.[0]).not.toHaveProperty('conversationRequest');
});

it('按最新归档状态打开只读原对话，不隐式恢复或执行收款',async()=>{
  mocks.request.mockResolvedValueOnce(state()).mockResolvedValue({...state('archived'),revision:3});
  const consumed=vi.fn();
  render(<StewardWorkspaces {...props} conversationRequest={{id:'aa-task',token:'open-archived'}} onConversationRequestConsumed={consumed}/>);
  const record=await screen.findByRole('region',{name:'当前会话记录'});
  expect(within(record).getByText('已归档 · 只读记录')).toBeInTheDocument();
  expect(within(record).getByText('夜宵220，女生半份')).toBeInTheDocument();
  await waitFor(()=>expect(record).toHaveFocus());
  expect(mocks.request.mock.calls.every(args=>args.length===0)).toBe(true);
  expect(consumed).toHaveBeenCalledOnce();
});

it('原对话已删除时显示准确说明，不选中其他事项',async()=>{
  mocks.request.mockResolvedValue({...emptyWorkspaces(),conversation:[]});
  const consumed=vi.fn();
  render(<StewardWorkspaces {...props} conversationRequest={{id:'deleted',token:'open-deleted'}} onConversationRequestConsumed={consumed}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('原对话已不存在，AA账本仍可在历史账本中查看');
  expect(screen.getByLabelText('当前事项')).toBeEmptyDOMElement();
  expect(consumed).toHaveBeenCalledOnce();
});

it('原消息已离开首页时间线时显示保留的原对话，不跳到空输入框',async()=>{
  mocks.request.mockResolvedValue(state('active',false));
  render(<StewardWorkspaces {...props} conversationRequest={{id:'aa-task',token:'open-older'}}/>);
  const record=await screen.findByRole('region',{name:'当前会话记录'});
  expect(within(record).getByText('原对话 · 只读记录')).toBeInTheDocument();
  expect(within(record).getByText('夜宵220，女生半份')).toBeInTheDocument();
  expect(within(record).queryByText('已归档 · 只读记录')).not.toBeInTheDocument();
  expect(screen.getByLabelText('当前事项')).toHaveTextContent('aa-task');
});

it('连续打开不同账本时忽略较早请求的迟到结果',async()=>{
  mocks.request.mockResolvedValue(state());
  const consumed=vi.fn(),view=render(<StewardWorkspaces {...props} onConversationRequestConsumed={consumed}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'＋ 新对话'})).toBeEnabled());
  let resolveFirst!:(value:WorkspaceState)=>void;
  mocks.request.mockImplementationOnce(()=>new Promise<WorkspaceState>(resolve=>{resolveFirst=resolve;}));
  view.rerender(<StewardWorkspaces {...props} conversationRequest={{id:'aa-task',token:'first'}} onConversationRequestConsumed={consumed}/>);
  await waitFor(()=>expect(resolveFirst).toBeTypeOf('function'));
  const second={...state(),revision:3,items:[{...state().items[0],id:'second',title:'第二次聚餐'}],conversation:[{id:'second-reply',workspaceId:'second',role:'assistant' as const,content:'第二次聚餐的分摊'}]};
  mocks.request.mockResolvedValueOnce(second);
  view.rerender(<StewardWorkspaces {...props} conversationRequest={{id:'second',token:'second'}} onConversationRequestConsumed={consumed}/>);
  await waitFor(()=>expect(screen.getByLabelText('当前事项')).toHaveTextContent('second'));
  await act(async()=>{resolveFirst({...state('archived'),revision:4});});
  expect(screen.getByLabelText('当前事项')).toHaveTextContent('second');
  expect(screen.queryByRole('region',{name:'当前会话记录'})).not.toBeInTheDocument();
  expect(consumed).toHaveBeenCalledOnce();
});
