import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {createWealthStore} from '../../server/wealth-store';
const now=Date.parse('2026-10-12T12:00:00+08:00');
const dirs:string[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'real-assets-'));dirs.push(dir);const file=join(dir,'bank.json');return {file,bank:createBankStore(file)};}
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
it('初始资产只有现金，不注入虚构理财或定期；理财申购、赎回同步总资产',()=>{
 const {bank}=fixture();expect(bank.get().assetSummary).toMatchObject({cash:4230000,wealth:0,deposits:0,total:4230000,availableCash:4230000});
 const wealth=createWealthStore(bank);wealth.assess({experience:0,loss:0,term:0,liquidity:0,income:0},now);
 const draft=wealth.prepare({productId:'cash-plus',amount:100000,term:3},now);wealth.confirm(draft.id,now);
 expect(bank.get().assetSummary).toMatchObject({cash:4130000,wealth:100000,deposits:0,total:4230000,holdingCount:1});
 const redemption=wealth.prepareRedemption(draft.id,now+1);wealth.confirmRedemption(redemption.id,now+2);
 expect(bank.get().assetSummary).toMatchObject({cash:4230000,wealth:0,total:4230000,holdingCount:0});
});
it('定存先核对再扣款，可重启恢复；重复确认不重复扣款，支取不重复入账',()=>{
 const {file,bank}=fixture();const draft=bank.prepareDeposit({amount:100000,months:3},now);
 expect(bank.get().balance).toBe(4230000);bank.confirmDeposit(draft.id,now+1);bank.confirmDeposit(draft.id,now+2);
 expect(bank.get().assetSummary).toMatchObject({cash:4130000,deposits:100000,total:4230000,depositCount:1});
 const restarted=createBankStore(file);expect(restarted.get().termDeposits).toHaveLength(1);
 const withdrawal=restarted.prepareDepositWithdrawal(draft.id,now+86400000+1000);
 expect(restarted.get().balance).toBe(4130000);const result=restarted.confirmDepositWithdrawal(withdrawal.id,now+86400000+1001);
 restarted.confirmDepositWithdrawal(withdrawal.id,now+86400000+1002);
 expect(restarted.get().balance).toBe(4230000+result.interest);
 expect(restarted.get().assetSummary).toMatchObject({deposits:0,depositCount:0,total:4230000+result.interest});
});
it('定存保护已有预约、还款预留和生日预算；账户变动后旧确认失效',()=>{
 const {bank}=fixture();const scheduled=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:2000000,executeAt:now+86400000},now);bank.schedule(scheduled.id,now,scheduled.review?.token);
 expect(bank.get().assetSummary).toMatchObject({cash:4230000,availableCash:230000,reservedCash:4000000,total:4230000});
 expect(()=>bank.prepareDeposit({amount:300000,months:3},now)).toThrow(/预留|不足/);
 const draft=bank.prepareDeposit({amount:100000,months:3},now);bank.configure({revision:bank.get().revision,limit:1500000});
 expect(()=>bank.confirmDeposit(draft.id,now+1)).toThrow(/变化|重新核对/);
 expect(bank.get().assetSummary?.deposits).toBe(0);
});
it('定存到期按约定模拟利率，提前支取按沙箱活期利率，回执真实计入现金',()=>{
 const {bank}=fixture();const draft=bank.prepareDeposit({amount:1000000,months:3},now);const deposit=bank.confirmDeposit(draft.id,now+1);
 const quote=bank.prepareDepositWithdrawal(deposit.id,deposit.maturesAt);
 expect(quote.early).toBe(false);expect(quote.interest).toBeGreaterThan(0);expect(quote.rateBps).toBe(deposit.rateBps);
 const before=bank.get();const receipt=bank.confirmDepositWithdrawal(quote.id,deposit.maturesAt+1);
 expect(bank.get().balance).toBe(before.balance+deposit.amount+receipt.interest);
 expect(bank.get().assetSummary?.total).toBe(4230000+receipt.interest);
});
it('无效金额、期限、过期方案和损坏定存停止操作，不改账本',()=>{
 const {file,bank}=fixture();for(const amount of [0,-1,0.5,NaN,Number.MAX_SAFE_INTEGER])expect(()=>bank.prepareDeposit({amount,months:3},now)).toThrow();
 expect(()=>bank.prepareDeposit({amount:100000,months:4},now)).toThrow();
 const draft=bank.prepareDeposit({amount:100000,months:3},now);const before=readFileSync(file,'utf8');
 expect(()=>bank.confirmDeposit(draft.id,now+300001)).toThrow(/过期/);expect(readFileSync(file,'utf8')).toBe(before);
 const state=JSON.parse(before);state.termDeposits=[null];writeFileSync(file,JSON.stringify(state));expect(()=>bank.get()).toThrow(/读取失败/);
});
it('损坏定存草稿不能反向加钱，读取与执行都停止，不覆写原文件',()=>{
 const {file,bank}=fixture();const draft=bank.prepareDeposit({amount:100000,months:3},now);
 const state=JSON.parse(readFileSync(file,'utf8'));state.depositDrafts[0].amount=-100000;writeFileSync(file,JSON.stringify(state));
 const before=readFileSync(file,'utf8');expect(()=>bank.get()).toThrow(/读取失败/);
 expect(()=>bank.confirmDeposit(draft.id,now+1)).toThrow(/损坏/);expect(readFileSync(file,'utf8')).toBe(before);
});
