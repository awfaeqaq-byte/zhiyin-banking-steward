import { it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExpenseStore } from "../../server/expense-store";
import { expenseMiddleware } from "../../server/expense-store";
import { createServer } from "node:http";
import {
  parseExpenseReply,
  requestExpenseReply,
  expenseRequest,
  isExpenseReviewPrompt,
} from "../../src/lib/expense-service";
import type { ExpenseBook } from "../../src/lib/expense-notebook";
import { entryAllocations } from "../../src/lib/expense-notebook";
afterEach(() => vi.restoreAllMocks());
const breakdownBook: ExpenseBook = {
  id: 'breakdown', title: '聚餐', at: 0, entries: [], batches: [],
  participants: ['me', 'li', 'wang'], defaultPayerId: 'me',
  group: { id: 'g', name: '饭搭子', revision: 1, members: [
    { id: 'me', name: '我', self: true }, { id: 'li', name: '李娜' }, { id: 'wang', name: '小王' },
  ] },
};
it.each([
  '饮料20，我可乐4块，然后买了4瓶啤酒16aa',
  '饮料总共20，我自己买了个4块的可乐，剩下4瓶啤酒16元AA',
])('总额与明细只记一笔，个人可乐不进入共同平摊：%s', async prompt => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({output_text: JSON.stringify({action:'add',entry:{title:'饮料',amount:4000,payerId:'me',fixed:[],shares:breakdownBook.participants.map(memberId=>({memberId,weight:1}))}})})));
  const reply = await requestExpenseReply(breakdownBook, prompt);
  expect(reply.action).toBe('add');
  expect(reply.entry).toMatchObject({amount:2000,fixed:[{memberId:'me',amount:400}]});
  expect(reply.entry?.shares).toEqual(breakdownBook.participants.map(memberId=>({memberId,weight:1})));
  expect(entryAllocations(breakdownBook.group,reply.entry!).reduce((sum,item)=>sum+item.amount,0)).toBe(2000);
  expect(fetcher).not.toHaveBeenCalled();
});
it('总额与明细不相符时先澄清，不保存模型猜测的金额', async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch');
  const reply=await requestExpenseReply(breakdownBook,'饮料共20元，我可乐4块，啤酒18元AA');
  expect(reply).toMatchObject({action:'clarify'});
  expect(reply.message).toContain('22');
  expect(fetcher).not.toHaveBeenCalled();
});
it('我买了表示垫付，不等于自己承担；数量也不是费用',async()=>{
  const reply=await requestExpenseReply(breakdownBook,'饮料共20，我买了可乐4元，4瓶啤酒16元AA');
  expect(reply.entry).toMatchObject({amount:2000,fixed:[]});
  expect(reply.entry?.shares).toHaveLength(3);
});
it('复杂分配交给模型时仍校验总额，不把模型返回的重复总额交给保存层',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({action:'add',entry:{title:'饮料',amount:4000,payerId:'me',fixed:[{memberId:'li',amount:400}],shares:breakdownBook.participants.map(memberId=>({memberId,weight:1}))}})})));
  const reply=await requestExpenseReply(breakdownBook,'饮料20，李娜可乐4，啤酒16AA');
  expect(reply.action).toBe('clarify');
  expect(reply.entry).toBeUndefined();
  expect(reply.message).toContain('20');
});
it('通用总分句由模型解析他人归属，不能先按默认均摊保存',async()=>{
  const model=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({action:'add',entry:{title:'晚饭',amount:2000,payerId:'me',fixed:[{memberId:'wang',amount:400}],shares:breakdownBook.participants.map(memberId=>({memberId,weight:1}))}})})));
  const reply=await requestExpenseReply(breakdownBook,'晚饭共20，其中小王的饭4，剩余菜16AA');
  expect(model).toHaveBeenCalledOnce();
  expect(reply.entry?.fixed).toEqual([{memberId:'wang',amount:400}]);
});
it('明细出现不同垫付人时交给模型澄清，不能错误保存成默认付款人',async()=>{
  const model=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({action:'clarify',message:'可乐由你付，啤酒由谁付？'})})));
  const reply=await requestExpenseReply({...breakdownBook,defaultPayerId:'li'},'饮料共20，我买了可乐4，啤酒16AA');
  expect(model).toHaveBeenCalledOnce();
  expect(reply.action).toBe('clarify');
  expect(reply.entry).toBeUndefined();
});
it("只有纯结算语句走快捷查看，混合消费不得被漏掉", () => {
  expect(isExpenseReviewPrompt("帮我群收款一下今天的消费")).toBe(true);
  expect(isExpenseReviewPrompt("饮料16，最后一起算")).toBe(false);
  expect(isExpenseReviewPrompt("烧烤236，小王没吃，记完一起算")).toBe(false);
  expect(isExpenseReviewPrompt("不要结算")).toBe(false);
});
it("保存断线重试保持同一个请求标识，后端不会重复追加", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("断线"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 0, books: [], applied: [] })),
    );
  await expenseRequest({ type: "delete", bookId: "b", entryId: "e" }, 1);
  expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
});
it("账本跨服务实例保存，旧版本不能覆盖新消费", () => {
  const dir = mkdtempSync(join(tmpdir(), "zhiyin-expenses-"));
  try {
    const file = join(dir, "data.json"),
      store = createExpenseStore(file);
    const s = store.change({
      type: "create",
      bookId: "b",
      title: "晚饭",
      group: {
        id: "g",
        name: "群",
        revision: 1,
        members: [{ id: "me", name: "我", self: true }],
      },
      participants: ["me"],
      defaultPayerId: "me",
      revision: 0,
      requestId: "r",
    });
    expect(createExpenseStore(file).get()).toEqual(s);
    expect(() =>
      store.change({
        type: "delete",
        bookId: "b",
        entryId: "x",
        revision: 0,
        requestId: "r2",
      }),
    ).toThrow(/已变化/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
it("模型格式失败仅重试解析，不写消费；上下文带明确成员和历史", async () => {
  const book: ExpenseBook = {
    id: "b",
    title: "聚餐",
    group: {
      id: "g",
      name: "群",
      revision: 1,
      members: [{ id: "me", name: "我", self: true }],
    },
    participants: ["me"],
    defaultPayerId: "me",
    entries: [],
    batches: [],
    at: 0,
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ output_text: "记下了" })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_text: '{"action":"clarify","message":"多少钱？"}',
        }),
      ),
    );
  expect(
    (
      await requestExpenseReply(book, "饮料", [
        { role: "user", content: "晚饭" },
      ])
    ).action,
  ).toBe("clarify");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).input[0].content,
  ).toContain("晚饭");
  fetcher.mockImplementation(
    async () =>
      new Response(JSON.stringify({ error: "模型暂不可用" }), { status: 502 }),
  );
  await expect(requestExpenseReply(book, "饮料")).rejects.toThrow(
    "模型暂不可用",
  );
});
it("客户端拒绝错误账本，正确请求带隔离标识与版本", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify({ wrong: true })),
    );
  await expect(expenseRequest()).rejects.toThrow("数据格式");
  fetcher.mockImplementation(
    async () =>
      new Response(JSON.stringify({ revision: 0, books: [], applied: [] })),
  );
  expect(
    (await expenseRequest({ type: "delete", bookId: "b", entryId: "e" }, 3))
      .revision,
  ).toBe(0);
  const request = fetcher.mock.calls.at(-1)![1]!;
  expect(JSON.parse(String(request.body)).revision).toBe(3);
  expect(request.headers).toHaveProperty("X-Zhiyin-Expense-Scope");
  fetcher.mockImplementation(
    async () =>
      new Response(JSON.stringify({ error: "版本已变化" }), { status: 409 }),
  );
  await expect(expenseRequest()).rejects.toThrow("版本已变化");
});
it("模型只能提出消费操作，不得伪造执行或修改不存在的记录", () => {
  expect(() => parseExpenseReply('{"action":"publish"}')).toThrow();
  expect(
    parseExpenseReply('{"action":"clarify","message":"饮料一共多少钱？"}')
      .action,
  ).toBe("clarify");
  expect(() =>
    parseExpenseReply('{"action":"add","entry":{"amount":3.5}}'),
  ).toThrow();
});
it("API隔离浏览器账本，拒绝跨源、路径穿越和超大请求", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zhiyin-expense-api-")),
    server = createServer(expenseMiddleware(dir));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("port");
  const url = `http://127.0.0.1:${addr.port}`;
  try {
    const headers = {
      "X-Zhiyin-Expense-Scope": crypto.randomUUID(),
      "Content-Type": "application/json",
      "X-Zhiyin-Expenses": "1",
    };
    expect((await fetch(url)).status).toBe(400);
    expect(
      (
        await fetch(url, {
          headers: { ...headers, origin: "https://other.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url, {
          headers: { ...headers, "X-Zhiyin-Expense-Scope": "../../bad" },
        })
      ).status,
    ).toBe(400);
    expect((await fetch(url, { method: "DELETE", headers })).status).toBe(405);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify("x".repeat(70000)),
        })
      ).status,
    ).toBe(413);
    const c = {
      type: "create",
      bookId: "b",
      title: "晚饭",
      group: {
        id: "g",
        name: "群",
        revision: 1,
        members: [{ id: "me", name: "我", self: true }],
      },
      participants: ["me"],
      defaultPayerId: "me",
      revision: 0,
      requestId: "r",
    };
    expect(
      (await fetch(url, { method: "POST", headers, body: JSON.stringify(c) }))
        .status,
    ).toBe(200);
    expect((await (await fetch(url, { headers })).json()).books).toHaveLength(
      1,
    );
    expect(
      (
        await (
          await fetch(url, {
            headers: {
              ...headers,
              "X-Zhiyin-Expense-Scope": crypto.randomUUID(),
            },
          })
        ).json()
      ).books,
    ).toHaveLength(0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true });
  }
});
