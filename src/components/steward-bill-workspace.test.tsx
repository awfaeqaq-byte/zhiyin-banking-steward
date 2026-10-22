import {act,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {InlineBillConsent,StewardBillWorkspace} from './steward-bill-workspace';
import type {ConnectedFinancialSource} from '../lib/financial-connections';

const wechat:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],syncedAt:'2026-09-24',autopays:[],transactions:[
  {id:'lunch',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'},
  {id:'metro',title:'地铁',amount:-500,category:'出行',occurredAt:'2026-09-20'},
]};
const alipay:ConnectedFinancialSource={...wechat,provider:'alipay',displayName:'支付宝',transactions:[{id:'tea',title:'奶茶',amount:-1000,category:'餐饮',occurredAt:'2026-09-21'}]};

it('BI2-045 分类打开明细后查看全部记录，明细仍显示且恢复其他分类',async()=>{
 const user=userEvent.setup();
 render(<StewardBillWorkspace question="2026年9月账单" connections={{wechat_pay:wechat}} onInteract={vi.fn()} ui={{sections:['overview','categories'],evidenceRefs:[]}}/>);
 expect(screen.queryByRole('button',{name:/请宁宁解释午餐/})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:/查看餐饮交易/}));
 expect(screen.getByRole('button',{name:/请宁宁解释午餐/})).toBeVisible();
 expect(screen.queryByRole('button',{name:/请宁宁解释地铁/})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'查看全部记录'}));
 expect(screen.getByRole('button',{name:/请宁宁解释午餐/})).toBeVisible();
 expect(screen.getByRole('button',{name:/请宁宁解释地铁/})).toBeVisible();
});

it('账单授权就地选择平台，默认仅交易账单，点击前不连接',async()=>{
 const connect=vi.fn(async()=>wechat),complete=vi.fn(),user=userEvent.setup();
 render(<InlineBillConsent provider="wechat_pay" connections={{}} onConnect={connect} onComplete={complete}/>);
 expect(screen.getByRole('region',{name:'账单读取范围'})).toHaveTextContent('不包含付款');
 expect(connect).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(connect).toHaveBeenCalledWith('wechat_pay',['transactions']);
 expect(complete).toHaveBeenCalledWith({wechat_pay:wechat},['wechat_pay']);
});
it('平台拒绝时保留范围和重试，部分授权成功不重复请求已成功的平台',async()=>{
 const user=userEvent.setup(),complete=vi.fn();let denied=true;
 const connect=vi.fn(async(provider:string)=>{if(provider==='alipay'&&denied)throw new Error('支付宝未同意');return provider==='alipay'?alipay:wechat;});
 render(<InlineBillConsent connections={{}} onConnect={connect} onComplete={complete}/>);
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('支付宝未同意');
 expect(complete).not.toHaveBeenCalled();
 denied=false;await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(connect.mock.calls.filter(([p])=>p==='wechat_pay')).toHaveLength(1);
 expect(complete).toHaveBeenCalledWith({wechat_pay:wechat,alipay},['wechat_pay','alipay']);
});
it('新增账单权限不暗中撤回已有余额或扣费权限',async()=>{
 const user=userEvent.setup(),connect=vi.fn(async()=>wechat);
 render(<InlineBillConsent provider="wechat_pay" connections={{wechat_pay:{...wechat,scopes:['balance','autopay']}}} onConnect={connect} onComplete={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(connect).toHaveBeenCalledWith('wechat_pay',['balance','autopay','transactions']);
});
it('已授权来源不重复申请，缺少选择时禁止继续',async()=>{
 const user=userEvent.setup(),connect=vi.fn(),complete=vi.fn();
 render(<InlineBillConsent provider="wechat_pay" connections={{wechat_pay:wechat}} onConnect={connect} onComplete={complete}/>);
 await user.click(screen.getByRole('button',{name:'继续分析账单'}));
 expect(connect).not.toHaveBeenCalled();expect(complete).toHaveBeenCalled();
});
it('平台和分类仅切换展示，明确请宁宁解释时才发起问答',async()=>{
 const user=userEvent.setup(),change=vi.fn(),viewChange=vi.fn();
 render(<StewardBillWorkspace question="本月支出" connections={{wechat_pay:wechat,alipay}} onInteract={change} onViewChange={viewChange}/>);
 const scene=screen.getByRole('region',{name:'账单工作区'});
 expect(within(scene).getByText('¥40')).toBeVisible();
 await user.click(within(scene).getByRole('button',{name:'只看微信支付'}));
 expect(within(scene).getByText('¥30')).toBeVisible();
 expect(change).not.toHaveBeenCalled();
 expect(viewChange).toHaveBeenLastCalledWith(expect.objectContaining({provider:'wechat_pay',question:expect.stringContaining('本月支出')}));
 await user.click(within(scene).getByRole('button',{name:/查看餐饮交易/}));
 expect(within(scene).getByRole('button',{name:/请宁宁解释午餐/})).toBeVisible();
 expect(change).not.toHaveBeenCalled();
 expect(viewChange).toHaveBeenLastCalledWith(expect.objectContaining({category:'餐饮'}));
 await user.click(within(scene).getByRole('button',{name:'请宁宁分析当前账单'}));
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({provider:'wechat_pay',category:'餐饮'}));
 await user.click(within(scene).getByRole('button',{name:/请宁宁解释午餐/}));
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({focus:{provider:'wechat_pay',id:'lunch'}}));
 expect(screen.getAllByRole('region',{name:'账单工作区'})).toHaveLength(1);
});
it('模型按需求选择展示模块，空记录不冒充零支出，授权撤销不显示旧金额',()=>{
 const props={question:'本月支出',connections:{wechat_pay:wechat},onInteract:vi.fn()};
 const view=render(<StewardBillWorkspace {...props} ui={{sections:['transactions'],evidenceRefs:[]}}/>);
 expect(screen.getByRole('button',{name:/请宁宁解释午餐/})).toBeVisible();
 expect(screen.queryByRole('heading',{name:'消费分布'})).not.toBeInTheDocument();
 view.rerender(<StewardBillWorkspace {...props} connections={{wechat_pay:{...wechat,transactions:[]}}}/>);
 expect(screen.getByText(/未返回交易记录/)).toBeVisible();expect(screen.queryByText('¥0')).not.toBeInTheDocument();
 view.rerender(<StewardBillWorkspace {...props} connections={{wechat_pay:{...wechat,scopes:[]}}}/>);
 expect(screen.queryByText('¥30')).not.toBeInTheDocument();expect(screen.getByText(/需要账单读取授权/)).toBeVisible();
});
it('同步失败明确标为待核对并禁用向模型发送旧交易',()=>{
 render(<StewardBillWorkspace question="本月支出" connections={{wechat_pay:wechat}} error="平台暂时不可用" onInteract={vi.fn()}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('平台暂时不可用');
 expect(screen.getByRole('button',{name:'只看微信支付'})).toBeDisabled();
 expect(screen.queryByText('¥30')).not.toBeInTheDocument();
});
it('等待平台授权期间如果界面已撤回，迟到的结果不会自动继续旧问题',async()=>{
 let resolve!:(source:ConnectedFinancialSource)=>void;
 const complete=vi.fn(),user=userEvent.setup();
 const view=render(<InlineBillConsent provider="wechat_pay" connections={{}} onConnect={()=>new Promise(done=>{resolve=done;})} onComplete={complete}/>);
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));view.unmount();
 await act(async()=>{resolve(wechat);});
 expect(complete).not.toHaveBeenCalled();
});
it('无选择不能授权，恢复选择后处理错误回执而不是宣称成功',async()=>{
 const user=userEvent.setup(),complete=vi.fn(),connect=vi.fn(async()=>({...wechat,scopes:[] as ConnectedFinancialSource['scopes']}));
 render(<InlineBillConsent provider="wechat_pay" connections={{}} onConnect={connect} onComplete={complete}/>);
 await user.click(screen.getByRole('checkbox',{name:'微信支付'}));
 expect(screen.getByRole('button',{name:'继续到平台确认'})).toBeDisabled();
 await user.click(screen.getByRole('checkbox',{name:'微信支付'}));await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('平台未返回');expect(complete).not.toHaveBeenCalled();
});
it('分类收起、长列表展开、交易证据和不足的趋势均可操作',async()=>{
 const user=userEvent.setup(),change=vi.fn(),connect=vi.fn();
 const many={...wechat,transactions:[...wechat.transactions,...Array.from({length:5},(_,i)=>({id:`s${i}`,title:'便利店',amount:-1000,category:'购物',occurredAt:'2026-09-20'}))]};
 const props={question:'本月支出',connections:{wechat_pay:many},onInteract:change,onRequestConnection:connect,ui:{sections:['trend','transactions'] as const,evidenceRefs:[1]}};
 render(<StewardBillWorkspace {...props} ui={{...props.ui,sections:[...props.ui.sections]}}/>);
 expect(screen.getByText('前期记录不足，暂不能判断趋势。')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'展开更多 · 7 笔'}));
 expect(screen.getAllByRole('button',{name:/请宁宁解释便利店/})).toHaveLength(5);
 await user.click(screen.getByRole('button',{name:'收起明细'}));
 await user.click(screen.getByRole('button',{name:'加入支付宝账单'}));expect(connect).toHaveBeenCalledWith('alipay');
 expect(screen.getByText('核对交易依据')).toBeVisible();
});
