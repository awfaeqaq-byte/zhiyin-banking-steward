import {taskRequest,dayKey} from './task-calendar';
import {expenseActivityClosed} from './expense-follow-up';
import type {ExpenseBook} from './expense-notebook';
async function reminderId(book:ExpenseBook) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(book.id));
  return 'aa-'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function remindExpenseTomorrow(book:ExpenseBook,now=Date.now()) {
  if(expenseActivityClosed(book))return '已经收齐，不需要再设收款提醒。';
  const id=await reminderId(book),state=await taskRequest();
  const existing=state.tasks.find(t=>t.id===id);
  if(existing?.status==='pending')return '已经在日历中安排了这次收款提醒，不会重复添加。';
  const dueAt=new Date(`${dayKey(now+86400000)}T09:00:00+08:00`).getTime();
  await taskRequest({type:'save',id:existing?`${id}-${now}`:id,revision:state.revision,title:`查看收款：${book.title}`.replace(/[|\[\]\x00-\x1f]/g,''),dueAt,note:`活动 ${book.id}：查看尚未收齐的群收款。只提醒你，不会自动催款；打开知银后核对最新进度。`});
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
