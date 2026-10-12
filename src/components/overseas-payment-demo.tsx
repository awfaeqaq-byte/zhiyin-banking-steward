import {useState} from 'react';
import {bankRequest,type BankPaymentReceipt,type BankSnapshot} from '../lib/bank-transfer';
import {Button} from './ui/button';
import {Dialog} from './ui/dialog';

export function OverseasPaymentDemo({bank,onRefresh}:{bank:BankSnapshot|null;onRefresh:()=>Promise<unknown>}){
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState<BankPaymentReceipt|null>(null);
  async function pay(){setBusy(true);setError('');try{
    const id=`overseas:${crypto.randomUUID()}`;
    const result=await bankRequest<BankPaymentReceipt>({type:'payment',authorized:true,payment:{id,channel:'overseas',amount:100,merchant:'境外演示商户'}});
    setReceipt(result);setConfirm(false);await onRefresh();window.dispatchEvent(new Event('zhiyin-bank-updated'));
  }catch(value){setError(value instanceof Error?value.message:'境外沙箱付款未完成');}finally{setBusy(false);}}
  return <section className="surface card-settings" aria-label="境外交易渠道验证">
    <h3>境外交易渠道验证</h3>
    <p>向境外演示商户支付 ¥1.00（人民币沙箱金额），可验证境外开关、挂失、夜间保护、无卡支付、限额和余额的服务端拦截。</p>
    <Button variant="secondary" disabled={!bank||busy} onClick={()=>{setError('');setConfirm(true);}}>测试境外付款</Button>
    {receipt&&<p role="status">境外沙箱付款成功 · 回执 {receipt.id} · 交易后余额 ¥{(receipt.balanceAfter/100).toFixed(2)}</p>}
    <Dialog open={confirm} onOpenChange={open=>!open&&setConfirm(false)} title="确认境外沙箱付款" description="仅在本机演示账本扣除 ¥1.00，不会发起真实跨境支付">
      <p>境外演示商户 · ¥1.00 · 当前境外交易{bank?.controls.overseas?'已开启':'已关闭'}</p>
      {error&&<p role="alert">{error}</p>}
      <div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setConfirm(false)}>取消</Button><Button disabled={busy} onClick={()=>void pay()}>确认测试付款</Button></div>
    </Dialog>
  </section>;
}
