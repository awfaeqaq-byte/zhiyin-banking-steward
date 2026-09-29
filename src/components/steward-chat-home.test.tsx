import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StewardChatHome } from "./steward-chat-home";
import type { ConnectedFinancialSource } from "../lib/financial-connections";
import type { StewardReplyFn } from "../lib/steward-chat";
import { duplicateGroupKey } from '../lib/subscription-insights';
import {emptyMemory,updateMemory} from '../lib/steward-memory';
import type {StewardMemoryController} from '../lib/use-steward-memory';

const alipay: ConnectedFinancialSource = {
  provider: "alipay",
  displayName: "支付宝",
  accountMasked: "叶先生",
  scopes: ["autopay"],
  transactions: [],
  syncedAt: "2026-09-17",
  autopays: [{
    id: "sub-video",
    title: "优酷VIP会员连续包月",
    merchant: "优酷",
    amount: 2500,
    cycle: "月",
    nextChargeAt: new Date("2026-09-25T00:00:00+08:00").getTime(),
  }],
};

describe("宁宁真实对话首页", () => {
  it('进入具体任务后不再挤入首页订阅信息',()=>{
    render(<StewardChatHome workspace={{id:'dinner',kind:'aa',title:'今晚聚餐',status:'active',updatedAt:0,messages:[],summary:'',memoryRevision:0}} stewardName="宁宁" stewardImage="/n.png" connections={{alipay}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()}/>);
    expect(screen.getByRole('heading',{name:'今晚聚餐'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'哪些会员快扣费了？'})).not.toBeInTheDocument();
  });
  it('转账规划读取最新授权账单和续费，平台失败时不使用旧快照作保证',async()=>{
    const user=userEvent.setup();
    const reply=vi.fn<StewardReplyFn>(async()=>({text:'需要留多少还款预算？'}));
    const refresh=vi.fn(async()=>({connections:{},error:'平台暂时不可用'}));
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]})));
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{alipay}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply} refreshSubscriptions={refresh}/>);
    await user.type(screen.getByRole('textbox'),'给妈妈转2000，留够还款的钱');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
    await screen.findByText('需要留多少还款预算？');
    expect(refresh).toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatchObject({bank:{balance:4230000},subscriptions:[],transferBackground:expect.stringContaining('未能更新')});
    expect(reply.mock.calls[0][0].fundingForecast?.accounts).toHaveLength(0);
  });
  it('已有预约失败时管家展示真实结果并支持收起，不会代用户重试',async()=>{
    const open=vi.fn();
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({revision:2,balance:10000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],schedules:[{id:'follow',recipientId:'mom',amount:200000,executeAt:Date.now()-1000,createdAt:1,status:'failed',error:'余额不足'}]})));
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onPrepareTransfer={open}/>);
    const notice=await screen.findByRole('region',{name:'转账进展'});
    expect(notice).toHaveTextContent('余额不足');expect(notice).toHaveTextContent('未扣款');
    await userEvent.click(within(notice).getByRole('button',{name:'查看安排'}));
    expect(open).toHaveBeenCalledWith({kind:'records'});
    await userEvent.click(within(notice).getByRole('button',{name:'知道了'}));
    expect(screen.queryByRole('region',{name:'转账进展'})).not.toBeInTheDocument();
  });
  it('开启画像后自动保存有原话依据的暂定理解，页面不露出模型标记',async()=>{
    const user=userEvent.setup();let state=updateMemory(emptyMemory(),{type:'enabled',enabled:true,revision:0});
    state=updateMemory(state,{type:'profile',profileAction:'enable',enabled:true,revision:state.revision});
    const change=vi.fn(async()=>true);
    const memory:StewardMemoryController={state,error:'',busy:false,current:{current:state},refresh:async()=>state,change};
    const reply=vi.fn<StewardReplyFn>(async()=>({text:'好，我先说结论。<impression>{"topic":"communication","text":"喜欢先听结论","quote":"先说结论"}</impression>'}));
    render(<StewardChatHome memory={memory} stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
    await user.type(screen.getByRole('textbox'),'先说结论');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
    await screen.findByText('好，我先说结论。');
    expect(change).toHaveBeenCalledWith(expect.objectContaining({type:'profile',profileAction:'observe',observation:expect.objectContaining({quote:'先说结论',userText:'先说结论'})}));
    expect(screen.queryByText(/<impression>/)).not.toBeInTheDocument();
  });
  it('长期记忆被读取，模型候选经用户确认才保存',async()=>{
    const user=userEvent.setup();
    let state=updateMemory(emptyMemory(),{type:'enabled',enabled:true,revision:0});
    state=updateMemory(state,{type:'save',text:'偏好高铁',category:'preference',revision:1});
    const change=vi.fn(async()=>true);
    const memory:StewardMemoryController={state,error:'',busy:false,current:{current:state},refresh:async()=>state,change};
    const reply=vi.fn<StewardReplyFn>(async()=>({text:'了解。<memory>{"text":"经常出差","category":"habit","quote":"我经常出差"}</memory>'}));
    render(<StewardChatHome memory={memory} stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
    await user.type(screen.getByRole('textbox'),'我经常出差');
    await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
    await screen.findByRole('button',{name:'确认记住'});
    expect(reply.mock.calls[0][0].memoryContext).toContain('偏好高铁');
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'确认记住'}));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({type:'save',text:'经常出差',quote:'我经常出差',origin:'conversation'}));
    expect(screen.getByRole('status')).toHaveTextContent('已保存');
  });
  it('重新开始上下文不会删除聊天，但不再向模型发送旧消息',async()=>{
    localStorage.setItem('zhiyin-steward-chat-v3',JSON.stringify([{id:'old',role:'user',content:'不再使用的旧偏好'}]));
    localStorage.setItem('zhiyin-steward-context-cutoff','old');
    const user=userEvent.setup(),reply=vi.fn<StewardReplyFn>(async()=>({text:'新的对话。'}));
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}/>);
    await user.type(screen.getByRole('textbox'),'你好');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));await screen.findByText('新的对话。');
    expect(reply.mock.calls[0][0].messages).toEqual([{role:'user',content:'你好'}]);
    expect(localStorage.getItem('zhiyin-steward-chat-v3')).toContain('不再使用的旧偏好');
  });
  it('按需展示模型选项，点选发送原文继续对话，不直接执行取消',async()=>{
    const user=userEvent.setup();
    const prepare=vi.fn();
    const reply=vi.fn<StewardReplyFn>().mockResolvedValueOnce({text:'这个会员还在用吗？\n[[choices:经常用|不太用了]]'}).mockResolvedValueOnce({text:'那先核对扣费协议。'});
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{alipay}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={prepare} reply={reply}/>);
    await user.type(screen.getByRole('textbox'),'帮我看看会员');
    await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
    await user.click(await screen.findByRole('button',{name:'不太用了'}));
    await screen.findByText('那先核对扣费协议。');
    expect(reply.mock.calls[1][0].messages.at(-1)?.content).toBe('不太用了');
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{name:'经常用'})).not.toBeInTheDocument();
    expect(screen.queryByText(/\[\[choices:/)).not.toBeInTheDocument();
  });
  it('把最新授权普通账单的计算结果交给宁宁', async()=>{
    const user=userEvent.setup();
    const reply=vi.fn<StewardReplyFn>(async()=>({text:'本月餐饮支出25元。'}));
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}
      refreshSubscriptions={async()=>({connections:{alipay:{...alipay,scopes:['transactions'],transactions:[{id:'lunch',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-17'}]}},error:''})} />);
    await user.type(screen.getByRole('textbox',{name:'和宁宁说点什么'}),'这个月账单情况');
    await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
    await screen.findByText('本月餐饮支出25元。');
    expect(reply.mock.calls[0]?.[0]).toMatchObject({billAnalysis:{expense:2500,sources:['支付宝']}});
    expect(screen.getByRole('region',{name:'账单分析结果'})).toBeVisible();
    expect(screen.queryByRole('region',{name:'管家工作台'})).not.toBeInTheDocument();
  });
  it('uses a task workspace with real side-by-side subscriptions, not a transcript by default', async () => {
    const user = userEvent.setup();
    localStorage.setItem('zhiyin-steward-chat-v3', JSON.stringify([{id:'old',role:'assistant',content:'之前聊过的话'}]));
    const music = {...alipay, autopays:[
      {id:'qq',title:'QQ音乐',amount:2500,cycle:'月'},
      {id:'wy',title:'网易云音乐',amount:1500,cycle:'月'},
    ]};
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{alipay:music}}
      disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onDuplicatePreference={vi.fn()} />);
    const desk = screen.getByRole('region', {name:'管家工作台'});
    expect(within(desk).getByRole('list', {name:'需要你决定的订阅'})).toBeInTheDocument();
    expect(within(desk).getByText('每月合计 ¥40')).toBeInTheDocument();
    expect(screen.queryByText('之前聊过的话')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:/对话记录/}));
    expect(screen.getByText('之前聊过的话')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:/对话记录/}));
    await user.click(screen.getByRole('button', {name:'两个都保留'}));
    expect(screen.getByRole('status')).toHaveTextContent('按你的选择保留');
    expect(screen.queryByRole('list', {name:'需要你决定的订阅'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:'收起'}));
    expect(screen.getByRole('textbox', {name:'和宁宁说点什么'})).toHaveFocus();
  });
  it('applies the conversational choice and keeps urgent renewal visible after remembering it', async () => {
    const user = userEvent.setup(); const onDuplicatePreference = vi.fn(); const onToggleReminder = vi.fn();
    const music = { ...alipay, autopays: [
      { id: 'qq', title: 'QQ音乐', amount: 2500, cycle: '月', nextChargeAt: Date.parse('2026-09-25') },
      { id: 'wy', title: '网易云音乐', amount: 1500, cycle: '月', nextChargeAt: Date.parse('2026-09-25') },
    ] };
    const key = duplicateGroupKey([{key:'alipay:qq'}, {key:'alipay:wy'}]);
    const reply = vi.fn<StewardReplyFn>(async () => ({ text: '好', action: { type:'set_duplicate_preference', groupId: key, decision:'keep' } }));
    const props = { stewardName:'宁宁', stewardImage:'/n.png', connections:{alipay:music}, now:Date.parse('2026-09-24'), disabledReminders:[], onToggleReminder,
      onOpenSubscriptions:vi.fn(), onPrepareCancel:vi.fn(), onDuplicatePreference, reply };
    const view = render(<StewardChatHome {...props} />);
    await user.type(screen.getByRole('textbox'), '这两个我都要留，以后别提醒重复了');
    await user.click(screen.getByRole('button', { name:'发送给宁宁' }));
    await waitFor(() => expect(onDuplicatePreference).toHaveBeenCalledWith(key, 'keep'));
    expect(onToggleReminder).not.toHaveBeenCalled();
    view.rerender(<StewardChatHome {...props} duplicatePreferences={{[key]:{decision:'keep'}}} />);
    expect(screen.queryByText('可能重复订阅')).not.toBeInTheDocument();
    expect(screen.getByText('临近扣费')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), '我保留的是什么');
    await user.click(screen.getByRole('button', { name:'发送给宁宁' }));
    await waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
    expect(reply.mock.calls[1][0].duplicateGroups?.[0].kept).toBe(true);
  });
  it('retains a duplicate group without disabling renewal reminders', async () => {
    const user = userEvent.setup(); const onDuplicatePreference = vi.fn(); const onToggleReminder = vi.fn();
    const music = { ...alipay, autopays: [
      { id: 'qq', title: 'QQ音乐', amount: 2500, cycle: '月', nextChargeAt: Date.parse('2026-10-10') },
      { id: 'wy', title: '网易云音乐', amount: 1500, cycle: '月', nextChargeAt: Date.parse('2026-10-11') },
    ] };
    render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{alipay: music}}
      now={Date.parse('2026-09-24')} disabledReminders={[]} onToggleReminder={onToggleReminder}
      onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onDuplicatePreference={onDuplicatePreference} />);
    await user.click(screen.getByRole('button', { name: '两个都保留' }));
    expect(onDuplicatePreference).toHaveBeenCalledWith(expect.any(String), 'keep');
    expect(onToggleReminder).not.toHaveBeenCalled();
    expect(screen.getByText(/正常的续费提醒仍然保留/)).toBeInTheDocument();
  });
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("平台余额不足优先呈现资金事件，进入资金安排且把最新测算发给模型", async () => {
    const user = userEvent.setup(); const onOpenFunding = vi.fn();
    const source: ConnectedFinancialSource = { ...alipay, scopes: ["balance", "autopay"], balance: 1000 };
    const reply = vi.fn<StewardReplyFn>(async () => ({ text: "按支付宝余额看还差15元。", action: { type: "open_funding" } }));
    const props = { stewardName: "宁宁", stewardImage: "/ningning.png", connections: { alipay: source },
      disabledReminders: [], onToggleReminder: vi.fn(), onOpenSubscriptions: vi.fn(), onPrepareCancel: vi.fn(),
      onOpenFunding, reply, now: Date.parse("2026-09-22T10:00:00+08:00") };
    const view = render(<StewardChatHome {...props} />);
    expect(screen.getByText("近期续费可能余额不足")).toBeInTheDocument();
    expect(screen.queryByText("临近扣费")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /支付宝.*需补足/ }));
    expect(onOpenFunding).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "接下来一周的钱够续费吗？" }));
    await waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({ fundingForecast: expect.objectContaining({ shortfallTotal: 1500 }) })));
    await user.click(await screen.findByRole("button", { name: "查看近期资金安排" }));
    expect(onOpenFunding).toHaveBeenCalledTimes(2);
    view.rerender(<StewardChatHome {...props} connections={{ alipay: { ...source, balance: 10000 } }} />);
    expect(screen.queryByText("近期续费可能余额不足")).not.toBeInTheDocument();
  });
  it.each([false, true])("首页把逾期待扣差额显示为待核实，而不是确定缺口（其他数据缺失：%s）", incomplete => {
    render(<StewardChatHome stewardName="宁宁" stewardImage="/ningning.png"
      connections={{ alipay: { ...alipay, scopes: ["balance", "autopay"], balance: 1000, autopays: [
        { ...alipay.autopays[0], nextChargeAt: Date.parse("2026-09-20T00:00:00+08:00") },
        ...(incomplete ? [{ ...alipay.autopays[0], id: "unknown", nextChargeAt: undefined }] : []),
      ] } }}
      now={Date.parse("2026-09-22T10:00:00+08:00")} disabledReminders={[]}
      onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onOpenFunding={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "宁宁发现一笔到期扣费需要核实" })).toBeInTheDocument();
    expect(screen.getByText("待核实差额")).toBeInTheDocument();
    expect(screen.getByText(/先确认是否已支付，避免重复付款/)).toBeInTheDocument();
    expect(screen.queryByText(/至少需补足|近期续费可能余额不足/)).not.toBeInTheDocument();
  });
  it("同步失败不会继续展示缓存的余额不足结论", () => {
    render(<StewardChatHome stewardName="宁宁" stewardImage="/ningning.png"
      connections={{ alipay: { ...alipay, scopes: ["balance", "autopay"], balance: 1000 } }}
      now={Date.parse("2026-09-22T10:00:00+08:00")} disabledReminders={[]}
      refreshError="账户数据暂时无法同步" onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()}
      onOpenFunding={vi.fn()} onPrepareCancel={vi.fn()} />);
    expect(screen.queryByText("近期续费可能余额不足")).not.toBeInTheDocument();
  });
  it("把新发现的账单证据传给模型，忽略后不再推荐该候选", async () => {
    const user = userEvent.setup();
    const reply = vi.fn<StewardReplyFn>(async () => ({ text: "这三笔是疑似周期付款，需要你核实。" }));
    const connection: ConnectedFinancialSource = { ...alipay, scopes: ["transactions"], autopays: [],
      transactions: ["07", "08", "09"].map(month => ({ id: month, title: "云盘会员", amount: -1800,
        category: "服务", kind: "payment", occurredAt: `2026-${month}-15` })),
    };
    const props = { stewardName: "宁宁", stewardImage: "/ningning.png", connections: { alipay: connection },
      disabledReminders: [], onToggleReminder: vi.fn(), onOpenSubscriptions: vi.fn(), onPrepareCancel: vi.fn(), reply,
      now: Date.parse("2026-09-17"),
    };
    const view = render(<StewardChatHome {...props} />);
    expect(screen.getByText("疑似周期扣费 · 待核对")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "还有别的周期扣费吗");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    await waitFor(() => expect(reply).toHaveBeenCalledOnce());
    const request = vi.mocked(reply).mock.calls[0][0] as unknown as { recurringCandidates: Array<{ key: string; evidence: unknown[] }> };
    expect(request.recurringCandidates[0].evidence).toHaveLength(3);
    view.rerender(<StewardChatHome {...props} recurringReviews={{ [request.recurringCandidates[0].key]: "dismissed" }} />);
    expect(screen.queryByText("疑似周期扣费 · 待核对")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "现在呢");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    await waitFor(() => expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ recurringCandidates: [] })));
  });
  it("发送前等待同步，并把新快照而非旧属性传给模型", async () => {
    const user = userEvent.setup();
    const reply = vi.fn(async () => ({ text: "已核对最新订阅" }));
    const refresh = vi.fn(async () => ({ connections: { alipay: { ...alipay, scopes: ["balance", "autopay"] as ConnectedFinancialSource["scopes"], balance: 5000, syncedAt: "2026-09-22T10:00:00+08:00", autopays: [
      { ...alipay.autopays[0], id: "new-sub", title: "新添加的会员" },
    ] } }, error: "" }));
    render(<StewardChatHome stewardName="宁宁" stewardImage="/ningning.png"
      connections={{ alipay }} disabledReminders={[]} onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply} refreshSubscriptions={refresh} />);
    await user.type(screen.getByRole("textbox"), "有哪些续费");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    await waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      subscriptions: [expect.objectContaining({ id: "new-sub", title: "新添加的会员" })],
      fundingForecast: expect.objectContaining({ accounts: [expect.objectContaining({ balance: 5000, shortfall: 0 })] }),
    })));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("同步失败时显示可重试错误，不让模型基于旧数据回答", async () => {
    const user = userEvent.setup();
    const reply = vi.fn();
    render(<StewardChatHome stewardName="宁宁" stewardImage="/ningning.png"
      connections={{ alipay }} disabledReminders={[]} onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}
      refreshSubscriptions={async () => ({ connections: { alipay }, error: "支付宝暂时无法同步" })} />);
    await user.type(screen.getByRole("textbox"), "帮我取消会员");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("支付宝暂时无法同步");
    expect(reply).not.toHaveBeenCalled();
  });
  it("普通订阅不占据首页，只展示安静状态和订阅入口", () => {
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    const conversation = screen.getByRole("region", { name: "与宁宁对话" });
    expect(within(conversation).getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
    expect(screen.getByText("今天没有需要你处理的事。")).toBeInTheDocument();
    expect(screen.queryByText(/已检查/)).not.toBeInTheDocument();
    expect(screen.queryByText("优酷VIP会员连续包月")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看全部订阅" })).toBeInTheDocument();
    expect(screen.getByText("沙箱演示数据")).toBeInTheDocument();
    expect(screen.queryByText("转账与资金安排")).not.toBeInTheDocument();
    expect(screen.queryByText("直接告诉宁宁你想处理什么")).not.toBeInTheDocument();
  });

  it("未连接支付账户时保持安静，并说明连接后的提醒边界", () => {
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{}}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    expect(screen.getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
    expect(screen.getByText("连接微信支付或支付宝后，宁宁只会在有需要时提醒你。")).toBeInTheDocument();
    expect(screen.queryByText(/数据来自你已授权/)).not.toBeInTheDocument();
  });

  it("已授权账户但没有订阅时不汇报检查状态、零订阅或展示订阅入口", () => {
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay: { ...alipay, autopays: [] } }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    expect(screen.getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
    expect(screen.getByText("今天没有需要你处理的事。")).toBeInTheDocument();
    expect(screen.queryByText(/已检查|0 项订阅/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看全部订阅" })).not.toBeInTheDocument();
    expect(screen.queryByText("前往连接账户或查看同步状态")).not.toBeInTheDocument();
  });

  it("仅在临近扣费等需要关注的事件出现时展示报告", () => {
    const urgentAlipay: ConnectedFinancialSource = {
      ...alipay,
      autopays: [{
        ...alipay.autopays[0],
        nextChargeAt: new Date("2026-09-19T00:00:00+08:00").getTime(),
      }],
    };
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay: urgentAlipay }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    expect(screen.getByRole("heading", { name: "宁宁发现了需要你确认的订阅" })).toBeInTheDocument();
    expect(screen.getByText("优酷VIP会员连续包月")).toBeInTheDocument();
    expect(screen.getByText("支付宝 · 2 天后扣费")).toBeInTheDocument();
  });

  it("把跨平台同类订阅合并为一条事件并说明判断依据", () => {
    const wechatMusic: ConnectedFinancialSource = {
      provider: "wechat_pay",
      displayName: "微信支付",
      accountMasked: "叶先生",
      scopes: ["autopay"],
      transactions: [],
      syncedAt: "2026-09-17",
      autopays: [{
        id: "wx-music",
        title: "黑胶VIP会员包月",
        merchant: "网易云音乐",
        amount: 1500,
        cycle: "月",
        nextChargeAt: new Date("2026-10-10T00:00:00+08:00").getTime(),
      }],
    };
    const alipayMusic: ConnectedFinancialSource = {
      ...alipay,
      autopays: [{
        ...alipay.autopays[0],
        id: "ali-music",
        title: "QQ音乐绿钻连续包月",
        merchant: "QQ音乐",
        nextChargeAt: new Date("2026-10-12T00:00:00+08:00").getTime(),
      }],
    };
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ wechat_pay: wechatMusic, alipay: alipayMusic }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    expect(screen.getByRole("heading", { name: "宁宁发现了需要你确认的订阅" })).toBeInTheDocument();
    expect(screen.getByText("可能重复订阅")).toBeInTheDocument();
    expect(screen.getByText("与QQ音乐绿钻连续包月同属音乐会员 · 来自微信支付、支付宝")).toBeInTheDocument();
    expect(screen.getAllByText("可能重复订阅")).toHaveLength(1);
  });

  it("三天内扣费会提醒，关闭该项提醒后恢复安静状态", () => {
    const boundaryAlipay: ConnectedFinancialSource = {
      ...alipay,
      autopays: [{
        ...alipay.autopays[0],
        nextChargeAt: new Date("2026-09-20T00:00:00+08:00").getTime(),
      }],
    };
    const props = {
      stewardName: "宁宁",
      stewardImage: "/ningning.png",
      connections: { alipay: boundaryAlipay },
      onToggleReminder: vi.fn(),
      onOpenSubscriptions: vi.fn(),
      onPrepareCancel: vi.fn(),
      reply: vi.fn(),
      now: new Date("2026-09-17T00:00:00+08:00").getTime(),
    };
    const view = render(<StewardChatHome {...props} disabledReminders={[]} />);
    expect(screen.getByText("临近扣费")).toBeInTheDocument();

    view.rerender(<StewardChatHome {...props} disabledReminders={["alipay:sub-video"]} />);
    expect(screen.getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
    expect(screen.queryByText("临近扣费")).not.toBeInTheDocument();
  });

  it("空会话首次打开保留问候位置，不自动滚到底部", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn()}
    />);

    expect(screen.getByRole("heading", { name: "下午好，叶先生。" })).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("滚动新消息时不强制平滑动画", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<StewardChatHome
      stewardName="宁宁" stewardImage="/ningning.png" connections={{}} disabledReminders={[]}
      onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()}
      reply={vi.fn(async () => ({ text: "可以，先连接支付账户来核对。" }))}
    />);

    await user.click(screen.getByRole("button", { name: "帮我检查重复订阅" }));
    await screen.findByText("可以，先连接支付账户来核对。");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.calls.every(([options]) => options.behavior !== "smooth")).toBe(true);
  });

  it("回复失败后滚动到错误与重试操作之后，让恢复入口进入视野", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    let rejectReply!: (reason: Error) => void;
    const reply = vi.fn<StewardReplyFn>(() => new Promise((_, reject) => { rejectReply = reject; }));
    render(<StewardChatHome
      stewardName="宁宁" stewardImage="/ningning.png" connections={{}} disabledReminders={[]}
      onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} reply={reply}
    />);
    await user.click(screen.getByRole("button", { name: "帮我检查重复订阅" }));
    await waitFor(() => expect(reply).toHaveBeenCalledOnce());
    scrollIntoView.mockClear();

    await act(async () => { rejectReply(new Error("连接暂时中断，请稍后重新发送。")); });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "重新发送" })).toBeEnabled();
    expect(scrollIntoView).toHaveBeenCalled();
    const scrollTarget = scrollIntoView.mock.contexts.at(-1) as Element;
    expect(alert.compareDocumentPosition(scrollTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scrollTarget.compareDocumentPosition(screen.getByRole("textbox")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("把用户请求发给大模型，并把取消意图变成需用户确认的操作", async () => {
    const user = userEvent.setup();
    const onPrepareCancel = vi.fn();
    const reply = vi.fn(async () => ({
      text: "可以，我先带你核对这项续费，确认后才会取消。",
      action: { type: "prepare_cancel" as const, provider: "alipay" as const, subscriptionId: "sub-video" },
    }));
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay }}
      disabledReminders={[]}
      onToggleReminder={vi.fn()}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={onPrepareCancel}
      reply={reply}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    await user.type(screen.getByRole("textbox", { name: "和宁宁说点什么" }), "帮我取消优酷会员续费");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    expect(await screen.findByText(/确认后才会取消/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "核对并取消优酷VIP会员连续包月" }));
    expect(onPrepareCancel).toHaveBeenCalledWith("alipay", "sub-video");
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([{ role: "user", content: "帮我取消优酷会员续费" }]),
    }));
  });

  it("模型选择关闭提醒时只修改提醒，不取消订阅", async () => {
    const user = userEvent.setup();
    const onToggleReminder = vi.fn();
    render(<StewardChatHome
      stewardName="宁宁"
      stewardImage="/ningning.png"
      connections={{ alipay }}
      disabledReminders={[]}
      onToggleReminder={onToggleReminder}
      onOpenSubscriptions={vi.fn()}
      onPrepareCancel={vi.fn()}
      reply={vi.fn(async () => ({
        text: "好的，已关闭优酷的续费提醒，订阅本身不受影响。",
        action: { type: "set_reminder" as const, provider: "alipay" as const, subscriptionId: "sub-video", enabled: false },
      }))}
      now={new Date("2026-09-17T00:00:00+08:00").getTime()}
    />);

    await user.type(screen.getByRole("textbox", { name: "和宁宁说点什么" }), "关闭优酷续费提醒");
    await user.click(screen.getByRole("button", { name: "发送给宁宁" }));
    await waitFor(() => expect(onToggleReminder).toHaveBeenCalledWith("alipay:sub-video", false));
    expect(screen.getByText(/订阅本身不受影响/)).toBeInTheDocument();
  });
});
