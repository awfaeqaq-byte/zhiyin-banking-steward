import {expect,it,afterEach} from 'vitest';
import {depositMaturity,depositInterest,parseDepositRequest,depositRequestForMessages} from './bank-assets';
import {createBankStore} from '../../server/bank-store';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const now=Date.parse('2026-10-12T12:00:00+08:00');const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));
it('月末按北京时间正确滚入目标月，只有入账利息才增加总资产',()=>{
 const start=Date.parse('2026-01-31T12:00:00+08:00');expect(depositMaturity(start,3)).toBe(Date.parse('2026-04-30T12:00:00+08:00'));
 const deposit={id:'d',amount:100000,months:3,rateBps:110,openedAt:start,maturesAt:depositMaturity(start,3)};
 expect(depositInterest(deposit,start)).toMatchObject({interest:0,early:true,rateBps:20});
 expect(depositInterest(deposit,deposit.maturesAt).interest).toBe(268);
 expect(depositInterest(deposit,deposit.maturesAt+86400000).interest).toBe(268);
 expect(()=>depositInterest(deposit,start-1)).toThrow();
});
it('改成金额/期限继承定存语境，不误读16个月为6个月或负金额为正数',()=>{
 expect(parseDepositRequest('存1.5万元，半年定期')).toEqual({amount:'15000',months:6});
 expect(parseDepositRequest('存1000元，16个月定期').months).toBeNull();
 expect(parseDepositRequest('存-1000元，3个月定期').amount).toBe('');
 expect(parseDepositRequest('存1000.999元，3个月定期').amount).toBe('');
 const messages=[{role:'user',content:'存1000元，3个月定期'},{role:'assistant',content:'可以先核对'},{role:'user',content:'改成5000元，半年'}];
 expect(parseDepositRequest(depositRequestForMessages(messages)!)).toEqual({amount:'5000',months:6});
 expect(depositRequestForMessages([{role:'user',content:'看看本月账单'}])).toBeNull();
});
it('支取回执重复读取仍返回当时余额，余额后续变化不会改写回执',()=>{
 const dir=mkdtempSync(join(tmpdir(),'deposit-receipt-'));dirs.push(dir);const bank=createBankStore(join(dir,'bank.json'));
 const draft=bank.prepareDeposit({amount:100000,months:3},now);const deposit=bank.confirmDeposit(draft.id,now);
 const quote=bank.prepareDepositWithdrawal(deposit.id,now);const receipt=bank.confirmDepositWithdrawal(quote.id,now);
 bank.pay({id:'test-after-withdrawal',channel:'wechat',amount:1000,merchant:'测试商户'},now);
 expect(bank.confirmDepositWithdrawal(quote.id,now+1)).toEqual(receipt);
});
