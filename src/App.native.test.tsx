import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as phoneBridge from "./lib/phone-bridge";
import App from "./App";
import type { ConnectedFinancialSource } from "./lib/financial-connections";

afterEach(() => vi.restoreAllMocks());

it('保留同类订阅后刷新仍记住，可在订阅页撤回且不关闭续费提醒', async () => {
  const now = Date.parse('2026-09-24T10:00:00+08:00');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const music: ConnectedFinancialSource = { ...alipay, syncedAt: new Date(now).toISOString(), autopays: [
    { id:'qq', title:'QQ音乐', amount:2500, cycle:'月', nextChargeAt:now + 86400000 },
    { id:'wy', title:'网易云音乐', amount:1500, cycle:'月', nextChargeAt:now + 86400000 },
  ] };
  localStorage.setItem('zhiyin-mode', '"native"');
  localStorage.setItem('zhiyin-connections', JSON.stringify({alipay:music}));
  vi.spyOn(phoneBridge, 'refreshFinancialSource').mockResolvedValue({status:'granted',source:music});
  const user = userEvent.setup();
  let view = render(<App />);
  await waitFor(() => expect(screen.getByRole('button', {name:'两个都保留'})).toBeEnabled());
  await user.click(screen.getByRole('button', {name:'两个都保留'}));
  expect(screen.queryByText('可能重复订阅')).not.toBeInTheDocument();
  expect(screen.getByText('临近扣费')).toBeInTheDocument();
  expect(localStorage.getItem('zhiyin-duplicate-preferences-v1')).toContain('keep');
  view.unmount(); view = render(<App />);
  await waitFor(() => expect(screen.getByRole('button', {name:'查看全部订阅'})).toBeInTheDocument());
  expect(screen.queryByRole('button', {name:'两个都保留'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name:'查看全部订阅'}));
  await waitFor(() => expect(screen.getByRole('button', {name:'重新评估这组订阅'})).toBeEnabled());
  expect(screen.getByRole('switch', {name:'QQ音乐续费提醒'})).toBeChecked();
  await user.click(screen.getByRole('button', {name:'重新评估这组订阅'}));
  expect(localStorage.getItem('zhiyin-duplicate-preferences-v1')).toBe('{}');
  expect(screen.getByRole('switch', {name:'网易云音乐续费提醒'})).toBeChecked();
});

const alipay: ConnectedFinancialSource = {
  provider: "alipay",
  displayName: "支付宝",
  accountMasked: "叶先生",
  scopes: ["autopay"],
  transactions: [],
  syncedAt: "2026-09-17T09:00:00+08:00",
  autopays: [{
    id: "ali-video",
    title: "优酷VIP会员连续包月",
    merchant: "优酷",
    amount: 2500,
    cycle: "月",
    nextChargeAt: Date.now() + 8 * 24 * 60 * 60 * 1000,
  }],
};

async function switchMode(
  user: ReturnType<typeof userEvent.setup>,
  name: "经典款" | "AI 原生",
) {
  if (screen.queryByRole("button", { name: "个人中心" })) {
    await user.click(screen.getByRole("button", { name: "个人中心" }));
  }
  await user.click(screen.getByRole("button", { name: /^设置/ }));
  await user.click(screen.getByRole("radio", { name: new RegExp(name) }));
  await user.click(screen.getByRole("button", { name: "返回" }));
  await user.click(screen.getByRole("button", { name: "返回" }));
}

it("经典模式保留，AI 原生首页可切换并记住选择", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  expect(screen.getByRole("heading", { name: "今天想办理什么？" })).toBeInTheDocument();

  await switchMode(user, "AI 原生");
  expect(screen.getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "和宁宁说点什么" })).toBeInTheDocument();
  expect(screen.getByRole("banner")).toHaveClass("fixed-chat-header");

  view.unmount();
  render(<App />);
  expect(screen.getByRole("textbox", { name: "和宁宁说点什么" })).toBeInTheDocument();
});

it("宁宁用真实授权数据回答，取消意图进入指定订阅确认页", async () => {
  vi.spyOn(phoneBridge, "refreshFinancialSource").mockResolvedValue({ status: "granted", source: alipay });
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ alipay }));
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith('/memory')?{version:1,revision:0,enabled:false,items:[]}:{
    output_text: "可以，我先带你核对优酷续费，确认后才会取消。\n[ZHIYIN_ACTION:PREPARE_CANCEL|alipay|ali-video]",
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByText("优酷VIP会员连续包月")).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "和宁宁说点什么" }), "帮我取消优酷会员续费");
  await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
  await user.click(await screen.findByRole("button", { name: "核对并取消优酷VIP会员连续包月" }));

  expect(await screen.findByRole("dialog", { name: "取消自动续费" })).toHaveTextContent("优酷VIP会员连续包月");
  expect(fetchSpy).toHaveBeenCalledWith("/api/zhiyin/steward-reply", expect.objectContaining({ method: "POST" }));
  fetchSpy.mockRestore();
});

it("首页加载、手机回到前台和返回首页都会同步订阅", async () => {
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ alipay }));
  const refresh = vi.spyOn(phoneBridge, "refreshFinancialSource").mockResolvedValue({ status: "granted", source: alipay });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  refresh.mockResolvedValue({ status: "granted", source: { ...alipay, autopays: [] } });
  fireEvent(window, new Event("zhiyin-phone-foreground"));
  await waitFor(() => expect(screen.queryByRole("button", { name: "查看全部订阅" })).not.toBeInTheDocument());
  expect(screen.queryByText(/已检查|0 项订阅/)).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "个人中心" }));
  await user.click(screen.getByRole("button", { name: "返回" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
});

it("账单候选的用户确认会保存，且不会创建可取消的签约", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-22"));
  const historical: ConnectedFinancialSource = { ...alipay, scopes: ["transactions"], autopays: [],
    transactions: ["07", "08", "09"].map(month => ({ id: month, title: "云盘会员", amount: -1800,
      category: "服务", kind: "payment", occurredAt: `2026-${month}-15` })),
  };
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ alipay: historical }));
  vi.spyOn(phoneBridge, "refreshFinancialSource").mockResolvedValue({ status: "granted", source: historical });
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(screen.getByRole("button", { name: "订阅" }));
  await user.click(await screen.findByRole("button", { name: "这是订阅" }));
  expect(screen.getByText("你已确认是订阅")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /取消.*自动续费/ })).not.toBeInTheDocument();
  view.unmount();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "订阅" }));
  expect(await screen.findByText("你已确认是订阅")).toBeInTheDocument();
});

it("取消签约后不会把它的历史扣费重新识别为疑似订阅", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-22"));
  const source: ConnectedFinancialSource = { ...alipay, scopes: ["transactions", "autopay"],
    transactions: ["07", "08", "09"].map(month => ({ id: month, title: "优酷VIP会员连续包月", amount: -2500,
      category: "服务", kind: "payment", occurredAt: `2026-${month}-15`, linkedId: `alipay-subscription:ali-video:${month}` })),
  };
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ alipay: source }));
  vi.spyOn(phoneBridge, "refreshFinancialSource").mockResolvedValue({ status: "granted", source });
  const cancel = vi.spyOn(phoneBridge, "cancelFinancialAutopay").mockResolvedValue({ status: "cancelled" });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "订阅" }));
  await user.click(await screen.findByRole("button", { name: "取消优酷VIP会员连续包月自动续费" }));
  await user.click(screen.getByRole("button", { name: "确认取消自动续费" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith("alipay", "ali-video"));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "取消自动续费" })).not.toBeInTheDocument());
  expect(screen.queryByRole("region", { name: "账单中的周期扣费" })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("zhiyin-connections")!).alipay.cancelledAutopayIds).toContain("ali-video");
});

it("切换私人管家后，对话入口和首页文案同步更新", async () => {
  localStorage.setItem("zhiyin-mode", '"native"');
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "选择私人管家" }));
  await user.click(screen.getByRole("button", { name: "选择阿衡" }));
  expect(screen.getByText(/阿衡只会在有需要时提醒你/)).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "和阿衡说点什么" })).toBeInTheDocument();
});

it("资产页进入真实资金安排并保留返回路径", async () => {
  localStorage.setItem("zhiyin-mode", '"native"');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "资产" }));
  await user.click(screen.getByRole("button", { name: /近期资金安排/ }));
  expect(screen.getByRole("heading", { name: "近期资金安排" })).toBeInTheDocument();
  expect(screen.getByText("先连接你的支付账户")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "返回" }));
  expect(screen.getByRole("heading", { name: "我的资产" })).toBeInTheDocument();
});
