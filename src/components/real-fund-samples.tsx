import {useEffect,useState} from 'react';
import {fundSamplesRequest,type FundSampleRecord,type FundSamples} from '../lib/fund-samples';
import {realFundExamples} from '../lib/real-fund-examples';

function observation(record?:FundSampleRecord){
  if(!record||record.status!=='ready')return <span>{record?.status==='conflict'?'来源冲突，已隐藏数值':'暂无可核验样本'}{record?.message?` · ${record.message}`:''}</span>;
  const metric=record.metric==='per_10k_income'?'万份收益':'单位净值';
  return <span><strong>{metric} {record.value!.toFixed(4)} 元</strong>{record.sevenDayAnnualizedPct!==undefined&&<small>七日年化 {record.sevenDayAnnualizedPct.toFixed(3)}%（历史指标）</small>}<small>{record.date} · {record.changePct===undefined?'':`当日 ${record.changePct>0?'+':''}${record.changePct.toFixed(2)}% · `}{record.crossCheck==='matched'?'发行方与第三方同日一致':'发行方披露'}{record.stale?' · 旧样本':''}</small>{record.message&&<small>{record.message}</small>}{record.source&&<a href={record.source} target="_blank" rel="noreferrer">核对发行方原文</a>}</span>;
}

export function RealFundSamples(){
  const [samples,setSamples]=useState<FundSamples|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;void fundSamplesRequest().then(value=>{if(active)setSamples(value);}).catch(()=>{if(active)setError('暂无法读取基金样本缓存。');});return()=>{active=false;};},[]);
  async function refresh(){setBusy(true);setError('');try{setSamples(await fundSamplesRequest(true));}catch(value){setError(value instanceof Error?value.message:'基金样本更新失败');}finally{setBusy(false);}}
  return <details className="wealth-real-examples"><summary>查看发行方基金资料</summary>
    <p>优先读取发行方披露：货币基金展示万份收益和七日年化，其他基金展示单位净值；债券基金和 ETF 再用 AKShare 核对同日净值。不同指标不能直接比高低，也不是实时成交价或可售证明。</p>
    <button type="button" className="wealth-sample-refresh" disabled={busy} onClick={()=>void refresh()}>{busy?'获取中…':'更新基金市场样本'}</button>
    <p role="status">{error||samples?.message||'尚未读取基金样本。'}</p>
    <div className="wealth-comparison"><table><caption>真实基金资料的比较维度</caption><thead><tr><th>类型与代码</th><th>历史市场样本</th><th>已披露费用</th><th>取用方式</th><th>主要风险</th><th>依据</th></tr></thead><tbody>{realFundExamples.map(item=>{
      const record=samples?.records.find(value=>value.code===item.code);
      return <tr key={item.code}><th>{item.name}<small>{item.kind} · {item.code}</small></th><td className="wealth-fund-observation" data-label="历史市场样本">{observation(record)}</td><td data-label="已披露费用">{item.cost}</td><td data-label="取用方式">{item.liquidity}</td><td data-label="主要风险">{item.risk}</td><td data-label="依据"><a href={item.source} target="_blank" rel="noreferrer">发行方资料 · {item.asOf}</a></td></tr>;
    })}</tbody></table></div>
  </details>;
}
