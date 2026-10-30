import {useEffect,useRef,useState} from 'react';
import {CakeSlice,Check,UserRound} from 'lucide-react';
import {cakeProducts,verifyVoiceCakeResult,voiceCakeRequest,type VoiceCakeReview as Review} from '../lib/voice-cake-review';
import {voiceMoney} from '../lib/voice-wealth-review';
import './voice-cake-review.css';
const date=(at:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(at);
export function VoiceCakeReview({review,onCancel,onResult}:{review:Review;onCancel:()=>void;onResult:(text:string)=>void}){
  const [productId,setProductId]=useState(''),[deliverAt,setDeliverAt]=useState(review.draft.deliverAt);
  const [stage,setStage]=useState<'choose'|'review'|'busy'|'uncertain'|'done'>('choose'),[error,setError]=useState('');
  const [orderId,setOrderId]=useState('');
  const [expired,setExpired]=useState(Date.now()>=review.expiresAt);const started=useRef(false),checking=useRef(false);
  useEffect(()=>{const timer=setInterval(()=>setExpired(Date.now()>=review.expiresAt),1000);return()=>clearInterval(timer);},[review.expiresAt]);
  const product=cakeProducts.find(p=>p.id===productId),amount=product?product.price+product.deliveryFee:0;
  async function checkResult(){
    if(checking.current)return;checking.current=true;setStage('busy');setError('');
    try{const receipt=verifyVoiceCakeResult(review,{productId,deliverAt},await voiceCakeRequest(undefined,review.id));setOrderId(receipt.order.id);setStage('done');onResult(`蛋糕已预订，${date(deliverAt)}送到海景餐厅，个人承担，不计入旅行AA。`);window.dispatchEvent(new Event('zhiyin-bank-updated'));}
    catch(cause){setStage('uncertain');setError(cause instanceof Error?cause.message:'请核对原订单，勿重复支付');}finally{checking.current=false;}
  }
  async function confirm(){
    if(started.current||Date.now()>=review.expiresAt){setExpired(Date.now()>=review.expiresAt);return;}started.current=true;setStage('busy');
    try{await voiceCakeRequest({reviewId:review.id,productId,deliverAt,authorized:true});}catch{/* Read original order after a lost response; never resubmit. */}
    await checkResult();
  }
  const done=stage==='done',editable=stage==='review';
  return <section className="voice-wealth-review voice-cake-review" data-stage={done?'done':stage} aria-label={done?'蛋糕预订结果':'蛋糕预订方案'}>
    <div className="voice-wealth-heading"><span className="voice-wealth-icon">{done?<Check size={18}/>:<CakeSlice size={18}/>}</span><strong>爱人的生日蛋糕</strong><span className="voice-wealth-badge">{done?'预订已确认':stage==='choose'?'预算 ¥300':'含配送 · 300以内'}</span></div>
    {stage==='choose'?<><p className="voice-cake-recommend">推荐鲜果款，低甜，适合四人分享。</p><div className="voice-cake-options">{cakeProducts.map(p=><button type="button" key={p.id} aria-label={p.id==='cake-light'?'选择鲜果蛋糕':'选择巧克力慕斯'} onClick={()=>{setProductId(p.id);setStage('review');}}><strong>{p.id==='cake-light'?'轻甜鲜果':'巧克力慕斯'}</strong><span>6英寸 · {voiceMoney(p.price+p.deliveryFee)}</span><small>含配送</small></button>)}</div><p className="voice-cake-personal"><UserRound size={14}/>个人承担 · 不计入旅行AA</p><button className="voice-cake-cancel" type="button" onClick={onCancel}>先不预订</button></>:<>
      <div className="voice-cake-selected"><div><strong>{product?.name}</strong><span>{voiceMoney(amount)}<small>蛋糕 {voiceMoney(product!.price)} + 配送 {voiceMoney(product!.deliveryFee)}</small></span></div>{editable&&<button type="button" onClick={()=>setStage('choose')}>改选款式</button>}</div>
      <div className="voice-cake-shipping"><span>预约明天送达</span>{editable?<div className="voice-cake-times">{[review.draft.deliverAt,review.draft.deliverAt+3600000].map((at,i)=><button type="button" key={at} aria-pressed={deliverAt===at} onClick={()=>setDeliverAt(at)}>明天 {i===0?'18:00':'19:00'}</button>)}</div>:<strong>{date(deliverAt)}</strong>}</div>
      <div className="voice-cake-address"><strong>海风度假酒店·海景餐厅</strong><span>{review.draft.address.replace(' 海风度假酒店·海景餐厅','')}</span></div>
      <p className="voice-cake-personal"><UserRound size={14}/>个人承担 · 不计入旅行AA</p>
      {editable&&<><p className="voice-cake-payment">微信支付 · 常用卡 8888</p><div className="voice-wealth-actions"><button type="button" onClick={onCancel}>先不预订</button><button type="button" className="voice-wealth-confirm" disabled={expired} onClick={()=>void confirm()}>确认预订并支付 {voiceMoney(amount)}</button></div>{expired&&<p className="voice-wealth-error">方案已过期，请重新核对。</p>}</>}
      {stage==='busy'&&<p className="voice-wealth-note" role="status">正在核对原订单与付款回执…</p>}
      {error&&<p className="voice-wealth-error" role="alert">{error}</p>}
      {stage==='uncertain'&&<button type="button" className="voice-wealth-recheck" onClick={()=>void checkResult()}>重新核对原订单</button>}
      {done&&<p className="voice-cake-done">已支付 {voiceMoney(amount)} · 预约配送待履约<small>订单 {orderId}</small><small>本地沙箱订单</small></p>}
    </>}
  </section>;
}
