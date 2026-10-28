import {Menu,CalendarDays,BellRing,UserRound,CircleHelp,ChevronDown,ChartNoAxesCombined,CalendarClock} from 'lucide-react';
import './home-ui-preview.css';
type Props={stewardName:string;stewardImage:string;onSwitchSteward:()=>void;onTasks:()=>void;onSubscriptions:()=>void;onProfile:()=>void;onHelp?:()=>void;onToggleElder?:()=>void;onWealth?:()=>void;onAutomations?:()=>void;onConversations?:()=>void;conversationsOpen?:boolean};
export function HomePreviewHeader(props:Props){
 return <header className="home-preview-header fixed-chat-header">
  <div className="home-preview-brand-row">
   <button type="button" className="home-preview-conversations" aria-label="打开会话列表" aria-haspopup="dialog" aria-expanded={props.conversationsOpen??false} onClick={props.onConversations}><Menu size={24} aria-hidden="true"/><span>会话</span></button>
   <nav className="home-preview-nav" aria-label="首页导航">
    <button aria-label="任务日历" onClick={props.onTasks}><CalendarDays size={21}/><span>日程</span></button>
    <button aria-label="订阅" onClick={props.onSubscriptions}><BellRing size={21}/><span>订阅</span></button>
    {props.onWealth&&<button className="native-header-secondary" onClick={props.onWealth}><ChartNoAxesCombined size={21}/><span>资金规划</span></button>}
    {props.onAutomations&&<button className="native-header-secondary" onClick={props.onAutomations}><CalendarClock size={21}/><span>我的关注</span></button>}
    {props.onToggleElder&&<button aria-label="切换到长辈版" onClick={props.onToggleElder}><UserRound size={21} aria-hidden="true"/><span>长辈版</span></button>}
    {props.onHelp?<button aria-label="查看使用指南" onClick={props.onHelp}><CircleHelp size={21}/><span>指南</span></button>:<button aria-label="个人中心" onClick={props.onProfile}><UserRound size={21}/><span>我的</span></button>}
   </nav>
  </div>
  <div className="home-preview-steward-row">
   <button className="home-preview-identity" aria-label="选择私人管家" onClick={props.onSwitchSteward}>
    <span className="home-preview-portrait"><img src={props.stewardImage} alt=""/><i aria-hidden="true"/></span>
    <span><span className="home-preview-name">{props.stewardName}<span className="home-preview-ai">AI</span><ChevronDown size={14}/></span><small>你的个人银行管家</small></span>
   </button>
   <span className="home-preview-promise">一起，把生活安排好</span>
  </div>
 </header>;
}
