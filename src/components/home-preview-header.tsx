import {useId,useState} from 'react';
import {Menu,CalendarDays,BellRing,UserRound,ChevronDown,ChevronRight,Eye,EyeOff,ArrowUpRight,LoaderCircle,ChartNoAxesCombined,CalendarClock} from 'lucide-react';
import type {BankSnapshot} from '../lib/bank-transfer';
import {availableBankFunds} from '../lib/occasion-plans';
import {Button} from './ui/button';
import './home-ui-preview.css';
type Props={stewardName:string;stewardImage:string;bank:BankSnapshot|null;bankError:string;hidden?:boolean;onHiddenChange?:(hidden:boolean)=>void;onRefresh:()=>unknown;onSwitchSteward:()=>void;onTasks:()=>void;onSubscriptions:()=>void;onProfile:()=>void;onAssets:()=>void;onWealth?:()=>void;onAutomations?:()=>void;onConversations?:()=>void;conversationsOpen?:boolean};
const amount=(cents:number)=>(cents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function HomePreviewHeader(props:Props){
 const [expanded,setExpanded]=useState(false),[localHidden,setLocalHidden]=useState(false),[refreshing,setRefreshing]=useState(false),detailsId=useId();
 const hidden=props.hidden??localHidden,bank=!props.bankError?props.bank:null,assets=bank?.assetSummary;
 const show=(value:number|undefined)=>hidden?'••••':value===undefined?'—':amount(value);
 const togglePrivacy=()=>{if(props.onHiddenChange)props.onHiddenChange(!hidden);else setLocalHidden(!hidden);};
 const allocation=assets?[{label:'银行卡',value:assets.cash,color:'cash'},{label:'定期存款',value:assets.deposits,color:'deposit'},{label:'银行理财',value:assets.wealth,color:'wealth'}]:[];
 return <header className="home-preview-header fixed-chat-header">
  <div className="home-preview-brand-row">
   <button type="button" className="home-preview-conversations" aria-label="打开会话列表" aria-haspopup="dialog" aria-expanded={props.conversationsOpen??false} onClick={props.onConversations}><Menu size={24} aria-hidden="true"/><span>会话</span></button>
   <nav className="home-preview-nav" aria-label="首页导航">
    <button aria-label="任务日历" onClick={props.onTasks}><CalendarDays size={21}/><span>日程</span></button>
    <button aria-label="订阅" onClick={props.onSubscriptions}><BellRing size={21}/><span>订阅</span></button>
    {props.onWealth&&<button className="native-header-secondary" onClick={props.onWealth}><ChartNoAxesCombined size={21}/><span>资金规划</span></button>}
    {props.onAutomations&&<button className="native-header-secondary" onClick={props.onAutomations}><CalendarClock size={21}/><span>定时任务</span></button>}
    <button aria-label="个人中心" onClick={props.onProfile}><UserRound size={21}/><span>我的</span></button>
   </nav>
  </div>
  <div className="home-preview-steward-row">
   <button className="home-preview-identity" aria-label="选择私人管家" onClick={props.onSwitchSteward}>
    <span className="home-preview-portrait"><img src={props.stewardImage} alt=""/><i aria-hidden="true"/></span>
    <span><span className="home-preview-name">{props.stewardName}<span className="home-preview-ai">AI</span><ChevronDown size={14}/></span><small>你的个人银行管家</small></span>
   </button>
   <span className="home-preview-promise">一起，把生活安排好</span>
  </div>
  <section className="home-preview-assets" aria-label="首页资产快照">
   <div className="home-preview-asset-top"><span>{assets?'我的总资产':bank?'银行卡余额':'银行资产'}<small>（元）</small></span><div><button aria-label={hidden?'显示首页资产金额':'隐藏首页资产金额'} onClick={togglePrivacy}>{hidden?<EyeOff size={17}/>:<Eye size={17}/>}</button><button aria-label={expanded?'收起资产明细':'展开资产明细'} aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(!expanded)}><ChevronDown size={17}/></button></div></div>
   <div className="home-preview-asset-main"><strong>{show(assets?.total??bank?.balance)}</strong><span>{props.bankError?'资产暂未更新':bank?'银行沙箱账本':'正在读取资产'}</span></div>
   {expanded&&<div className="home-preview-asset-details" id={detailsId}>
    {bank&&<><dl><div><dt>扣除预留后可用</dt><dd>{show(assets?.availableCash??availableBankFunds(bank))}</dd></div><div><dt>已预留资金</dt><dd>{show(assets?.reservedCash??bank.balance-availableBankFunds(bank))}</dd></div></dl>
     {assets&&<><div className="home-preview-allocation" aria-hidden="true">{allocation.filter(a=>a.value>0).map(a=><span key={a.label} className={a.color} style={{flexGrow:a.value}}/>)}</div><ul className="home-preview-asset-list">{allocation.map(a=><li key={a.label}><span><i className={a.color} aria-hidden="true"/>{a.label}</span><strong>{show(a.value)}</strong></li>)}</ul></>}
    </>}
    {!bank&&<p>暂时没有可核对的资产金额。可重新读取或进入资产页。</p>}
    <div className="home-preview-asset-actions"><Button variant="ghost" size="sm" aria-label="查看资产" onClick={props.onAssets}>查看资产<ArrowUpRight size={14}/></Button><Button variant="ghost" size="sm" disabled={refreshing} onClick={()=>{setRefreshing(true);void Promise.resolve().then(props.onRefresh).catch(()=>undefined).finally(()=>setRefreshing(false));}}>{refreshing?<LoaderCircle size={14} className="spin"/>:null}{refreshing?'正在读取':'更新快照'}</Button></div>
   </div>}
   {!expanded&&<button className="home-preview-asset-link" aria-label="查看资产" onClick={props.onAssets}>查看资产<ChevronRight size={14}/></button>}
  </section>
 </header>;
}
