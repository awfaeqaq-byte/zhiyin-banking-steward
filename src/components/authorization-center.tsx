import {useState} from 'react';
import {DataConnections} from './data-connections';
import {CardApplicationPanel} from './card-application';
import type {BankSnapshot,BankControls} from '../lib/bank-transfer';
import type {ConnectedFinancialSource,ExternalFinancialProvider,FinancialScope} from '../lib/financial-connections';
import {Button} from './ui/button';

type Props={
 bank:BankSnapshot|null;bankBusy:boolean;bankError:string;onBankChange:(change:{limit?:number;frozen?:boolean;controls?:BankControls})=>Promise<boolean>;onRefresh:()=>Promise<unknown>;
 connections:Partial<Record<ExternalFinancialProvider,ConnectedFinancialSource>>;
 initialProvider?:ExternalFinancialProvider;onEntryConsumed?:()=>void;
 onConnect:(provider:ExternalFinancialProvider,scopes:FinancialScope[])=>Promise<void>;onDisconnect:(provider:ExternalFinancialProvider)=>Promise<void>;
 privacy:{notifications:boolean;analytics:boolean};onPrivacyChange:(next:{notifications:boolean;analytics:boolean})=>void;
};

export function AuthorizationCenter({bank,bankBusy,bankError,onBankChange,onRefresh,connections,initialProvider,onEntryConsumed,onConnect,onDisconnect,privacy,onPrivacyChange}:Props){
 const [pending,setPending]=useState<{title:string;risk:string;change:{limit?:number;frozen?:boolean;controls?:BankControls}}|null>(null);
 const [limit,setLimit]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const controls=bank?.controls;
 function request(title:string,risk:string,change:Props['onBankChange'] extends (arg:infer T)=>Promise<boolean>?T:never){setPending({title,risk,change});setMessage('');}
 async function accept(){if(!pending||busy)return;setBusy(true);try{const ok=await onBankChange(pending.change);if(ok){setMessage(`${pending.title}已写入银行沙箱，请以当前账户状态为准。`);setPending(null);}else setMessage('服务端未保存变更，请刷新后重新核对。');}finally{setBusy(false);}}
 return <div className="authorization-center">
  <section className="surface"><h2>授权与批准集中管理</h2><p>在这里核对数据读取范围、卡片安全开关、限额与提醒。涉及资金的每一笔操作还会展示独立的金额、收款人和确认回执。</p><p>风险：扩大读取范围会让知银看到更多账单；开启支付能力或提高限额会扩大误操作的影响。口头约定和历史对话不会自动授权。</p></section>
  <section className="surface" aria-label="数据授权"><h2>支付账户读取授权</h2><p>选择只读数据范围。合作方仍需单独确认；这里不能授予转账或扣款权限。</p><DataConnections initialProvider={initialProvider} onEntryConsumed={onEntryConsumed} connections={connections} onConnect={onConnect} onDisconnect={onDisconnect}/></section>
  <section className="surface" aria-label="银行卡批准配置"><h2>银行卡安全与批准</h2><p>演示付款账户：常用卡 8888。当前状态：{!bank?'待读取':bank.frozen?'已挂失':'正常'}。</p>
   <label className="field">单笔支付限额（元）<input inputMode="decimal" value={limit} placeholder={bank?String(bank.limit/100):''} onChange={event=>setLimit(event.target.value)}/></label>
   <Button disabled={!bank||bankBusy} onClick={()=>{const yuan=Number(limit);if(!Number.isInteger(yuan)||yuan<100||yuan>50000){setMessage('请输入100至50000之间的整数金额。');return;}request('单笔限额变更',`限额调整为${yuan}元后，单笔允许支付的上限会变化，请核对是否符合需要。`,{limit:yuan*100});}}>核对限额变更</Button>
   {controls&&<div className="authorization-control-list">{([['overseas','境外交易','开启后可通过境外沙箱渠道付款。'],['contactless','无卡支付','开启后平台沙箱付款可能使用此卡。'],['night','夜间保护','关闭后夜间转账保护不再拦截。']] as const).map(([key,label,risk])=><div key={key}><span>{label}：{controls[key]?'已开启':'已关闭'}</span><Button variant="secondary" disabled={bankBusy} onClick={()=>request(`${controls[key]?'关闭':'开启'}${label}`,risk,{controls:{...controls,[key]:!controls[key]}})}>{controls[key]?'核对关闭':'核对开启'}</Button></div>)}</div>}
   {bank&&<Button variant="secondary" disabled={bankBusy} onClick={()=>request(bank.frozen?'恢复演示卡':'挂失演示卡',bank.frozen?'恢复后沙箱付款与转账能力重新开启，请先核对近期交易。':'挂失后这张演示卡不能付款或转账。',{frozen:!bank.frozen})}>{bank.frozen?'核对恢复卡片':'核对挂失卡片'}</Button>}
   {pending&&<div className="warning-box" role="group" aria-label="待批准变更"><div><strong>{pending.title}</strong><p>潜在风险：{pending.risk}</p><p>请接受或拒绝本次明确范围的变更。</p></div><Button disabled={busy||bankBusy} onClick={()=>void accept()}>接受并保存</Button><Button variant="secondary" disabled={busy} onClick={()=>{setPending(null);setMessage('已拒绝，本次没有变更。');}}>拒绝</Button></div>}
   {(message||bankError)&&<p role="status">{message||bankError}</p>}
  </section>
  <section className="surface" aria-label="卡片申请与脱敏档案"><h2>卡片管理</h2><p>对话可添加演示卡片档案，只保存昵称与末四位；不核验真实卡片归属，不采集完整卡号或卡密，也不赋予付款能力。</p>{bank?.managedCards?.map(card=><p key={card.id}>{card.label} · 尾号 {card.last4} · 演示档案</p>)}<CardApplicationPanel bank={bank} onRefresh={onRefresh}/></section>
  <section className="surface" aria-label="提醒和个性化"><h2>提醒与个性化</h2><label className="smart-person"><input type="checkbox" checked={privacy.notifications} onChange={event=>onPrivacyChange({...privacy,notifications:event.target.checked})}/>事项提醒</label><label className="smart-person"><input type="checkbox" checked={privacy.analytics} onChange={event=>onPrivacyChange({...privacy,analytics:event.target.checked})}/>个性化分析</label><p>这些展示偏好只影响本地界面，不替代支付账户或资金操作授权。</p></section>
 </div>;
}
