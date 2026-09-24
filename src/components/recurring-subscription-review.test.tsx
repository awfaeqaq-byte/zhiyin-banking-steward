import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RecurringSubscriptionReview, type RecurringReviews } from "./recurring-subscription-review";
import type { RecurringCandidate } from "../lib/recurring-payments";

const candidate: RecurringCandidate = {
  key: "alipay:cloud:month", provider: "alipay", providerName: "支付宝", title: "云盘会员",
  amount: 1800, cycle: "月", estimatedNextChargeAt: Date.parse("2026-10-15"), confidence: "high",
  evidenceSummary: "连续 3 个月在每月 15 日扣费，金额均为 ¥18",
  evidence: ["07", "08", "09"].map(month => ({ id: month, occurredAt: `2026-${month}-15`, amount: -1800 })),
};

function Review() {
  const [reviews, setReviews] = useState<RecurringReviews>({});
  return <RecurringSubscriptionReview candidates={[candidate]} reviews={reviews}
    onReview={(key, value) => setReviews(current => ({ ...current, [key]: value }))} />;
}

describe("账单周期扣费核对", () => {
  it("展示可展开的账单依据，用户确认不产生取消签约能力", () => {
    render(<Review />);
    expect(screen.getByText("疑似订阅")).toBeInTheDocument();
    fireEvent.click(screen.getByText("查看 3 笔扣费依据"));
    expect(screen.getByText("2026-07-15")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "这是订阅" }));
    expect(screen.getByText("你已确认是订阅")).toBeInTheDocument();
    expect(screen.getByText(/尚未取得该服务的签约信息/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /取消.*续费/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新判断" }));
    expect(screen.getByRole("button", { name: "这是订阅" })).toBeInTheDocument();
  });

  it("误报可忽略并恢复，忽略不会删除账单", () => {
    render(<Review />);
    fireEvent.click(screen.getByRole("button", { name: "不是订阅" }));
    expect(screen.queryByText("疑似订阅")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("已忽略 1 项"));
    fireEvent.click(screen.getByRole("button", { name: "重新核对云盘会员" }));
    expect(within(screen.getByRole("region", { name: "账单中的周期扣费" })).getByText("疑似订阅")).toBeInTheDocument();
    expect(screen.getByText("查看 3 笔扣费依据")).toBeInTheDocument();
  });
});
