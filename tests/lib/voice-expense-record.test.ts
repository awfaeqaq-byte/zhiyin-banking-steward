import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createExpenseStore} from '../../server/expense-store';
import {readVoiceExpenseRecord} from '../../src/lib/voice-expense-record';
import {resolveRelativeAAShares} from '../../src/lib/aa-relative-shares';
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
it('按明确的同行人性别将晚饭350元按2比1记入原旅行账本，饮料原样保留',()=>{
 const directory=mkdtempSync(join(tmpdir(),'zhiyin-voice-dinner-'));
 try{
  const file=join(directory,'expense.json'),store=createExpenseStore(file);
  const knownGroup={...group,members:group.members.map((m,i)=>({...m,gender:(i%2===0?'male':'female') as 'male'|'female'}))};
  const participants=group.members.map(m=>m.id);
  store.change({type:'create',bookId:'trip',title:'海边旅行',group:knownGroup,participants,defaultPayerId:'self',revision:0,requestId:'create-trip'});
  store.change({type:'add',bookId:'trip',entryId:'drinks',entry,revision:1,requestId:'drinks'});
  const before=store.get().books[0].entries[0];
  const ratio=resolveRelativeAAShares(knownGroup,participants,'晚饭350，女生算半份，男生一份');
  expect(ratio.status).toBe('resolved');if(ratio.status!=='resolved')throw Error('未核实分摊规则');
  store.change({type:'add',bookId:'trip',entryId:'dinner',entry:{...entry,title:'晚饭',amount:35000,shares:ratio.shares},revision:2,requestId:'dinner'});
  const book=createExpenseStore(file).get().books[0],result=readVoiceExpenseRecord({kind:'expense_record',book,entryId:'dinner'});
  expect(result?.members.map(m=>m.amount)).toEqual([11667,5833,11667,5833]);expect(result?.members.reduce((sum,m)=>sum+m.amount,0)).toBe(35000);
  expect(book.entries[0]).toEqual(before);expect(book.entries).toHaveLength(2);expect(book.batches).toHaveLength(0);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
