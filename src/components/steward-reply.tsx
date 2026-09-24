import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ArrowUpRight, ReceiptText } from 'lucide-react';
import type { BillAnalysis } from '../lib/bill-analysis';
import { formatCny } from '../lib/financial-connections';
import './steward-reply.css';

function emphasis(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part,index)=>part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2,-2)}</strong> : part);
}

function ReplyTable({headers,rows}:{headers:string[];rows:string[][]}) {
  const [expanded,setExpanded]=useState(false);
  const id=useId();
  const columns=Math.max(headers.length,...rows.map(row=>row.length));
  const labels=Array.from({length:columns},(_,i)=>headers[i] || '内容');
  const visible=expanded ? rows : rows.slice(0,4);
  return <div className="reply-table">
    <div className="reply-table-scroll" role="region" aria-label="回复中的明细表，可横向滚动" tabIndex={0}>
      <table id={id}>
        <thead><tr>{labels.map((label,i)=><th scope="col" key={i}>{emphasis(label)}</th>)}</tr></thead>
        <tbody>{visible.map((cells,i)=><tr key={i}>{labels.map((label,j)=><td key={j} className={/金额|费用|支出|收入/.test(label)?'reply-table-money':undefined}>{emphasis(cells[j] || '—')}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {rows.length>4 && <button type="button" className="reply-table-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{expanded?'收起记录':`展开其余 ${rows.length-4} 条`}<ChevronDown size={14} aria-hidden="true"/></button>}
  </div>;
}

/** Render a deliberately small, safe text subset. Never interpret model HTML. */
function ReplyText({content}: {content:string}) {
  const lines=content.replace(/\[\[evidence:\d+\]\]/g,'').split('\n');
  const blocks: ReactNode[]=[];
  let list: string[]=[];
  let table:string[][]=[];
  const flushTable=()=>{
    if(!table.length)return;
    const [headers,...rows]=table;
    blocks.push(<ReplyTable key={`table-${blocks.length}`} headers={headers} rows={rows}/>);
    table=[];
  };
  const flush=()=>{if(list.length){blocks.push(<ul key={`list-${blocks.length}`}>{list.map((line,i)=><li key={i}>{emphasis(line)}</li>)}</ul>);list=[];}};
  lines.forEach((line,index)=>{
    if(/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const cells=line.trim().slice(1,-1).split('|').map(cell=>cell.trim());
      if(!cells.every(cell=>/^:?-{3,}:?$/.test(cell)))table.push(cells);
      return;
    }
    flushTable();
    const item=line.match(/^\s*(?:[-*•]|\d+[.)、])\s+(.+)/);
    if(item){list.push(item[1]);return;}
    flush();
    if(!line.trim())return;
    if(/^#{1,6}\s/.test(line))blocks.push(<h3 key={index}>{emphasis(line.replace(/^#{1,6}\s+/,''))}</h3>);
    else blocks.push(<p key={index}>{emphasis(line)}</p>);
  });
  flush();
  flushTable();
  return <div className="reply-prose">{blocks}</div>;
}

function EvidenceReply({content,bill}:{content:string;bill:BillAnalysis}) {
  const shown=new Set<number>();
  return <>{content.split(/(\[\[evidence:\d+\]\])/g).map((part,index)=>{
    const marker=part.match(/^\[\[evidence:(\d+)\]\]$/);
    if(!marker)return part.trim() ? <ReplyText key={index} content={part}/> : null;
    const id=Number(marker[1]);
    const finding=id<=3 ? bill.diagnosis.findings[id-1] : undefined;
    if(!finding || shown.has(id))return null;
    shown.add(id);
    return <figure className="bill-inline-evidence" key={index}>
      <figcaption>核对交易依据</figcaption>
      <ul className="bill-transactions">{finding.evidence.map(row=><li key={`${row.providerKey}:${row.id}`}>
        <div><strong>{row.title}</strong><small>{row.occurredAt} · {row.providerName}</small></div><span>{formatCny(-row.amount)}</span>
      </li>)}</ul>
      <details className="bill-disclosure"><summary><span>为什么列出这几笔</span><ChevronDown size={16} aria-hidden="true"/></summary><p className="bill-note">{finding.detail}</p></details>
    </figure>;
  })}</>;
}

export function StewardReplyContent({content,bill,stewardName}: {content:string;bill?:BillAnalysis;stewardName:string}) {
  if(!bill || bill.needsClarification || !bill.sources.length || !bill.count) return <ReplyText content={content}/>;
  const leading=bill.categories[0];
  const percent=leading && bill.expense ? Math.round(leading.amount/bill.expense*100) : 0;
  const categories=bill.categories.slice(0,4);
  const other=bill.categories.slice(4).reduce((sum,item)=>sum+item.amount,0);
  return <section className="bill-reply" aria-label="账单分析结果">
    <header className="bill-reply-heading">
      <h2>这段支出，帮你理了一下</h2>
      <p>{bill.from} — {bill.to}</p>
      <span className="bill-source">{bill.sources.join(' · ')}</span>
    </header>
    <section className="bill-advice" aria-label={`${stewardName}的建议`}>
      <EvidenceReply content={content} bill={bill}/>
    </section>
    {bill.diagnosis.trend && <details className="bill-disclosure"><summary><span>查看前期对照</span><ChevronDown size={16} aria-hidden="true"/></summary><section className="bill-trend"><h3>前期对照</h3><p>已返回消费金额{bill.diagnosis.trend.changePercent===0 ? '持平' : `${bill.diagnosis.trend.changePercent>0?'增加':'减少'} ${Math.abs(bill.diagnosis.trend.changePercent)}%`}。</p><small>对照 {bill.diagnosis.trend.previousFrom} — {bill.diagnosis.trend.previousTo}。{bill.diagnosis.trend.label}；记录完整性未知。</small></section></details>}
    <details className="bill-disclosure bill-summary-evidence">
    <summary><span>查看金额与消费分布</span><ChevronDown size={16}/></summary>
    <div className="bill-verdict">
      <p>{leading ? <><strong>{leading.name}</strong>是主要消费，占支出的 {percent}%。</> : '这段时间的已返回记录中，没有消费支出。'}</p>
      <div className="bill-primary-amount"><span>消费支出</span><strong>{formatCny(bill.expense)}</strong></div>
      <div className="bill-inflow"><span>普通入账</span><strong>{formatCny(bill.income)}</strong><small>不含退款和转入</small></div>
    </div>
    {categories.length>0 && <div className="bill-distribution">
      <h3>消费分布</h3>
      <div className="bill-distribution-track" aria-hidden="true">{categories.map((item,index)=><span key={item.name} className={`bill-tone-${index}`} style={{flexGrow:item.amount}}/>)}{other>0&&<span className="bill-tone-other" style={{flexGrow:other}}/>}</div>
      <ul>{categories.map((item,index)=><li key={item.name}><span className={`bill-category-dot bill-tone-${index}`} aria-hidden="true"/><span>{item.name}</span><small>{Math.round(item.amount/bill.expense*100)}%</small><strong>{formatCny(item.amount)}</strong></li>)}
        {other>0&&<li><span className="bill-category-dot bill-tone-other" aria-hidden="true"/><span>其余分类</span><small>{Math.round(other/bill.expense*100)}%</small><strong>{formatCny(other)}</strong></li>}
      </ul>
    </div>}
    </details>
    <details className="bill-disclosure">
      <summary><ReceiptText size={17} aria-hidden="true"/><span>查看大额消费</span><ChevronDown size={16} aria-hidden="true"/></summary>
      {bill.largest.length ? <ol className="bill-transactions">{bill.largest.map((item,index)=><li key={`${item.providerName}:${item.id}:${index}`}><div><strong>{item.title}</strong><small>{item.occurredAt} · {item.providerName}</small></div><span>{formatCny(Math.abs(item.amount))}</span></li>)}</ol> : <p className="bill-note">本次没有消费记录。</p>}
      <p className="bill-note">按金额列出最多 5 笔消费，不含转账。</p>
    </details>
    <details className="bill-disclosure">
      <summary><ArrowUpRight size={17} aria-hidden="true"/><span>退款与转账</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <dl className="bill-other-flows"><div><dt>退款入账</dt><dd>{formatCny(bill.refund)}</dd></div><div><dt>转入</dt><dd>{formatCny(bill.transferIn)}</dd></div><div><dt>转出</dt><dd>{formatCny(bill.transferOut)}</dd></div></dl>
      <p className="bill-note">退款未抵扣消费支出；跨平台转账可能在两端各有记录。</p>
    </details>
    <details className="bill-disclosure">
      <summary><span>分析范围与数据质量</span><ChevronDown size={16}/></summary>
      <p className="bill-note">本次返回数据中排除 {bill.diagnosis.quality.duplicates} 条同平台重复记录、{bill.diagnosis.quality.invalid} 条无效记录。转账与退款单列，不计入消费诊断。</p>
      <ul className="bill-limitations">{bill.diagnosis.limitations.map(text=><li key={text}>{text}</li>)}</ul>
    </details>
    <p className="bill-coverage">依据已授权平台返回的 {bill.count} 笔记录整理，不代表完整账单或全部账户。</p>
  </section>;
}
