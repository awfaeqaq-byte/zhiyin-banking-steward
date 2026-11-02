import type {StewardReply,StewardReplyRequest} from './steward-chat';
import {cancelledTransfer} from './business-continuation';
import {bankRecipients} from './bank-transfer';

/** Queries bind to the current workspace or an explicit receipt, never the newest
 * unrelated transaction with the same amount and recipient. */
export function bankFollowup(request:StewardReplyRequest):StewardReply|null {
 const users=request.messages.filter(m=>m.role==='user'),latest=users.at(-1)?.content||'';
 const history=users.slice(0,-1).map(m=>m.content).join('\n');
 if(!/转账|汇款|给.{0,20}转|从.{0,12}转|预约/.test(history))return null;
 if(/理财|申购|赎回|限额|卡片|订阅|会员/.test(latest))return null;
 const stopped=cancelledTransfer(latest)||users.slice(0,-1).some(m=>cancelledTransfer(m.content));
 if(cancelledTransfer(latest))return {text:'这笔未付款转账已停止准备，原核对入口不再继续使用。本次没有扣款；已完成的交易不会因此撤销。'};
 if(!/状态|结果|先查|核查|核对.*(?:成功|失败)|没看见|没看到|没成功|失败|不要再付|不要重复|是否.*(?:完成|执行)/.test(latest))return null;
 const bank=request.bank;
 if(!bank)return {text:'本轮尚未读到银行状态，请查看原回执和记录；不能推断成功，也不会重新发起付款。',action:{type:'open_transfer_records'}};
 const messages=request.messages.map(m=>m.content).join('\n');
 const linked=(id:string,workspaceId?:string)=>Boolean(request.workspaceId&&workspaceId===request.workspaceId)||messages.includes(id);
 const receipts=bank.transactions.filter(r=>linked(r.id,r.workspaceId));
 if(receipts.length){const r=receipts.slice().sort((a,b)=>b.completedAt-a.completedAt)[0];return {text:`当前事项已完成一次：向${bankRecipients.find(p=>p.id===r.recipientId)?.name}转账${(r.amount/100).toFixed(2)}元，真实回执${r.id}，转后余额${(r.balanceAfter/100).toFixed(2)}元。未准备新的付款或授权。`,action:{type:'open_transfer_records',recipientId:r.recipientId}};}
 const schedules=(bank.schedules??[]).filter(r=>linked(r.id,r.workspaceId));
 if(schedules.length){const s=schedules.slice().sort((a,b)=>b.createdAt-a.createdAt)[0];return {text:`当前事项预约${s.id}：${s.status==='pending'?'已创建待执行，尚未扣款':s.status==='cancelled'?'已取消，不会执行':s.status==='completed'?'已完成，请核对银行回执':'执行失败，请核对记录'}。未重新创建预约。`,action:{type:'open_transfer_records',recipientId:s.recipientId}};}
 const source=users.slice(0,-1).reverse().find(m=>/预约|定时|明天|后天/.test(m.content))?.content;
 return {text:stopped?'这笔已放弃准备，当前没有本事项的转账回执或预约，没有扣款，不再追问金额。':`本事项尚未读到已完成回执或已创建预约，仍是未执行核对。${source?`原交代：${source.slice(0,180)}。`:''}不会拿其他事项的历史记录代替，也未重新发起付款。`,action:{type:'open_transfer_records'}};
}
