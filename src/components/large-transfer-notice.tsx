import {ShieldAlert} from 'lucide-react';
import {transferRiskPolicy} from '../lib/transfer-risk';
import {money} from '../lib/native-banking';
import './large-transfer-notice.css';

export function LargeTransferNotice({amount}:{amount:number|null}){
 if(amount===null||!Number.isSafeInteger(amount)||amount<transferRiskPolicy.largeAmount)return null;
 return <div className="large-transfer-notice" role="status" aria-label="大额转账提醒">
  <ShieldAlert size={18} aria-hidden="true"/>
  <div><strong>大额转账 · 需单独核对</strong><p>本笔已达到{money(transferRiskPolicy.largeAmount)}。请核对收款账户、金额和用途，最终确认前需单独勾选。</p></div>
 </div>;
}
