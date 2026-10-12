import type {WechatShare} from '../lib/wechat-message-share';
import './wechat-share-attachment.css';
export function WechatShareAttachment({share,stewardName,disabled,onRemove,onProcess}:{share:WechatShare;stewardName:string;disabled:boolean;onRemove:()=>void;onProcess:()=>void}){
 return <section className="wechat-share-attachment" aria-label="来自微信的所选消息">
  <div><strong>来自微信 · {share.chat.name}</strong><button disabled={disabled} onClick={onRemove}>移除材料</button></div>
  <ol>{share.messages.map(m=><li key={m.id}><span>{m.sender} · <time>{new Date(m.sentAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</time></span><p>{m.text}</p></li>)}</ol>
  {share.instruction&&<p>你的附言：{share.instruction}</p>}
  <p className="wechat-share-hint">可以在下方补充要求。分享仅提供材料，资金和订单操作仍需核对确认。</p>
  <button className="wechat-share-process" disabled={disabled} onClick={onProcess}>交给{stewardName}整理</button>
 </section>;
}
