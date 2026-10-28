import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubscriptionCenter } from "./subscription-center";
import type { ConnectedFinancialSource } from "../lib/financial-connections";

const now = Date.parse("2026-09-17T09:00:00+08:00");
const wechat: ConnectedFinancialSource = {
  provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
  scopes: ["autopay"], transactions: [], syncedAt: "2026-09-17T09:00:00+08:00",
  autopays: [{
    id: "wx-music", title: "黑胶VIP会员包月", merchant: "网易云音乐",
    amount: 1500, cycle: "月", nextChargeAt: now + 3 * 86_400_000,
  }],
};
const alipay: ConnectedFinancialSource = {
  provider: "alipay", displayName: "支付宝", accountMasked: "叶先生",
  scopes: ["autopay"], transactions: [], syncedAt: "2026-09-17T09:00:00+08:00",
  autopays: [{
    id: "ali-video", title: "视频VIP连续包月", merchant: "优酷",
    amount: 2000, cycle: "月", nextChargeAt: now + 1 * 86_400_000,
  }],
};

describe("SubscriptionCenter", () => {
  it("只有账单授权也能展示疑似订阅，且不混入已签约统计", () => {
    render(<SubscriptionCenter connections={{ alipay: { ...alipay, scopes: ["transactions"], autopays: [],
      transactions: ["07", "08", "09"].map(month => ({ id: month, title: "云盘会员", amount: -1800,
        category: "服务", kind: "payment", occurredAt: `2026-${month}-15` })),
    } }} now={now} disabledReminders={[]} onToggleReminder={vi.fn()} onCancel={vi.fn()} onConnect={vi.fn()}
      recurringReviews={{}} onReviewRecurring={vi.fn()} />);
    expect(screen.getByRole("region", { name: "账单中的周期扣费" })).toHaveTextContent("云盘会员");
    expect(screen.queryByText("已识别 1 项自动续费")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /取消.*自动续费/ })).not.toBeInTheDocument();
  });
  it("shows recognized renewals, reminders and performs confirmed cancellation", async () => {
    const onCancel = vi.fn(async () => undefined);
    render(<SubscriptionCenter
      connections={{ wechat_pay: wechat }} now={now}
      disabledReminders={[]} onToggleReminder={vi.fn()}
      onCancel={onCancel} onConnect={vi.fn()}
    />);

    expect(screen.getByText("已识别 1 项自动续费")).toBeInTheDocument();
    expect(screen.getByText("3 天后扣费")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "黑胶VIP会员包月续费提醒" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "取消黑胶VIP会员包月自动续费" }));
    expect(screen.getByRole("heading", { name: "取消自动续费" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认取消自动续费" }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith("wechat_pay", "wx-music"));
  });

  it("从宁宁对话进入时直接打开指定订阅的确认面板", async () => {
    const onSelectionConsumed = vi.fn();
    render(<SubscriptionCenter
      connections={{ alipay }}
      now={now}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onCancel={vi.fn(async () => undefined)}
      onConnect={vi.fn()}
      selectedKey="alipay:ali-video"
      onSelectionConsumed={onSelectionConsumed}
    />);

    const dialog = await screen.findByRole("dialog", { name: "取消自动续费" });
    expect(dialog).toHaveTextContent("视频VIP连续包月");
    expect(screen.getByText("来自已授权的支付宝账户")).toBeInTheDocument();
    expect(onSelectionConsumed).toHaveBeenCalledOnce();
  });

  it("guides the user to connect payment accounts when no renewal data is available", () => {
    const onConnect = vi.fn();
    render(<SubscriptionCenter
      connections={{}} now={now} disabledReminders={[]}
      onToggleReminder={vi.fn()} onCancel={vi.fn()} onConnect={onConnect}
    />);
    expect(screen.getByText("还没有可识别的订阅")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "连接微信支付或支付宝" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("suppresses disabled items from the renewal reminder while keeping them in the financial forecast", () => {
    render(<SubscriptionCenter
      connections={{ wechat_pay: wechat, alipay }} now={now}
      disabledReminders={["alipay:ali-video"]} onToggleReminder={vi.fn()}
      onCancel={vi.fn()} onConnect={vi.fn()}
    />);
    expect(screen.getByText("2 项", { selector: ".subscription-metrics strong" })).toBeInTheDocument();
    const reminder = screen.getByRole("region", { name: "续费提醒" });
    expect(reminder).toHaveTextContent("黑胶VIP会员包月");
    expect(reminder).not.toHaveTextContent("视频VIP连续包月");
    expect(reminder).not.toHaveTextContent("另有 1 项");
  });

  it("shows stale-data guidance and allows retry after provider refresh fails", () => {
    const onRefresh = vi.fn();
    render(<SubscriptionCenter
      connections={{ wechat_pay: wechat }} now={now}
      disabledReminders={[]} onToggleReminder={vi.fn()}
      onCancel={vi.fn()} onConnect={vi.fn()}
      refreshError="微信支付授权已失效，请重新连接。" onRefresh={onRefresh}
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("微信支付授权已失效");
    fireEvent.click(screen.getByRole("button", { name: "重新同步" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

it("从日程查看订阅只定位详情，不进入取消流程", async () => {
  const onCancel = vi.fn(), onFocusConsumed = vi.fn();
  render(<SubscriptionCenter connections={{ wechat_pay: wechat }} now={now} disabledReminders={[]}
    onToggleReminder={vi.fn()} onCancel={onCancel} onConnect={vi.fn()}
    focusKey="wechat_pay:wx-music" onFocusConsumed={onFocusConsumed} />);
  const item = screen.getByRole("article", { name: "黑胶VIP会员包月订阅详情" });
  await waitFor(() => expect(item).toHaveFocus());
  expect(screen.getByText("日程中的这项续费")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onCancel).not.toHaveBeenCalled();
  expect(onFocusConsumed).toHaveBeenCalledOnce();
});

it("读取失败、未授权和空清单是不同状态", () => {
  const common = { now, disabledReminders: [], onToggleReminder: vi.fn(), onCancel: vi.fn(), onConnect: vi.fn(), onRefresh: vi.fn() };
  const view = render(<SubscriptionCenter {...common} connections={{}} refreshError="平台暂时无法连接" />);
  expect(screen.getByRole("heading", { name: "暂时无法读取自动续费" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("读取失败不代表没有订阅");
  fireEvent.click(screen.getByRole("button", { name: "重新同步" }));
  expect(common.onRefresh).toHaveBeenCalledOnce();
  view.rerender(<SubscriptionCenter {...common} connections={{ wechat_pay: { ...wechat, scopes: ["transactions"], autopays: [] } }} />);
  expect(screen.getByRole("heading", { name: "还需要自动续费读取授权" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "管理读取授权" }));
  expect(common.onConnect).toHaveBeenCalledOnce();
  view.rerender(<SubscriptionCenter {...common} connections={{ wechat_pay: { ...wechat, autopays: [] } }} />);
  expect(screen.getByRole("heading", { name: "暂无已签约自动续费" })).toBeInTheDocument();
  expect(screen.queryByText("已连接的账户里暂未发现正在自动续费的服务。")).not.toBeInTheDocument();
});

it("未知扣费日期不显示已排期，已到期不冒充今天将扣费", () => {
  render(<SubscriptionCenter connections={{ wechat_pay: { ...wechat, autopays: [
    { ...wechat.autopays[0], nextChargeAt: undefined },
    { ...wechat.autopays[0], id: "overdue", title: "过期记录", nextChargeAt: now - 86400000 },
  ] } }} now={now} disabledReminders={[]} onToggleReminder={vi.fn()} onCancel={vi.fn()} onConnect={vi.fn()} />);
  expect(screen.getByText("日期待核对")).toBeInTheDocument();
  expect(screen.getByText("结果待核对")).toBeInTheDocument();
  expect(screen.queryByText("已排期")).not.toBeInTheDocument();
  expect(screen.queryByText("预计今天扣费", { selector: ".subscription-schedule strong" })).not.toBeInTheDocument();
});
