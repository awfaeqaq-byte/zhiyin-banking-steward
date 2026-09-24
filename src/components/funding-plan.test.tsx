import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConnectedFinancialSource } from "../lib/financial-connections";
import { FundingPlan } from "./funding-plan";

const now = Date.parse("2026-09-22T10:00:00+08:00");
const wechat: ConnectedFinancialSource = {
  provider: "wechat_pay", displayName: "微信支付", accountMasked: "演示账户", syncedAt: "2026-09-22",
  scopes: ["balance", "autopay"], balance: 1000, transactions: [],
  autopays: [{ id: "music", title: "音乐会员", amount: 2500, cycle: "月", nextChargeAt: Date.parse("2026-09-25T00:00:00+08:00") }],
};
const props = { connections: { wechat_pay: wechat }, now, onConnect: vi.fn(), onOpenSubscriptions: vi.fn(), onRefresh: vi.fn() };

describe("近期资金安排", () => {
  it("按账户报告缺口，展开每笔资金变化，不提供假转账按钮", async () => {
    const user = userEvent.setup();
    render(<FundingPlan {...props} connections={{ wechat_pay: wechat, alipay: { ...wechat, provider: "alipay", displayName: "支付宝", balance: 100000, autopays: [] } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("有 1 个账户需要补足余额");
    const account = screen.getByRole("region", { name: "微信支付资金测算" });
    expect(account).toHaveTextContent("需补足 ¥15");
    await user.click(within(account).getByText("查看 1 笔预计扣费"));
    expect(within(account).getByRole("table")).toHaveTextContent("音乐会员");
    expect(within(account).getByRole("table")).toHaveTextContent("-¥15");
    expect(screen.getByText(/各平台余额分别测算，不互相抵扣/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /转账|充值/ })).not.toBeInTheDocument();
  });
  it("切换测算窗口真实更新扣费清单", async () => {
    const user = userEvent.setup();
    render(<FundingPlan {...props} connections={{ wechat_pay: { ...wechat, autopays: [{ ...wechat.autopays[0], nextChargeAt: Date.parse("2026-10-02T00:00:00+08:00") }] } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("本窗口内暂无已知续费");
    await user.click(screen.getByRole("radio", { name: "未来 14 天" }));
    expect(screen.getByRole("radio", { name: "未来 14 天" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("有 1 个账户需要补足余额");
  });
  it("测算窗口支持键盘方向键", async () => {
    const user = userEvent.setup();
    render(<FundingPlan {...props} />);
    await user.click(screen.getByRole("radio", { name: "未来 7 天" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "未来 14 天" })).toBeChecked();
  });
  it("缺少权限时不显示安全结论，可以进入连接管理", async () => {
    const user = userEvent.setup(); const onConnect = vi.fn();
    render(<FundingPlan {...props} onConnect={onConnect} connections={{ wechat_pay: { ...wechat, scopes: ["autopay"] } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("还有信息需要补齐");
    expect(screen.getByText("未授权或未提供")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "管理数据连接" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
  it("同步中和失败时不把缓存缺口当成当前结论", () => {
    const view = render(<FundingPlan {...props} refreshing />);
    expect(screen.getByRole("status")).toHaveTextContent("正在核对账户数据");
    expect(screen.queryByText("有 1 个账户需要补足余额")).not.toBeInTheDocument();
    view.rerender(<FundingPlan {...props} refreshError="微信支付暂时无法同步" />);
    expect(screen.getByRole("alert")).toHaveTextContent("微信支付暂时无法同步");
    expect(screen.getByRole("status")).toHaveTextContent("暂不能给出最新资金结论");
  });
  it("无连接时解释权限边界，不显示演示银行余额", () => {
    render(<FundingPlan {...props} connections={{}} />);
    expect(screen.getByText("先连接你的支付账户")).toBeInTheDocument();
    expect(screen.queryByText(/42,300|286,540/)).not.toBeInTheDocument();
  });
  it.each([false, true])("逾期差额必须先核实，不能视为最低补款额（其他数据缺失：%s）", async incomplete => {
    const user = userEvent.setup();
    render(<FundingPlan {...props} connections={{ wechat_pay: { ...wechat, autopays: [
      { ...wechat.autopays[0], nextChargeAt: Date.parse("2026-09-20T00:00:00+08:00") },
      ...(incomplete ? [{ ...wechat.autopays[0], id: "unknown", title: "日期未定的会员", nextChargeAt: undefined }] : []),
    ] } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("到期扣费还需核实");
    expect(screen.getByRole("status")).toHaveTextContent("若到期款项仍需支付");
    expect(screen.getByText("待核实差额 ¥15")).toBeInTheDocument();
    expect(screen.queryByText(/至少需补足|可先补足/)).not.toBeInTheDocument();
    expect(screen.getByText("暂不能完整计算")).toBeInTheDocument();
    expect(screen.getAllByText(/先确认是否已支付，避免重复付款/).length).toBeGreaterThan(0);
    await user.click(screen.getByText("查看 1 笔预计扣费"));
    expect(screen.getByRole("table")).toHaveTextContent("9月20日 · 已到期");
  });
});
