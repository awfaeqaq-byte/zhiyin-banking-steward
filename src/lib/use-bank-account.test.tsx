import {act,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {bankCards,type BankCardId,type BankSnapshot} from './bank-transfer';
import {useBankAccount} from './use-bank-account';

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

function snapshot(cardId:BankCardId,revision:number,balance=10000):BankSnapshot{
 return {cardId,revision,balance,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true},transactions:[]};
}
function aggregate(revisions:Record<BankCardId,number>):BankSnapshot{
 const primary=snapshot('primary',revisions.primary,4230000-revisions.primary);
 return {...primary,cards:bankCards.map(card=>({...card,...snapshot(card.id,revisions[card.id],card.isPrimary?primary.balance:revisions[card.id]*1000)}))};
}
function requests(){
 const pending:Array<{url:string;body:Record<string,unknown>|undefined;resolve:(response:Response)=>void}>=[];
 vi.spyOn(globalThis,'fetch').mockImplementation((url,options)=>new Promise<Response>(resolve=>{
  pending.push({url:String(url),body:options?.body?JSON.parse(String(options.body)):undefined,resolve});
 }));
 const reply=async(index:number,value:unknown,status=200)=>{
  await act(async()=>{pending[index].resolve(new Response(JSON.stringify(value),{status}));});
 };
 return {pending,reply};
}

it('主卡没有预约但副卡有待执行预约时，总览持续刷新执行状态',async()=>{
 vi.useFakeTimers();
 const {pending,reply}=requests();renderHook(()=>useBankAccount());
 const fresh=aggregate({primary:0,living:1,reserve:0});
 fresh.allSchedules=[{id:'living-schedule',cardId:'living',recipientId:'mom',amount:100,executeAt:Date.now()+60000,createdAt:Date.now(),status:'pending'}];
 await reply(0,fresh);
 await act(async()=>{vi.advanceTimersByTime(3000);});
 expect(pending).toHaveLength(2);
 await reply(1,{...fresh,allSchedules:[{...fresh.allSchedules[0],status:'completed'}]});
 await act(async()=>{vi.advanceTimersByTime(6000);});
 expect(pending).toHaveLength(2);
});

it.each(['living','reserve'] as const)('主卡版本不变时，迟到响应不能回退%s的余额和版本',async cardId=>{
 const {reply}=requests();const {result}=renderHook(()=>useBankAccount());
 let newer!:Promise<BankSnapshot|null>;
 act(()=>{newer=result.current.refresh();});
 const fresh=aggregate({primary:0,living:0,reserve:0});
 const card=fresh.cards!.find(card=>card.id===cardId)!;card.balance=10000;card.revision=1;
 await reply(1,fresh);await newer;
 expect(result.current.state).toEqual(fresh);
 await reply(0,aggregate({primary:0,living:0,reserve:0}));
 expect(result.current.state).toEqual(fresh);
});

it.each(['primary','living','reserve'] as const)('聚合响应中%s版本退后时，其他卡版本前进也不能覆盖已核对快照',async cardId=>{
 const {reply}=requests();const {result}=renderHook(()=>useBankAccount('primary'));
 const current=aggregate({primary:4,living:5,reserve:6});await reply(0,current);
 let refresh!:Promise<BankSnapshot|null>;
 act(()=>{refresh=result.current.refresh();});
 const revisions={primary:5,living:6,reserve:7};revisions[cardId]-=2;
 await reply(1,aggregate(revisions));
 expect(result.current.state).toEqual(current);
 expect(await refresh).toEqual(current);
 act(()=>{void result.current.refresh();});
 const next=aggregate({primary:5,living:6,reserve:7});await reply(2,next);
 expect(result.current.state).toEqual(next);
});

it('切卡后旧响应不会显示到当前卡，设置请求使用当前卡和当前版本',async()=>{
 const {pending,reply}=requests();
 const {result,rerender}=renderHook(({cardId}:{cardId:BankCardId})=>useBankAccount(cardId),{initialProps:{cardId:'primary'}});
 rerender({cardId:'living'});expect(result.current.state).toBeNull();
 await reply(1,snapshot('living',4));
 await reply(0,aggregate({primary:99,living:99,reserve:99}));
 expect(result.current.state).toMatchObject({cardId:'living',revision:4});
 let changed!:Promise<boolean>;
 act(()=>{changed=result.current.change({frozen:true});});
 expect(pending[2].body).toEqual({type:'settings',cardId:'living',revision:4,frozen:true});
 await reply(2,{...snapshot('living',5),frozen:true});expect(await changed).toBe(true);
 await reply(3,{...snapshot('living',5),frozen:true});
 expect(result.current.state).toMatchObject({cardId:'living',revision:5,frozen:true});
});

it('切走再切回后，前一次打开卡片的迟到响应和回调仍失效',async()=>{
 const {pending,reply}=requests();
 const {result,rerender}=renderHook(({cardId}:{cardId:BankCardId})=>useBankAccount(cardId),{initialProps:{cardId:'primary'}});
 await reply(0,aggregate({primary:1,living:0,reserve:0}));
 const oldChange=result.current.change;
 act(()=>{void result.current.refresh();});
 rerender({cardId:'living'});
 let blocked!:Promise<boolean>;
 act(()=>{blocked=oldChange({frozen:true});});
 expect(pending).toHaveLength(3);
 expect(await blocked).toBe(false);
 await reply(2,snapshot('living',4));
 rerender({cardId:'primary'});expect(result.current.state).toBeNull();
 await reply(1,aggregate({primary:99,living:99,reserve:99}));
 expect(result.current.state).toBeNull();
 await reply(3,aggregate({primary:2,living:1,reserve:1}));
 expect(result.current.state).toMatchObject({cardId:'primary',revision:2});
 act(()=>{blocked=oldChange({frozen:true});});
 expect(pending).toHaveLength(4);
 expect(await blocked).toBe(false);
});

it('旧接口不带卡号的快照保持兼容，副卡拒绝错误卡号并不提交设置',async()=>{
 const {pending,reply}=requests();
 const {result,rerender}=renderHook(({cardId}:{cardId?:BankCardId})=>useBankAccount(cardId),{initialProps:{cardId:undefined as BankCardId|undefined}});
 const legacy=snapshot('primary',3);delete legacy.cardId;await reply(0,legacy);
 expect(result.current.state).toEqual(legacy);
 rerender({cardId:'reserve'});await reply(1,snapshot('living',4));
 expect(result.current.state).toBeNull();expect(result.current.error).toContain('当前卡片');
 await act(async()=>{expect(await result.current.change({frozen:true})).toBe(false);});
 expect(pending).toHaveLength(2);
});
