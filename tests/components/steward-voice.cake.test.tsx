import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardVoice} from '../../src/components/steward-voice';
import * as transport from '../../src/lib/voice-connection';
import * as cake from '../../src/lib/voice-cake-review';
import {initialVoiceState,type VoiceBusiness} from '../../src/lib/realtime-voice';
const now=Date.now(),at=Date.parse(new Date(now+86400000+8*3600000).toISOString().slice(0,10)+'T18:00:00+08:00');
const draft={title:'爱人生日',recipient:'爱人',budget:30000,prepareAt:now,deliverAt:at,address:'浙江省舟山市普陀区海莲路88号 海风度假酒店·海景餐厅',contact:'叶先生 13800001234',note:'个人承担，不计入旅行AA',productIds:['cake-light']};
const review={kind:'cake_preorder' as const,id:'review-cake',planId:'birthday-cake',draft,revision:0,balance:4230000,createdAt:now,expiresAt:now+300000};
function receipt(){const order={productId:'cake-light',orderId:'ZY-birthday-cake-cake-light',paymentId:'occasion:birthday-cake:cake-light',amount:20600,merchant:'好食送 · 生日精选',createdAt:now};return {bank:{revision:4,balance:4209400,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],payments:[{id:order.paymentId,channel:'wechat',amount:20600,merchant:order.merchant,occasionId:review.planId,completedAt:now,balanceAfter:4209400}],occasions:[{...draft,id:review.planId,status:'reserved',createdAt:now,updatedAt:now,orders:[order]}]},order:{id:order.orderId,occasionId:review.planId,bankPaymentId:order.paymentId,payable:20600,deliveryAt:at,address:draft.address,contact:draft.contact,note:draft.note,status:'PAID',paidAt:now,lines:[{dishId:'cake-light',dishName:'轻甜鲜果蛋糕 · 6英寸',quantity:1,unitPrice:19800}],deliveryFee:800}};}
afterEach(()=>vi.restoreAllMocks());
async function setup(value=review){
 let business:VoiceBusiness=async()=>({text:''});
 vi.spyOn(transport,'createVoiceConnection').mockImplementation(options=>{business=options.business;return {start:async()=>options.onState({...initialVoiceState,phase:'listening'}),stop:vi.fn(),setMuted:vi.fn(),play:vi.fn(async()=>{}),getState:()=>({...initialVoiceState,phase:'listening'})};});
 const request=vi.fn(async()=>({text:'我来准备，先选款式，确认配送和费用。',review:value}));render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={request}/>);
 fireEvent.click(screen.getByRole('button',{name:'和宁宁语音对话'}));fireEvent.click(screen.getByRole('button',{name:'开始语音对话'}));await act(async()=>{await business('明天我爱人生日，蛋糕300以内，我请不算AA','cake',new AbortController().signal);});return {business,request};
}
it('原页选择款式、核对明天配送地址费用与个人承担；选款不付款',async()=>{
 const api=vi.spyOn(cake,'voiceCakeRequest');await setup();fireEvent.click(screen.getByRole('button',{name:/选择鲜果蛋糕/}));
 expect(screen.getByText('个人承担 · 不计入旅行AA')).toBeVisible();expect(screen.getByText('海风度假酒店·海景餐厅')).toBeVisible();expect(screen.getByRole('button',{name:'确认预订并支付 ¥206.00'})).toBeEnabled();expect(api).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/改选款式/}));fireEvent.click(screen.getByRole('button',{name:/选择巧克力慕斯/}));expect(screen.getByRole('button',{name:'确认预订并支付 ¥246.00'})).toBeEnabled();
});
it('明确点击后只支付一次，读回匹配回执才显示预订已确认',async()=>{
 const api=vi.spyOn(cake,'voiceCakeRequest').mockResolvedValue(receipt());await setup();fireEvent.click(screen.getByRole('button',{name:/选择鲜果蛋糕/}));fireEvent.click(screen.getByRole('button',{name:'明天 18:00'}));
 const confirm=screen.getByRole('button',{name:'确认预订并支付 ¥206.00'});fireEvent.click(confirm);fireEvent.click(confirm);await screen.findByText('预订已确认');expect(api).toHaveBeenCalledTimes(2);expect(api).toHaveBeenNthCalledWith(1,{reviewId:review.id,productId:'cake-light',deliverAt:at,authorized:true});expect(api).toHaveBeenNthCalledWith(2,undefined,review.id);expect(screen.getByRole('region',{name:'语音对话'})).toBeVisible();
});
it('口头确认及取消不能付款，过期不能提交',async()=>{
 const api=vi.spyOn(cake,'voiceCakeRequest');const call=await setup({...review,createdAt:now-300001,expiresAt:now-1});await act(async()=>{await call.business('确认','yes',new AbortController().signal);});expect(call.request).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:/选择鲜果蛋糕/}));expect(screen.getByRole('button',{name:'确认预订并支付 ¥206.00'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'先不预订'}));expect(api).not.toHaveBeenCalled();
});
it('提交响应丢失先读原订单，回执不匹配只允许重新核对',async()=>{
 const api=vi.spyOn(cake,'voiceCakeRequest').mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce(null).mockResolvedValueOnce(receipt());await setup();fireEvent.click(screen.getByRole('button',{name:/选择鲜果蛋糕/}));fireEvent.click(screen.getByRole('button',{name:'确认预订并支付 ¥206.00'}));await screen.findByRole('alert');expect(screen.queryByText('预订已确认')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'重新核对原订单'}));await screen.findByText('预订已确认');expect(api.mock.calls.filter(a=>a[0])).toHaveLength(1);
});
