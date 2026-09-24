import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import App from "./App";
import type { ConnectedFinancialSource } from "./lib/financial-connections";

const wechat: ConnectedFinancialSource = {
  provider: "wechat_pay",
  displayName: "微信支付",
  accountMasked: "叶先生",
  scopes: ["autopay"],
  transactions: [],
  syncedAt: "2026-09-17T09:00:00+08:00",
  autopays: [{
    id: "wx-music",
    title: "黑胶VIP会员包月",
    merchant: "网易云音乐",
    amount: 1500,
    cycle: "月",
    nextChargeAt: Date.parse("2026-09-20T09:00:00+08:00"),
  }],
};

it("模式仅在设置中选择，二级页面不重复首页导航，返回保留路径", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.queryByRole("button", { name: "AI 原生" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "个人中心" }));
  await user.click(screen.getByRole("button", { name: /^设置/ }));
  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: /AI 原生/ }));
  await user.click(screen.getByRole("button", { name: "返回" }));
  await user.click(screen.getByRole("button", { name: "返回" }));
  expect(screen.getByLabelText("和宁宁说点什么")).toBeInTheDocument();
  expect(localStorage.getItem("zhiyin-mode")).toBe('"native"');
});

it("AI 原生首页读取真实授权订阅，顶部入口打开同一份清单", async () => {
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ wechat_pay: wechat }));
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole("heading", { name: "宁宁发现了需要你确认的订阅" })).toBeInTheDocument();
  expect(screen.getByText("黑胶VIP会员包月")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "订阅" }));
  expect(screen.getByRole("heading", { name: "订阅与续费" })).toBeInTheDocument();
  expect(screen.getByText("已识别 1 项自动续费")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "取消黑胶VIP会员包月自动续费" })).toBeInTheDocument();
});

it("无授权数据时明确引导连接账户，而不是展示虚构交易", async () => {
  localStorage.setItem("zhiyin-mode", '"native"');
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "订阅" }));
  expect(screen.getByRole("heading", { name: "订阅与续费" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "连接微信支付或支付宝" })).toBeInTheDocument();
});
