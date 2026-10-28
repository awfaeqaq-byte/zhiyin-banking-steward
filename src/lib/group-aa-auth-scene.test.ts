import {it, expect, vi} from 'vitest';
import {applySceneSnapshot, sceneFingerprint, type SceneFlow} from './scene-flow';
import {reconcileSceneSources} from './scene-service';
import {emptyWorkspaces, type WorkspaceState} from './workspaces';

const error = '此群授权已失效，请重新选择';
const scene: SceneFlow = {id:'aa',title:'周末聚餐',workspaceIds:['aa'],links:[{kind:'expense_book',id:'book',workspaceId:'aa'}],records:[{kind:'expense_book',id:'book',workspaceId:'aa',status:'active',label:'消费记录已保存'}],stage:'waiting_external',summary:`周末聚餐：平台结果还需核对：${error}`,orders:[],checkedAt:1,fingerprint:'',error,next:{kind:'expense',id:'book',workspaceId:'aa'}};
scene.fingerprint=sceneFingerprint(scene);
const state = (): WorkspaceState => ({...emptyWorkspaces(),items:[{id:'aa',title:'周末聚餐',kind:'aa',status:'active',updatedAt:1,messages:[],summary:'',memoryRevision:0}],scenes:[scene]});

it('群授权缺失暂停后台读群，仍保留待恢复状态和其他事项核对', async () => {
 const current=state();current.scenes!.push({...scene,id:'food',workspaceIds:['food'],links:[{kind:'food_order',id:'order',workspaceId:'food',channel:'food'}],error:undefined});
 const request=vi.fn().mockResolvedValue(current),expenses=vi.fn(),food=vi.fn().mockResolvedValue({orders:[{id:'order',taskId:'food',status:'PAID'}]});
 await reconcileSceneSources({request,expenses,food,occasion:vi.fn()});
 expect(expenses).not.toHaveBeenCalled();
 expect(food).toHaveBeenCalledOnce();
 expect(request.mock.lastCall?.[0].errors).toEqual([expect.objectContaining({workspaceId:'aa'})]);
});

it('失效授权只保留在事项状态，不再把后台错误追加为当前对话回复', () => {
 const initial=state();initial.scenes=[];
 initial.conversation=[{id:'latest',role:'user',content:'帮我看看小店经营'}];
 const next=applySceneSnapshot(initial,[scene]);
 expect(next.conversation).toEqual(initial.conversation);
 expect(next.scenes?.[0].error).toBe(error);
});

it('已有授权错误提醒会从首页派生通知移除，原AA对话与回执保留', () => {
 const initial=state();initial.conversation=[{id:'old-aa',role:'assistant',content:'已保存消费',workspaceId:'aa'},{id:'scene-stale',role:'assistant',content:scene.summary,sceneId:'aa',workspaceId:'aa'},{id:'receipt',role:'assistant',content:'已收款回执',sceneId:'aa',workspaceId:'aa'}];
 const next=applySceneSnapshot(initial,[scene]);
 expect(next.conversation?.map(message=>message.id)).toEqual(['old-aa','receipt']);
 expect(next.items).toEqual(initial.items);
});

it('明确恢复原群授权才重试对应账本，成功后清除本轮授权错误', async () => {
 const request=vi.fn().mockResolvedValue(state()),expenses=vi.fn().mockResolvedValue(undefined);
 await reconcileSceneSources({request,expenses,food:vi.fn(),occasion:vi.fn()},{retryExpenseBookIds:['book']});
 expect(expenses).toHaveBeenCalledTimes(1);expect(expenses).toHaveBeenCalledWith('book');
 expect(request.mock.lastCall?.[0]).toEqual({orders:[],errors:[]});
});
