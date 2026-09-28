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
} from "./expense-service";
import type { ExpenseBook } from "./expense-notebook";
afterEach(() => vi.restoreAllMocks());
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
