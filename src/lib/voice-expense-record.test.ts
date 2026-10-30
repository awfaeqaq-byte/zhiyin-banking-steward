import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createExpenseStore} from '../../server/expense-store';
import {readVoiceExpenseRecord} from './voice-expense-record';
const group={id:'trip-four',name:'海边四人行',revision:1,members:[{id:'self',name:'小叶',self:true},{id:'partner',name:'爱人'},{id:'wang',name:'小王'},{id:'li',name:'李娜'}]};
const entry={title:'饮料',amount:1800,payerId:'self',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))};
it('从实际保存后重新读取的同一账本计算分摊，不发起收款；同请求重试只记一次',()=>{
 const directory=mkdtempSync(join(tmpdir(),'zhiyin-voice-expense-'));
 try{
  const file=join(directory,'expense.json'),store=createExpenseStore(file);
  store.change({type:'create',bookId:'trip',title:'海边旅行',group,participants:group.members.map(m=>m.id),defaultPayerId:'self',revision:0,requestId:'create-trip'});
  const command={type:'add' as const,bookId:'trip',entryId:'drinks',entry,revision:1,requestId:'voice-drinks'};store.change(command);store.change(command);
  const book=createExpenseStore(file).get().books[0],result=readVoiceExpenseRecord({kind:'expense_record',book,entryId:'drinks'});
  expect(result?.members.map(m=>m.amount)).toEqual([450,450,450,450]);expect(result?.equal).toBe(true);expect(result?.payer.self).toBe(true);expect(book.entries).toHaveLength(1);expect(book.batches).toHaveLength(0);
  expect(readVoiceExpenseRecord({kind:'expense_record',book,entryId:'missing'})).toBeNull();
  expect(readVoiceExpenseRecord({kind:'expense_record',book:{...book,entries:[{...book.entries[0],batchId:'old'}]},entryId:'drinks'})).toBeNull();
  expect(readVoiceExpenseRecord({kind:'expense_record',book:{...book,entries:[{...book.entries[0],amount:-1}]},entryId:'drinks'})).toBeNull();
  const weighted={...book,entries:[{...book.entries[0],shares:entry.shares.map((s,i)=>({...s,weight:i%2===0?2:1}))}]};expect(readVoiceExpenseRecord({kind:'expense_record',book:weighted,entryId:'drinks'})?.equal).toBe(false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('拒绝不存在或损坏的账本结果',()=>{
 for(const value of [undefined,{}, {kind:'other'}, {kind:'expense_record',entryId:'x'}, {kind:'expense_record',entryId:1,book:{}}])expect(readVoiceExpenseRecord(value)).toBeNull();
});
