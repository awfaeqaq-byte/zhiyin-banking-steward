import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {BankTransfer} from './bank-transfer';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
it('大额和重复证据就地展示，核对勾选不等于付款，修改后清除勾选',async()=>{
 const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
 const now=Date.now();
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body));calls.push(body);
  return new Response(JSON.stringify(body.type==='prepare'?{id:'draft',recipientId:'mom',amount:500000,revision:1,balance:4230000,createdAt:now,expiresAt:now+300000,review:{large:true,token:'review-token',matches:[{id:'previous',kind:'completed',recipientId:'mom',amount:500000,at:now-2000}]}}:{id:'draft',recipientId:'mom',amount:500000,completedAt:now,balanceAfter:3730000}));
 });
 render(<BankTransfer initial={{workspaceId:'dinner',recipientId:'mom',amount:500000}} onDone={vi.fn()}/>);
 await user.selectOptions(screen.getByLabelText('从哪个账户转出'),'demo-8888');
 await user.click(screen.getByRole('button',{name:'核对即时转账'}));
 expect(screen.getByText('可能重复转账')).toBeVisible();expect(screen.getByText(/大额转账/)).toBeVisible();
 const button=screen.getByRole('button',{name:'确认并立即转账（沙箱）'});expect(button).toBeDisabled();
 await user.click(screen.getByRole('checkbox',{name:/已核对/}));expect(button).toBeEnabled();
 expect(calls.filter(x=>x.type==='confirm')).toEqual([]);
 await user.click(screen.getByRole('button',{name:'返回修改'}));await user.click(screen.getByRole('button',{name:'核对即时转账'}));
 expect(screen.getByRole('checkbox',{name:/已核对/})).not.toBeChecked();
 await user.click(screen.getByRole('checkbox',{name:/已核对/}));await user.click(screen.getByRole('button',{name:'确认并立即转账（沙箱）'}));
 expect(calls.at(-1)).toMatchObject({type:'confirm',riskReviewToken:'review-token',authorized:true});
 expect(await screen.findByText('转账已完成')).toBeVisible();
});

it('只有大额时不误称重复，未勾选保持原状态',async()=>{
 const {TransferRiskReview}=await import('./transfer-risk-review');
 const change=vi.fn();
 render(<TransferRiskReview review={{large:true,matches:[],token:'large'}} checked={false} disabled={false} onChange={change}/>);
 expect(screen.queryByText('可能重复转账')).not.toBeInTheDocument();
 expect(screen.getByRole('checkbox',{name:'我已核对收款账户和大额转账金额'})).not.toBeChecked();
 await userEvent.click(screen.getByRole('checkbox'));
 expect(change).toHaveBeenCalledWith(true);
});
it('显示预约和执行时间，多条证据可展开，不把预约当成已付款',async()=>{
 const {TransferRiskReview}=await import('./transfer-risk-review');const now=Date.now();
 render(<TransferRiskReview review={{large:false,token:'pending',matches:Array.from({length:4},(_,i)=>({id:`scheduled-${i}`,kind:'pending',recipientId:'mom',amount:100000,at:now,executeAt:now+60000}))}} checked={false} disabled={true} onChange={vi.fn()}/>);
 expect(screen.queryByText(/大额转账提醒/)).not.toBeInTheDocument();
 expect(screen.getAllByText(/已预约，尚未扣款/)[0]).toBeVisible();
 expect(screen.getAllByText(/预计执行/)[0]).toBeVisible();
 expect(screen.getByRole('checkbox')).toBeDisabled();
 const summary=screen.getByText('其余 1 条记录');await userEvent.click(summary);
 expect(summary.closest('details')).toHaveAttribute('open');
 expect(screen.getByText('记录号 scheduled-3')).toBeVisible();
});
