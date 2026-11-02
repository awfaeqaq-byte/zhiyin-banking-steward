import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../src/App";
import type { ConnectedFinancialSource } from "../../src/lib/financial-connections";
import {bankCards} from '../../src/lib/bank-transfer';
import {emptyMemory} from '../../src/lib/steward-memory';

afterEach(()=>vi.restoreAllMocks());

it('首页指南把示例填入草稿，保留未发内容；我的服务有明确分组',async()=>{
  localStorage.setItem('zhiyin-mode','"native"');
  const user=userEvent.setup();render(<App/>);
  const input=screen.getByRole('textbox',{name:'和宁宁说点什么'});
  await user.type(input,'我想先聊聊本周安排');
  await user.click(screen.getByRole('button',{name:'查看使用指南'}));
  const guide=screen.getByRole('dialog',{name:'可以帮你做什么'});
  await user.click(within(guide).getByRole('button',{name:'填写示例：管理订阅'}));
  expect(input).toHaveValue('我想先聊聊本周安排；帮我看看有哪些订阅要续费');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('帮我看看有哪些订阅要续费',{selector:'.steward-message *'})).not.toBeInTheDocument();
  await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'我的'}));
  for(const name of ['账户与资金','日常安排','连接与设置'])expect(screen.getByRole('heading',{name})).toBeInTheDocument();
});

it('财富和选基共享产品，带回分析不会覆盖尚未发送的计划',async()=>{
  localStorage.setItem('zhiyin-mode','"native"');
  const user=userEvent.setup();render(<App/>);
  await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'财富'}));
  await user.click(screen.getByRole('button',{name:'展开和宁宁的财富对话'}));
  await user.type(screen.getByRole('textbox',{name:'和宁宁聊财富计划'}),'先聊聊我的安排');
  await user.click(screen.getByRole('button',{name:'基金筛选'}));
  await user.click(screen.getByRole('button',{name:'查看 招商前沿医疗保健股票A'}));
  await user.click(screen.getByRole('button',{name:'请宁宁分析'}));
  expect(screen.getByRole('textbox',{name:'和宁宁聊财富计划'})).toHaveValue('先聊聊我的安排\n请帮我分析招商前沿医疗保健股票A');
  expect(screen.queryByRole('spinbutton',{name:'试算投入金额'})).not.toBeInTheDocument();
  expect(screen.queryByText(/计划投入.*30,000/)).not.toBeInTheDocument();
});

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
  expect(screen.getByRole('button',{name:/临近扣费.*黑胶VIP会员包月/})).toBeInTheDocument();
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

it("账单和银行卡归入我的，资金规划与我的关注保留入口", async()=>{
  const accounts=bankCards.map(card=>({...card,cardId:card.id,revision:0,balance:card.isPrimary?4230000:0,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true},transactions:[]}));
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/bank?view=cards')?accounts:String(url).includes('/bank')?accounts[0]:emptyMemory())));
  localStorage.setItem("zhiyin-mode", '"native"');
  const user=userEvent.setup();
  render(<App/>);
  expect(screen.getByRole('button',{name:'资金规划'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'我的关注'})).toBeInTheDocument();
  expect(screen.queryByText('卡片管理')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'资产'}));
  expect(screen.queryByRole('heading',{name:'我的银行卡'})).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'分析与规划'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'返回'}));
  await user.click(screen.getByRole('button',{name:'我的'}));
  expect(screen.getByRole('button',{name:/我的账单/})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/银行卡与安全/}));
  expect(screen.getByRole('heading',{name:'我的卡包'})).toBeInTheDocument();
  expect(await screen.findByText('3 张银行卡 · 轻点切换')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'日常支付卡，尾号 8888，正常'})).toHaveAttribute('aria-pressed','true');
});

it("资金观察进入资金规划，我的关注进入同名页面", async()=>{
  localStorage.setItem("zhiyin-mode", '"native"');
  const user=userEvent.setup();
  render(<App/>);

  expect(screen.queryByText("AI 最近发现")).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'资金规划'}));
  expect(screen.getByRole('heading',{name:'资金规划'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'资金观察'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/储蓄安排.*和宁宁一起规划/})).toBeInTheDocument();

  await user.click(screen.getByRole('button',{name:'返回'}));
  await user.click(screen.getByRole('button',{name:'我的关注'}));
  expect(screen.getByRole('heading',{name:'我的关注'})).toBeInTheDocument();
  const input=screen.getByRole('textbox',{name:'用自然语言设置我的关注'});
  await user.type(input,'以后外卖每月超过 800 元提醒我');
  await user.click(screen.getByRole('button',{name:'添加关注规则'}));
  expect(screen.getByText('外卖消费')).toBeInTheDocument();
  expect(screen.getByText('单月超过 ¥800 时提醒我')).toBeInTheDocument();
});

it('手机紧凑导航保留管家身份，资金规划和我的关注仍可从个人中心进入',async()=>{
  localStorage.setItem('zhiyin-mode','"native"');
  const user=userEvent.setup();render(<App/>);
  expect(screen.getByRole('button',{name:'资金规划'})).toHaveClass('native-header-secondary');
  expect(screen.getByRole('button',{name:'我的关注'})).toHaveClass('native-header-secondary');
  await user.click(screen.getByRole('button',{name:'我的'}));
  await user.click(screen.getByRole('button',{name:/资金规划/}));
  expect(screen.getByRole('heading',{name:'资金规划'})).toBeInTheDocument();
});
