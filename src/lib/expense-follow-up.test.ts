import {describe,it,expect,vi,afterEach} from 'vitest';
import {changeExpenses,emptyExpenseState,type ExpenseCommand} from './expense-notebook';
import {calculateGroupAA,type AACollection} from './group-aa';
import {collectionProgress,expenseActivityClosed,expenseProgressText,remindExpenseTomorrow,finishExpenseReminder} from './expense-follow-up';
import * as tasks from './task-calendar';
export function followUpFixture() {
  const group={id:'g',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'},{id:'wang',name:'小王'}]};
  let state=emptyExpenseState();
  const apply=(op:object)=>state=changeExpenses(state,{...op,bookId:'book',revision:state.revision,requestId:crypto.randomUUID()} as ExpenseCommand);
  apply({type:'create',title:'今晚聚餐',group,participants:['me','li','wang'],defaultPayerId:'me'});
  apply({type:'add',entryId:'e',entry:{title:'晚饭',amount:9000,payerId:'me',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))}});
  apply({type:'prepare',batchId:'batch',entryIds:['e']});
  apply({type:'published',batchId:'batch',collectionId:'batch'});
  const book=state.books[0];const plan=book.batches[0].plan;
  const collection:AACollection={...calculateGroupAA(group,plan),id:'batch',groupId:'g',groupName:'饭搭子',createdAt:Date.now(),plan,status:'pending',members:calculateGroupAA(group,plan).members.map(m=>({...m,paid:m.id!=='wang'}))};
  return {state,book,collection};
}
afterEach(()=>vi.restoreAllMocks());
describe('收款跟进',()=>{
  it('核对原方案金额和成员，不能用completed标签伪装收齐',()=>{
    const {book,collection}=followUpFixture();
    expect(collectionProgress(book,book.batches[0],collection).remaining).toBe(3000);
    expect(()=>collectionProgress(book,book.batches[0],{...collection,status:'completed'})).toThrow();
    expect(()=>collectionProgress(book,book.batches[0],{...collection,collectAmount:1})).toThrow();
    expect(()=>collectionProgress(book,book.batches[0],{...collection,groupId:'other'})).toThrow();
    expect(()=>collectionProgress(book,book.batches[0],{...collection,members:[collection.members[0]]})).toThrow();
  });
  it('回执持久保存，收齐归档；取消、缺失或尚有消费不算结清',()=>{
    const {state,collection}=followUpFixture();
    const sync=(collections:AACollection[])=>changeExpenses(state,{type:'sync-collections',bookId:'book',collections,revision:state.revision,requestId:crypto.randomUUID()});
    const partial=sync([collection]).books[0];
    expect(expenseActivityClosed(partial)).toBe(false);
    expect(expenseProgressText(partial)).toContain('小王');
    expect(expenseProgressText(partial)).toContain('¥30.00');
    const full={...collection,status:'completed' as const,members:collection.members.map(m=>({...m,paid:true}))};
    const closed=sync([full]).books[0];
    expect(expenseActivityClosed(JSON.parse(JSON.stringify(closed)))).toBe(true);
    expect(expenseActivityClosed({...closed,entries:[...closed.entries,{...closed.entries[0],id:'new',batchId:undefined}]})).toBe(false);
    expect(expenseActivityClosed(sync([{...collection,status:'cancelled'}]).books[0])).toBe(false);
    expect(expenseProgressText(sync([]).books[0])).toContain('未取得');
  });
  it('提醒只建立本人日历任务，重复点击不重复创建；收齐后完成提醒',async()=>{
    const {book,collection}=followUpFixture();
    book.batches[0].receipt=collection;
    let state:tasks.TaskState={revision:0,tasks:[]};
    const request=vi.spyOn(tasks,'taskRequest').mockImplementation(async command=>{
      if(command)state=tasks.updateTasks(state,command,new Date('2026-09-29T08:00:00+08:00').getTime());
      return state;
    });
    const now=new Date('2026-09-29T23:40:00+08:00').getTime();
    await remindExpenseTomorrow(book,now);await remindExpenseTomorrow(book,now);
    expect(state.tasks).toHaveLength(1);
    expect(tasks.localTaskTime(state.tasks[0].dueAt)).toBe('2026-09-30T09:00');
    expect(state.tasks[0].note).toContain('不会自动催款');
    await finishExpenseReminder(book);expect(state.tasks[0].status).toBe('pending');
    book.batches[0].receipt={...collection,status:'completed',members:collection.members.map(m=>({...m,paid:true}))};
    await finishExpenseReminder(book);expect(state.tasks[0].status).toBe('completed');
    expect(request).toHaveBeenCalled();
  });
});
