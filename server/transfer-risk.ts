import type {BankDraft,BankSnapshot} from '../src/lib/bank-transfer';
import {assessTransferRisk} from '../src/lib/transfer-risk';

/** Bind acknowledgement to this server-issued draft, never to a client-provided boolean. */
export function requireTransferReview(state:BankSnapshot,draft:BankDraft,now:number,token?:string){
 const current=assessTransferRisk(state,draft,now,{excludeId:draft.id});
 if(!current.large&&!current.matches.length)return;
 if(!draft.review||!token||token!==draft.review.token)throw new Error('请先核对大额或重复转账提醒，再明确确认这笔转账');
 if(current.large&&!draft.review.large||current.matches.some(match=>!draft.review!.matches.some(old=>old.id===match.id&&old.kind===match.kind&&old.amount===match.amount)))throw new Error('相似转账记录已变化，请返回修改并重新核对');
}
