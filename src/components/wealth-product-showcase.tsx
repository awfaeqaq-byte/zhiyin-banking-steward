import {useState} from 'react';
import {ArrowUpRight,ChevronRight,Clock3} from 'lucide-react';
import type {WealthProduct} from '../lib/wealth-operation';

const termGroups=[{id:'all',label:'全部'},{id:'flexible',label:'灵活周转'},{id:'six',label:'半年安排'},{id:'year',label:'一年以上'}] as const;
type TermGroup=typeof termGroups[number]['id'];
const matches=(product:WealthProduct,group:TermGroup)=>group==='all'||(group==='flexible'?product.minTerm===0:group==='six'?product.minTerm>0&&product.minTerm<12:product.minTerm>=12);

export function WealthProductShowcase({products,hasPlan,onOpen,onAsk,stewardName}:{products:WealthProduct[];hasPlan:boolean;onOpen:(id:string)=>void;onAsk:(id:string)=>void;stewardName:string}){
  const [group,setGroup]=useState<TermGroup>('all');
  // A changed plan may remove a group; never leave a stale filter hiding every eligible product.
  const activeGroup=products.some(product=>matches(product,group))?group:'all';
  const visible=products.filter(product=>matches(product,activeGroup));
  return <section className="wealth-product-showcase" aria-label="账户产品">
    <div className="wealth-bank-section-title"><h3>账户产品</h3><small>{hasPlan?'已按你的计划核对':'已按风险等级筛选'}</small></div>
    <div className="wealth-purpose-tabs" role="group" aria-label="按用钱时间查看产品">{termGroups.filter(item=>item.id==='all'||products.some(product=>matches(product,item.id))).map(item=><button type="button" key={item.id} aria-pressed={activeGroup===item.id} onClick={()=>setGroup(item.id)}>{item.label}</button>)}</div>
    <div className="wealth-product-rail" role="group" aria-label="候选产品">{visible.map(product=><article className="wealth-product-pass" key={product.id} data-tone={product.risk} aria-label={product.name}><button className="wealth-product-pass-open" type="button" onClick={()=>onOpen(product.id)}>
      <span className="wealth-product-pass-title"><strong>{product.name}</strong><ArrowUpRight size={20} aria-hidden="true"/></span>
      <span className="wealth-product-pass-description">{product.description}</span>
      <span className="wealth-product-pass-term"><Clock3 size={18} aria-hidden="true"/><span><strong>{product.minTerm===0?'灵活':product.minTerm}</strong>{product.minTerm===0?'可随时赎回':'个月起持有'}</span><i>R{product.risk} · {product.risk===1?'低风险':product.risk===2?'中低风险':'中等风险'}</i></span>
      <span className="wealth-product-duration" aria-hidden="true">{Array.from({length:12},(_,index)=><i key={index} data-filled={index<product.minTerm}/>)}</span>
      <span className="wealth-product-duration-scale" aria-hidden="true"><span>0</span><span>6 个月</span><span>12 个月</span></span>
      <span className="wealth-product-pass-footer"><span>{product.minAmount.toLocaleString('zh-CN')} 元起购 <b>·</b> 申购费 {(product.feeRate*100).toFixed(1)}%</span><ChevronRight size={16} aria-hidden="true"/></span>
    </button><button className="wealth-product-pass-ask" type="button" onClick={()=>onAsk(product.id)} aria-label={`请${stewardName}解读${product.name}`}>请{stewardName}解读<ChevronRight size={14} aria-hidden="true"/></button></article>)}</div>
    {visible.length>0&&<p className="wealth-product-rail-caption">{visible.length>1?`${visible.length} 项产品 · 左右滑动查看`:'查看详情后，再核对投入计划'}</p>}
  </section>;
}
