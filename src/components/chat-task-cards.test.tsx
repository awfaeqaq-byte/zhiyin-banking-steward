import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {TransferPlanCard,SubscriptionReviewCard,SceneProgressCard} from './chat-task-cards';
import type {SceneFlow} from '../lib/scene-flow';
import type {StewardSubscription} from '../lib/steward-chat';

const item:StewardSubscription={key:'alipay:video',provider:'alipay',id:'video',title:'视频会员',providerName:'支付宝',amount:2500,cycle:'月',daysUntilCharge:2,reminderEnabled:true};
const flow:SceneFlow={id:'birthday',title:'王芳生日筹备',workspaceIds:['calendar','cake'],links:[],records:[{kind:'calendar',id:'date',workspaceId:'calendar',status:'saved',label:'7月15日生日'},{kind:'food_order',id:'order',workspaceId:'cake',status:'ACCEPTED',label:'生日蛋糕'}],stage:'waiting_external',summary:'蛋糕订单已接单，等待配送。',orders:[],checkedAt:Date.parse('2026-10-13'),fingerprint:'test',next:{kind:'food',id:'order',workspaceId:'cake',channel:'occasion'}};

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
 expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('已挂失');expect(screen.getByRole('button',{name:'核对预约转账'})).toBeDisabled();
 view.rerender(<TransferPlanCard intent={{recipientId:'dad',amount:200000}} quote={{...quote,frozen:false}} onReview={vi.fn()}/>);
 expect(screen.getByText(/可安排金额不足/)).toBeVisible();
 view.rerender(<TransferPlanCard intent={{recipientId:'dad',amount:200000}} onReview={vi.fn()}/>);
 expect(screen.getByText(/尚未读取/)).toBeVisible();expect(screen.queryByText('¥100')).not.toBeInTheDocument();
});
it('订阅组件只汇总同周期签约，取消只进入核对，提醒使用已有开关',async()=>{
 const cancel=vi.fn(),reminder=vi.fn(),open=vi.fn();
 render(<SubscriptionReviewCard items={[item,{...item,key:'wechat_pay:annual',id:'annual',provider:'wechat_pay',providerName:'微信支付',title:'年度会员',amount:9900,cycle:'年',daysUntilCharge:null}]} onReviewCancel={cancel} onToggleReminder={reminder} onOpen={open}/>);
 const card=screen.getByRole('region',{name:'订阅安排'});
 expect(card).toHaveTextContent('按月签约');expect(card).toHaveTextContent('¥25');expect(card).not.toHaveTextContent('¥124');
 expect(card).toHaveTextContent('扣费时间待核对');expect(cancel).not.toHaveBeenCalled();
 await userEvent.click(within(card).getByRole('button',{name:'核对并取消视频会员'}));expect(cancel).toHaveBeenCalledWith('alipay','video');
 await userEvent.click(within(card).getByRole('button',{name:'关闭视频会员提醒'}));expect(reminder).toHaveBeenCalledWith('alipay:video',false);
 await userEvent.click(within(card).getByRole('button',{name:'查看自动续费清单'}));expect(open).toHaveBeenCalledOnce();
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
 expect(resume).not.toHaveBeenCalled();await userEvent.click(within(card).getByRole('button',{name:'查看原订单'}));expect(resume).toHaveBeenCalledWith(flow.next);
});
it('未知平台状态和恢复失败如实展示，不自动付款或假装完成',async()=>{
 const view=render(<SceneProgressCard scene={{...flow,stage:'failed',error:'订单状态尚未核对',records:[{...flow.records[1],status:'UNKNOWN'}]}} onResume={async()=>{throw new Error('平台暂不可用');}}/>);
 expect(screen.getByText('状态待核对')).toBeVisible();expect(screen.getByText('订单状态尚未核对')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'查看原订单'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('平台暂不可用'));
 view.rerender(<SceneProgressCard scene={{...flow,stage:'completed',next:undefined}}/>);
 expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
