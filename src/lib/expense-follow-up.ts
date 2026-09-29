import {calculateGroupAA,type AACollection} from './group-aa';
import type {ExpenseBook,ExpenseBatch} from './expense-notebook';
const money=(n:number)=>`¥${(n/100).toFixed(2)}`;
export function collectionProgress(book:ExpenseBook,batch:ExpenseBatch,c:AACollection) {
  const expected=calculateGroupAA(book.group,batch.plan);
  if(!c || c.id!==batch.id || c.groupId!==book.group.id ||
    !['pending','completed','cancelled'].includes(c.status) ||
    JSON.stringify(c.plan)!==JSON.stringify(batch.plan) ||
    c.total!==expected.total || c.collectAmount!==expected.collectAmount || c.selfAmount!==expected.selfAmount ||
    !Array.isArray(c.members) || c.members.length!==expected.members.length ||
    new Set(c.members.map(m=>m?.id)).size!==c.members.length ||
    !expected.members.every(m=>c.members.some(x=>x.id===m.id&&x.amount===m.amount&&Boolean(x.self)===Boolean(m.self)&&typeof x.paid==='boolean')))
    throw new Error('微信收款回执与原分摊不一致，请重新核对');
  const members=expected.members.filter(m=>!m.self&&m.amount>0).map(m=>({...m,paid:c.members.find(x=>x.id===m.id)!.paid}));
  const paid=members.filter(m=>m.paid).reduce((sum,m)=>sum+m.amount,0);
  const remaining=expected.collectAmount-paid;
  if(c.status==='completed'&&remaining!==0)throw new Error('微信回执标记收齐，但成员付款尚未齐全');
  return {members,paid,remaining,cancelled:c.status==='cancelled',complete:c.status!=='cancelled'&&remaining===0};
}
export function expenseActivityClosed(book:ExpenseBook) {
  return book.batches.length>0 && book.entries.every(e=>!!e.batchId) &&
    book.batches.every(b=>b.status==='published'&&!!b.receipt&&collectionProgress(book,b,b.receipt).complete);
}
export function expenseProgressText(book:ExpenseBook) {
  if(!book.batches.length)return '这次活动还没有发起群收款。';
  const text=book.batches.map((b,i)=>{
    const prefix=book.batches.length>1?`第${i+1}笔收款：`:'';
    if(b.status==='prepared')return prefix+'尚未完成微信确认，不能当作已收款。';
    if(!b.receipt)return prefix+'未取得这笔微信收款记录，暂时无法确认进度。';
    const p=collectionProgress(book,b,b.receipt);
    if(p.cancelled)return prefix+`微信已取消这笔收款，不能算作收齐；取消前已付 ${money(p.paid)}，退款情况请在微信核对。`;
    if(p.complete)return prefix+`已收齐 ${money(p.paid)}。`;
    const paid=p.members.filter(m=>m.paid).map(m=>m.name).join('、');
    return prefix+`${paid?`${paid}已付；`:''}还差${p.members.filter(m=>!m.paid).map(m=>`${m.name} ${money(m.amount)}`).join('、')}。`;
  }).join('\n');
  return text+(expenseActivityClosed(book)?'\n这次活动已结清归档，消费与分摊依据仍然保留。':book.entries.some(e=>!e.batchId)?'\n另有消费尚未发起结算。':'');
}
