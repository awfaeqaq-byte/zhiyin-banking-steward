import {it,expect,vi} from 'vitest';
import {reconcileSceneSources} from './scene-service';
import {emptyWorkspaces} from './workspaces';
import type {SceneFlow} from './scene-flow';
const scene:SceneFlow={id:'food',title:'点餐',workspaceIds:['food'],links:[{kind:'food_order',id:'same-order',workspaceId:'food',channel:'food'}],records:[],stage:'waiting_external',summary:'核对中',orders:[],checkedAt:0,fingerprint:''};
it('返回只读取原订单并同步状态；不会准备、支付或创建新订单',async()=>{
 const state={...emptyWorkspaces(),scenes:[scene]},request=vi.fn().mockResolvedValue(state),food=vi.fn().mockResolvedValue({orders:[{id:'same-order',taskId:'food',status:'PAID'}]}),occasion=vi.fn();
 await reconcileSceneSources({request,food,occasion,expenses:vi.fn()});
 expect(food).toHaveBeenCalledTimes(1);expect(food).toHaveBeenCalledWith('records',{taskId:'food'});expect(occasion).not.toHaveBeenCalled();
 expect(request.mock.calls[1][0]).toEqual({orders:[expect.objectContaining({taskId:'food',id:'same-order',status:'PAID'})],errors:[]});
});
it('读取失败或其他事项的回执不能当作本事项成功；继续保留可重试信息',async()=>{
 const request=vi.fn().mockResolvedValue({...emptyWorkspaces(),scenes:[scene]});
 await reconcileSceneSources({request,food:vi.fn().mockRejectedValue(Error('未能读订单')),occasion:vi.fn(),expenses:vi.fn()});
 expect(request.mock.calls[1][0]).toEqual({orders:[],errors:[{workspaceId:'food',message:'未能读订单'}]});
 const bad=vi.fn().mockResolvedValue({orders:[{id:'same-order',taskId:'other',status:'PAID'}]});await reconcileSceneSources({request,food:bad,occasion:vi.fn(),expenses:vi.fn()});
 expect(request.mock.lastCall?.[0].orders).toEqual([]);expect(request.mock.lastCall?.[0].errors[0].message).toContain('归属');
});
it('筹备订单按原planId核对，关联账本自动同步收款进度',async()=>{
 const s={...scene,links:[{kind:'food_order' as const,id:'same-order',workspaceId:'food',channel:'occasion' as const},{kind:'expense_book' as const,id:'book',workspaceId:'food'}]},state={...emptyWorkspaces(),scenes:[s]},request=vi.fn().mockResolvedValue(state),occasion=vi.fn().mockResolvedValue({orders:[{id:'same-order',occasionId:'food',status:'DELIVERING'}]}),expenses=vi.fn().mockResolvedValue(undefined);
 await reconcileSceneSources({request,food:vi.fn(),occasion,expenses});expect(occasion).toHaveBeenCalledTimes(1);expect(occasion).toHaveBeenCalledWith('records',{planId:'food'});expect(expenses).toHaveBeenCalledTimes(1);expect(expenses).toHaveBeenCalledWith('book');expect(request.mock.lastCall?.[0].orders[0].status).toBe('DELIVERING');
});
