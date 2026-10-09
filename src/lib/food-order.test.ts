import {afterEach,expect,it,vi} from 'vitest';
import {foodRoute,foodQuote,parseFoodAdvice,requestFoodAdvice,validFoodDraft,type FoodCatalog} from './food-order';
import {advanceTaskProgress} from './task-progress';
import {changeWorkspaces,emptyWorkspaces,type Workspace} from './workspaces';
export const catalog:FoodCatalog={storeId:'shop',storeName:'橙子小馆',deliveryFee:300,discount:500,deliveryMinutes:32,address:'默认地址',contact:'林晓',products:[{id:'tea',name:'黑糖珍珠鲜奶茶',description:'微糖500ml',price:880,image:''},{id:'rice',name:'鸡丁饭',description:'现炒',price:2580,image:''}]};
afterEach(()=>vi.restoreAllMocks());
it('真实菜单以分计算费用；拒绝不存在商品、浮点份数与伪造价格',()=>{
 expect(foodQuote(catalog,{items:[{productId:'tea',quantity:1}],note:''})).toEqual({itemTotal:880,deliveryFee:300,discount:500,payable:680});
 expect(()=>foodQuote(catalog,{items:[{productId:'fake',quantity:1}],note:''})).toThrow();
 expect(validFoodDraft({items:[{productId:'tea',quantity:1.5}],note:''})).toBe(false);
 expect(validFoodDraft({items:[],note:'',payable:1})).toBe(false);
});
it('日常点餐与旧的general外卖任务续聊复用，AA消费不能误归点餐',()=>{
 const old:Workspace={id:'old',kind:'general',title:'点奶茶外卖',status:'active',updatedAt:0,messages:[],summary:'',memoryRevision:0};
 expect(foodRoute('我让你推荐啊',[old],'old')?.parts[0]).toMatchObject({taskId:'old',kind:'food'});
 expect(foodRoute('喝个奶茶吧，就默认地址',[old],'old')?.parts[0].taskId).toBe('old');
 expect(foodRoute('帮我点个外卖',[],'')?.parts[0].kind).toBe('food');
 expect(foodRoute('饮料18，平分',[],'')).toBeNull();
 expect(foodRoute('帮我点外卖，给妈妈转500',[],'')).toBeNull();
 const progress=advanceTaskProgress({...old,kind:'food',progress:{goal:'点奶茶',stage:'ready',food:{items:[{productId:'tea',quantity:1}],note:'',orderId:'order1'}}},'继续付款');
 expect(progress.food?.orderId).toBe('order1');
});
it('模型只提出菜单方案，不得捏造商品、执行授权或覆盖订单编号',()=>{
 expect(parseFoodAdvice(JSON.stringify({text:'推荐奶茶',draft:{items:[{productId:'tea',quantity:1}],note:''},choices:[]}),catalog).text).toContain('黑糖珍珠鲜奶茶');
 for(const draft of [{items:[{productId:'fake',quantity:1}],note:''},{items:[{productId:'tea',quantity:1}],note:'',orderId:'fake'}])expect(()=>parseFoodAdvice(JSON.stringify({text:'已下单',draft}),catalog)).toThrow();
 expect(()=>parseFoodAdvice('坏格式',catalog)).toThrow();
});
it('模型的已下单与积分口误不能呈现为交易事实',()=>{
 const r=parseFoodAdvice(JSON.stringify({text:'880积分，已按默认地址下单啦',draft:{items:[{productId:'tea',quantity:1}],note:'微糖'}}),catalog);
 expect(r.text).not.toContain('已');expect(r.text).not.toContain('积分');expect(r.text).toContain('核对后再付款');
});
it('请求包含实际菜单及旧对话；模型不可用不能默默下单',async()=>{
 const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({text:'推荐黑糖珍珠鲜奶茶',draft:{items:[{productId:'tea',quantity:1}],note:''}})})));
 await requestFoodAdvice('你推荐',catalog,{items:[],note:''},[{role:'user',content:'喝奶茶，用默认地址'}],'喜欢微糖','宁宁');
 const body=JSON.parse(String(f.mock.calls[0][1]?.body));expect(JSON.stringify(body)).toContain('喝奶茶，用默认地址');expect(JSON.stringify(body)).toContain('880');expect(JSON.stringify(body)).toContain('喜欢微糖');
 f.mockResolvedValue(new Response(JSON.stringify({error:'模型不可用'}),{status:502}));await expect(requestFoodAdvice('推荐',catalog,{items:[],note:''},[],'','宁宁')).rejects.toThrow('模型不可用');
});
it('旧普通事项只能用已校验的点餐现场转为food，刷新后仍有方案',()=>{
 let state=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'old',kind:'general',title:'点餐',revision:0,requestId:'a'});
 state=changeWorkspaces(state,{type:'progress',id:'old',kind:'food',progress:{goal:'点奶茶',stage:'ready',food:{items:[{productId:'tea',quantity:1}],note:''}},memoryRevision:0,revision:1,requestId:'b'});
 expect(state.items[0].kind).toBe('food');
 expect(()=>changeWorkspaces(state,{type:'progress',id:'old',kind:'food',progress:{goal:'乱转',stage:'ready'},memoryRevision:0,revision:2,requestId:'c'})).toThrow();
});
