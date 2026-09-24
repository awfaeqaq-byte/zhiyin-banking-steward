import {it,expect,vi,afterEach} from 'vitest';
import {bankFunding} from '../apps/FoodDelivery/payments/bank';
afterEach(()=>vi.unstubAllGlobals());
const payment={id:'food:one',channel:'wechat' as const,amount:200,merchant:'店'};
it('发送明确授权与固定订单号，拒绝畸形成功响应',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetch);
 await expect(bankFunding.pay(payment)).rejects.toThrow(/回执/);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({type:'payment',authorized:true,payment});
});
it('合法付款和退款回执，业务拒绝与网络未知分开',async()=>{
 const receipt={...payment,completedAt:100,balanceAfter:1000};
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
 .mockResolvedValueOnce(new Response(JSON.stringify({...receipt,refundedAt:200,refundBalanceAfter:1200})))
 .mockResolvedValueOnce(new Response('{"error":"银行卡余额不足"}',{status:400}))
 .mockResolvedValueOnce(new Response('{"error":"服务繁忙"}',{status:500}));
 vi.stubGlobal('fetch',fetch);
 await expect(bankFunding.pay(payment)).resolves.toEqual(receipt);
 await expect(bankFunding.refund(payment.id)).resolves.toMatchObject({refundedAt:200});
 await expect(bankFunding.pay(payment)).rejects.toMatchObject({name:'BankRejection'});
 await expect(bankFunding.pay(payment)).rejects.toMatchObject({name:'BankUnavailable'});
});
