import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {WealthConversation,WealthConversationProvider,useWealthConversation} from './wealth-conversation';
import {assessRisk,type WealthSnapshot} from '../lib/wealth-operation';
const snapshot:WealthSnapshot={version:1,receipts:[],assessment:assessRisk({experience:0,loss:0,term:0,liquidity:0,income:0})};
afterEach(cleanup);
function State(){const {plan}=useWealthConversation();return <output aria-label="计划状态">{JSON.stringify(plan)}</output>;}
it('focus只预填，不自动发送，发送后清空输入并同步显式计划',async()=>{
 const user=userEvent.setup(),model=vi.fn().mockResolvedValue(JSON.stringify({text:'先核对资料。',candidates:[{id:'medical',reason:'医疗主题'}]})),handled=vi.fn();
 render(<WealthConversationProvider><State/><WealthConversation model={model} snapshot={snapshot} onOpenRisk={()=>{}} focusProductId="medical" onFocusHandled={handled}/></WealthConversationProvider>);
 expect(screen.getByRole('textbox',{name:'和宁宁聊财富计划'})).toHaveValue('请帮我分析招商前沿医疗保健股票A');expect(model).not.toHaveBeenCalled();expect(handled).toHaveBeenCalledTimes(1);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'投入5000元，持有半年，关注医疗主题');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
 await screen.findByText('先核对资料。');expect(screen.getByRole('textbox')).toHaveValue('');expect(screen.getByLabelText('计划状态')).toHaveTextContent('"amountYuan":5000,"termMonths":6');
 expect(screen.getByText('风险、费用与交易状态待核验')).toBeInTheDocument();
});
it('同一Provider跨页面保留草稿、计划和后台返回，双击只发一次',async()=>{
 let resolve!:(value:string)=>void;
 const model=vi.fn(()=>new Promise<string>(r=>{resolve=r;}));
 const View=({show}:{show:boolean})=><WealthConversationProvider>{show&&<WealthConversation model={model} snapshot={snapshot} onOpenRisk={()=>{}}/>}<State/></WealthConversationProvider>;
 const view=render(<View show/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'投入1000元，持有3个月'}});fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 expect(model).toHaveBeenCalledTimes(1);view.rerender(<View show={false}/>);
 resolve(JSON.stringify({text:'流动性是当前重点。',candidates:[{id:'cash-plus',reason:'可随时赎回'}]}));
 await waitFor(()=>expect(screen.getByLabelText('计划状态')).toHaveTextContent('1000'));
 view.rerender(<View show/>);expect(await screen.findByText('流动性是当前重点。')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'还想问一下'}});view.rerender(<View show={false}/>);view.rerender(<View show/>);expect(screen.getByRole('textbox')).toHaveValue('还想问一下');
});
it('失败保留本轮内容，可重试且不重复添加用户消息',async()=>{
 const model=vi.fn().mockRejectedValueOnce(new Error('连接失败')).mockResolvedValueOnce(JSON.stringify({text:'已收到。',candidates:[]}));
 render(<WealthConversation model={model} snapshot={snapshot} onOpenRisk={()=>{}}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'投入1000元'}});fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('连接失败');fireEvent.click(screen.getByRole('button',{name:'重试这条消息'}));
 await screen.findByText('已收到。');expect(screen.getAllByText('投入1000元')).toHaveLength(1);expect(model).toHaveBeenCalledTimes(2);
});

it('从产品目录带回分析时保留尚未发送的文字',()=>{
 const View=({focus}:{focus?:string})=><WealthConversationProvider><WealthConversation snapshot={snapshot} onOpenRisk={()=>{}} focusProductId={focus}/></WealthConversationProvider>;
 const view=render(<View/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'先不要调整我的金额'}});view.rerender(<View focus="medical"/>);
 expect(screen.getByRole('textbox')).toHaveValue('先不要调整我的金额\n请帮我分析招商前沿医疗保健股票A');
});
it('计划修改后不展示旧候选，即使旧请求刚刚返回',async()=>{
 let resolve!:(value:string)=>void;const model=vi.fn(()=>new Promise<string>(r=>{resolve=r;}));
 function Change(){const {setPlan}=useWealthConversation();return <button onClick={()=>setPlan({amountYuan:5000})}>改计划</button>;}
 render(<WealthConversationProvider><Change/><WealthConversation model={model} snapshot={snapshot} onOpenRisk={()=>{}} onViewProduct={()=>{}}/></WealthConversationProvider>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'投入1000元，持有3个月'}});fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 fireEvent.click(screen.getByRole('button',{name:'改计划'}));resolve(JSON.stringify({text:'这份计划可以先核对现金管理。',candidates:[{id:'cash-plus',reason:'流动性'}]}));
 expect(await screen.findByText('计划已更新，可重新分析')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'查看产品'})).not.toBeInTheDocument();
});

it('紧凑入口按需展开，收起与跨页返回仍保留未发送草稿',async()=>{
 const user=userEvent.setup();
 const View=({show}:{show:boolean})=><WealthConversationProvider>{show&&<WealthConversation compact snapshot={snapshot} onOpenRisk={()=>{}}/>}</WealthConversationProvider>;
 const view=render(<View show/>);
 expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'展开和宁宁的财富对话'}));
 const input=screen.getByRole('textbox',{name:'和宁宁聊财富计划'});
 expect(input).toHaveFocus();
 await user.type(input,'年底之前都不用这笔钱');
 await user.click(screen.getByRole('button',{name:'收起和宁宁的财富对话'}));
 expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
 expect(screen.getByText('草稿已保留')).toBeInTheDocument();
 view.rerender(<View show={false}/>);view.rerender(<View show/>);
 expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'展开和宁宁的财富对话'}));
 expect(screen.getByRole('textbox')).toHaveValue('年底之前都不用这笔钱');
});

it('收起时返回的答复保留在原对话，产品分析会展开并追加草稿',async()=>{
 const user=userEvent.setup();let resolve!:(value:string)=>void;
 const model=vi.fn(()=>new Promise<string>(r=>{resolve=r;}));
 const View=({focus}:{focus?:string})=><WealthConversationProvider><WealthConversation compact model={model} snapshot={snapshot} onOpenRisk={()=>{}} focusProductId={focus}/></WealthConversationProvider>;
 const view=render(<View/>);
 await user.click(screen.getByRole('button',{name:'展开和宁宁的财富对话'}));
 await user.type(screen.getByRole('textbox'),'投入1000元，持有3个月');
 await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
 await user.type(screen.getByRole('textbox'),'先不要调整我的金额');
 await user.click(screen.getByRole('button',{name:'收起和宁宁的财富对话'}));
 resolve(JSON.stringify({text:'先关注这笔钱的流动性。',candidates:[]}));
 await waitFor(()=>expect(screen.getByText('先关注这笔钱的流动性。')).toBeInTheDocument());
 view.rerender(<View focus="medical"/>);
 expect(screen.getByRole('textbox')).toHaveValue('先不要调整我的金额\n请帮我分析招商前沿医疗保健股票A');
 expect(screen.getByRole('log')).toHaveTextContent('投入1000元，持有3个月');
 expect(screen.getByRole('log')).toHaveTextContent('先关注这笔钱的流动性。');
 expect(model).toHaveBeenCalledTimes(1);
});
