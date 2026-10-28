import {ArrowUpRight, CalendarDays, CreditCard, FileText, Repeat2, TrendingUp, Users} from 'lucide-react';
import './steward-guide.css';

const examples = [
  {icon:FileText, title:'看懂账单', detail:'按月份看收支，核对具体交易', prompt:'帮我分析这个月的账单，先确认读取范围'},
  {icon:Repeat2, title:'管理订阅', detail:'查看续费、提醒和取消方案', prompt:'帮我看看有哪些订阅要续费'},
  {icon:Users, title:'转账与聚餐 AA', detail:'整理金额与分法，再核对收付款', prompt:'帮我记录这次聚餐的 AA 消费，先确认参与人'},
  {icon:CalendarDays, title:'日程与生活筹备', detail:'记生日、设提醒，安排预算和订单', prompt:'帮我记一件要提醒的事，先确认时间'},
  {icon:TrendingUp, title:'理财与选基', detail:'说说目标，一起看风险和候选产品', prompt:'我想做个理财计划，先聊聊目标和风险偏好'},
  {icon:CreditCard, title:'用卡与安全', detail:'核对限额、支付权限和挂失操作', prompt:'帮我检查银行卡的支付权限和限额'},
];

export function StewardGuide({stewardName,onChoose}:{stewardName:string;onChoose:(prompt:string)=>void}) {
  return <div className="steward-guide">
    <p className="guide-flow">说出需求 <span aria-hidden="true">→</span> 核对方案 <span aria-hidden="true">→</span> 由你确认</p>
    <p>可以直接告诉{stewardName}，也可以选一句示例，补充后再发送。</p>
    <div className="guide-examples" aria-label="按需求选择示例">
      {examples.map(({icon:Icon,title,detail,prompt})=><button key={title} type="button" aria-label={`填写示例：${title}`} onClick={()=>onChoose(prompt)}>
        <Icon size={19} aria-hidden="true"/><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
      </button>)}
    </div>
    <details className="guide-platforms"><summary>微信里的事情，怎样接着处理？</summary><p>在沙箱微信中选择消息并分享给知银，或与知银管家联系人聊天。带入的消息会作为材料，缺少的信息由管家继续询问。</p></details>
    <p className="guide-boundary">示例只填入草稿。转账、支付、申购、取消续费和修改用卡权限，仍需你核对并确认。</p>
  </div>;
}
