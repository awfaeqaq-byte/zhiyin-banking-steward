import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {foodOrderRequest} from '../../src/lib/food-order-bridge';
const descriptor=Object.getOwnPropertyDescriptor(window,'parent')!;
let peer:Window;
beforeEach(()=>{vi.useFakeTimers();peer={postMessage:vi.fn()} as unknown as Window;Object.defineProperty(window,'parent',{value:peer,configurable:true});});
afterEach(()=>{Object.defineProperty(window,'parent',descriptor);vi.useRealTimers();});
function reply(data:object,origin=location.origin,source=peer){const request=(peer.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];window.dispatchEvent(new MessageEvent('message',{origin,source,data:{channel:'zhiyin-phone',version:1,type:'food-order-result',requestId:request.requestId,...data}}));}
it('同源指定父窗口结果才有效，未知来源不能伪造订单',async()=>{
 const p=foodOrderRequest('prepare',{taskId:'food',orderId:'order'});reply({status:'ok',orderId:'fake'},'https://evil.example');reply({status:'ok',orderId:'fake'},location.origin,{} as Window);reply({status:'ok',orderId:'order'});await expect(p).resolves.toMatchObject({orderId:'order'});
});
it('超时与业务失败可恢复，不将未验证响应当作执行成功',async()=>{
 const p=foodOrderRequest('open',{taskId:'food',orderId:'order'});const check=expect(p).rejects.toThrow('待核对');await vi.advanceTimersByTimeAsync(15001);await check;
 const failed=foodOrderRequest('open',{taskId:'food',orderId:'order'});reply({status:'error',message:'订单已变化'});await expect(failed).rejects.toThrow('订单已变化');
 const catalog=foodOrderRequest('catalog',{taskId:'food'});reply({status:'ok',catalog:{}});await expect(catalog).rejects.toThrow('无法核对');
 const records=foodOrderRequest('records',{taskId:'food'});reply({status:'ok',orders:[{id:'order',taskId:'other',payable:1,status:'PAID'}]});await expect(records).rejects.toThrow('无法核对');
});
it('单独打开知银提示从手机进入，不伪造可支付的菜单',async()=>{Object.defineProperty(window,'parent',{value:window,configurable:true});await expect(foodOrderRequest('catalog',{taskId:'food'})).rejects.toThrow('手机沙箱');});
