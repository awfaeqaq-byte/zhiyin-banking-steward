// @vitest-environment node
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createBankStore} from '../../server/bank-store';
import {validVoiceLimitReview,verifyVoiceLimit} from './voice-limit-review';

it('实际沙箱限额从20000改到2000，不改余额和其他保护；超额付款被阻止',()=>{
 const directory=mkdtempSync(join(tmpdir(),'zhiyin-limit-'));
 try{
  const bank=createBankStore(join(directory,'bank.json'));const before=bank.get();const now=Date.now();
  const review={kind:'payment_limit' as const,cardId:'primary' as const,before,limit:200000,createdAt:now,expiresAt:now+300000};
  expect(validVoiceLimitReview(review)).toBe(true);expect(()=>verifyVoiceLimit(review,before)).toThrow();
  bank.configure({revision:before.revision,limit:200000});const after=bank.get();expect(()=>verifyVoiceLimit(review,after)).not.toThrow();
  expect(after.balance).toBe(before.balance);expect(after.controls).toEqual(before.controls);
  expect(()=>bank.prepare({recipientId:'mom',amount:200001},new Date('2026-10-30T12:00:00+08:00').getTime())).toThrow(/限额/);
  expect(()=>bank.configure({revision:before.revision,limit:100000})).toThrow(/已变化/);
  expect(()=>verifyVoiceLimit(review,{...after,balance:after.balance-1})).toThrow();
  expect(()=>verifyVoiceLimit(review,{...after,controls:{...after.controls,night:!after.controls.night}})).toThrow();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('校验方案边界、有效期和卡片归属，拒绝无法核实的结果',()=>{
 const before={cardId:'primary' as const,revision:0,balance:300000,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[]};
 const review={kind:'payment_limit',cardId:'primary',before,limit:200000,createdAt:1000,expiresAt:301000};
 expect(validVoiceLimitReview(null)).toBe(false);
 for(const patch of [{limit:1},{limit:5000001},{limit:NaN},{limit:200000.5},{cardId:'fake'},{cardId:'living'},{expiresAt:999},{createdAt:0},{before:{...before,revision:-1}}])expect(validVoiceLimitReview({...review,...patch})).toBe(false);
 expect(validVoiceLimitReview({...review,limit:10000})).toBe(true);expect(validVoiceLimitReview({...review,limit:5000000})).toBe(true);
 expect(()=>verifyVoiceLimit(review as never,null)).toThrow();
 expect(()=>verifyVoiceLimit(review as never,{...before,limit:200000})).toThrow();
 expect(()=>verifyVoiceLimit(review as never,{...before,revision:1,limit:200000,cardId:'living'})).toThrow();
 expect(()=>verifyVoiceLimit(review as never,{...before,revision:1,limit:200000,transactions:[{id:'new',recipientId:'mom',amount:100,completedAt:1000,balanceAfter:300000}]})).toThrow();
});
