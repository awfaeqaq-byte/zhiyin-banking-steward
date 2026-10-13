import {useId} from 'react';
import {ChartNoAxesColumnIncreasing,ArrowRight} from 'lucide-react';
import {parseCompoundExample} from '../lib/compound-example';
import {StewardReplyContent} from './steward-reply';
const number=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
export function HomeReplyVisual({content,prompt,stewardName}:{content:string;prompt:string;stewardName:string}){
 const example=parseCompoundExample(content,prompt),titleId=useId();
 if(!example)return <StewardReplyContent content={content} stewardName={stewardName}/>;
 return <>
  {example.intro&&<StewardReplyContent content={example.intro} stewardName={stewardName}/>}
  <figure className="home-compound-example" aria-labelledby={titleId}>
   <figcaption><ChartNoAxesColumnIncreasing size={22} aria-hidden="true"/><strong id={titleId}>看看“利滚利”怎样发生</strong></figcaption>
   <p>一次存入 {number(example.principal)} 元，假设每年增长 {example.rateBps/100}%，连续 {example.years} 年。</p>
   <ol className="home-compound-steps">{example.amounts.slice(1).map((value,index)=><li key={index}><span>第 {index+1} 年</span><div>{number(example.amounts[index])}<ArrowRight size={12} aria-hidden="true"/><strong>{number(value)}</strong></div></li>)}</ol>
   <div className="home-compound-plot"><div className="home-compound-bars" style={{gridTemplateColumns:`repeat(${example.amounts.length}, minmax(28px,1fr))`}} aria-hidden="true">{example.amounts.map((value,index)=><div key={index}><span>{number(value)}</span><i style={{height:`${value/example.final*92}px`}}/><small>{index===0?'初始':`${index}年后`}</small></div>)}</div><div className="home-compound-result"><span>{example.years} 年后的示意金额</span><strong>{number(example.final)}<small> 元</small></strong><p>本金增加 {number(example.final-example.principal)} 元<br/>其中比单利多 {number(example.final-example.simple)} 元</p></div></div>
   <p className="home-compound-note">这是算术示意，假设增长率不代表银行或理财产品的实际收益。</p>
  </figure>
  <details className="home-original-explanation"><summary>查看完整文字说明</summary><StewardReplyContent content={content} stewardName={stewardName}/></details>
 </>;
}
