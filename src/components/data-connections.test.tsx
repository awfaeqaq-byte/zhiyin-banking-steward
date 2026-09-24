import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataConnections } from "./data-connections";

describe("DataConnections", () => {
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
        scopes: ["balance", "transactions"],
      },
    }} onConnect={vi.fn()} onDisconnect={onDisconnect} />);

    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.queryByText(/最近同步/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新授权微信支付" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "同步微信支付" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "断开微信支付" }));
    await waitFor(() => expect(onDisconnect).toHaveBeenCalledWith("wechat_pay"));
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
