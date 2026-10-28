import {useState,useEffect,useCallback,useRef} from 'react';
import {bankRequest,validBankSnapshot,type BankSnapshot,type BankSettings,type BankCardId} from './bank-transfer';
type Selection={scope:BankCardId};
function olderSnapshot(value:BankSnapshot,current:BankSnapshot){
 return value.revision<current.revision||Boolean(current.cards?.some(card=>{
  const next=value.cards?.find(item=>item.id===card.id);
  return !next||next.revision<card.revision;
 }));
}
export function useBankAccount(cardId?:BankCardId){
 const scope=cardId??'primary';
 const selected=useRef<Selection>({scope});
 if(selected.current.scope!==scope)selected.current={scope};
 const selection=selected.current;
 const [record,setRecord]=useState<{scope:BankCardId;state:BankSnapshot|null}>({scope,state:null});
 const [failure,setFailure]=useState<{scope:BankCardId;error:string}>({scope,error:''});
 const [pending,setPending]=useState<Selection|null>(null);
 const state=record.scope===scope?record.state:null,error=failure.scope===scope?failure.error:'',busy=pending===selection;
 const current=useRef<{scope:BankCardId;state:BankSnapshot}|null>(null);
 const latest=useRef<Partial<Record<BankCardId,BankSnapshot>>>({});
 const accept=useCallback((value:unknown)=>{
  if(selected.current!==selection)return null;
  if(!validBankSnapshot(value)||(value.cardId!==undefined&&value.cardId!==scope)||(scope!=='primary'&&value.cardId!==scope))throw new Error('银行账户数据不可用，请重新读取当前卡片');
  const previous=latest.current[scope],next=previous&&olderSnapshot(value,previous)?previous:value;
  latest.current[scope]=next;current.current={scope,state:next};setRecord({scope,state:next});
  return next;
 },[scope,selection]);
 const refresh=useCallback(async()=>{try{const next=accept(await bankRequest(undefined,cardId));if(selected.current===selection)setFailure({scope,error:''});return next;}catch(e){if(selected.current===selection)setFailure({scope,error:e instanceof Error?e.message:'银行账户加载失败'});return null;}},[accept,cardId,scope,selection]);
 useEffect(()=>{void refresh();const run=()=>void refresh();window.addEventListener('zhiyin-bank-updated',run);window.addEventListener('zhiyin-phone-foreground',run);return()=>{window.removeEventListener('zhiyin-bank-updated',run);window.removeEventListener('zhiyin-phone-foreground',run);};},[refresh]);
 const awaitingTransfer=(state?.allSchedules??state?.schedules)?.some(item=>item.status==='pending')??false;
 useEffect(()=>{if(!awaitingTransfer)return;const timer=setInterval(()=>void refresh(),3000);return()=>clearInterval(timer);},[awaitingTransfer,refresh]);
 const change=async(settings:Omit<BankSettings,'revision'>)=>{
  if(selected.current!==selection||!current.current||current.current.scope!==scope||pending===selection)return false;
  setPending(selection);setFailure({scope,error:''});
  try{accept(await bankRequest({type:'settings',revision:current.current.state.revision,...settings},cardId));window.dispatchEvent(new Event('zhiyin-bank-updated'));return true;}catch(e){await refresh();if(selected.current===selection)setFailure({scope,error:e instanceof Error?e.message:'设置保存失败'});return false;}finally{setPending(value=>value===selection?null:value);}
 };
 return {state,error,busy,refresh,change};
}
