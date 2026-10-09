import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {InlineBillConsent,StewardBillWorkspace} from './steward-bill-workspace';
import type {ConnectedFinancialSource} from '../lib/financial-connections';

const wechat:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],syncedAt:'2026-09-24',autopays:[],transactions:[
  {id:'lunch',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'},
  {id:'metro',title:'地铁',amount:-500,category:'出行',occurredAt:'2026-09-20'},
]};
const alipay:ConnectedFinancialSource={...wechat,provider:'alipay',displayName:'支付宝',transactions:[{id:'tea',title:'奶茶',amount:-1000,category:'餐饮',occurredAt:'2026-09-21'}]};

it('账单授权就地选择平台，默认仅交易账单，点击前不连接',async()=>{
 const connect=vi.fn(async()=>wechat),complete=vi.fn(),user=userEvent.setup();
 render(<InlineBillConsent provider="wechat_pay" connections={{}} onConnect={connect} onComplete={complete}/>);
 expect(screen.getByRole('region',{name:'账单读取范围'})).toHaveTextContent('不包含付款');
 expect(connect).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'继续到平台确认'}));
 expect(connect).toHaveBeenCalledWith('wechat_pay',['transactions']);
 expect(complete).toHaveBeenCalledWith({wechat_pay:wechat});
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
 expect(complete).toHaveBeenCalledWith({wechat_pay:wechat,alipay});
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
it('平台切换和分类展开就在同一账单现场，点选真实交易回传给宁宁',async()=>{
 const user=userEvent.setup(),change=vi.fn();
 render(<StewardBillWorkspace question="本月支出" connections={{wechat_pay:wechat,alipay}} onInteract={change}/>);
 const scene=screen.getByRole('region',{name:'账单工作区'});
 expect(within(scene).getByText('¥40')).toBeVisible();
 await user.click(within(scene).getByRole('button',{name:'只看微信支付'}));
 expect(within(scene).getByText('¥30')).toBeVisible();
 expect(change).toHaveBeenLastCalledWith(expect.objectContaining({provider:'wechat_pay',question:expect.stringContaining('本月支出')}));
 await user.click(within(scene).getByRole('button',{name:/查看餐饮交易/}));
 expect(within(scene).getByRole('button',{name:/请宁宁解释午餐/})).toBeVisible();
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
