import { describe, expect, it } from "vitest";
import {
  calculateFunds,
  parseInstruction,
  validatePlan,
  makeTask,
  money,
} from "../../src/lib/native-banking";

describe("AI 原生资金安排", () => {
  it("拆分转账、还款预算和自由资金，保留分", () => {
    expect(calculateFunds(200000, 1200000).free).toBe(1636000);
    expect(calculateFunds(300000, 1200000).free).toBe(1536000);
    expect(money(1)).toBe("¥0.01");
  });
  it("从一句话提取金额、收款人与日期，修改不误读日期为金额", () => {
    expect(
      parseInstruction("下周五给妈妈转2000，再帮我留够信用卡还款的钱"),
    ).toMatchObject({
      amount: 200000,
      recipient: "妈妈",
      date: "2026-09-18",
      reserve: 1200000,
    });
    expect(parseInstruction("改成3000")).toMatchObject({ amount: 300000 });
    expect(parseInstruction("改到9月20日")).toEqual({ date: "2026-09-20" });
  });
  it("不默默接收未知收款人或三位小数", () => {
    expect(parseInstruction("给小王转2000元")).toHaveProperty("error");
    expect(parseInstruction("改成0.001")).toHaveProperty("error");
    expect(parseInstruction("随便聊聊")).toEqual({});
  });
  it("不把显式的其他年份静默改为演示年份", () => {
    expect(parseInstruction("2027年9月18日给妈妈转2000")).toHaveProperty(
      "error",
    );
    expect(parseInstruction("改到2025-09-18")).toHaveProperty("error");
    expect(parseInstruction("改到2026年9月20日")).toEqual({
      date: "2026-09-20",
    });
  });
  it("拒绝越限、挂失、预算不足与过去日期", () => {
    const task = makeTask({
      amount: 200000,
      recipient: "妈妈",
      date: "2026-09-18",
      reserve: 1200000,
    });
    expect(validatePlan(task, 2000000, false)).toBe("");
    expect(validatePlan(task, 100000, false)).toContain("限额");
    expect(validatePlan(task, 2000000, true)).toContain("挂失");
    expect(
      validatePlan({ ...task, amount: 2000000 }, 2000000, false),
    ).toContain("还款预算");
    expect(
      validatePlan({ ...task, date: "2026-09-01" }, 2000000, false),
    ).toContain("日期");
  });
});
