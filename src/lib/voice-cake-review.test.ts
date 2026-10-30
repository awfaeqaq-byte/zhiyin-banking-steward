import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {createBankStore} from '../../server/bank-store';
import {createVoiceCakeService} from '../../server/voice-cake-service';
import {validVoiceCakeReview,verifyVoiceCakeResult} from './voice-cake-review';
const NOW=Date.parse('2026-10-30T18:00:00+08:00'),AT=Date.parse('2026-10-31T18:00:00+08:00');
const draft={title:'爱人生日',recipient:'爱人',budget:30000,prepareAt:NOW,deliverAt:AT,address:'浙江省舟山市普陀区海莲路88号 海风度假酒店·海景餐厅',contact:'叶先生 13800001234',note:'个人承担，不计入旅行AA；含生日蜡烛',productIds:['cake-light']};
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
function setup(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-cake-'));dirs.push(dir);const bank=createBankStore(join(dir,'bank.json')),file=join(dir,'cake.json'),service=createVoiceCakeService(file,bank);const review=service.prepare(draft,NOW);return {bank,file,service,review};}
it('只拟定不扣款，明确确认后产生真实沙箱订单、206元回执及明天配送信息',()=>{
 const x=setup(),before=x.bank.get();expect(x.service.get(x.review.id)).toBeNull();expect(before.payments).toHaveLength(0);expect(before.occasions).toHaveLength(0);
 const selection={productId:'cake-light',deliverAt:AT};const receipt=x.service.confirm(x.review.id,selection,true,NOW+1);
 expect(verifyVoiceCakeResult(x.review,selection,receipt).order.status).toBe('PAID');expect(receipt.order.payable).toBe(20600);expect(receipt.order.deliveryAt).toBe(AT);expect(x.bank.get().balance).toBe(before.balance-20600);
 expect(receipt.order.note).toContain('不计入旅行AA');expect(x.bank.get().aaRequests).toEqual(before.aaRequests);expect(x.bank.get().transactions).toEqual(before.transactions);
 expect(x.bank.get().controls).toEqual(before.controls);
});
it('重试及服务重开复用同一订单和支付编号；修改已确认款式会被拒绝',()=>{
 const x=setup(),selection={productId:'cake-light',deliverAt:AT};const first=x.service.confirm(x.review.id,selection,true,NOW+1);
 expect(x.service.confirm(x.review.id,selection,true,NOW+2)).toEqual(first);expect(createVoiceCakeService(x.file,x.bank).get(x.review.id)).toEqual(first);expect(x.bank.get().payments).toHaveLength(1);
 expect(()=>x.service.confirm(x.review.id,{...selection,productId:'cake-chocolate'},true,NOW+2)).toThrow();
});
it('巧克力246元也计入300元预算，配送时间只能选核对过的当天18或19点',()=>{
 const x=setup();const selection={productId:'cake-chocolate',deliverAt:AT+3600000};expect(x.service.confirm(x.review.id,selection,true,NOW+1).order.payable).toBe(24600);
 const y=setup();expect(()=>y.service.confirm(y.review.id,{productId:'cake-light',deliverAt:AT+86400000},true,NOW+1)).toThrow();expect(()=>y.service.confirm(y.review.id,{productId:'flowers-roses',deliverAt:AT},true,NOW+1)).toThrow();
});
it('未授权、过期或账户变化时不付款；重新读取不会补执行',()=>{
 const x=setup(),selection={productId:'cake-light',deliverAt:AT};expect(()=>x.service.confirm(x.review.id,selection,false,NOW+1)).toThrow();expect(()=>x.service.confirm(x.review.id,selection,true,NOW+300001)).toThrow();
 x.bank.configure({revision:x.bank.get().revision,limit:200000});expect(()=>x.service.confirm(x.review.id,selection,true,NOW+1)).toThrow();expect(x.bank.get().payments).toHaveLength(0);expect(x.service.get(x.review.id)).toBeNull();expect(()=>x.service.confirm('missing',selection,true,NOW+1)).toThrow();
});
it('损坏或超预算方案不能进入确认；订单、配送、金额、回执不匹配不能说成功',()=>{
 const x=setup(),selection={productId:'cake-light',deliverAt:AT};expect(validVoiceCakeReview(x.review)).toBe(true);expect(validVoiceCakeReview(null)).toBe(false);
 for(const patch of [{draft:{...draft,budget:30100}},{draft:{...draft,address:''}},{expiresAt:0},{balance:NaN},{kind:'other'}])expect(validVoiceCakeReview({...x.review,...patch})).toBe(false);
 const result=x.service.confirm(x.review.id,selection,true,NOW+1);
 for(const value of [null,{...result,order:{...result.order,payable:1}},{...result,order:{...result.order,deliveryAt:AT+1}},{...result,order:{...result.order,status:'PENDING_PAYMENT'}},{...result,bank:{...result.bank,payments:[]}},{...result,bank:{...result.bank,balance:1}}])expect(()=>verifyVoiceCakeResult(x.review,selection,value)).toThrow();
 expect(()=>x.service.prepare({...draft,note:'大家平分'},NOW)).toThrow();
});
