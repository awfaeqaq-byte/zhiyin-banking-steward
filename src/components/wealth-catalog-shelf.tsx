import {useState} from 'react';
import {ArrowUpRight,ChevronRight,Layers3} from 'lucide-react';
import {wealthCatalog} from '../lib/wealth-catalog';
import {findFund,fundDataDate} from '../lib/fund-discovery-data';

export function WealthCatalogShelf({onOpenFund,onAskNingning,stewardName='宁宁'}:{stewardName?:string;onOpenFund?:(id?:string)=>void;onAskNingning:(id:string)=>void}){
  const [category,setCategory]=useState('全部');
  const [expanded,setExpanded]=useState(false);
  const catalog=wealthCatalog.filter(item=>item.source==='fund');
  const categories=['全部',...new Set(catalog.map(item=>item.category))];
  const filtered=category==='全部'?catalog:catalog.filter(item=>item.category===category);
  // Default previews span different categories; they are browsing entry points, not a return ranking.
  const previews=['nasdaq-a','medical','bond'].map(id=>catalog.find(item=>item.id===id)!).filter(Boolean);
  const visible=expanded?filtered:category==='全部'?previews:filtered.slice(0,3);
  return <section className="wealth-catalog" aria-label="基金目录">
    <div className="wealth-bank-section-title"><h3>基金目录 <small>{catalog.length}</small></h3>{onOpenFund&&<button type="button" onClick={()=>onOpenFund()}>全部与筛选<ChevronRight size={16} aria-hidden="true"/></button>}</div>
    <p className="wealth-catalog-intro">从关注的方向开始，资料与自选同步到基金筛选。</p>
    <div className="wealth-catalog-categories" role="group" aria-label="基金类型">{categories.map(item=><button key={item} type="button" aria-pressed={category===item} onClick={()=>{setCategory(item);setExpanded(false);}}>{item}</button>)}</div>
    <div className="wealth-catalog-list">{visible.map((product,index)=>{
      const fund=findFund(product.id);
      return <article key={product.id} className={index===0?'wealth-catalog-feature':'wealth-catalog-entry'}>
        {index===0&&<div className="wealth-catalog-feature-topic"><span><Layers3 size={17} aria-hidden="true"/>{fund?.sector||product.category}</span><small>{product.category}</small></div>}
        <button type="button" className="wealth-catalog-open" onClick={()=>onOpenFund?onOpenFund(product.id):onAskNingning(product.id)} aria-label={`查看${product.name}`}>
          <span><strong>{product.name}</strong><small>{product.category}{fund?.sector?` · ${fund.sector}`:''}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
        </button>
        <div className="wealth-catalog-row"><span>资料内近 1 年 <strong className={fund&&fund.year<0?'is-negative':''}>{fund?`${fund.year>0?'+':''}${fund.year.toFixed(2)}%`:'待更新'}</strong></span><button type="button" onClick={()=>onAskNingning(product.id)} aria-label={`请${stewardName}分析${product.name}`}>问{stewardName}<ChevronRight size={14} aria-hidden="true"/></button></div>
      </article>;
    })}</div>
    {filtered.length>3&&<button className="wealth-catalog-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起目录':`查看全部 ${filtered.length} 项基金`}<ChevronRight size={16} aria-hidden="true"/></button>}
    <p className="wealth-bank-footnote">资料日期 {fundDataDate} · 非实时行情。基金在此提供资料与自选，风险、费用与交易状态需在详情核验。</p>
  </section>;
}
