import {useId,useState,type CSSProperties} from 'react';
import {ArrowDownRight,ArrowUpRight,ChevronDown,ChevronRight,ReceiptText} from 'lucide-react';
import type {BillAnalysis} from '../lib/bill-analysis';
import {formatCny} from '../lib/financial-connections';
import type {BillFocus} from '../lib/steward-ui';
import './bill-spending-visual.css';

type Props={
 bill:BillAnalysis;disabled?:boolean;selectedCategory?:string;onSelectCategory?:(category:string)=>void;
 onInspect?:(focus:BillFocus)=>void;stewardName?:string;showOverview?:boolean;showCategories?:boolean;showTrend?:boolean;
};

const categoryColors:Record<string,string>={
 餐饮:'#087f78',交通:'#507f99',购物:'#9b8050',生活缴费:'#718f72',娱乐:'#797692',医疗:'#a27774',
 教育:'#887c5b',住房:'#526f67',旅行:'#5b8d91',未分类:'#7c898e',其他:'#7c898e',
};
const extraColors=['#526f67','#507f99','#9b8050','#797692','#a27774','#718f72'];
function colorFor(name:string){
 if(categoryColors[name])return categoryColors[name];
 let hash=0;for(const letter of name)hash=(hash*31+letter.charCodeAt(0))>>>0;
 return extraColors[hash%extraColors.length];
}
function share(amount:number,total:number){
 if(total<=0)return '0%';
 const value=amount/total*100;
 return value>0&&value<.1?'不足 0.1%':`${Number(value.toFixed(1))}%`;
}

/** A view of the verified analysis, never a second ledger or model-generated chart. */
export function BillSpendingVisual({bill,disabled=false,selectedCategory='',onSelectCategory,onInspect,stewardName='宁宁',showOverview=true,showCategories=true,showTrend=false}:Props){
 const scope=[bill.from,bill.to,...bill.sources].join(':');
 const [expansion,setExpansion]=useState({scope:'',open:false});
 const expanded=expansion.scope===scope&&expansion.open;
 const detailId=useId();
 const categoriesId=useId();
 const ready=!bill.needsClarification&&bill.sources.length>0&&bill.count>0;
 const categories=bill.categories.filter(category=>category.amount>0&&Number.isFinite(category.amount));
 const selected=categories.find(category=>category.name===selectedCategory);
 const visible=expanded?categories:categories.filter((category,index)=>index<3||category.name===selected?.name);
 const purchases=selected?bill.transactions.filter(row=>row.category===selected.name&&row.amount<0&&row.kind!=='transfer'):[];
 const trend=!bill.coverageIncomplete?bill.diagnosis.trend:null;
 const comparable=trend&&Number.isFinite(trend.previousExpense)&&trend.previousExpense>0&&Number.isFinite(trend.currentExpense)&&trend.currentExpense>=0&&Number.isFinite(trend.changePercent);
 const trendMax=comparable?Math.max(trend.previousExpense,trend.currentExpense):0;

 if(!ready)return <div className="bill-spending-visual"><p className="bill-visual-note">{bill.needsClarification?'确认日期范围后，再整理消费结构。':!bill.sources.length?'授权读取账单后，再整理消费结构。':'这段时间未返回交易记录，暂不能判断消费情况。'}</p></div>;

 return <div className="bill-spending-visual">
  {showOverview&&<dl className="bill-visual-overview">
   <div><dt>{bill.coverageIncomplete?'已返回消费小计':'消费支出'}</dt><dd>{formatCny(bill.expense)}</dd></div>
   <div><dt>{bill.coverageIncomplete?'已返回普通入账':'普通入账'}</dt><dd>{formatCny(bill.income)}</dd></div>
  </dl>}

  {showCategories&&<section className="bill-visual-composition" aria-label="消费构成">
   <div className="bill-visual-heading"><h3>钱花在哪里</h3><span>{bill.coverageIncomplete?'按已返回消费计算':'按消费金额计算'}</span></div>
   {bill.expense>0&&categories.length>0?<>
    <div className="bill-visual-stack" role="img" aria-label={`消费金额构成：${categories.map(category=>`${category.name} ${share(category.amount,bill.expense)}`).join('，')}`}>
     {categories.map(category=><span key={category.name} data-selected={selected?selected.name===category.name:undefined} style={{flexBasis:`${category.amount/bill.expense*100}%`,backgroundColor:colorFor(category.name)}}/>) }
    </div>
    <div id={categoriesId} className="bill-visual-category-list" role="group" aria-label="选择消费分类">
     {visible.map(category=><button type="button" key={category.name} className="bill-visual-category" style={{'--bill-category-color':colorFor(category.name)} as CSSProperties} disabled={disabled||!onSelectCategory} aria-label={`查看${category.name}交易 ${formatCny(category.amount)}`} aria-pressed={selected?.name===category.name} aria-controls={detailId} onClick={()=>onSelectCategory?.(selected?.name===category.name?'':category.name)}>
      <span className="bill-visual-category-name"><i aria-hidden="true"/>{category.name}</span>
      <span className="bill-visual-category-value"><strong>{formatCny(category.amount)}</strong><small>{share(category.amount,bill.expense)}</small></span>
      <ChevronRight size={15} aria-hidden="true"/>
     </button>)}
    </div>
    {categories.length>3&&<button type="button" className="bill-visual-expand" disabled={disabled} aria-controls={categoriesId} aria-expanded={expanded} onClick={()=>setExpansion({scope,open:!expanded})}>{expanded?'收起分类':`展开全部 ${categories.length} 类`}<ChevronDown size={15} aria-hidden="true"/></button>}
   </>:<p className="bill-visual-note">未返回消费类支出，暂不展示消费构成。</p>}
   <div id={detailId}>
    {selected&&<section className="bill-visual-evidence" aria-label={`${selected.name}交易`}>
     <div className="bill-visual-heading"><h3>{selected.name}交易</h3><span>{purchases.length} 笔{purchases.length>3?' · 最近 3 笔':''}</span></div>
     {purchases.length>0?<ul>{purchases.slice(0,3).map(row=><li key={`${row.providerKey}:${row.id}`}><button type="button" disabled={disabled||!onInspect} aria-label={`请${stewardName}解释${row.title} ${formatCny(-row.amount)}`} onClick={()=>onInspect?.({provider:row.providerKey,id:row.id})}>
      <ReceiptText size={16} aria-hidden="true"/><span><strong>{row.title}</strong><small>{row.occurredAt} · {row.providerName}</small></span><b>{formatCny(-row.amount)}</b><ChevronRight size={14} aria-hidden="true"/>
     </button></li>)}</ul>:<p className="bill-visual-note">该分类的消费明细暂未返回，不能补充交易依据。</p>}
     {purchases.length>0&&onInspect&&<p className="bill-visual-note">点一笔，请{stewardName}结合这笔交易解读。</p>}
    </section>}
   </div>
  </section>}

  {showTrend&&<section className="bill-visual-comparison" aria-label="前期消费对照">
   {comparable?<>
    <div className="bill-visual-heading"><h3>前期对照</h3><span className="bill-visual-change">{trend.changePercent>0?<ArrowUpRight size={15} aria-hidden="true"/>:trend.changePercent<0?<ArrowDownRight size={15} aria-hidden="true"/>:null}{trend.changePercent===0?'已返回金额持平':`${trend.changePercent>0?'增加':'减少'} ${Math.abs(trend.changePercent)}%`}</span></div>
    <div className="bill-visual-comparison-rows">
     <div><span>前期</span><span className="bill-visual-comparison-bar" aria-hidden="true"><i style={{width:`${trend.previousExpense/trendMax*100}%`}}/></span><strong>{formatCny(trend.previousExpense)}</strong></div>
     <div><span>本期</span><span className="bill-visual-comparison-bar" aria-hidden="true"><i style={{width:`${trend.currentExpense/trendMax*100}%`}}/></span><strong>{formatCny(trend.currentExpense)}</strong></div>
    </div>
    <p className="bill-visual-note">前期 {trend.previousFrom} — {trend.previousTo}，按等长时段对照；两期记录完整性未知。</p>
   </>:<p className="bill-visual-note">{bill.coverageIncomplete?'记录尚未补全，暂不能判断消费趋势。':'前期记录不足，暂不能判断消费趋势。'}</p>}
  </section>}
 </div>;
}
