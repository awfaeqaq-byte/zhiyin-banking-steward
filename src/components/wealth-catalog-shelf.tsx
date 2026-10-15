import {useState} from 'react';
import {ArrowUpRight,ChevronRight} from 'lucide-react';
import {wealthCatalog} from '../lib/wealth-catalog';
import {findFund,fundDataDate} from '../lib/fund-discovery-data';

export function WealthCatalogShelf({onOpenFund,onAskNingning}:{onOpenFund?:(id?:string)=>void;onAskNingning:(id:string)=>void}){
  const [category,setCategory]=useState('全部');
  const catalog=wealthCatalog.filter(item=>item.source==='fund');
  const categories=['全部',...new Set(catalog.map(item=>item.category))];
  const visible=category==='全部'?catalog:catalog.filter(item=>item.category===category);
  return <section className="wealth-catalog" aria-label="基金目录">
    <div className="wealth-bank-section-title"><h3>基金目录 <small>{catalog.length}</small></h3>{onOpenFund&&<button type="button" onClick={()=>onOpenFund()}>筛选与对比<ChevronRight size={16} aria-hidden="true"/></button>}</div>
    <p className="wealth-catalog-intro">和宁宁聊聊你的偏好，也可以先看不同类型的基金。</p>
    <div className="wealth-catalog-categories" role="group" aria-label="基金类型">{categories.map(item=><button key={item} type="button" aria-pressed={category===item} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    <div className="wealth-catalog-list">{visible.map(product=>{
      const fund=findFund(product.id);
      return <article key={product.id}>
        <button type="button" className="wealth-catalog-open" onClick={()=>onOpenFund?onOpenFund(product.id):onAskNingning(product.id)} aria-label={`查看${product.name}`}>
          <span><strong>{product.name}</strong><small>{product.category}{fund?.sector?` · ${fund.sector}`:''}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
        </button>
        <div className="wealth-catalog-row"><span>资料内近 1 年 <strong className={fund&&fund.year<0?'is-negative':''}>{fund?`${fund.year>0?'+':''}${fund.year.toFixed(2)}%`:'待更新'}</strong></span><button type="button" onClick={()=>onAskNingning(product.id)} aria-label={`请宁宁分析${product.name}`}>问宁宁</button></div>
      </article>;
    })}</div>
    <p className="wealth-bank-footnote">资料日期 {fundDataDate} · 静态资料，非实时行情；风险与费用在详情中核对。</p>
  </section>;
}
