import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBankStore} from '../../server/bank-store';
import {TermDepositPanel} from '../../src/components/term-deposit-panel';
const dirs:string[]=[];
afterEach(()=>{vi.restoreAllMocks();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
it('一句话准备定存，选择期限不扣款，确认后汇总变化，支取需要再次核对',async()=>{
 const now=Date.parse('2026-10-12T12:00:00+08:00');vi.spyOn(Date,'now').mockReturnValue(now);
 const dir=mkdtempSync(join(tmpdir(),'deposit-ui-'));dirs.push(dir);const bank=createBankStore(join(dir,'bank.json'));
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=options?.body?JSON.parse(String(options.body)):null;
  try{const result=!body?bank.get():body.type==='prepare-deposit'?bank.prepareDeposit(body,now):body.type==='confirm-deposit'?bank.confirmDeposit(body.draftId,now):body.type==='prepare-deposit-withdrawal'?bank.prepareDepositWithdrawal(body.depositId,now):body.type==='confirm-deposit-withdrawal'?bank.confirmDepositWithdrawal(body.draftId,now):null;
   return new Response(JSON.stringify(result));}catch(error){return new Response(JSON.stringify({error:(error as Error).message}),{status:400});}
 });
 const user=userEvent.setup();render(<TermDepositPanel initialRequest="存1000元，6个月定期"/>);
 await screen.findByText(/可用资金/);expect(screen.getByLabelText('存入金额（元）')).toHaveValue('1000');
 expect(screen.getByRole('radio',{name:/6个月/})).toBeChecked();expect(bank.get().balance).toBe(4230000);
 await user.click(screen.getByRole('button',{name:'核对定存方案'}));expect(bank.get().balance).toBe(4230000);
 await user.click(screen.getByRole('button',{name:'确认存入'}));
 await waitFor(()=>expect(bank.get().assetSummary?.deposits).toBe(100000));
 await screen.findByText(/存入已完成/);
 await user.click(screen.getByRole('button',{name:'支取这笔定存'}));expect(bank.get().balance).toBe(4130000);
 expect(screen.getByText(/提前支取/)).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'确认支取'}));await waitFor(()=>expect(bank.get().assetSummary?.deposits).toBe(0));
 expect(bank.get().balance).toBe(4230000);
});
