import { describe, it, expect } from "vitest";
import { calculateGroupAA, parseGroupAAReply, type AAGroup } from "./group-aa";
const group: AAGroup = {
  id: "g",
  name: "聚餐群",
  revision: 1,
  members: [
    { id: "me", name: "我", self: true },
    { id: "li", name: "李娜" },
    { id: "w", name: "小王" },
    { id: "w2", name: "小王" },
  ],
};
describe("微信群复杂AA", () => {
  it("可以只选择成员，不虚构费用；无效选择不覆盖界面", () => {
    expect(
      parseGroupAAReply(
        '{"message":"已选李娜和小王","selectedMemberIds":["li","w"]}',
        group,
      ),
    ).toHaveProperty("selectedMemberIds", ["li", "w"]);
    expect(() =>
      parseGroupAAReply('{"selectedMemberIds":["fake"]}', group),
    ).toThrow();
    expect(() =>
      parseGroupAAReply('{"selectedMemberIds":["li","li"]}', group),
    ).toThrow();
  });
  it("逐项按份数分摊，尾差确定且金额守恒", () => {
    const result = calculateGroupAA(group, {
      title: "聚餐",
      items: [
        {
          id: "food",
          title: "晚饭",
          amount: 60000,
          shares: [
            { memberId: "me", weight: 2 },
            { memberId: "li", weight: 2 },
            { memberId: "w", weight: 2 },
          ],
        },
        {
          id: "wine",
          title: "酒水",
          amount: 18001,
          shares: [
            { memberId: "me", weight: 2 },
            { memberId: "li", weight: 1 },
          ],
        },
      ],
    });
    expect(result.total).toBe(78001);
    expect(result.selfAmount + result.collectAmount).toBe(78001);
    expect(result.members.find((m) => m.id === "w")?.amount).toBe(20000);
    expect(result.members.reduce((n, m) => n + m.amount, 0)).toBe(78001);
  });
  it("拒绝未授权成员、重复成员和空分摊", () => {
    for (const shares of [
      [],
      [{ memberId: "unknown", weight: 1 }],
      [
        { memberId: "li", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    ])
      expect(() =>
        calculateGroupAA(group, {
          title: "餐费",
          items: [{ id: "a", title: "餐费", amount: 100, shares }],
        }),
      ).toThrow();
  });
  it("模型只能提案；虚构成员或未知格式不覆盖方案", () => {
    const plan = {
      title: "聚餐",
      items: [
        {
          id: "a",
          title: "餐费",
          amount: 101,
          shares: [
            { memberId: "me", weight: 1 },
            { memberId: "li", weight: 1 },
          ],
        },
      ],
    };
    expect(
      parseGroupAAReply(JSON.stringify({ message: "已调整", plan }), group)
        .plan,
    ).toEqual(plan);
    expect(() =>
      parseGroupAAReply(
        JSON.stringify({
          plan: {
            ...plan,
            items: [
              { ...plan.items[0], shares: [{ memberId: "fake", weight: 1 }] },
            ],
          },
        }),
        group,
      ),
    ).toThrow();
    expect(
      parseGroupAAReply(
        JSON.stringify({ message: "你指的是哪位小王？" }),
        group,
      ).plan,
    ).toBeUndefined();
  });
});
