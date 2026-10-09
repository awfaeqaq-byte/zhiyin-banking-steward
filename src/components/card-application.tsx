import {useState} from 'react';
import {bankRequest,cardProducts,type BankSnapshot,type CardApplication} from '../lib/bank-transfer';
import {Dialog} from './ui/dialog';
import {Button} from './ui/button';

export function CardApplicationPanel({bank,onRefresh}:{bank:BankSnapshot|null;onRefresh:()=>Promise<unknown>}){
 const [selected,setSelected]=useState<(typeof cardProducts)[number]['id']|null>(null);
 const [requestId,setRequestId]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState<CardApplication|null>(null);
 async function submit(){if(!bank||!selected)return;setBusy(true);setError('');const id=requestId||crypto.randomUUID();setRequestId(id);try{const result=await bankRequest<CardApplication>({type:'apply-card',id,productId:selected,revision:bank.revision,authorized:true});await onRefresh();setReceipt(result);setSelected(null);setRequestId('');}catch(value){setError(value instanceof Error?value.message:'申请状态待核实');}finally{setBusy(false);}}
 return <section className="surface card-application" aria-label="卡申请"><h3>卡申请</h3><p>对比演示卡种，提交后仅生成沙箱申请，不代表真实银行审批或发卡。</p><div className="wealth-products">{cardProducts.map(product=><button key={product.id} onClick={()=>{setSelected(product.id);setRequestId('');setError('');}}><strong>{product.name}</strong><small>年费 ¥{product.annualFee} · {product.benefit}</small><small>申请条件：{product.condition} · 模拟资料：{product.materials}</small></button>)}</div>{receipt&&<p role="status">沙箱申请已提交 · 编号 {receipt.id}</p>}{!!bank?.cardApplications?.length&&<details><summary>查看申请进度（{bank.cardApplications.length}）</summary>{bank.cardApplications.map(item=><p key={item.id}>{cardProducts.find(product=>product.id===item.productId)?.name} · 已提交待演示处理 · {item.id}</p>)}</details>}
 <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)} title="确认提交沙箱卡申请" description="仅保存演示申请，不采集身份证号"><p>卡种：{cardProducts.find(item=>item.id===selected)?.name}</p><p>年费 ¥0；需满足持有演示沙箱账户。提交后状态为“已提交”，不会自动发卡。</p>{error&&<p role="alert">{error}</p>}<div className="form-grid"><Button variant="secondary" disabled={busy} onClick={()=>setSelected(null)}>取消</Button><Button disabled={busy||!bank} onClick={()=>void submit()}>确认提交申请</Button></div></Dialog></section>;
}
