import {useWechatStrings} from '../hooks/useWechatStrings';
import {useWechatGestures} from '../hooks/useWechatGestures';
import {useWechatStore} from '../state';
import {NINGNING_WXID} from '../chat-ai/zhiyin';
import type {ChatSession} from '../types';

export function NingningChatTools({chat,myWxid,pending,selectMessage}:{chat:ChatSession;myWxid:string;pending:boolean;selectMessage:(id:string)=>void}){
 const t=useWechatStrings(),{bindTap}=useWechatGestures();
 const failed=useWechatStore(s=>s._temp.ningningReplyFailed);
 const last=chat.messages.filter(m=>m.type==='text').at(-1);
 const lastUser=chat.messages.filter(m=>m.type==='text'&&m.senderId===myWxid).at(-1);
 return <section className="rounded-lg bg-app-surface px-3 py-3 text-[13px] leading-5" aria-label={t.ningning_identity}>
  <strong className="block text-[#007d7c]">{t.ningning_identity}</strong>
  <p className="mt-1 text-[#66757b]">{t.ningning_channel_hint}</p>
  {!pending&&last?.senderId===myWxid&&<div className="mt-2" role="status"><p>{failed?t.ningning_failed:t.ningning_unfinished}</p><button className="min-h-[44px] text-[#007d7c]" {...bindTap<HTMLButtonElement>({kind:'action',id:'chat.ningning.retry'},{params:{id:NINGNING_WXID},onTrigger:()=>useWechatStore.getState().retryNingningReply()})}>{t.ningning_retry}</button></div>}
  {lastUser&&<><button className="mt-2 min-h-[44px] w-full rounded-md bg-[#e7f4ef] px-3 text-[#006b62] disabled:opacity-50" disabled={pending} {...bindTap<HTMLButtonElement>('chat.messageShare.select',{params:{id:NINGNING_WXID},onTrigger:()=>selectMessage(lastUser.id)})}>{t.ningning_continue}</button><p className="mt-1 text-[12px] text-[#66757b]">{t.ningning_select_hint}</p></>}
 </section>;
}
