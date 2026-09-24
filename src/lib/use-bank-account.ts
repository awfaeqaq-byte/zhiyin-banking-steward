import {useState,useEffect,useCallback,useRef} from 'react';
import {bankRequest,validBankSnapshot,type BankSnapshot,type BankSettings} from './bank-transfer';
export function useBankAccount(){
 const [state,setState]=useState<BankSnapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const current=useRef(state);
 const accept=useCallback((value:unknown)=>{if(!validBankSnapshot(value))throw new Error('银行账户数据不可用');if(!current.current || value.revision>=current.current.revision){current.current=value;setState(value);}return value;},[]);
 const refresh=useCallback(async()=>{try{const next=accept(await bankRequest());setError('');return next;}catch(e){setError(e instanceof Error?e.message:'银行账户加载失败');return null;}},[accept]);
 useEffect(()=>{void refresh();const run=()=>void refresh();window.addEventListener('zhiyin-bank-updated',run);window.addEventListener('zhiyin-phone-foreground',run);return()=>{window.removeEventListener('zhiyin-bank-updated',run);window.removeEventListener('zhiyin-phone-foreground',run);};},[refresh]);
 const change=async(settings:Omit<BankSettings,'revision'>)=>{
  if(!current.current || busy)return false;
  setBusy(true);setError('');
  try{accept(await bankRequest({type:'settings',revision:current.current.revision,...settings}));return true;}catch(e){await refresh();setError(e instanceof Error?e.message:'设置保存失败');return false;}finally{setBusy(false);}
 };
 return {state,error,busy,refresh,change};
}
