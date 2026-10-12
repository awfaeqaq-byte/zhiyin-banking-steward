import {useEffect,useRef,useState} from 'react';
import {finishWechatShare,readWechatInbox,type WechatShare} from './wechat-message-share';
export function useWechatShare(onReceive:()=>void){
 const [pending,setPending]=useState<WechatShare[]>([]),[error,setError]=useState('');
 const receive=useRef(onReceive);receive.current=onReceive;
 useEffect(()=>{
  const reload=()=>{try{const shares=readWechatInbox();setPending(shares);setError('');if(shares.length)receive.current();}catch(cause){setError(cause instanceof Error?cause.message:'微信分享未能载入');}};
  const failed=(event:Event)=>setError(String((event as CustomEvent).detail||'微信分享未能保存'));
  reload();window.addEventListener('zhiyin-wechat-share',reload);window.addEventListener('zhiyin-wechat-share-error',failed);
  return()=>{window.removeEventListener('zhiyin-wechat-share',reload);window.removeEventListener('zhiyin-wechat-share-error',failed);};
 },[]);
 return {share:pending[0],error,done:(id:string)=>{try{finishWechatShare(id);setPending(readWechatInbox());setError('');}catch(cause){setError(cause instanceof Error?cause.message:'分享状态未能保存，请勿重复提交。');}}};
}
