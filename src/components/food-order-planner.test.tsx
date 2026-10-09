import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {FoodOrderPlanner} from './food-order-planner';
const catalog={storeId:'shop',storeName:'橙子小馆',deliveryFee:300,discount:500,deliveryMinutes:32,address:'江湾默认地址',contact:'林晓',products:[{id:'tea',name:'黑糖珍珠鲜奶茶',description:'微糖500ml',price:880,image:''}]};
const bridge=vi.hoisted(()=>vi.fn());const advice=vi.hoisted(()=>vi.fn());
vi.mock('../lib/food-order-bridge',()=>({foodOrderRequest:bridge}));
vi.mock('../lib/food-order',async imp=>({...await imp<typeof import('../lib/food-order')>(),requestFoodAdvice:advice}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup(){bridge.mockImplementation(async(operation:string)=>operation==='catalog'?{status:'ok',catalog}:operation==='records'?{status:'ok',orders:[]}:{status:'ok',orderId:'order'});advice.mockResolvedValue({text:'推荐这杯微糖奶茶。',draft:{items:[{productId:'tea',quantity:1}],note:''},choices:[]});}
it('推荐就地呈现真实核价，改数量不发送聊天；只有点击核对才生成待支付订单',async()=>{
 setup();const turn=vi.fn(),save=vi.fn();render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[],note:''}} history={[]} injectedPrompt={{token:'a',text:'推荐奶茶，用默认地址'}} onTurn={turn} onDraftChange={save}/>);
 await screen.findByText('黑糖珍珠鲜奶茶');expect(screen.getByText('¥6.80')).toBeTruthy();expect(screen.getByText('江湾默认地址')).toBeTruthy();expect(bridge.mock.calls.some(c=>c[0]==='prepare')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'增加黑糖珍珠鲜奶茶'}));await screen.findByText('¥15.60');expect(advice).toHaveBeenCalledTimes(1);await waitFor(()=>expect(save).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:'核对后去支付'}));await waitFor(()=>expect(bridge.mock.calls.some(c=>c[0]==='prepare')).toBe(true));expect(bridge.mock.calls.find(c=>c[0]==='prepare')?.[1]).toMatchObject({authorized:true,quote:{payable:1560}});
});
it('已有订单恢复后只能继续原订单；模型失败会完成失败回调并保留方案',async()=>{
 setup();bridge.mockImplementation(async(operation:string)=>operation==='catalog'?{status:'ok',catalog}:operation==='records'?{status:'ok',orders:[{id:'old',taskId:'food',status:'PENDING_PAYMENT',payable:680}]}:{status:'ok',orderId:'old'});const turn=vi.fn();advice.mockRejectedValue(new Error('模型暂不可用'));
 render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[{productId:'tea',quantity:1}],note:'',orderId:'old'}} history={[]} injectedPrompt={{token:'b',text:'推荐'}} onTurn={turn}/>);
 await screen.findByRole('button',{name:'继续付款'});await waitFor(()=>expect(turn).toHaveBeenCalledWith('推荐',expect.stringContaining('模型暂不可用'),true,expect.anything()));expect(screen.queryByRole('button',{name:'核对后去支付'})).toBeNull();
});
it('超时重试复用订单编号；方案保存失败不丢失原数量，原订单只做跳转',async()=>{
 setup();let failed=true;bridge.mockImplementation(async(operation:string)=>{if(operation==='catalog')return {status:'ok',catalog};if(operation==='records')return {status:'ok',orders:[]};if(operation==='prepare'&&failed){failed=false;throw new Error('结果待核对');}return {status:'ok',orderId:'order'};});
 const save=vi.fn().mockRejectedValueOnce(new Error('保存冲突')).mockResolvedValue(undefined);
 render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[{productId:'tea',quantity:1}],note:''}} history={[]} onDraftChange={save}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'核对后去支付'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'增加黑糖珍珠鲜奶茶'}));await screen.findByText('保存冲突');expect(screen.getByText('¥6.80')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'核对后去支付'}));await screen.findByText('结果待核对');fireEvent.click(screen.getByRole('button',{name:'核对后去支付'}));
 await screen.findByRole('button',{name:'继续付款'});const calls=bridge.mock.calls.filter(c=>c[0]==='prepare');expect(calls[0][1].orderId).toBe(calls[1][1].orderId);
 fireEvent.click(screen.getByRole('button',{name:'继续付款'}));await waitFor(()=>expect(bridge.mock.calls.some(c=>c[0]==='open')).toBe(true));
});
it('菜单失败完成回调并可重读；选项是对话回应而非第二套输入框',async()=>{
 setup();bridge.mockRejectedValueOnce(new Error('菜单离线'));const turn=vi.fn(),prompt=vi.fn();advice.mockResolvedValue({text:'想吃哪类？',choices:['喝奶茶','吃炒饭']});
 render(<FoodOrderPlanner taskId="food" stewardName="阿衡" initialDraft={{items:[],note:''}} history={[]} injectedPrompt={{token:'c',text:'点外卖'}} onTurn={turn} onPrompt={prompt}/>);
 await screen.findByText('菜单离线');await waitFor(()=>expect(turn).toHaveBeenCalledWith('点外卖','菜单离线',true,expect.anything()));fireEvent.click(screen.getByRole('button',{name:'重新读取菜单'}));
 await waitFor(()=>expect(bridge.mock.calls.filter(c=>c[0]==='catalog')).toHaveLength(2));
});
it('模型只改份数并省略地址时，保留用户已交代的收货信息',async()=>{
 setup();const turn=vi.fn();render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[{productId:'tea',quantity:1}],note:'',address:'新收货地址',contact:'新联系人'}} history={[]} injectedPrompt={{token:'d',text:'两杯'}} onTurn={turn}/>);
 await waitFor(()=>expect(turn).toHaveBeenCalled());expect(screen.getByText('新收货地址')).toBeTruthy();expect(screen.getByText('新联系人')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'核对后去支付'}));await waitFor(()=>expect(bridge.mock.calls.find(c=>c[0]==='prepare')?.[1].draft).toMatchObject({address:'新收货地址',contact:'新联系人'}));
});
it('模型按需询问的选项能续答，数量减少直接更新原方案',async()=>{
 setup();advice.mockResolvedValue({text:'选哪种？',choices:['喝奶茶','吃炒饭']});const onPrompt=vi.fn();render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[{productId:'tea',quantity:2}],note:''}} history={[]} injectedPrompt={{token:'e',text:'推荐'}} onPrompt={onPrompt}/>);
 await screen.findByRole('button',{name:'喝奶茶'});fireEvent.click(screen.getByRole('button',{name:'喝奶茶'}));expect(onPrompt).toHaveBeenCalledWith('喝奶茶');
 fireEvent.click(screen.getByRole('button',{name:'减少黑糖珍珠鲜奶茶'}));await screen.findByText('¥6.80');
});
it('营养询问仅回复解释，模型附带草稿也不改变原方案或跳支付',async()=>{
 setup();const turn=vi.fn(),save=vi.fn();
 advice.mockResolvedValue({intent:'answer',text:'这只是常见份量的热量粗估，不是商家实测。',draft:{items:[{productId:'tea',quantity:1}],note:'无糖'},choices:[]});
 render(<FoodOrderPlanner taskId="food" stewardName="宁宁" initialDraft={{items:[{productId:'tea',quantity:2}],note:'少冰',address:'我的地址',contact:'我的联系人'}} history={[]} injectedPrompt={{token:'calories',text:'这个热量大概怎么样啊？'}} onTurn={turn} onDraftChange={save}/>);
 await waitFor(()=>expect(turn).toHaveBeenCalled());
 expect(turn.mock.calls[0][1]).toContain('热量粗估');expect(turn.mock.calls[0][2]).toBe(false);
 expect(turn.mock.calls[0][3].food).toMatchObject({items:[{productId:'tea',quantity:2}],note:'少冰',address:'我的地址',contact:'我的联系人'});
 expect(screen.getByText('¥15.60')).toBeTruthy();expect(save).not.toHaveBeenCalled();
 expect(bridge.mock.calls.some(c=>c[0]==='prepare'||c[0]==='open')).toBe(false);
});
