import {useEffect,useRef} from 'react';
import {connectJudgeEntry,type JudgeOpenResult} from './judge-bridge';
import type {JudgeStep} from './judge-scenarios';
export function useJudgeEntry(onOpen:(step:JudgeStep)=>JudgeOpenResult){
  const current=useRef(onOpen);current.current=onOpen;
  useEffect(()=>{
    if(window.parent===window)return;
    return connectJudgeEntry(window,window.parent,step=>current.current(step));
  },[]);
}
