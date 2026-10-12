import { it, expect, vi, afterEach } from "vitest";
import { workspaceRequest, routeWorkspacePrompt } from "./workspace-service";
import { emptyWorkspaces, type Workspace } from "./workspaces";
import {buildWechatShare,sharePrompt} from './wechat-message-share';

it('微信分享分流只判断类别，模型省略引用包装时仍保留本人附言与完整原文',async()=>{
 const prompt=sharePrompt(buildWechatShare({id:'chat',name:'小林',kind:'direct'},[{id:'m',sender:'小林',text:'我的生日是8月20日，刚过去没多久。',sentAt:1791770000000}],['m'],'帮我记录一下小林的生日','s'));
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:null,kind:'general',title:'小林的生日',text:'帮我记录一下小林的生日'}]})})));
 expect((await routeWorkspacePrompt(prompt,[],'' )).parts).toEqual([{taskId:null,kind:'general',title:'小林的生日',text:prompt}]);expect(fetcher).toHaveBeenCalledOnce();
});
it('分享分流仍拒绝未知事项与多段拆分，不把分类结果当执行授权',async()=>{
 const prompt=sharePrompt(buildWechatShare({id:'chat',name:'小林',kind:'direct'},[{id:'m',sender:'小林',text:'准备生日蛋糕',sentAt:1791770000000}],['m'],'帮我准备生日','s'));
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:'unknown',kind:'occasion',title:'生日',text:'准备生日蛋糕'}]})})));
 await expect(routeWorkspacePrompt(prompt,[],'' )).rejects.toThrow('之前的交代');
 fetcher.mockImplementation(async()=>new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:null,kind:'occasion',title:'生日',text:'准备生日蛋糕'},{taskId:null,kind:'transfer',title:'转账',text:'给妈妈转500'}]})})));
 await expect(routeWorkspacePrompt(prompt,[],'' )).rejects.toThrow();
});

it('分流能看到上一轮管家的追问，授权和问号不被当作独立闲聊', async () => {
  const task: Workspace = {id:'bill',kind:'bills',title:'本月支出',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[{id:'u',role:'user',content:'看看这个月支出',memoryRevision:0},{id:'a',role:'assistant',content:'需要先授权微信账单。',memoryRevision:0}]};
  const fetcher = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:'bill',kind:'bills',title:'本月支出',text:'授权一下微信吧'}]})})));
  expect((await routeWorkspacePrompt('授权一下微信吧',[task],'bill')).parts[0].taskId).toBe('bill');
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockClear();
  expect((await routeWorkspacePrompt('？',[task],'bill')).parts[0].taskId).toBe('bill');
  expect(fetcher).not.toHaveBeenCalled();
});
afterEach(() => vi.restoreAllMocks());
it('分流模型临时返回空内容时重试一次，仍为空时明确失败且不生成任务',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({error:'模型服务未返回有效内容'}),{status:502}))
   .mockResolvedValueOnce(new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:null,kind:'general',title:'闲聊',text:'帮我梳理一下周末计划'}]})})));
 expect((await routeWorkspacePrompt('帮我梳理一下周末计划',[],'')).parts[0].text).toBe('帮我梳理一下周末计划');expect(fetcher).toHaveBeenCalledTimes(2);
 expect(fetcher.mock.calls[0][1]?.signal).toBe(fetcher.mock.calls[1][1]?.signal);
 fetcher.mockClear().mockImplementation(async()=>new Response(JSON.stringify({error:'模型服务未返回有效内容'}),{status:502}));
 await expect(routeWorkspacePrompt('帮我梳理一下周末计划',[],'')).rejects.toThrow('未返回有效内容');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('回应记忆追问的“记忆”直接续接原事项，不再额外调用分流模型',async()=>{
 const task:Workspace={id:'birthday',kind:'general',title:'记录小林生日',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[],progress:{goal:'记录小林生日',stage:'waiting_user',waitingFor:{field:'reply',question:'需要我帮你记住这个日期吗？'}}};
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('不应调用分流接口'));
 expect((await routeWorkspacePrompt('记忆',[task],task.id)).parts).toEqual([{taskId:task.id,kind:task.kind,title:task.title,text:'记忆'}]);expect(fetcher).not.toHaveBeenCalled();
});
it("写入重试复用请求ID；读失败与数据异常清晰报错", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("断线"))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyWorkspaces())));
  await workspaceRequest(
    { type: "create", id: "a", title: "晚餐", kind: "aa" },
    0,
  );
  expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  fetcher.mockRejectedValueOnce(new Error("读取断线"));
  await expect(workspaceRequest()).rejects.toThrow("读取断线");
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "保存冲突" }), { status: 409 }),
  );
  await expect(workspaceRequest()).rejects.toThrow("保存冲突");
  fetcher.mockResolvedValueOnce(new Response("{}"));
  await expect(workspaceRequest()).rejects.toThrow("格式无效");
});
it("分流器只接受合法原话路由，服务失败不自行猜测执行", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            parts: [
              { taskId: null, kind: "aa", title: "晚餐", segmentIds:[0] },
            ],
          }),
        }),
      ),
    );
  expect((await routeWorkspacePrompt("饮料18", [], "")).parts[0].kind).toBe(
    "aa",
  );
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({ parts: [], clarification: "哪次活动？" }),
      }),
    ),
  );
  expect(
    (await routeWorkspacePrompt("改成16", [], "", "饮料")).clarification,
  ).toBe("哪次活动？");
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "模型暂不可用" }), { status: 502 }),
  );
  await expect(routeWorkspacePrompt("饮料18", [], "")).rejects.toThrow(
    "模型暂不可用",
  );
});
it("分流输出遗漏时只重试分流，不执行遗漏后的半份请求", async () => {
  const good = {
    parts: [
      { taskId: null, kind: "aa", title: "晚饭", segmentIds:[0] },
      { taskId: null, kind: "transfer", title: "转账", segmentIds:[1] },
    ],
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({ parts: good.parts.slice(0, 1) }),
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ output_text: JSON.stringify(good) })),
    );
  expect(
    (await routeWorkspacePrompt("饮料18，给妈妈转500", [], "")).parts,
  ).toHaveLength(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('服务端模型空内容只重试一次，编号分类仍恢复当前原文',async()=>{
 const model=vi.fn().mockRejectedValueOnce(new Error('模型服务未返回有效内容')).mockResolvedValue(JSON.stringify({parts:[{taskId:null,kind:'general',title:'周末计划',segmentIds:[0]}]}));
 const result=await routeWorkspacePrompt('帮我梳理一下周末计划',[],'','',[],{model});expect(model).toHaveBeenCalledTimes(2);expect(result.parts[0].text).toBe('帮我梳理一下周末计划');
});
