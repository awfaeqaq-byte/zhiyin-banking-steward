import {afterEach,describe,expect,it,vi} from 'vitest';
import {getPublicMerchant,merchantOrderUrl,merchantRequest,submitMerchantOrder,hasPendingMerchantOperation,recoverMerchantOperation,MerchantOwnerUnknownError} from './merchant-service';
const state={version:1,revision:0,shop:null,orders:[],expenses:[]};
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
describe('merchant transport',()=>{
 it('persists an uncertain write and recovers the exact body before allowing another operation',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('offline'));
  await expect(merchantRequest({type:'add-expense',title:'买菜',category:'进货',amount:1000,occurredAt:1},3)).rejects.toBeInstanceOf(MerchantOwnerUnknownError);
  const original=fetcher.mock.calls[0][1]!.body;expect(hasPendingMerchantOperation()).toBe(true);
  await expect(merchantRequest({type:'create-shop',name:'别的操作'},4)).rejects.toBeInstanceOf(MerchantOwnerUnknownError);expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValue({ok:true,json:async()=>state} as Response);await recoverMerchantOperation();expect(fetcher.mock.calls.at(-1)![1]!.body).toBe(original);expect(hasPendingMerchantOperation()).toBe(false);
 });
 it('keeps the original write while the server is busy before idempotency lookup',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:503,json:async()=>({error:'小店记录正在保存，请稍后重试'})} as Response);
 await expect(merchantRequest({type:'create-shop',name:'小馆'},0)).rejects.toBeInstanceOf(MerchantOwnerUnknownError);expect(hasPendingMerchantOperation()).toBe(true);
 });
 it('retries a lost owner response with the same request identity',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ok:true,json:async()=>state} as Response);
  await merchantRequest({type:'create-shop',name:'小馆'},0);
  const a=fetcher.mock.calls[0][1]!,b=fetcher.mock.calls[1][1]!;expect(a.body).toBe(b.body);expect(new Headers(a.headers).get('X-Zhiyin-Expense-Scope')).toMatch(/^[\w-]{36}$/);
 });
 it('does not attach owner credentials to a public order',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({order:{id:'one',table:'A1',items:[{menuItemId:'dish',name:'面',quantity:1,unitPrice:1800,amount:1800}],total:1800,status:'pending',createdAt:Date.now()}})} as Response);
  await submitMerchantOrder('abc',{table:'A1',items:[{menuItemId:'dish',quantity:1}],requestId:'order-one'});
  expect(fetcher.mock.calls[0][1]!.headers).not.toHaveProperty('X-Zhiyin-Expense-Scope');
 });
 it('surfaces a server conflict instead of replacing data',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,json:async()=>({error:'账本已更新，请刷新'})} as Response);
  await expect(merchantRequest()).rejects.toThrow('账本已更新');
 });
 it('rejects invalid public menu and encodes the guest link',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({orders:[]})} as Response);
  await expect(getPublicMerchant('abc')).rejects.toThrow();
  const url=new URL(merchantOrderUrl('token','一号桌'));expect(url.searchParams.get('merchant')).toBe('token');expect(url.searchParams.get('table')).toBe('一号桌');expect(url.searchParams.has('phone')).toBe(false);
 });
});
