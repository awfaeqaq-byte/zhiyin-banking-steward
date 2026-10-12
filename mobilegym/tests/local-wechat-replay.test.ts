import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {loadLocalWechatBillFixture,restoreLocalWechatLedger} from '../apps/Wechat/pay-ledger/localFixtureBootstrap';
const data=vi.hoisted(()=>({ledger:{transactions:[{id:'original',direction:'expense',amountCents:100,category:'dining',merchant:'原消费',occurredAt:'2026-09-16'}],monthlyHistory:[],settings:{dailyReport:true,includeManualRecords:true}}}));
vi.mock('../apps/Wechat/state',()=>({useWechatStore:{getState:()=>({payLedger:data.ledger}),setState:(s:{payLedger:typeof data.ledger})=>{data.ledger=s.payLedger;}}}));
vi.mock('../apps/Zhiyin/finance-access',()=>({loadFinancialSource:vi.fn(async()=>({status:'granted',source:{provider:'wechat_pay',scopes:['transactions']}}))}));
const grant=vi.hoisted(()=>vi.fn());
vi.mock('../apps/Zhiyin/financial-grants',()=>({storeFinancialGrant:grant,revokeFinancialGrant:vi.fn()}));
const payload={transactions:[{id:'imported',direction:'expense',amountCents:200,category:'shopping',merchant:'历史消费',occurredAt:'2026-08-01'}],monthlyHistory:[],settings:{dailyReport:true,includeManualRecords:true},importReport:{version:1,fileName:'sample.xlsx',sha256:'abc',sourceRows:1,importedRows:1,quarantinedRows:0,quarantineReasons:{},formulaCells:0,from:'2026-08-01',to:'2026-08-01'}};
let storage:Map<string,string>;
beforeEach(()=>{
 data.ledger={transactions:[{id:'original',direction:'expense',amountCents:100,category:'dining',merchant:'原消费',occurredAt:'2026-09-16'}],monthlyHistory:[],settings:{dailyReport:true,includeManualRecords:true}};
 storage=new Map([['zhiyin-connections','{"alipay":{"scopes":["balance"]}}']]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,v:string)=>storage.set(key,v),removeItem:(key:string)=>storage.delete(key)});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).endsWith('/status')?{configured:true,enabled:false}:payload)));vi.clearAllMocks();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('未手动确认时不读取Excel、不替换账单或授予授权',async()=>{
 const before=structuredClone(data.ledger);await loadLocalWechatBillFixture();
 expect(fetch).not.toHaveBeenCalled();expect(data.ledger).toEqual(before);expect(grant).not.toHaveBeenCalled();
});
it('手动回放保留授权不变，备份后能恢复且保留回放期间新增的沙箱消费',async()=>{
 const before=structuredClone(data.ledger),connections=storage.get('zhiyin-connections');
 await loadLocalWechatBillFixture({confirmed:true});expect(data.ledger.transactions[0].id).toBe('imported');expect(grant).not.toHaveBeenCalled();expect(storage.get('zhiyin-connections')).toBe(connections);
 data.ledger.transactions.push({...before.transactions[0],id:'new-payment'});
 await restoreLocalWechatLedger({confirmed:true});
 expect(data.ledger.transactions.map(row=>row.id)).toEqual(['new-payment','original']);expect(storage.get('zhiyin-connections')).toBe(connections);
 expect(vi.mocked(fetch).mock.calls.some(([,options])=>String(options?.body).includes('"authorized":true'))).toBe(false);
});
