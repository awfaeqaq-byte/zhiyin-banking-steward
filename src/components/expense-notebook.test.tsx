import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  ExpenseNotebook,
  type ExpenseNotebookHandle,
} from "./expense-notebook";
import * as service from "../lib/expense-service";
import * as aa from "../lib/group-aa";
import {
  changeExpenses,
  emptyExpenseState,
  type ExpenseCommand,
} from "../lib/expense-notebook";
afterEach(() => vi.restoreAllMocks());
it("可以修改活动名称、暂停再继续，无关问题交还普通管家", async () => {
  let state = emptyExpenseState();
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  vi.spyOn(aa, "groupAARequest").mockResolvedValue({
    group: {
      id: "g",
      name: "群",
      revision: 1,
      members: [
        { id: "me", name: "我", self: true },
        { id: "li", name: "李娜" },
      ],
    },
  });
  vi.spyOn(service, "requestExpenseReply").mockResolvedValue({
    action: "unrelated",
  });
  const ref = createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} onPrompt={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "随手记消费" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "活动名称" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "活动名称" }),
    "周末出游",
  );
  await userEvent.click(screen.getByRole("button", { name: "从微信选择群" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "李娜" }));
  await userEvent.click(screen.getByRole("button", { name: "开始记录" }));
  await screen.findByRole("button", { name: /周末出游/ });
  await act(async () =>
    expect(await ref.current!.handle("本月花了300吗")).toBeNull(),
  );
  await act(async () =>
    expect(await ref.current!.handle("暂停记账")).toContain("记录还在"),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "继续记录" }),
    state.books[0].id,
  );
  await screen.findByRole("button", { name: /周末出游/ });
  await userEvent.click(screen.getByRole("button", { name: /周末出游/ }));
  await userEvent.click(screen.getByRole("button", { name: "收起活动" }));
  await userEvent.click(screen.getByRole("button", { name: "随手记消费" }));
  await userEvent.click(screen.getByRole("button", { name: "暂不开始" }));
  expect(screen.queryByText("把这次消费记在一起")).not.toBeInTheDocument();
});
it("选群确认参与人后，首页短句追加并能纠正上一笔，记录不触发支付", async () => {
  let state = emptyExpenseState();
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  const bridge = vi.spyOn(aa, "groupAARequest").mockResolvedValue({
    group: {
      id: "g",
      name: "饭搭子",
      revision: 1,
      members: [
        { id: "me", name: "我", self: true },
        { id: "li", name: "李娜" },
      ],
    },
  });
  const model = vi.spyOn(service, "requestExpenseReply").mockResolvedValue({
    action: "add",
    entry: {
      title: "卤味",
      amount: 4200,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
  });
  const ref = createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} onPrompt={vi.fn()} />);
  await act(async () => {
    expect(await ref.current!.handle("今晚吃饭我先付，最后一起算")).toContain(
      "参与人",
    );
  });
  await userEvent.click(screen.getByRole("button", { name: "从微信选择群" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "李娜" }));
  await userEvent.click(screen.getByRole("button", { name: "开始记录" }));
  await waitFor(() => expect(state.books).toHaveLength(1));
  await act(async () => {
    expect(await ref.current!.handle("卤味42")).toContain("42.00");
  });
  expect(state.books[0].entries).toHaveLength(1);
  model.mockResolvedValue({
    action: "edit",
    entryId: state.books[0].entries[0].id,
    entry: { ...state.books[0].entries[0], amount: 4500 },
  });
  await act(async () => {
    await ref.current!.handle("刚才说错了，45元");
  });
  expect(state.books[0].entries[0].amount).toBe(4500);
  expect(bridge).toHaveBeenCalledTimes(1);
});
it("微信回执丢失后锁定费用，核对找到原收款即恢复，不会再建一笔", async () => {
  const group = {
    id: "g",
    name: "饭搭子",
    revision: 1,
    members: [
      { id: "me", name: "我", self: true },
      { id: "li", name: "李娜" },
    ],
  };
  let state = changeExpenses(emptyExpenseState(), {
    type: "create",
    bookId: "b",
    title: "聚餐",
    group,
    participants: ["me", "li"],
    defaultPayerId: "me",
    revision: 0,
    requestId: "c",
  });
  state = changeExpenses(state, {
    type: "add",
    bookId: "b",
    entryId: "e",
    entry: {
      title: "晚饭",
      amount: 1000,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
    revision: 1,
    requestId: "a",
  });
  localStorage.setItem("zhiyin-expense-active", "b");
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  const bridge = vi
    .spyOn(aa, "groupAARequest")
    .mockImplementation(async (op) => {
      if (op === "publish") throw new Error("微信操作超时");
      const batch = state.books[0].batches[0];
      return {
        collections: [
          {
            id: batch.id,
            groupId: "g",
            groupName: "饭搭子",
            createdAt: Date.now(),
            plan: batch.plan,
            status: "pending",
            total: 1000,
            selfAmount: 500,
            collectAmount: 500,
            members: [
              { ...group.members[0], amount: 500, paid: true },
              { ...group.members[1], amount: 500, paid: false },
            ],
          },
        ],
      };
    });
  render(<ExpenseNotebook onPrompt={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: /聚餐/ }));
  await userEvent.click(screen.getByRole("button", { name: "核对并结算" }));
  await userEvent.click(screen.getByRole("button", { name: /去微信确认收款/ }));
  await screen.findByText("微信操作超时");
  expect(state.books[0].batches[0].status).toBe("prepared");
  expect(state.books[0].entries[0].batchId).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "核对结果" }));
  await screen.findByText("1 笔消费 · 已发起群收款");
  expect(state.books[0].batches).toHaveLength(1);
  expect(bridge.mock.calls.filter((c) => c[0] === "publish")).toHaveLength(1);
});
it("未发布的结算核对后可恢复修改，删除需要再次确认", async () => {
  const group = {
    id: "g",
    name: "饭搭子",
    revision: 1,
    members: [
      { id: "me", name: "我", self: true },
      { id: "li", name: "李娜" },
    ],
  };
  let state = changeExpenses(emptyExpenseState(), {
    type: "create",
    bookId: "b",
    title: "聚餐",
    group,
    participants: ["me", "li"],
    defaultPayerId: "me",
    revision: 0,
    requestId: "c",
  });
  state = changeExpenses(state, {
    type: "add",
    bookId: "b",
    entryId: "e",
    entry: {
      title: "晚饭",
      amount: 1000,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
    revision: 1,
    requestId: "a",
  });
  state = changeExpenses(state, {
    type: "prepare",
    bookId: "b",
    batchId: "x",
    entryIds: ["e"],
    revision: 2,
    requestId: "p",
  });
  localStorage.setItem("zhiyin-expense-active", "b");
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  vi.spyOn(aa, "groupAARequest").mockResolvedValue({ collections: [] });
  render(<ExpenseNotebook onPrompt={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: /聚餐/ }));
  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  await screen.findByText("微信中尚未发布，已恢复修改。");
  await userEvent.click(screen.getByRole("button", { name: "删除" }));
  expect(state.books[0].entries).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(state.books[0].entries).toHaveLength(0));
});
