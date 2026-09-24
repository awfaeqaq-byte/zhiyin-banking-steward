import {useCallback,useEffect,useRef,useState} from 'react';
import {emptyMemory,validMemoryState,type MemoryCommand,type MemoryState} from './steward-memory';
function resetContext(){
  try {
    const messages=JSON.parse(localStorage.getItem('zhiyin-steward-chat-v3') || '[]');
    localStorage.setItem('zhiyin-steward-context-cutoff',Array.isArray(messages)?messages.at(-1)?.id || '':'');
  }catch{/* History stays intact even if storage is unavailable. */}
  window.dispatchEvent(new Event('zhiyin-memory-context-reset'));
}
export function useStewardMemory() {
  const [state,setState]=useState(emptyMemory);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const current=useRef(state);
  const accept=useCallback((next:MemoryState)=>{
    if(next.revision>=current.current.revision){current.current=next;setState(next);}
    return current.current;
  },[]);
  const refresh=useCallback(async()=>{
    try {
      const response=await fetch('/api/zhiyin/memory',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      const data=await response.json();
      if(!response.ok || !validMemoryState(data))throw new Error('长期记忆服务暂时不可用，本次不会读取记忆');
      if(data.revision<current.current.revision)return current.current;
      try {
        const revision=localStorage.getItem('zhiyin-memory-revision');
        if(revision===null?data.revision>0:revision!==String(data.revision))resetContext();
        localStorage.setItem('zhiyin-memory-revision',String(data.revision));
      }catch{/* Persistence is optional; server remains authoritative. */}
      setError('');return accept(data);
    }catch(error){setError(error instanceof Error?error.message:'记忆不可用');return null;}
  },[accept]);
  useEffect(()=>{void refresh();},[refresh]);
  const change=useCallback(async(command:Omit<MemoryCommand,'revision'>)=>{
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/zhiyin/memory',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Memory':'1'},body:JSON.stringify({...command,revision:current.current.revision}),signal:AbortSignal.timeout(5000)});
      const data=await response.json();
      if(!response.ok || !validMemoryState(data))throw new Error(data.error || '保存失败，请重试');
      accept(data);
      try{localStorage.setItem('zhiyin-memory-revision',String(data.revision));}catch{/* Server save succeeded. */}
      if((command.type!=='save' || command.id) && !(command.type==='profile' && command.profileAction==='observe')) {
        // Do not reintroduce forgotten/corrected facts from old raw conversations.
        resetContext();
      }
      return true;
    }catch(error){await refresh();setError(error instanceof Error?error.message:'保存失败');return false;}
    finally{setBusy(false);}
  },[accept,refresh]);
  return {state,error,busy,refresh,change,current};
}
export type StewardMemoryController=ReturnType<typeof useStewardMemory>;
