import { it, expect, vi, afterEach } from "vitest";
import { workspaceRequest, routeWorkspacePrompt } from "./workspace-service";
import { emptyWorkspaces, type Workspace } from "./workspaces";

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
              { taskId: null, kind: "aa", title: "晚餐", text: "饮料18" },
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
      { taskId: null, kind: "aa", title: "晚饭", text: "饮料18" },
      { taskId: null, kind: "transfer", title: "转账", text: "给妈妈转500" },
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
