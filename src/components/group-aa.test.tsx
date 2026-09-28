import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupAA } from "./group-aa";
import {
  groupAARequest,
  requestGroupAAPlan,
  type AAGroup,
} from "../lib/group-aa";
vi.mock("../lib/group-aa", async (original) => ({
  ...(await original<typeof import("../lib/group-aa")>()),
  groupAARequest: vi.fn(),
  requestGroupAAPlan: vi.fn(),
}));
const group: AAGroup = {
  id: "g",
  name: "聚餐群",
  revision: 1,
  members: [
    { id: "self", name: "我", self: true },
    { id: "li", name: "李娜", note: "非好友" },
  ],
};
beforeEach(() => {
  vi.mocked(groupAARequest).mockReset();
  vi.mocked(requestGroupAAPlan).mockReset();
  vi.mocked(groupAARequest).mockImplementation(async (operation) =>
    operation === "choose" ? { group } : { collections: [] },
  );
});
it('手动搜索、点选、按项改份数和删除均更新同一份方案',async()=>{
 const user=userEvent.setup();const {container}=render(<GroupAA/>);await user.click(screen.getByRole('button',{name:'从微信选择群'}));await screen.findByText('聚餐群');
 await user.click(screen.getByRole('button',{name:'清空'}));await user.click(screen.getByRole('button',{name:'添加费用'}));expect(await screen.findByRole('alert')).toHaveTextContent('先选择');
 await user.type(screen.getByLabelText('搜索群成员'),'李娜');expect(screen.queryByRole('checkbox',{name:/我（自己）/})).not.toBeInTheDocument();await user.click(screen.getByRole('checkbox',{name:/李娜/}));await user.clear(screen.getByLabelText('搜索群成员'));await user.click(screen.getByRole('checkbox',{name:/我（自己）/}));await user.click(screen.getByRole('button',{name:'添加费用'}));
 await user.clear(screen.getByLabelText('费用1名称'));await user.type(screen.getByLabelText('费用1名称'),'晚餐');await user.type(screen.getByLabelText('费用1金额'),'600');await user.clear(screen.getByLabelText('活动名称'));await user.type(screen.getByLabelText('活动名称'),'周末聚餐');await user.click(screen.getByText(/人参与 · 点选修改份数/));
 const picker=within(container.querySelector('.aa-share-picker') as HTMLElement);await user.click(picker.getByRole('checkbox',{name:/李娜/}));await user.click(picker.getByRole('checkbox',{name:/李娜/}));await user.selectOptions(picker.getByRole('combobox',{name:/李娜/}),'1');expect(screen.getByText('待收 ¥200')).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'清空'}));expect(screen.getByText('待收 ¥200')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'核对群收款'}));await user.click(screen.getByRole('button',{name:'返回修改'}));await user.click(screen.getByRole('button',{name:'刷新进度'}));await user.click(screen.getByRole('button',{name:'删除费用1'}));expect(screen.queryByLabelText('费用1金额')).not.toBeInTheDocument();
});
it("point selection, model editing, undo and two-stage publishing share one plan", async () => {
  const user = userEvent.setup();
  render(<GroupAA />);
  await user.click(screen.getByRole("button", { name: "从微信选择群" }));
  await screen.findByText("聚餐群");
  await user.click(screen.getByRole("button", { name: "全选" }));
  await user.click(screen.getByRole("button", { name: "添加费用" }));
  await user.type(screen.getByLabelText("费用1金额"), "100");
  expect(screen.getByText("待收 ¥50")).toBeInTheDocument();
  const proposal = {
    title: "晚饭",
    items: [
      {
        id: "food",
        title: "晚饭",
        amount: 12000,
        shares: [
          { memberId: "self", weight: 2 },
          { memberId: "li", weight: 1 },
        ],
      },
    ],
  };
  vi.mocked(requestGroupAAPlan).mockResolvedValue({
    message: "李娜半份",
    plan: proposal,
  });
  await user.type(
    screen.getByLabelText("告诉宁宁怎么调整"),
    "改成120元，李娜半份",
  );
  await user.click(screen.getByRole("button", { name: "整理方案" }));
  await screen.findByText("待收 ¥40");
  expect(vi.mocked(requestGroupAAPlan).mock.calls[0][4]).toEqual([
    "self",
    "li",
  ]);
  await user.click(screen.getByRole("button", { name: "撤销修改" }));
  expect(screen.getByText("待收 ¥50")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "核对群收款" }));
  expect(
    vi.mocked(groupAARequest).mock.calls.some((c) => c[0] === "publish"),
  ).toBe(false);
  vi.mocked(groupAARequest).mockImplementation(async (op, payload) =>
    op === "publish"
      ? {
          collection: {
            id: "receipt",
            groupId: "g",
            groupName: "聚餐群",
            plan: payload!.plan as typeof proposal,
            createdAt: 1,
            status: "pending",
            total: 10000,
            selfAmount: 5000,
            collectAmount: 5000,
            members: [
              { ...group.members[0], amount: 5000, paid: true },
              { ...group.members[1], amount: 5000, paid: false },
            ],
          },
        }
      : { collections: [] },
  );
  await user.click(screen.getByRole("button", { name: "去微信确认发起" }));
  await screen.findByText("0/1 人已付");
  expect(screen.getByText(/等待成员付款，不代表已经到账/)).toBeInTheDocument();
});
it("智能选人可以单独执行和撤销，不需要编造费用", async () => {
  const user = userEvent.setup();
  render(<GroupAA />);
  await user.click(screen.getByRole("button", { name: "从微信选择群" }));
  await screen.findByText("聚餐群");
  vi.mocked(requestGroupAAPlan).mockResolvedValue({
    message: "已选中李娜",
    selectedMemberIds: ["li"],
  });
  await user.type(screen.getByLabelText("告诉宁宁怎么调整"), "只选李娜");
  await user.click(screen.getByRole("button", { name: "整理方案" }));
  await screen.findByText("已选中李娜");
  expect(screen.getByRole("checkbox", { name: /李娜/ })).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: /我（自己）/ }),
  ).not.toBeChecked();
  expect(screen.queryByLabelText("费用1金额")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "撤销修改" }));
  expect(screen.getByRole("checkbox", { name: /李娜/ })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: /我（自己）/ })).toBeChecked();
});
it("clarifications and invalid model output preserve the current editable plan", async () => {
  const user = userEvent.setup();
  render(<GroupAA />);
  await user.click(screen.getByRole("button", { name: "从微信选择群" }));
  await user.click(await screen.findByRole("button", { name: "全选" }));
  await user.click(screen.getByRole("button", { name: "添加费用" }));
  await user.type(screen.getByLabelText("费用1金额"), "60");
  vi.mocked(requestGroupAAPlan).mockResolvedValue({
    message: "哪些人参与酒水？",
  });
  await user.type(screen.getByLabelText("告诉宁宁怎么调整"), "加点酒水");
  await user.click(screen.getByRole("button", { name: "整理方案" }));
  await screen.findByText("哪些人参与酒水？");
  expect(screen.getByText("待收 ¥30")).toBeInTheDocument();
  vi.mocked(requestGroupAAPlan).mockRejectedValue(new Error("无效成员"));
  await user.type(screen.getByLabelText("告诉宁宁怎么调整"), "给陌生人分摊");
  await user.click(screen.getByRole("button", { name: "整理方案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("无效成员");
  expect(screen.getByText("待收 ¥30")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "断开" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "从微信选择群" }),
    ).toBeInTheDocument(),
  );
});
