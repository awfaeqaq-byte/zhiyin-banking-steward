import {existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {createBankStore} from './bank-store';
import type {OccasionDraft} from '../src/lib/occasion-plans';
import {validVoiceCakeReview,validCakeSelection,verifyVoiceCakeResult,type VoiceCakeReview,type CakeSelection,type VoiceCakeResult} from '../src/lib/voice-cake-review';
import {buildOccasionFoodOrder} from '../mobilegym/apps/Zhiyin/occasion-food';
import {progressOrder} from '../mobilegym/apps/FoodDelivery/orderModel';

type Stored=VoiceCakeReview&{selection?:CakeSelection;order?:VoiceCakeResult['order']};
export function createVoiceCakeService(file:string,bank:ReturnType<typeof createBankStore>){
  const read=():Stored[]=>{if(!existsSync(file))return [];const rows:unknown=JSON.parse(readFileSync(file,'utf8'));if(!Array.isArray(rows)||rows.length>100||!rows.every(validVoiceCakeReview))throw new Error('蛋糕方案记录无效，请保留原记录核对');return rows;};
  const save=(rows:Stored[])=>{writeFileSync(file+'.tmp',JSON.stringify(rows),{mode:0o600});renameSync(file+'.tmp',file);};
  function get(id:string):VoiceCakeResult|null{
    const r=read().find(r=>r.id===id);if(!r?.selection)return null;
    const snapshot=bank.get(),plan=snapshot.occasions?.find(p=>p.id===r.planId),link=plan?.orders.find(o=>o.productId===r.selection!.productId);
    const payment=snapshot.payments?.find(p=>p.id===link?.paymentId);if(!plan||!link||!payment)return null;
    const order={...progressOrder(buildOccasionFoodOrder(plan,link),'pay'),paidAt:payment.completedAt,paymentMethod:'wechat_pay' as const,fundingSource:'bank_8888' as const};
    return verifyVoiceCakeResult(r,r.selection,{bank:snapshot,order});
  }
  return {get,
    prepare(draft:OccasionDraft,now=Date.now()):VoiceCakeReview{
      const snapshot=bank.get(),review:VoiceCakeReview={kind:'cake_preorder',id:randomUUID(),planId:'birthday-'+randomUUID().replaceAll('-','').slice(0,12),draft:structuredClone(draft),revision:snapshot.revision,balance:snapshot.balance,createdAt:now,expiresAt:now+300000};
      if(!validVoiceCakeReview(review))throw new Error('蛋糕预算、配送或个人承担信息无效');const rows=read();if(rows.length>=100)throw new Error('方案数量已达上限');save([...rows,review]);return review;
    },
    confirm(id:string,selection:CakeSelection,authorized:boolean,now=Date.now()):VoiceCakeResult{
      let lock:number;try{lock=openSync(file+'.lock','wx',0o600);}catch{throw new Error('预订正在处理，请核对原订单');}
      try{
        const rows=read(),r=rows.find(r=>r.id===id);if(!r||authorized!==true)throw new Error('请在方案内明确确认预订及支付');
        if(!validCakeSelection(r,selection))throw new Error('款式或配送时间不在本次核对范围内');
        if(r.selection&&JSON.stringify(r.selection)!==JSON.stringify(selection))throw new Error('原方案已确认，请核对原订单，不能改参数重复支付');
        const previous=get(id);if(previous)return previous;
        if(now>=r.expiresAt)throw new Error('蛋糕方案已过期，请重新核对');
        let snapshot=bank.get(),plan=snapshot.occasions?.find(p=>p.id===r.planId);
        if(!plan&&snapshot.revision!==r.revision)throw new Error('账户已变化，请重新核对方案');
        r.selection={productId:selection.productId,deliverAt:selection.deliverAt};save(rows);
        if(!plan){snapshot=bank.saveOccasion({id:r.planId,revision:snapshot.revision,draft:{...r.draft,productIds:[selection.productId],deliverAt:selection.deliverAt}},now);plan=snapshot.occasions!.find(p=>p.id===r.planId)!;}
        if(plan.status==='draft')snapshot=bank.reserveOccasion(plan.id,snapshot.revision,now);
        const link=bank.prepareOccasionOrder(plan.id,selection.productId,snapshot.revision,now);
        bank.pay({id:link.paymentId,occasionId:plan.id,channel:'wechat',amount:link.amount,merchant:link.merchant},now);
        const result=get(id);if(!result)throw new Error('原订单付款结果暂未核实');r.order=result.order;save(rows);return result;
      }finally{closeSync(lock);unlinkSync(file+'.lock');}
    },
  };
}
export function voiceCakeMiddleware(service:ReturnType<typeof createVoiceCakeService>){return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
  try{
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许同源访问'});
    if(req.method==='GET')return send(200,service.get(new URL(req.url??'/','http://localhost').searchParams.get('reviewId')??''));
    if(req.method!=='POST')return send(405,{error:'不支持的方法'});
    if(req.headers['x-zhiyin-cake']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求格式无效'});
    let raw='';for await(const part of req){raw+=part.toString();if(Buffer.byteLength(raw)>2048)return send(413,{error:'请求过长'});}
    const body=JSON.parse(raw);return send(200,service.confirm(body.reviewId,{productId:body.productId,deliverAt:body.deliverAt},body.authorized));
  }catch(error){return send(409,{error:error instanceof Error?error.message:'预订结果待核对'});}
};}
