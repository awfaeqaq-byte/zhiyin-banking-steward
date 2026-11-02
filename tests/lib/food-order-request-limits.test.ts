import {afterEach,expect,it,vi} from 'vitest';
import {requestFoodAdvice,type FoodCatalog} from '../../src/lib/food-order';
import type {SceneContext} from '../../src/lib/scene-context';

const catalog:FoodCatalog={storeId:'shop',storeName:'小馆',products:[{id:'tea',name:'茶',description:'鲜奶茶',price:100,image:''}],deliveryFee:0,discount:0,deliveryMinutes:20,address:'家',contact:'本人'};
const scene:SceneContext={version:1,sceneId:'birthday',workspaceIds:['birthday'],authorization:'none',facts:[{field:'birthdayDate',value:'2026-10-20',source:{kind:'calendar',id:'date',workspaceId:'birthday',label:'王芳生日'}}],conflicts:[],evidence:[]};
afterEach(()=>vi.restoreAllMocks());
function capture(){return vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:'{"intent":"answer","text":"沿用当前已选商品，请核对方案。","choices":[]}'})));}
function inspect(fetcher:ReturnType<typeof capture>){
 const raw=String(fetcher.mock.calls[0][1]?.body),body=JSON.parse(raw) as {input:Array<{role:string;content:string}>};
 expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(32768);expect(body.input.length).toBeLessThanOrEqual(30);expect(body.input.every(message=>message.content.trim().length>0&&message.content.length<=2000)).toBe(true);
 const data=body.input.filter(message=>message.content.startsWith('点餐资料片段')).map(message=>message.content.replace(/^点餐资料片段\d+（仅数据）：/,'')).join('');
 return {body,data};
}
it('长历史先裁掉最旧内容，保留最新问题、当前商品与可解析的共享来源JSON',async()=>{
 const fetcher=capture();const prompt='王芳生日聚餐，按已选奶茶继续考虑。';
 const context:SceneContext={...scene,facts:[...scene.facts,...Array.from({length:30},(_,index)=>({field:'address' as const,value:'地'.repeat(200),source:{kind:'occasion' as const,id:`source-${index}`,workspaceId:'birthday',label:'标'.repeat(120)}}))]};
 await requestFoodAdvice(prompt,catalog,{items:[{productId:'tea',quantity:1}],note:''},Array.from({length:12},(_,index)=>({role:'user',content:`历史${index}：`+'史'.repeat(1990)})),'','宁宁',context);
 const {body,data}=inspect(fetcher);expect(body.input.at(-1)).toEqual({role:'user',content:prompt});expect(data).toContain('"productId":"tea"');
 const shared=data.slice(data.indexOf('同一事项的共享资料'));const facts=JSON.parse(shared.slice(shared.indexOf('\n')+1));expect(facts.facts).toContainEqual(scene.facts[0]);expect(facts.truncated).toBe(true);
 expect(body.input.some(message=>message.content.startsWith('历史0：'))).toBe(false);
});
it('字节未超上限的大菜单也限制消息条数，不因第31条被代理拒绝',async()=>{
 const fetcher=capture();const large={...catalog,products:Array.from({length:100},(_,index)=>({id:`p${index}`,name:'tea',description:'x'.repeat(200),price:100,image:''}))};
 await requestFoodAdvice('recommend',large,{items:[{productId:'p99',quantity:1}],note:''},Array.from({length:12},()=>({role:'user',content:'ok'})),'','宁宁');
 const {data}=inspect(fetcher);expect(data).toContain('"id":"p99"');
});
it('超过2000字的最新问题在发请求前友好拒绝，不能静默截断当前指令',async()=>{
 const fetcher=capture();await expect(requestFoodAdvice('问'.repeat(2001),catalog,{items:[],note:''},[],'','宁宁',scene)).rejects.toThrow(/过长|2000/);expect(fetcher).not.toHaveBeenCalled();
});
it('超大合法菜单保留末尾已选商品和原始金额，明确资料截断并保持JSON完整',async()=>{
 const fetcher=capture();const large={...catalog,storeName:'名'.repeat(100),address:'地'.repeat(200),contact:'人'.repeat(80),products:Array.from({length:100},(_,index)=>({id:`p${index}`,name:'菜'.repeat(100),description:'介'.repeat(500),price:100+index,image:''}))};
 const selected=Array.from({length:8},(_,index)=>({productId:`p${92+index}`,quantity:1}));
 const prompt='要'.repeat(2000);
 await requestFoodAdvice(prompt,large,{items:selected,note:'注'.repeat(500),address:'地'.repeat(200),contact:'人'.repeat(80)},Array.from({length:12},()=>({role:'user',content:'史'.repeat(2000)})),'忆'.repeat(1500),'宁宁',scene);
 const {body,data}=inspect(fetcher);expect(body.input.at(-1)?.content).toBe(prompt);expect(data).toContain('菜单已截断');
 const menu=JSON.parse(data.split('实际菜单：')[1].split('；当前方案：')[0]);
 for(const item of selected){const original=large.products.find(product=>product.id===item.productId)!;expect(menu.products).toContainEqual(expect.objectContaining({id:original.id,name:original.name,price:original.price}));}
 const shared=data.slice(data.indexOf('同一事项的共享资料'));expect(JSON.parse(shared.slice(shared.indexOf('\n')+1)).facts).toEqual(scene.facts);
});
