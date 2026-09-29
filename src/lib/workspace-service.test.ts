import {it,expect,vi,afterEach} from 'vitest';
import {workspaceRequest,routeWorkspacePrompt} from './workspace-service';
import {emptyWorkspaces} from './workspaces';
afterEach(()=>vi.restoreAllMocks());
it('写入重试复用请求ID；读失败与数据异常清晰报错',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new Error('断线')).mockResolvedValueOnce(new Response(JSON.stringify(emptyWorkspaces())));
  await workspaceRequest({type:'create',id:'a',title:'晚餐',kind:'aa'},0);
  expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  fetcher.mockRejectedValueOnce(new Error('读取断线'));await expect(workspaceRequest()).rejects.toThrow('读取断线');
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({error:'保存冲突'}),{status:409}));await expect(workspaceRequest()).rejects.toThrow('保存冲突');
  fetcher.mockResolvedValueOnce(new Response('{}'));await expect(workspaceRequest()).rejects.toThrow('格式无效');
});
it('分流器只接受合法原话路由，服务失败不自行猜测执行',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:null,kind:'aa',title:'晚餐',text:'饮料18'}]})})));
  expect((await routeWorkspacePrompt('饮料18',[],'')).parts[0].kind).toBe('aa');
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({output_text:JSON.stringify({parts:[],clarification:'哪次活动？'})})));
  expect((await routeWorkspacePrompt('改成16',[],'','饮料')).clarification).toBe('哪次活动？');
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({error:'模型暂不可用'}),{status:502}));await expect(routeWorkspacePrompt('饮料18',[],'')).rejects.toThrow('模型暂不可用');
});
