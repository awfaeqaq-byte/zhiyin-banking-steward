import {useState} from 'react';
import {profileTopics,type ProfileTopic} from '../lib/steward-profile';
import type {StewardMemoryController} from '../lib/use-steward-memory';
export function ProfileUnderstanding({memory}:{memory:StewardMemoryController}) {
  const [editing,setEditing]=useState<ProfileTopic|null>(null),[text,setText]=useState('');
  const profile=memory.state.profile;
  const disabled=memory.busy || !memory.state.enabled || !profile?.enabled;
  return <section className="profile-understanding" aria-label="长期印象">
    <h3>我对你的理解</h3>
    <label className="memory-toggle"><span>从对话积累长期印象</span><input type="checkbox" role="switch" disabled={memory.busy || !memory.state.enabled} checked={!!profile?.enabled} onChange={e=>void memory.change({type:'profile',profileAction:'enable',enabled:e.target.checked})}/></label>
    <p className="memory-help">开启后，日常偏好会形成暂定印象，无需逐条确认。你可以纠正；未经确认的理解不会当成事实。</p>
    <div className="memory-records">{profile?.items.map(item=><article key={item.topic}>
      <small>{profileTopics[item.topic]} · {item.expiresAt<=Date.now()?'已淡化，不用于回答':item.status==='confirmed'?'你已确认':'暂定理解'}</small>
      <p>{item.text}</p>
      <details><summary>为什么这样理解</summary><p>{item.quote}</p><small>更新于 {new Date(item.updatedAt).toLocaleDateString('zh-CN')} · {item.status==='tentative'?'90 天':'1 年'}后需重新核对</small></details>
      {editing===item.topic?<form onSubmit={async e=>{e.preventDefault();if(await memory.change({type:'profile',profileAction:'correct',topic:item.topic,text}))setEditing(null);}}>
        <label>你的实际偏好<textarea maxLength={100} value={text} onChange={e=>setText(e.target.value)}/></label>
        <div className="memory-actions"><button disabled={disabled || !text.trim()}>保存理解</button><button type="button" onClick={()=>setEditing(null)}>取消纠正</button></div>
      </form>:<div className="memory-actions">
        {item.status==='tentative'&&<button disabled={disabled} onClick={()=>void memory.change({type:'profile',profileAction:'correct',topic:item.topic,text:item.text})}>理解得对</button>}
        <button disabled={disabled} aria-label={`纠正：${item.text}`} onClick={()=>{setEditing(item.topic);setText(item.text);}}>不太对，纠正一下</button>
        <button disabled={memory.busy} aria-label={`忘记：${item.text}`} onClick={()=>void memory.change({type:'profile',profileAction:'forget',topic:item.topic})}>忘记</button>
      </div>}
    </article>)}</div>
    {!profile?.items.length&&<p className="memory-help">还没有形成长期印象，不会预设你是什么样的人。</p>}
    {!!profile?.ignored.length&&<details><summary>已停止积累的主题</summary><p className="memory-help">只保留主题开关，不保留已忘记的内容。恢复后从新对话开始了解。</p><div className="memory-actions">{profile.ignored.map(topic=><button key={topic} disabled={disabled} onClick={()=>void memory.change({type:'profile',profileAction:'resume',topic})}>恢复{profileTopics[topic]}</button>)}</div></details>}
  </section>;
}
