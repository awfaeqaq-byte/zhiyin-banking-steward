import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {forwardRef,useImperativeHandle,useState} from 'react';
import {StewardChatHome} from './steward-chat-home';
import type {Workspace} from '../lib/workspaces';
import type {ConversationEntry} from '../lib/message-flow';
vi.mock('./expense-notebook',()=>({ExpenseNotebook:forwardRef(function Notebook(_props,ref){useImperativeHandle(ref,()=>({handle:async()=>null}));return <input aria-label="AA方案编辑" defaultValue="未确认分摊"/>;})}));
vi.mock('./occasion-planner',()=>({OccasionPlanner:()=>{const [value,setValue]=useState('未保存筹备');return <input aria-label="筹备方案编辑" value={value} onChange={e=>setValue(e.target.value)}/>;}}));
vi.mock('./food-order-planner',()=>({FoodOrderPlanner:()=> <input aria-label="点餐方案编辑" defaultValue="待核对点餐"/>}));
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
const task=(kind:Workspace['kind'],id:string=kind):Workspace=>({id,kind,title:`${id}事项`,status:'active',updatedAt:0,messages:[],summary:'',memoryRevision:0});
const props={seamless:true,fullSession:true,stewardName:'宁宁',stewardImage:'/n.png',connections:{},disabledReminders:[],onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn(),onOpenGroupAA:vi.fn()};
const entries=(id:string):ConversationEntry[]=>[{id:'question',role:'user',content:'帮我整理方案'},{id:'answer',role:'assistant',content:'这份方案请核对',workspaceId:id},{id:'later',role:'user',content:'换个话题聊聊吧'},{id:'other-answer',role:'assistant',content:'我们聊旅行',workspaceId:'other'}];
function precedes(a:Element,b:Element){return Boolean(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);}
it.each([['aa','AA方案编辑'],['occasion','筹备方案编辑'],['food','点餐方案编辑']] as const)('%s方案留在对应回复后，新对话排在方案之后',async(kind,label)=>{
 const w=task(kind);render(<StewardChatHome {...props} workspace={w} contextWorkspaces={[w]} conversationMessages={entries(w.id)}/>);
 const input=await screen.findByRole('textbox',{name:label});await screen.findByText('我们聊旅行');
 expect(precedes(screen.getByText('这份方案请核对'),input)).toBe(true);
 expect(precedes(input,screen.getByText('换个话题聊聊吧'))).toBe(true);
});
it.each([['aa','AA方案编辑'],['occasion','筹备方案编辑'],['food','点餐方案编辑']] as const)('%s换话题再回来保留编辑值，更新回复只移动同一份组件',async(kind,label)=>{
 const w=task(kind),other=task('general','other'),conversation=entries(w.id);
 const view=render(<StewardChatHome {...props} workspace={w} contextWorkspaces={[w,other]} conversationMessages={conversation}/>);
 const input=await screen.findByRole('textbox',{name:label});fireEvent.change(input,{target:{value:'已核对但未提交'}});
 view.rerender(<StewardChatHome {...props} workspace={other} contextWorkspaces={[w,other]} conversationMessages={conversation}/>);
 const summary=await screen.findByRole('button',{name:`查看${w.title}方案与进度`});fireEvent.click(summary);
 expect(screen.getByRole('textbox',{name:label})).toBe(input);expect(input).toHaveValue('已核对但未提交');
 const updated:ConversationEntry[]=[...conversation,{id:'new-answer',role:'assistant',content:'这次方案更新了',workspaceId:w.id},{id:'last',role:'user',content:'好的再聊其他'}];
 view.rerender(<StewardChatHome {...props} workspace={w} contextWorkspaces={[w,other]} conversationMessages={updated}/>);
 await screen.findByText('好的再聊其他');
 await waitFor(()=>expect(screen.getByRole('textbox',{name:label})).toBeVisible());
 expect(screen.getAllByRole('textbox',{name:label})).toHaveLength(1);expect(screen.getByRole('textbox',{name:label})).toBe(input);
 expect(precedes(screen.getByText('这次方案更新了'),input)).toBe(true);expect(precedes(input,screen.getByText('好的再聊其他'))).toBe(true);
});

it('首次任务在本条用户消息后等待回复，回复到达只移动原组件，不重新挂载',async()=>{
 const {TaskConversationTimeline}=await import('./task-conversation-timeline');
 const panel={id:'new-task',title:'新事项',active:true,pendingMessageId:'run',node:<input aria-label="新方案" defaultValue="初稿"/>};
 const renderMessage=(m:ConversationEntry)=><p key={m.id}>{m.content}</p>;
 const view=render(<TaskConversationTimeline messages={[] as ConversationEntry[]} panels={[panel]} renderMessage={renderMessage}/>);
 expect(screen.queryByRole('textbox',{name:'新方案'})).not.toBeInTheDocument();
 const messages:ConversationEntry[]=[{id:'user-run',role:'user',content:'准备新事项'},{id:'next-user',role:'user',content:'后续消息'}];
 view.rerender(<TaskConversationTimeline messages={messages} panels={[panel]} renderMessage={renderMessage}/>);
 const input=screen.getByRole('textbox',{name:'新方案'});fireEvent.change(input,{target:{value:'保留的勾选现场'}});
 expect(precedes(input,screen.getByText('后续消息'))).toBe(true);
 view.rerender(<TaskConversationTimeline messages={[...messages,{id:'reply',role:'assistant',content:'新方案好了',workspaceId:'new-task'}]} panels={[panel]} renderMessage={renderMessage}/>);
 expect(screen.getByRole('textbox',{name:'新方案'})).toBe(input);expect(input).toHaveValue('保留的勾选现场');
 expect(precedes(screen.getByText('新方案好了'),input)).toBe(true);
});
it('旧任务可展开收起，已归档方案不可再次执行；没有回复时跟随自己的用户消息',async()=>{
 const {TaskConversationTimeline}=await import('./task-conversation-timeline');
 const panel={id:'archived',title:'旧事项',active:false,disabled:true,node:<button>确认执行</button>};
 render(<TaskConversationTimeline messages={[{id:'own',role:'user' as const,content:'旧交代',workspaceId:'archived'}]} panels={[panel]} renderMessage={m=><p key={m.id}>{m.content}</p>}/>);
 expect(screen.queryByRole('button',{name:'确认执行'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'查看旧事项方案与进度'}));
 expect(screen.getByRole('button',{name:'确认执行'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'收起旧事项方案与进度'}));
 expect(screen.queryByRole('button',{name:'确认执行'})).not.toBeInTheDocument();
});
