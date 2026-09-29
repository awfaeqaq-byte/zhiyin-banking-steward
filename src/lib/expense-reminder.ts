import {taskRequest,dayKey} from './task-calendar';
import {collectionProgress,expenseActivityClosed} from './expense-follow-up';
import type {ExpenseBook} from './expense-notebook';
async function reminderId(book:ExpenseBook) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(book.id));
  return 'aa-'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('').slice(0,48);
}
export async function remindExpenseTomorrow(book:ExpenseBook,now=Date.now()) {
  if(expenseActivityClosed(book))return '已经收齐，不需要再设收款提醒。';
  if(!book.batches.some(b=>b.receipt && !collectionProgress(book,b,b.receipt).cancelled && !collectionProgress(book,b,b.receipt).complete))
    return '没有已核实的待收款项，暂不添加提醒；请先核对微信收款状态。';
  const id=await reminderId(book),state=await taskRequest();
  const related=state.tasks.filter(t=>t.id===id||t.id.startsWith(id+'-'));
  const existing=related.find(t=>t.id===id);
  if(related.some(t=>t.status==='pending'))return '已经在日历中安排了这次收款提醒，不会重复添加。';
  const dueAt=new Date(`${dayKey(now+86400000)}T09:00:00+08:00`).getTime();
  await taskRequest({type:'save',id:existing?`${id}-${now}`:id,revision:state.revision,title:[...`查看收款：${book.title}`].filter(c=>c.charCodeAt(0)>=32&&!'|[]'.includes(c)).join(''),dueAt,note:`活动 ${book.id}：查看尚未收齐的群收款。只提醒你，不会自动催款；打开知银后核对最新进度。`});
  window.dispatchEvent(new Event('zhiyin-tasks-updated'));
  return '已安排明天上午9点提醒你查看收款，只提醒你，不会自动催款。';
}
export async function finishExpenseReminder(book:ExpenseBook) {
  if(!expenseActivityClosed(book))return;
  const id=await reminderId(book);let state=await taskRequest();
  for(const task of state.tasks.filter(t=>(t.id===id||t.id.startsWith(id+'-'))&&t.status==='pending'))
    state=await taskRequest({type:'status',id:task.id,status:'completed',revision:state.revision});
  window.dispatchEvent(new Event('zhiyin-tasks-updated'));
}
