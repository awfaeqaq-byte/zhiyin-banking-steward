import { expect, it } from 'vitest';
import { loadFinancialSource } from '../apps/Zhiyin/finance-access';

it('keeps incoming WeChat transfers separate from ordinary income', async()=>{
  const result=await loadFinancialSource('wechat_pay',['transactions'],{
    nowIso:()=> '2026-09-24T09:00:00+08:00',
    readAlipay:()=>({balance:{total:0},transferRecords:[],subscriptions:[]}),
    readWechatPay:()=>({subscriptions:[]}),
    readWechatWallet:()=>({balanceCents:0}),
    readWechatLedger:async()=>[{id:'transfer-in',amountCents:2000,direction:'income',category:'transfer',merchant:'朋友转账',occurredAt:'2026-09-24T08:00:00+08:00'}],
  });
  expect(result.source?.transactions[0]).toMatchObject({kind:'transfer',category:'转账',amount:2000});
});
