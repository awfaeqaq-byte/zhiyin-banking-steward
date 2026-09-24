import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {BankTransfer} from './bank-transfer';
afterEach(()=>vi.restoreAllMocks());
it('只在最后授权时扣款，修改金额需重新核对，显示服务器回执',async()=>{
 const user=userEvent.setup();const calls:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body || '{}'));calls.push(body);
  return new Response(JSON.stringify(body.type==='prepare'?{id:'draft',recipientId:body.recipientId,amount:body.amount,revision:0,balance:4230000,createdAt:1,expiresAt:Date.now()+300000}:{id:'draft',recipientId:'mom',amount:300000,completedAt:Date.now(),balanceAfter:3930000}));
 });
 render(<BankTransfer initial={{recipientId:'mom',amount:200000}} onDone={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'核对即时转账'}));
 expect(calls.filter(c=>c.type==='confirm')).toHaveLength(0);
 await user.click(screen.getByRole('button',{name:'返回修改'}));
 await user.clear(screen.getByLabelText('转账金额（元）'));await user.type(screen.getByLabelText('转账金额（元）'),'3000');
 await user.click(screen.getByRole('button',{name:'核对即时转账'}));
 await user.click(screen.getByRole('button',{name:'确认并立即转账（沙箱）'}));
 expect(await screen.findByText('转账已完成')).toBeVisible();
 expect(calls.filter(c=>c.type==='confirm')).toEqual([{type:'confirm',draftId:'draft',authorized:true}]);
});
it('未知结果保持原方案重试，刷新后从回执恢复，不重发新转账',async()=>{
 const user=userEvent.setup(),draft={id:'pending',recipientId:'dad',amount:100,revision:0,balance:4230000,createdAt:1,expiresAt:Date.now()+300000};
 let confirmed=false;
 const reply=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));
  if(body.type==='confirm'){confirmed=true;throw Error('网络中断，结果待核实');}
  return new Response(JSON.stringify(body.type==='status'?{receipt:{...draft,completedAt:100,balanceAfter:4229900}}:draft));
 });
 const view=render(<BankTransfer initial={{recipientId:'dad',amount:100}} onDone={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'核对即时转账'}));await user.click(screen.getByRole('button',{name:'确认并立即转账（沙箱）'}));
 expect(confirmed).toBe(true);expect(screen.getByRole('button',{name:'返回修改'})).toBeDisabled();
 view.unmount();render(<BankTransfer initial={{recipientId:'mom',amount:200000}} onDone={vi.fn()}/>);
 expect(await screen.findByText('转账已完成')).toBeVisible();
 expect(reply.mock.calls.filter(([,o])=>String(o?.body).includes('"type":"confirm"'))).toHaveLength(1);
 expect(localStorage.getItem('zhiyin-bank-pending-confirmation')).toBeNull();
});
