import {useState} from 'react';
import type {StewardMemoryController} from '../lib/use-steward-memory';
import type {MemoryCategory,MemoryItem} from '../lib/steward-memory';
import './memory-manager.css';
import {ProfileUnderstanding} from './profile-understanding';
const labels:Record<MemoryCategory,string>={preference:'偏好',habit:'习惯',goal:'目标',background:'背景'};
export function MemoryManager({memory}:{memory:StewardMemoryController}) {
  const [text,setText]=useState(''),[category,setCategory]=useState<MemoryCategory>('preference');
  const [editing,setEditing]=useState<string>();
  const [confirmClear,setConfirmClear]=useState(false);
  function edit(item:MemoryItem){setEditing(item.id);setText(item.text);setCategory(item.category);}
  return <div className="memory-manager">
    <label className="memory-toggle"><span>允许记住我的偏好</span><input type="checkbox" role="switch" checked={memory.state.enabled} disabled={memory.busy} onChange={event=>void memory.change({type:'enabled',enabled:event.target.checked})}/></label>
    <p className="memory-help">保存于本机沙箱后端，宁宁与阿衡共用。关闭后不读取或新增，已有记忆保留。</p>
    <details className="memory-help"><summary>记忆如何使用</summary><p>对话时，相关记忆和长期印象会发送给你配置的大模型服务。请勿保存密码、证件或完整账号。</p></details>
    <p className="memory-help">修改、删除或切换开关会重新开始模型上下文，旧聊天仍可查看，但不再发给模型；订阅提醒等业务设置不受影响。</p>
    {memory.error && <p role="alert">{memory.error}<button onClick={()=>void memory.refresh()}>重试</button></p>}
    <ProfileUnderstanding memory={memory}/>
    <h3>你明确告诉我的</h3>
    <form onSubmit={async event=>{event.preventDefault();if(await memory.change({type:'save',id:editing,text,category})){setText('');setEditing(undefined);}}}>
      <label>记忆内容<textarea maxLength={160} value={text} onChange={event=>setText(event.target.value)} placeholder="例如：出差时优先选择高铁" disabled={!memory.state.enabled || memory.busy}/></label>
      <label>分类<select value={category} onChange={event=>setCategory(event.target.value as MemoryCategory)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <p className="memory-help">目标有效期 90 天，其他记忆 1 年；到期不再用于回答，核对后可重新保存。</p>
      <div className="memory-actions"><button disabled={!memory.state.enabled || !text.trim() || memory.busy}>{editing?'保存修改':'添加记忆'}</button>{editing&&<button type="button" onClick={()=>{setEditing(undefined);setText('');}}>取消修改</button>}</div>
    </form>
    <div className="memory-records">{memory.state.items.map(item=><article key={item.id}>
      <p>{item.text}</p><small>{labels[item.category]} · {item.origin==='manual'?'手动保存':'对话确认'} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}{item.expiresAt<=Date.now()?' · 已过期':''}</small>
      {item.quote&&<details><summary>查看来源</summary><p>{item.quote}</p></details>}
      <div className="memory-actions"><button disabled={memory.busy || !memory.state.enabled} onClick={()=>edit(item)} aria-label={`修改记忆：${item.text}`}>修改</button><button disabled={memory.busy} onClick={()=>void memory.change({type:'delete',id:item.id})} aria-label={`删除记忆：${item.text}`}>删除</button></div>
    </article>)}</div>
    {!memory.state.items.length&&<p className="memory-help">还没有确认保存的长期记忆，不会自动导入演示偏好。</p>}
    {(memory.state.items.length>0 || !!memory.state.profile?.items.length) && (confirmClear?<div className="memory-actions"><p className="memory-help">明确记忆和长期印象都会删除，并停止各主题的自动积累。</p><button disabled={memory.busy} onClick={async()=>{if(await memory.change({type:'clear'}))setConfirmClear(false);}}>确认清空全部记忆</button><button onClick={()=>setConfirmClear(false)}>返回</button></div>:<button onClick={()=>setConfirmClear(true)}>清空全部记忆</button>)}
  </div>;
}
