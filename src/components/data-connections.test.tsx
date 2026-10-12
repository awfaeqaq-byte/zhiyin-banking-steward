import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataConnections } from "./data-connections";

describe("DataConnections", () => {
  it('聊天指定的平台入口离开后不影响之后从设置正常进入',()=>{
    const consumed=vi.fn();
    render(<DataConnections initialProvider="alipay" onEntryConsumed={consumed} connections={{}} onConnect={vi.fn()} onDisconnect={vi.fn()}/>);
    expect(screen.getByRole('dialog')).toHaveTextContent('连接支付宝');
    expect(consumed).toHaveBeenCalledTimes(1);
  });
  it("explains scopes before connecting and submits the selected scopes", async () => {
    const onConnect = vi.fn(async () => undefined);
    render(<DataConnections connections={{}} onConnect={onConnect} onDisconnect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "连接支付宝" }));
    expect(screen.getByRole("heading", { name: "连接支付宝" })).toBeInTheDocument();
    expect(screen.getByText("读取账户余额")).toBeInTheDocument();
    expect(screen.getByText("读取交易账单")).toBeInTheDocument();
    expect(screen.getByText("读取自动扣费")).toBeInTheDocument();
    expect(screen.getByText("第一步：同意知银使用这些数据")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续到支付宝确认" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "继续到支付宝确认" }));
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith(
      "alipay", ["balance", "transactions", "autopay"],
    ));
  });

  it("shows a connected source and exposes disconnect as an explicit action", async () => {
    const onDisconnect = vi.fn(async () => undefined);
    render(<DataConnections connections={{
      wechat_pay: {
        provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
        balance: 32_860, transactions: [], autopays: [], syncedAt: "2026-09-15T09:41:00+08:00",
        transactionCoverage: { total: 1_971, returned: 1_971, invalid: 0, complete: true },
        scopes: ["balance", "transactions"],
      },
    }} onConnect={vi.fn()} onDisconnect={onDisconnect} />);

    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.getByText(/1971\/1971 笔.*已完整同步/)).toBeInTheDocument();
    expect(screen.queryByText(/最近同步/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新授权微信支付" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "同步微信支付" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "断开微信支付" }));
    await waitFor(() => expect(onDisconnect).toHaveBeenCalledWith("wechat_pay"));
  });

  it("显示账单覆盖缺口和无效记录", () => {
    render(<DataConnections connections={{
      wechat_pay: {
        provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
        transactions: [], autopays: [], syncedAt: "2026-09-15T09:41:00+08:00",
        transactionCoverage: { total: 5_002, returned: 5_000, invalid: 2, complete: false },
        scopes: ["transactions"],
      },
    }} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByText(/5000\/5002 笔.*2 笔格式无效.*数据不完整/)).toBeInTheDocument();
  });

  it("keeps a connected source visible when partner revocation fails", async () => {
    const onDisconnect = vi.fn(async () => { throw new Error("微信支付暂未确认断开"); });
    render(<DataConnections connections={{
      wechat_pay: {
        provider: "wechat_pay", displayName: "微信支付", accountMasked: "叶先生",
        balance: 32_860, transactions: [], autopays: [], syncedAt: "2026-09-15T09:41:00+08:00",
        scopes: ["balance", "transactions", "autopay"],
      },
    }} onConnect={vi.fn()} onDisconnect={onDisconnect} />);

    fireEvent.click(screen.getByRole("button", { name: "断开微信支付" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("微信支付暂未确认断开");
    expect(screen.getByText("已连接")).toBeInTheDocument();
  });
});
