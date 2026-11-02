import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {TransferPlanCard,SubscriptionReviewCard,SceneProgressCard} from '../../src/components/chat-task-cards';
import type {SceneFlow} from '../../src/lib/scene-flow';
import type {StewardSubscription} from '../../src/lib/steward-chat';

const item:StewardSubscription={key:'alipay:video',provider:'alipay',id:'video',title:'视频会员',providerName:'支付宝',amount:2500,cycle:'月',daysUntilCharge:2,reminderEnabled:true};
const flow:SceneFlow={id:'birthday',title:'王芳生日筹备',workspaceIds:['calendar','cake'],links:[],records:[{kind:'calendar',id:'date',workspaceId:'calendar',status:'saved',label:'7月15日生日'},{kind:'food_order',id:'order',workspaceId:'cake',status:'ACCEPTED',label:'生日蛋糕'}],stage:'waiting_external',summary:'蛋糕订单已接单，等待配送。',orders:[],checkedAt:Date.parse('2026-10-13'),fingerprint:'test',next:{kind:'food',id:'order',workspaceId:'cake',channel:'occasion'}};

it('用户保留金额被分流遗漏或不一致时，方案等待补全且不能进入核对',()=>{
 const open=vi.fn(),intent={recipientId:'mom' as const,amount:200000};
 const view=render(<TransferPlanCard intent={intent} sourceText="给妈妈转2000元，保留5000元" onReview={open}/>);
 expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('约束待核对');
 expect(screen.getByRole('button',{name:'核对银行转账'})).toBeDisabled();
 view.rerender(<TransferPlanCard intent={{...intent,protectedAmount:100000}} sourceText="给妈妈转2000元，保留5000元" onReview={open}/>);
 expect(screen.getByRole('button',{name:'核对银行转账'})).toBeDisabled();
 view.rerender(<TransferPlanCard intent={{...intent,protectedAmount:500000}} sourceText="给妈妈转2000元，保留5000元" onReview={open}/>);
 expect(screen.getByRole('button',{name:'核对银行转账'})).toBeEnabled();
});

it('转账组件把待核对方案与余额测算固定展示，点击只打开已有核对流程',async()=>{
 const open=vi.fn();
 render(<TransferPlanCard intent={{recipientId:'mom',amount:200000,protectedAmount:500000}} quote={{balance:4230000,limit:2000000,frozen:false,capturedAt:Date.parse('2026-10-13'),impact:{pendingTotal:100000,protectedAmount:500000,available:2000000,remaining:3430000}}} onReview={open}/>);
 const card=screen.getByRole('region',{name:'转账方案'});
 expect(card).toHaveTextContent('妈妈');expect(card).toHaveTextContent('¥2,000');expect(card).toHaveTextContent('¥34,300');expect(card).toHaveTextContent('尚未转账');
 expect(open).not.toHaveBeenCalled();await userEvent.click(within(card).getByRole('button',{name:'核对银行转账'}));
 expect(open).toHaveBeenCalledWith(expect.objectContaining({recipientId:'mom',amount:200000}));
});
it('卡片冻结、额度不足与未读取余额都不能冒充已可付款',()=>{
 const quote={balance:10000,limit:10000,frozen:true,capturedAt:1,impact:{pendingTotal:0,protectedAmount:0,available:0,remaining:-190000}};
 const view=render(<TransferPlanCard intent={{recipientId:'dad',amount:200000,executeAt:Date.parse('2026-10-14T16:00:00+08:00')}} quote={quote} onReview={vi.fn()}/>);
 expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('已挂失');expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('卡片不可用');expect(screen.getByRole('button',{name:'核对预约转账'})).toBeDisabled();
 view.rerender(<TransferPlanCard intent={{recipientId:'dad',amount:200000}} quote={{...quote,frozen:false}} onReview={vi.fn()}/>);
 expect(screen.getByText(/可安排金额不足/)).toBeVisible();expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('金额待调整');
 view.rerender(<TransferPlanCard intent={{recipientId:'dad',amount:200000}} onReview={vi.fn()}/>);
 expect(screen.getByText(/尚未读取/)).toBeVisible();expect(screen.queryByText('¥100')).not.toBeInTheDocument();
});
it('订阅组件只汇总同周期签约，取消只进入核对，提醒使用已有开关',async()=>{
 const cancel=vi.fn(),reminder=vi.fn(),open=vi.fn();
 render(<SubscriptionReviewCard items={[item,{...item,key:'wechat_pay:annual',id:'annual',provider:'wechat_pay',providerName:'微信支付',title:'年度会员',amount:9900,cycle:'年',daysUntilCharge:null}]} onReviewCancel={cancel} onToggleReminder={reminder} onOpen={open}/>);
 const card=screen.getByRole('region',{name:'订阅安排'});
 expect(card).toHaveTextContent('按月签约');expect(card).toHaveTextContent('¥25');expect(card).not.toHaveTextContent('¥124');
 expect(card).toHaveTextContent('扣费时间待核对');expect(cancel).not.toHaveBeenCalled();
 expect(within(card).queryByRole('switch')).not.toBeInTheDocument();
 const manage=within(card).getByRole('button',{name:/视频会员.*管理订阅/});
 expect(manage).toHaveAttribute('aria-expanded','false');
 await userEvent.click(manage);expect(manage).toHaveAttribute('aria-expanded','true');
 expect(within(card).queryByRole('button',{name:'核对并取消年度会员'})).not.toBeInTheDocument();
 await userEvent.click(within(card).getByRole('button',{name:'核对并取消视频会员'}));expect(cancel).toHaveBeenCalledWith('alipay','video');
 const toggle=within(card).getByRole('switch',{name:'视频会员续费提醒'});
 expect(toggle).toBeChecked();
 await userEvent.click(toggle);expect(reminder).toHaveBeenCalledWith('alipay:video',false);
 await userEvent.click(manage);expect(manage).toHaveAttribute('aria-expanded','false');
 expect(within(card).queryByRole('switch')).not.toBeInTheDocument();
 await userEvent.click(within(card).getByRole('button',{name:'查看自动续费清单'}));expect(open).toHaveBeenCalledOnce();
});
it('订阅提醒明确呈现开关状态，键盘可开启且禁用时不修改偏好',async()=>{
 const reminder=vi.fn(),props={onReviewCancel:vi.fn(),onToggleReminder:reminder,onOpen:vi.fn()};
 const view=render(<SubscriptionReviewCard {...props} items={[{...item,reminderEnabled:false}]}/>);
 const manage=screen.getByRole('button',{name:/视频会员.*管理订阅/});
 manage.focus();await userEvent.keyboard('{Enter}');
 const toggle=screen.getByRole('switch',{name:'视频会员续费提醒'});
 expect(toggle).not.toBeChecked();expect(screen.getByText('已关闭')).toBeVisible();
 toggle.focus();await userEvent.keyboard(' ');
 expect(reminder).toHaveBeenCalledWith(item.key,true);
 view.rerender(<SubscriptionReviewCard {...props} items={[item]} disabled/>);
 expect(toggle).toBeChecked();expect(toggle).toBeDisabled();
 await userEvent.click(toggle);expect(reminder).toHaveBeenCalledOnce();
 expect(props.onReviewCancel).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'核对并取消视频会员'})).toBeDisabled();
});
it('同步失败隐藏旧订阅金额与取消入口，空签约不冒充全部无订阅',()=>{
 const view=render(<SubscriptionReviewCard items={[item]} error="平台暂不可用" onReviewCancel={vi.fn()} onToggleReminder={vi.fn()} onOpen={vi.fn()}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('平台暂不可用');expect(screen.queryByText('¥25')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'核对并取消视频会员'})).not.toBeInTheDocument();
 view.rerender(<SubscriptionReviewCard items={[]} onReviewCancel={vi.fn()} onToggleReminder={vi.fn()} onOpen={vi.fn()}/>);
 expect(screen.getByText(/未返回签约记录/)).toBeVisible();
});
it('跨场景组件显示真实记录和等待平台结果，入口仅恢复原事项',async()=>{
 const resume=vi.fn();render(<SceneProgressCard scene={flow} onResume={resume}/>);
 const card=screen.getByRole('region',{name:'跨场景进度'});
 expect(card).toHaveTextContent('等待平台结果');expect(card).toHaveTextContent('商家已接单');expect(card).toHaveTextContent('已记录');expect(card).not.toHaveTextContent('已送达');
 const records=within(card).getByText('关联记录').closest('summary')!;
 expect(records).toHaveAttribute('aria-expanded','false');
 expect(within(card).getByText('生日蛋糕')).not.toBeVisible();
 await userEvent.click(records);await waitFor(()=>expect(records).toHaveAttribute('aria-expanded','true'));
 expect(within(card).getByText('生日蛋糕')).toBeVisible();
 expect(resume).not.toHaveBeenCalled();await userEvent.click(within(card).getByRole('button',{name:'查看原订单'}));expect(resume).toHaveBeenCalledWith(flow.next);
});
it('未知平台状态和恢复失败如实展示，不自动付款或假装完成',async()=>{
 const view=render(<SceneProgressCard scene={{...flow,stage:'failed',error:'订单状态尚未核对',records:[{...flow.records[1],status:'UNKNOWN'}]}} onResume={async()=>{throw new Error('平台暂不可用');}}/>);
 await userEvent.click(screen.getByText('关联记录').closest('summary')!);
 expect(screen.getByText('状态待核对')).toBeVisible();expect(screen.getByText('订单状态尚未核对')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'查看原订单'}));await waitFor(()=>expect(screen.getAllByRole('alert').some(alert=>alert.textContent==='平台暂不可用')).toBe(true));
 view.rerender(<SceneProgressCard scene={{...flow,stage:'completed',next:undefined}}/>);
 expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('已付费用就地显示整理入口，点击只续接同一事项的费用草案',async()=>{
 const resume=vi.fn(),scene={...flow,summary:'王芳生日筹备：蛋糕订单已接单。；有1笔实付可整理，退款后净额合计¥206.00。核对后再决定是否记账或分摊。',expenses:{pendingCount:1,netAmount:20600,sourceIds:['payment']}};
 render(<SceneProgressCard scene={scene} onResume={resume}/>);
 expect(screen.getByText('1 笔实付可整理')).toBeVisible();expect(screen.getByText('¥206')).toBeVisible();
 expect(screen.getByText('尚未记入账本 · 退款后净额')).toBeVisible();
 expect(screen.queryByText(/退款后净额合计/)).not.toBeInTheDocument();
 const prepare=screen.getByRole('button',{name:'整理本次费用'}),records=screen.getByText('关联记录');
 expect(prepare.compareDocumentPosition(records)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 await userEvent.click(prepare);
 expect(resume).toHaveBeenCalledWith({kind:'expense',id:'birthday',workspaceId:'calendar',action:'prepare_expenses'});
});
it('场景结果失效时隐藏费用金额，保留禁用与恢复原事项入口，零项不显示费用占位',async()=>{
 const resume=vi.fn(),scene={...flow,error:'退款结果需要重新核对',expenses:{pendingCount:1,netAmount:20600,sourceIds:['payment']}};
 const view=render(<SceneProgressCard scene={scene} onResume={resume}/>);
 expect(screen.getByRole('alert')).toHaveTextContent(scene.error);
 expect(screen.queryByText('¥206')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'整理本次费用'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'整理本次费用'}));expect(resume).not.toHaveBeenCalled();
 await userEvent.click(screen.getByRole('button',{name:'查看原订单'}));expect(resume).toHaveBeenCalledWith(flow.next);
 view.rerender(<SceneProgressCard scene={{...flow,expenses:{pendingCount:0,netAmount:0,sourceIds:[]}}} onResume={resume} disabled/>);
 expect(screen.queryByText(/笔实付可整理/)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'查看原订单'})).toBeDisabled();
});
it('关联记录按需展开后可查看全部记录，收起不改变业务状态',async()=>{
 const resume=vi.fn(),records=Array.from({length:6},(_,i)=>({...flow.records[1],id:`order-${i}`,label:`订单 ${i+1}`}));
 render(<SceneProgressCard scene={{...flow,records}} onResume={resume}/>);
 const toggle=screen.getByText('关联记录').closest('summary')!;
 expect(toggle).toHaveTextContent('6 条');expect(screen.getByText('订单 6')).not.toBeVisible();
 await userEvent.click(toggle);expect(screen.getByText('订单 6')).toBeVisible();
 await userEvent.click(toggle);expect(screen.getByText('订单 6')).not.toBeVisible();expect(resume).not.toHaveBeenCalled();
});
