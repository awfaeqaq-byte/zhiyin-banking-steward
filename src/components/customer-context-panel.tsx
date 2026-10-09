import {useEffect,useState} from 'react';
import {
  customerExperience,
  customerNeedLabels,
  customerSegmentLabels,
  type CustomerNeed,
  type CustomerSegment,
} from '../lib/customer-context';
import type {StewardMemoryController} from '../lib/use-steward-memory';

export function CustomerContextPanel({memory}:{memory:StewardMemoryController}) {
  const saved=memory.state.customerContext;
  const [enabled,setEnabled]=useState(saved?.enabled ?? false);
  const [segment,setSegment]=useState<CustomerSegment>(saved?.primarySegment ?? 'general');
  const [needs,setNeeds]=useState<CustomerNeed[]>(saved?.needs ?? []);
  const [savedMessage,setSavedMessage]=useState('');
  useEffect(()=>{
    setEnabled(saved?.enabled ?? false);
    setSegment(saved?.primarySegment ?? 'general');
    setNeeds(saved?.needs ?? []);
  },[saved]);
  const disabled=memory.busy || !memory.state.enabled;
  const preview=customerExperience[segment];
  return <section className="customer-context-panel" aria-label="服务偏好">
    <h3>我的服务偏好</h3>
    <p className="memory-help">由你主动选择，只调整账单、理财和卡片建议的展示重点。不会推断收入、身份或风险等级。</p>
    <form onSubmit={async event=>{
      event.preventDefault();setSavedMessage('');
      if(await memory.change({type:'customer-context',customerContext:{enabled,primarySegment:segment,needs}}))setSavedMessage('服务偏好已保存。');
    }}>
      <label className="memory-toggle"><span>按我确认的需求调整建议重点</span><input type="checkbox" role="switch" checked={enabled} disabled={disabled} onChange={event=>setEnabled(event.target.checked)}/></label>
      <label>主客群<select aria-label="主客群" value={segment} disabled={disabled || !enabled} onChange={event=>setSegment(event.target.value as CustomerSegment)}>{Object.entries(customerSegmentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <fieldset className="customer-needs" disabled={disabled || !enabled}>
        <legend>希望重点帮助我的事情</legend>
        {Object.entries(customerNeedLabels).map(([key,label])=><label key={key}><input type="checkbox" checked={needs.includes(key as CustomerNeed)} onChange={event=>setNeeds(current=>event.target.checked?[...current,key as CustomerNeed]:current.filter(item=>item!==key))}/><span>{label}</span></label>)}
      </fieldset>
      {enabled&&<section className="segment-preview" aria-label="个性化功能预览">
        <div className="segment-preview-heading"><strong>{customerSegmentLabels[segment]}功能重点</strong><span>可随时修改</span></div>
        {([
          ['账单分析',preview.bills],
          ['理财操作',preview.investment],
          ['卡片管理',preview.cards],
        ] as const).map(([title,items])=><article key={title}><strong>{title}</strong><ul>{items.map(item=><li key={item}>{item}</li>)}</ul></article>)}
      </section>}
      <p className="memory-help">客群不会替代风险测评，也不会减少转账、申购或卡片操作的确认步骤。</p>
      <button disabled={disabled}>保存服务偏好</button>
      {savedMessage&&<p className="memory-help" role="status">{savedMessage}</p>}
    </form>
  </section>;
}
