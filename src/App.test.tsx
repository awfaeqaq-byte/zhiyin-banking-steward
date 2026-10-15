import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi,beforeEach,afterEach } from "vitest";
import {emptyMemory,updateMemory,type MemoryCommand} from './lib/steward-memory';
import App from "./App";
beforeEach(()=>{
 let bank={revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true},transactions:[],assetSummary:{cash:4230000,availableCash:4230000,reservedCash:0,wealth:0,deposits:0,total:4230000,holdingCount:0,depositCount:0}};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
  if(String(url).includes('/api/zhiyin/bank')){if(options?.method==='POST'){const body=JSON.parse(String(options.body));bank={...bank,...body,revision:bank.revision+1};}return new Response(JSON.stringify(bank));}
  return new Response(JSON.stringify(emptyMemory()));
 });
});
afterEach(()=>vi.restoreAllMocks());

describe("知银交互原型", () => {
  it("转账结果保留分，挂失后可通过演示入口恢复", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "个人中心" }));
    await user.click(screen.getByRole("button", { name: /银行卡与安全/ }));
    await user.click(screen.getByRole("button", { name: "挂失这张卡" }));
    await user.click(screen.getByRole("button", { name: "确认模拟挂失" }));
    await user.click(
      screen.getByRole("button", { name: "恢复卡片" }),
    );
    await user.click(screen.getByRole("button", { name: "确认恢复卡片" }));
    await user.click(
      within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
        "button",
        { name: "管家" },
      ),
    );
    await user.click(screen.getByRole("button", { name: /给妈妈转 2000/ }));
    await user.clear(screen.getByLabelText("转账金额（元）"));
    await user.type(screen.getByLabelText("转账金额（元）"), "0.01");
    await user.click(screen.getByRole("button", { name: "核对转账方案" }));
    await user.click(screen.getByRole("button", { name: "确认模拟预约" }));
    expect(
      screen.getByRole("heading", { name: "转给妈妈 ¥0.01" }),
    ).toBeInTheDocument();
  });
  it("转账需要两步确认，且校验金额", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /给妈妈转 2000/ }));
    const amount = screen.getByLabelText("转账金额（元）");
    await user.clear(amount);
    await user.type(amount, "25000");
    await user.click(screen.getByRole("button", { name: "核对转账方案" }));
    expect(screen.getByRole("alert")).toHaveTextContent("不超过 ¥20,000");
    await user.clear(amount);
    await user.type(amount, "2000");
    await user.click(screen.getByRole("button", { name: "核对转账方案" }));
    expect(
      screen.getByRole("heading", { name: "请核对并确认" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认模拟预约" }));
    expect(
      screen.getByText("本地流程已完成，未发生银行扣款。"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "撤销这笔预约" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("资金规划先进行风险测评，不展示固定资产配置", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /帮我选一个稳妥/ }));
    expect(screen.getByRole("heading", { name: "财富" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始风险测评" })).toBeInTheDocument();
    expect(screen.queryByText("资产配置建议")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成待确认申购方案" })).not.toBeInTheDocument();
    expect(screen.queryByText(/沙箱申购已完成/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByRole("heading", { name: "今天想办理什么？" })).toBeInTheDocument();
  });

  it("卡片开关保存，挂失须确认", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "个人中心" }));
    await user.click(screen.getByRole("button", { name: /银行卡与安全/ }));
    const overseas = screen.getByRole("switch", { name: "境外交易" });
    expect(overseas).not.toBeChecked();
    await user.click(overseas);
    expect(screen.getByRole('dialog',{name:'确认开启境外交易？'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'确认开启'}));
    expect(overseas).toBeChecked();
    expect(JSON.parse(localStorage.getItem("zhiyin-controls")!).overseas).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "挂失这张卡" }));
    await user.click(screen.getByRole("button", { name: "暂不挂失" }));
    expect(
      screen.getByRole("button", { name: "挂失这张卡" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "挂失这张卡" }));
    await user.click(screen.getByRole("button", { name: "确认模拟挂失" }));
    expect(screen.getByText("已挂失")).toBeInTheDocument();
  });

  it("自然语言调额只预填独立核对页，取消不变更，确认后更新", async () => {
    const user=userEvent.setup();render(<App/>);
    await user.type(screen.getByLabelText("告诉宁宁你想办理的事"),"把单笔限额调到5000元");
    await user.click(screen.getByRole("button",{name:"发送给宁宁"}));
    expect(screen.getByRole("dialog",{name:"调整单笔支付限额"})).toBeInTheDocument();
    expect(screen.getByLabelText("单笔限额（元）")).toHaveValue(5000);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog",{name:"调整单笔支付限额"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:/单笔支付限额/}));
    expect(screen.getByLabelText("单笔限额（元）")).toHaveValue(20000);
    await user.clear(screen.getByLabelText("单笔限额（元）"));
    await user.type(screen.getByLabelText("单笔限额（元）"),"5000");
    await user.click(screen.getByRole("button",{name:"确认调整"}));
    expect(screen.getByText(/单笔限额已调整为/)).toBeInTheDocument();
  });

  it("长期记忆可保存删除，切换管家保留选择", async () => {
    let memory=emptyMemory();
    const memoryFetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
      if(options?.method==='POST')memory=updateMemory(memory,JSON.parse(String(options.body)) as MemoryCommand);
      return new Response(JSON.stringify(memory),{status:200});
    });
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "个人中心" }));
    await user.click(screen.getByRole("button", { name: /管理记忆/ }));
    await user.click(screen.getByRole('switch',{name:'允许记住我的偏好'}));
    await user.type(screen.getByLabelText('记忆内容'),'转账前核对备注');
    await user.click(screen.getByRole('button',{name:'添加记忆'}));
    await user.click(await screen.findByRole('button',{name:'删除记忆：转账前核对备注'}));
    expect(memory.items).toHaveLength(0);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "切换管家" }));
    await user.click(screen.getByRole("button", { name: "选择阿衡" }));
    view.unmount();
    render(<App />);
    expect(screen.getByLabelText("告诉阿衡你想办理的事")).toBeInTheDocument();
    memoryFetch.mockRestore();
  });
  it("展示管家首页并可隐藏资产数字", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "今天想办理什么？" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("¥42,300.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "隐藏资产金额" }));
    expect(screen.queryByText("¥42,300.00")).not.toBeInTheDocument();
    expect(screen.getByText("¥ •••,•••.••")).toBeInTheDocument();
  });

  it("可从快捷指令进入消费分析", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /分析这个月的钱花在哪/ }),
    );
    expect(screen.getByRole("heading", { name: "我的账单" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账单报告" })).toBeInTheDocument();
    expect(screen.getByText(/当前授权范围没有返回可用账单记录/)).toBeInTheDocument();
  });

  it("可通过底部导航进入我的页面", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
        "button",
        { name: "我的" },
      ),
    );
    expect(screen.getByRole("heading", { name: "我的" })).toBeInTheDocument();
    expect(screen.getByText("宁宁对我的了解")).toBeInTheDocument();
  });

  it("可从我的页面切换私人管家", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
        "button",
        { name: "我的" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "切换管家" }));
    expect(
      screen.getByRole("dialog", { name: "选择你的私人管家" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /选择阿衡/ }));
    expect(screen.getByText("阿衡对我的了解")).toBeInTheDocument();
    expect(screen.getByText("沉稳直接，擅长分析与提醒")).toBeInTheDocument();
  });

  it("自由输入后生成待确认方案，不直接执行", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByLabelText("告诉宁宁你想办理的事"),
      "给妈妈转2000元",
    );
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));

    expect(
      screen.getByRole("heading", { name: "我先帮你整理好了" }),
    ).toBeInTheDocument();
    expect(screen.getByText("尚未执行，需要你本人确认")).toBeInTheDocument();
  });

  it("资产健康入口进入实际风险测评，不展示固定评级变化", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation",{name:"主导航"})).getByRole("button",{name:"资产"}));
    await user.click(screen.getByRole("button",{name:/理财风险测评与持仓/}));
    expect(screen.getByRole("heading",{name:"财富"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"开始风险测评"})).toBeInTheDocument();
    expect(screen.queryByText("当前建议仓位")).not.toBeInTheDocument();
  });
});
