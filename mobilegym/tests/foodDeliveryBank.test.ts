import {afterEach, expect, it, vi} from 'vitest';
import {netFetch} from '../os/NetworkService';
import {bankFunding} from '../apps/FoodDelivery/payments/bank';

vi.mock('../os/NetworkService',()=>({netFetch:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
it('银行卡回执必须属于同一筹备任务；错配回执不能记为成功',async()=>{
 const payment={id:'occasion:birthday:cake-light',channel:'wechat' as const,amount:20600,merchant:'好食送 · 生日精选',occasionId:'birthday'};
 const receipt={...payment,completedAt:Date.now(),balanceAfter:4209400};
 const mock=vi.mocked(netFetch);
 for(const occasionId of ['another',undefined]){
  mock.mockResolvedValue({ok:true,json:async()=>({...receipt,occasionId})} as Response);
  await expect(bankFunding.pay(payment)).rejects.toThrow(/回执/);
 }
 mock.mockResolvedValue({ok:true,json:async()=>receipt} as Response);
 await expect(bankFunding.pay(payment)).resolves.toEqual(receipt);
});
