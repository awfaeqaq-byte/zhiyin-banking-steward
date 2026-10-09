import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardWorkspaces} from './steward-workspaces';
import {changeWorkspaces,emptyWorkspaces} from '../lib/workspaces';
import {foodOrderRequest} from '../lib/food-order-bridge';
vi.mock('../lib/food-order-bridge',()=>({foodOrderRequest:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it('旧外卖闲聊在首页直接续聊为点餐，真实菜单回复不走订阅通用模型且刷新保留',async()=>{
 let tasks=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'legacy',kind:'general',title:'点奶茶外卖',revision:0,requestId:'a'});
 localStorage.setItem('zhiyin-workspace-active','legacy');
 vi.mocked(foodOrderRequest).mockImplementation(async operation=>operation==='catalog'?{status:'ok',catalog:{storeId:'shop',storeName:'橙子小馆',deliveryFee:300,discount:500,deliveryMinutes:32,address:'默认地址',contact:'林晓',products:[{id:'tea',name:'黑糖珍珠鲜奶茶',price:880,description:'微糖',image:''}]}}:{status:'ok',orders:[]});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url).endsWith('/workspaces')){if(init?.body)tasks=changeWorkspaces(tasks,JSON.parse(String(init.body)));return new Response(JSON.stringify(tasks));}
  return new Response(JSON.stringify({output_text:JSON.stringify({text:'我推荐这杯微糖奶茶，地址沿用默认。',draft:{items:[{productId:'tea',quantity:1}],note:''}})}));
 });
 const reply=vi.fn(async()=>({text:'不应该走订阅'}));const props={stewardName:'宁宁',stewardImage:'/n.png',connections:{},disabledReminders:[],onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn(),reply};
 const view=render(<StewardWorkspaces {...props}/>);
 const input=await screen.findByRole('textbox',{name:'和宁宁说点什么'});
 fireEvent.change(input,{target:{value:'我让你推荐啊'}});await waitFor(()=>expect(screen.getByRole('button',{name:'发送给宁宁'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
 await screen.findByText('黑糖珍珠鲜奶茶');await waitFor(()=>expect(tasks.items[0].messages).toHaveLength(2));
 expect(tasks.items).toHaveLength(1);expect(tasks.items[0].kind).toBe('food');expect(reply).not.toHaveBeenCalled();expect(tasks.items[0].progress?.food?.items[0].productId).toBe('tea');
 view.unmount();render(<StewardWorkspaces {...props}/>);await screen.findByText('¥6.80');
});
