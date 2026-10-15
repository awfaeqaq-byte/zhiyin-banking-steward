import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as phoneBridge from "./lib/phone-bridge";
import App from "./App";
import type { ConnectedFinancialSource } from "./lib/financial-connections";
import {createMessageService} from '../server/message-service';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const messageDirs:string[]=[];
afterEach(() => {vi.restoreAllMocks();messageDirs.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}));});

it('固定页头打开会话抽屉，移除品牌文字和聊天区重复入口，开关不丢草稿',async()=>{
  localStorage.setItem('zhiyin-mode','"native"');
  const user=userEvent.setup();render(<App/>);
  const header=screen.getByRole('banner');
  const menu=within(header).getByRole('button',{name:'打开会话列表'});
  expect(within(header).queryByText('知银')).not.toBeInTheDocument();
  expect(within(header).queryByText('更懂你的财富伙伴')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:'打开会话列表'})).toHaveLength(1);
  const input=screen.getByRole('textbox',{name:'和宁宁说点什么'});
  await user.type(input,'尚未发送的安排');
  await user.click(menu);
  expect(menu).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('dialog',{name:'会话管理'})).toBeVisible();
  expect(screen.getAllByRole('button',{name:'＋ 新对话'})).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'关闭会话列表'}));
  expect(screen.queryByRole('dialog',{name:'会话管理'})).not.toBeInTheDocument();
  expect(menu).toHaveAttribute('aria-expanded','false');
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBe(input);
  expect(input).toHaveValue('尚未发送的安排');
  await user.click(menu);
  expect(screen.getByRole('dialog',{name:'会话管理'})).toBeVisible();
});

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
  expect(screen.getByRole('button',{name:/临近扣费.*QQ音乐/})).toBeInTheDocument();
  expect(localStorage.getItem('zhiyin-duplicate-preferences-v1')).toContain('keep');
  view.unmount(); view = render(<App />);
  expect(screen.queryByRole('button', {name:'两个都保留'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name:'订阅'}));
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
  expect(screen.getAllByRole("banner").some(item=>item.classList.contains("fixed-chat-header"))).toBe(true);
  const navigation=screen.getByRole('navigation',{name:'主导航'});
  await user.click(within(navigation).getByRole('button',{name:'财富'}));
  expect(screen.getByRole('heading',{name:'财富'})).toBeInTheDocument();
  await user.click(within(navigation).getByRole('button',{name:'管家'}));
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBeInTheDocument();

  view.unmount();
  render(<App />);
  expect(screen.getByRole("textbox", { name: "和宁宁说点什么" })).toBeInTheDocument();
});

it("宁宁用真实授权数据回答，取消意图进入指定订阅确认页", async () => {
  vi.spyOn(phoneBridge, "refreshFinancialSource").mockResolvedValue({ status: "granted", source: alipay });
  localStorage.setItem("zhiyin-mode", '"native"');
  localStorage.setItem("zhiyin-connections", JSON.stringify({ alipay }));
  const directory=mkdtempSync(join(tmpdir(),'zhiyin-native-messages-'));messageDirs.push(directory);
  const service=createMessageService(directory,async payload=>payload.instructions.includes('任务分类器')?JSON.stringify({parts:[{taskId:null,kind:'subscriptions',title:'优酷续费',segmentIds:[0]}]}):'可以，我先带你核对优酷续费，确认后才会取消。\n[ZHIYIN_ACTION:PREPARE_CANCEL|alipay|ali-video]');
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url,init)=>{
    if(String(url).endsWith('/messages')){
      const scope=new Headers(init?.headers).get('X-Zhiyin-Expense-Scope')!,body=init?.body?JSON.parse(String(init.body)):undefined;
      let data:unknown;
      if(!body)data=service.get(scope);
      else if(body.type==='submit'){service.submit(scope,body);await service.idle(scope);data=service.get(scope);}
      else if(body.type==='claim')data=service.claim(scope,body.id,body.jobId,body.owner);
      else if(body.type==='reply')data={reply:await service.reply(scope,body),state:service.get(scope)};
      else if(body.type==='complete')data=service.complete(scope,{...body,type:'message-complete'});
      else data=service.operate(scope,{...body,type:body.type==='import'?'conversation-import':'conversation-append'});
      return new Response(JSON.stringify(data));
    }
    if(String(init?.body).includes('任务分流器'))return new Response(JSON.stringify({output_text:JSON.stringify({parts:[{taskId:null,kind:'subscriptions',title:'优酷续费',text:'帮我取消优酷会员续费'}]})}));
    return new Response(JSON.stringify(String(url).endsWith('/memory')?{version:1,revision:0,enabled:false,items:[]}:{
    output_text: "可以，我先带你核对优酷续费，确认后才会取消。\n[ZHIYIN_ACTION:PREPARE_CANCEL|alipay|ali-video]",
  }), { status: 200, headers: { "Content-Type": "application/json" } });});
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByText("优酷VIP会员连续包月")).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "和宁宁说点什么" }), "帮我取消优酷会员续费");
  await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
  await user.click(await screen.findByRole("button", { name: "核对并取消优酷VIP会员连续包月" }));

  expect(await screen.findByRole("dialog", { name: "取消自动续费" })).toHaveTextContent("优酷VIP会员连续包月");
  expect(fetchSpy).toHaveBeenCalledWith("/api/zhiyin/messages", expect.objectContaining({ method: "POST" }));
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
  expect(screen.getByRole('heading',{name:'下午好，叶先生。'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'选择私人管家'})).toHaveTextContent('阿衡');
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
