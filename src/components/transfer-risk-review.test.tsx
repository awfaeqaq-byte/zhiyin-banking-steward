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
