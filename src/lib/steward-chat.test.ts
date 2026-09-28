import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStewardInstructions,
  parseStewardReply,
  requestStewardReply,
  type StewardReplyRequest,
  type StewardSubscription,
} from "./steward-chat";
import type { FundingForecast } from "./funding-forecast";
import { buildBillAnalysis } from './bill-analysis';

it('账单问题使用独立收支上下文而不是续费限定提示词',()=>{
  const instructions = buildStewardInstructions({stewardName:'宁宁',subscriptions:[],
    messages:[{role:'user',content:'这个月消费账单情况'}],
    billAnalysis:buildBillAnalysis({},'这个月消费账单情况',Date.parse('2026-09-24'))});
  expect(instructions).toContain('授权账单分析');
  expect(instructions).not.toContain('已授权自动续费清单');
  expect(instructions).toContain('2026-09-01');
  expect(instructions.length).toBeLessThanOrEqual(4000);
});

const subscriptions: StewardSubscription[] = [
  {
    key: "alipay:sub-video",
    provider: "alipay",
    id: "sub-video",
    title: "优酷VIP会员连续包月",
    providerName: "支付宝",
    amount: 2500,
    cycle: "月",
    daysUntilCharge: 8,
    reminderEnabled: true,
  },
];

describe('duplicate preference model actions', () => {
  const groups = [{ id: 'music-group', titles: ['QQ音乐', '网易云音乐'], kept: true }];
  it.each(['keep', 'later', 'review'] as const)('validates %s against current authorized groups', decision => {
    expect(parseStewardReply(`[ZHIYIN_ACTION:DUPLICATE|music-group|${decision}]`, subscriptions, groups).action)
      .toEqual({ type: 'set_duplicate_preference', groupId: 'music-group', decision });
    expect(parseStewardReply(`[ZHIYIN_ACTION:DUPLICATE|unknown|${decision}]`, subscriptions, groups).action).toBeUndefined();
  });
  it('sends retained choices and distinguishes them from renewal reminders', () => {
    const instructions = buildStewardInstructions({ stewardName: '宁宁', subscriptions, duplicateGroups: groups });
    expect(instructions).toContain('用户已选择全部保留');
    expect(instructions).toContain('不改变续费提醒');
    expect(instructions.length).toBeLessThanOrEqual(4000);
  });
});

const recurringCandidates: NonNullable<StewardReplyRequest["recurringCandidates"]> = [
  {
    key: "wechat_pay:cloud-monthly",
    provider: "wechat_pay",
    providerName: "微信支付",
    title: "云存储会员",
    amount: 1800,
    cycle: "月",
    estimatedNextChargeAt: Date.parse("2026-10-05T00:00:00+08:00"),
    confidence: "high",
    evidenceSummary: "连续三个月在每月 5 日扣费 18 元",
    evidence: [
      { id: "cloud-jul", occurredAt: "2026-07-05T12:00:00+08:00", amount: -1800 },
      { id: "cloud-aug", occurredAt: "2026-08-05T12:00:00+08:00", amount: -1800 },
      { id: "cloud-sep", occurredAt: "2026-09-05T12:00:00+08:00", amount: -1800 },
    ],
    reviewStatus: "pending",
  },
];

const fundingForecast: FundingForecast = {
  horizonDays: 7,
  from: Date.parse("2026-09-22T00:00:00+08:00"),
  to: Date.parse("2026-09-29T23:59:59+08:00"),
  knownBalanceTotal: 1010000,
  upcomingTotal: 18000,
  shortfallTotal: 3000,
  coverageIncomplete: false,
  accounts: [
    {
      provider: "wechat_pay", providerName: "微信支付", balance: 10000,
      upcomingTotal: 13000, shortfall: 3000,
      firstShortfallAt: Date.parse("2026-09-25T00:00:00+08:00"),
      status: "shortfall", warnings: [],
      charges: [{ id: "cloud", title: "家庭云盘", amount: 13000,
        chargeAt: Date.parse("2026-09-25T00:00:00+08:00"), projectedBalance: -3000 }],
    },
    {
      provider: "alipay", providerName: "支付宝", balance: 1000000,
      upcomingTotal: 5000, shortfall: 0, firstShortfallAt: null,
      status: "covered", warnings: [],
      charges: [{ id: "music", title: "音乐会员", amount: 5000,
        chargeAt: Date.parse("2026-09-26T00:00:00+08:00"), projectedBalance: 995000 }],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("知银管家大模型协议", () => {
  it("把已授权的真实订阅与安全边界提供给宁宁", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁",
      subscriptions,
    });

    expect(instructions).toContain("优酷VIP会员连续包月");
    expect(instructions).toContain("sub-video");
    expect(instructions).toContain("不得声称已经取消");
    expect(instructions).toContain("PREPARE_CANCEL|alipay|sub-video");
    expect(instructions).toContain("产品名是知银");
    expect(instructions).toContain("用户称呼是叶先生");
    expect(instructions).toContain("绝不能把“知银”当作用户称呼");
    expect(instructions).toContain("不要在每条回复中重复自我介绍");
  });

  it("切换到阿衡后使用一致的管家身份", () => {
    const instructions = buildStewardInstructions({
      stewardName: "阿衡",
      subscriptions,
    });

    expect(instructions).toContain("你的名字是阿衡");
    expect(instructions).toContain("直接说明你是阿衡");
    expect(instructions).not.toContain("你是宁宁");
  });

  it("把账单识别的候选单独提供，并附上实际扣费证据和待确认状态", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁",
      subscriptions,
      recurringCandidates,
    });

    expect(instructions).toContain("账单识别的周期扣费候选（不属于平台签约清单）");
    expect(instructions).toContain("云存储会员");
    expect(instructions).toContain("微信支付");
    expect(instructions).toContain("金额=18.00元/月");
    expect(instructions).toContain("待用户确认");
    expect(instructions).toContain("置信度=高");
    expect(instructions).toContain("预计下次=2026-10-05");
    expect(instructions).toContain("2026-07-05 支出18.00元");
    expect(instructions).toContain("2026-08-05 支出18.00元");
    expect(instructions).toContain("2026-09-05 支出18.00元");
    expect(instructions).toContain("连续三个月在每月 5 日扣费 18 元");
    expect(instructions).not.toContain("PREPARE_CANCEL|wechat_pay|wechat_pay:cloud-monthly");
  });

  it("用户确认的账单订阅仍是预测，并要求建议基于证据及使用偏好", () => {
    const instructions = buildStewardInstructions({
      stewardName: "阿衡",
      subscriptions,
      recurringCandidates: [{ ...recurringCandidates[0], reviewStatus: "confirmed" }],
    });

    expect(instructions).toContain("用户已确认为订阅");
    expect(instructions).toContain("不代表平台签约或扣费授权");
    expect(instructions).toContain("预计日期仅为历史规律推测，不能声称一定会扣费");
    expect(instructions).toContain("没有使用频率或活跃度数据");
    expect(instructions).toContain("先询问用户的使用频率和偏好");
    expect(instructions).toContain("以本次最新数据为准，覆盖历史对话中的金额、状态和日期");
  });

  it("不提供候选时明确没有候选证据，兼容现有调用", () => {
    expect(buildStewardInstructions({ stewardName: "宁宁", subscriptions })).toContain(
      "当前没有账单识别的周期扣费候选",
    );
  });

  it("按平台提供资金缺口和扣款日期，禁止用总余额代替单个平台偿付能力", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁", subscriptions, recurringCandidates, fundingForecast,
    });

    expect(instructions).toContain("未来7天资金测算");
    expect(instructions).toContain("微信支付：余额=100.00元；已知续费=130.00元；测算缺口=30.00元");
    expect(instructions).toContain("首次不足=2026-09-25");
    expect(instructions).toContain("家庭云盘");
    expect(instructions).toContain("支付宝：余额=10000.00元");
    expect(instructions).toContain("不能跨平台抵扣");
    expect(instructions).toContain("按平台余额测算，实际扣款渠道请核实");
    expect(instructions).toContain("不包含日常消费、未来收入、日期未知的续费和账单推测候选");
    expect(instructions).toContain("不能执行或声称已执行转账、充值、资金划转");
    expect(instructions).toContain("[ZHIYIN_ACTION:OPEN_FUNDING]");
  });

  it("未授权余额或数据不完整时明确未知，不把缺失数据当作零余额或安全", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁", subscriptions,
      fundingForecast: { ...fundingForecast, coverageIncomplete: true, accounts: [{
        ...fundingForecast.accounts[0], balance: null, shortfall: null,
        firstShortfallAt: null, status: "unknown", warnings: ["尚未授权读取余额"],
      }] },
    });

    expect(instructions).toContain("数据不完整");
    expect(instructions).toContain("微信支付：余额=未知");
    expect(instructions).toContain("测算缺口=未知");
    expect(instructions).toContain("尚未授权读取余额");
    expect(instructions).toContain("缺少授权或数据时不能断言资金足够");
    expect(instructions).toContain("仅缺少未纳入费用且不存在到期未核实项时，已知缺口才是下限");
    expect(buildStewardInstructions({ stewardName: "宁宁", subscriptions })).toContain(
      "当前没有可用的资金测算，不能判断余额或缺口",
    );
  });

  it("资金、签约和候选均较多时保留各平台摘要并严格限定总指令长度", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁",
      subscriptions: Array.from({ length: 50 }, (_, i) => ({
        ...subscriptions[0], id: `video-${i}`, key: `alipay:video-${i}`, title: `视频会员${i}`,
      })),
      recurringCandidates: Array.from({ length: 50 }, (_, i) => ({
        ...recurringCandidates[0], key: `wechat_pay:cloud-${i}`, title: `云服务${i}`,
      })),
      fundingForecast: { ...fundingForecast, accounts: fundingForecast.accounts.map(account => ({
        ...account,
        charges: Array.from({ length: 50 }, (_, i) => ({ ...account.charges[0], id: `bill-${i}`, title: `资金续费服务${i}` })),
      })) },
      messages: [{ role: "user", content: "视频会员49和云服务49情况如何？" }],
    });

    expect(instructions.length).toBeLessThanOrEqual(4000);
    expect(instructions).toContain("微信支付：余额=100.00元");
    expect(instructions).toContain("支付宝：余额=10000.00元");
    expect(instructions).toContain("视频会员49");
    expect(instructions).toContain("云服务49");
    expect(instructions).toMatch(/资金明细仅展示部分：已展示 \d+ 项，另有 \d+ 项未展示/);
    expect(instructions).toContain("查看完整资金安排页");
    expect(instructions).toContain("签约仅展示部分");
    expect(instructions).toContain("账单候选仅展示部分");
  });

  it("到期未核实费用按当前余额测算，不把过去的计划日期说成已发生的资金失败", () => {
    const pastDue = Date.parse("2026-09-20T00:00:00+08:00");
    const instructions = buildStewardInstructions({
      stewardName: "宁宁", subscriptions,
      fundingForecast: { ...fundingForecast, coverageIncomplete: true, accounts: [{
        ...fundingForecast.accounts[0], firstShortfallAt: pastDue,
        warnings: ["家庭云盘已到期，扣款状态待核实；本次按该笔仍需支付测算。"],
        charges: [{ ...fundingForecast.accounts[0].charges[0], chargeAt: pastDue, projectedBalance: null }],
      }] },
    });

    expect(instructions).toContain("已到期待核实=2026-09-20");
    expect(instructions).not.toContain("首次不足=2026-09-20");
    expect(instructions).toContain("待核实差额=30.00元");
    expect(instructions).toContain("状态=到期款项待核实");
    expect(instructions).not.toContain("测算缺口=30.00元");
    expect(instructions).toContain("若到期款项仍需支付");
    expect(instructions).toContain("不是已确认最低缺口");
    expect(instructions).toContain("补款前先核实是否已经支付，避免重复补款");
    expect(instructions).toContain("到期未核实的已知扣费按仍需支付计入一次");
    expect(instructions).toContain("不得把过去的计划日期描述为历史余额不足或扣款失败");
  });

  it("先有到期未核实扣费再有未来缺口时，整笔差额仍是条件测算", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁", subscriptions,
      fundingForecast: { ...fundingForecast, coverageIncomplete: true, accounts: [{
        ...fundingForecast.accounts[0],
        charges: [
          { ...fundingForecast.accounts[0].charges[0], id: "past", amount: 5000,
            chargeAt: Date.parse("2026-09-20T00:00:00+08:00"), projectedBalance: null },
          { ...fundingForecast.accounts[0].charges[0], amount: 8000, projectedBalance: null },
        ],
      }] },
    });

    expect(instructions).toContain("待核实差额=30.00元");
    expect(instructions).toContain("状态=到期款项待核实");
    expect(instructions).toContain("条件测算首次不足=2026-09-25");
    expect(instructions).not.toContain("状态=存在缺口");
  });

  it("只解析精确的打开资金安排动作，不接受额外参数或资金执行动作", () => {
    expect(parseStewardReply("可查看资金安排。\n[ZHIYIN_ACTION:OPEN_FUNDING]", subscriptions)).toEqual({
      text: "可查看资金安排。", action: { type: "open_funding" },
    });
    expect(parseStewardReply("核对。\n[ZHIYIN_ACTION:OPEN_FUNDING|wechat_pay]", subscriptions).action).toBeUndefined();
    expect(parseStewardReply("核对。\n[ZHIYIN_ACTION:TRANSFER|alipay|sub-video]", subscriptions).action).toBeUndefined();
  });

  it("发送资金证据到现有模型接口并把打开资金页作为只读建议返回", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "微信平台余额测算还有 30 元缺口，请先核实扣款方式。\n[ZHIYIN_ACTION:OPEN_FUNDING]" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await requestStewardReply({
      stewardName: "宁宁", subscriptions, fundingForecast,
      messages: [{ role: "user", content: "未来一周续费的钱够吗？" }],
    });

    expect(reply.action).toEqual({ type: "open_funding" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/zhiyin/steward-reply");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).instructions).toContain("首次不足=2026-09-25");
  });

  it("大量签约与账单候选仍能通过代理长度限制，并标明未展示数量", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁",
      subscriptions: Array.from({ length: 50 }, (_, i) => ({
        ...subscriptions[0], id: `video-${i}`, key: `alipay:video-${i}`,
        title: `视频会员连续包月套餐${i}`,
      })),
      recurringCandidates: Array.from({ length: 50 }, (_, i) => ({
        ...recurringCandidates[0], key: `wechat_pay:cloud-${i}`, title: `云存储会员套餐${i}`,
      })),
    });

    expect(instructions.length).toBeLessThanOrEqual(4000);
    expect(instructions).toContain("视频会员连续包月套餐0");
    expect(instructions).toContain("云存储会员套餐0");
    expect(instructions).toMatch(/签约仅展示部分：已展示 \d+ 项，另有 \d+ 项未展示/);
    expect(instructions).toMatch(/账单候选仅展示部分：已展示 \d+ 项，另有 \d+ 项未展示/);
    expect(instructions).toContain("查看完整订阅页");
    expect(instructions).toContain("不要据此计算全部订阅总额");
    expect(instructions).toContain("2026-09-05 支出18.00元");
  });

  it("在有限上下文中优先展示最新问题点名的订阅，保留完整记录", () => {
    const instructions = buildStewardInstructions({
      stewardName: "宁宁",
      subscriptions: Array.from({ length: 50 }, (_, i) => ({
        ...subscriptions[0], id: `video-${i}`, key: `alipay:video-${i}`,
        title: `视频套餐${i}会员`,
      })),
      recurringCandidates: Array.from({ length: 50 }, (_, i) => ({
        ...recurringCandidates[0], key: `wechat_pay:cloud-${i}`, title: `云服务${i}会员`,
      })),
      messages: [{ role: "user", content: "视频套餐49会员和云服务49会员值得保留吗？" }],
    });

    expect(instructions.length).toBeLessThanOrEqual(4000);
    expect(instructions).toContain("视频套餐49会员");
    expect(instructions).toContain("PREPARE_CANCEL|alipay|video-49");
    expect(instructions).toContain("云服务49会员");
    expect(instructions).toContain("历史账单=2026-07-05 支出18.00元、2026-08-05 支出18.00元、2026-09-05 支出18.00元");
  });

  it("候选标识不能触发取消或提醒动作", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "先核对这笔扣费。\n[ZHIYIN_ACTION:PREPARE_CANCEL|wechat_pay|wechat_pay:cloud-monthly]",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await requestStewardReply({
      stewardName: "宁宁",
      subscriptions,
      recurringCandidates,
      messages: [{ role: "user", content: "看看周期扣费" }],
    });

    expect(reply).toEqual({ text: "先核对这笔扣费。" });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.instructions).toContain("云存储会员");
    expect(parseStewardReply(
      "设置提醒。\n[ZHIYIN_ACTION:SET_REMINDER|wechat_pay|wechat_pay:cloud-monthly|on]",
      subscriptions,
    ).action).toBeUndefined();
  });

  it("按 UTF-8 限制完整请求体，丢弃旧消息且保留最新问题及完整指令", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "我先核对最新这笔扣费。" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const newest = { role: "user" as const, content: "请看看云服务49会员的最新这笔扣费。" };
    const request: StewardReplyRequest = {
      stewardName: "宁宁",
      subscriptions: Array.from({ length: 50 }, (_, i) => ({
        ...subscriptions[0], id: `video-${i}`, key: `alipay:video-${i}`, title: `视频套餐${i}会员`,
      })),
      recurringCandidates: Array.from({ length: 50 }, (_, i) => ({
        ...recurringCandidates[0], key: `wechat_pay:cloud-${i}`, title: `云服务${i}会员`,
      })),
      messages: [
        ...Array.from({ length: 23 }, (_, i) => ({
          role: i % 2 ? "assistant" as const : "user" as const,
          content: `旧消息${i}：${"历史记录".repeat(100)}`,
        })),
        newest,
      ],
    };
    const instructions = buildStewardInstructions(request);
    const fullBody = JSON.stringify({ instructions, input: request.messages });
    expect(new TextEncoder().encode(fullBody).byteLength).toBeGreaterThan(32 * 1024);

    await requestStewardReply(request);

    const body = fetchMock.mock.calls[0][1].body;
    const sent = JSON.parse(body);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32 * 1024);
    expect(sent.instructions).toBe(instructions);
    expect(sent.input.at(-1)).toEqual(newest);
    expect(sent.input.length).toBeLessThan(request.messages.length);
    expect(sent.input).toEqual(request.messages.slice(-sent.input.length));
  });

  it("最新问题超过代理单条限制时明确报错，不发出请求或截断问题", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "不应发送此请求。" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestStewardReply({
      stewardName: "宁宁",
      subscriptions,
      messages: [{ role: "user", content: "问题".repeat(20000) }],
    })).rejects.toThrow("这条问题内容过长，请缩短后再发送");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("只接受当前订阅清单内的受限动作", () => {
    expect(parseStewardReply(
      `好的，我先把取消方案准备好。\n[ZHIYIN_ACTION:PREPARE_CANCEL|alipay|sub-video]`,
      subscriptions,
    )).toEqual({
      text: "好的，我先把取消方案准备好。",
      action: { type: "prepare_cancel", provider: "alipay", subscriptionId: "sub-video" },
    });

    expect(parseStewardReply(
      `已经取消。\n[ZHIYIN_ACTION:PREPARE_CANCEL|wechat_pay|invented]`,
      subscriptions,
    )).toEqual({ text: "已经取消。" });
  });

  it('转账模型漏动作时只修复一次，返回核对动作而非直接付款',async()=>{
    const mock=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({output_text:'已准备方案，请核对。'})}).mockResolvedValueOnce({ok:true,json:async()=>({output_text:'请核对[ZHIYIN_ACTION:PREPARE_TRANSFER|mom|10000]'})});
    vi.stubGlobal('fetch',mock);
    const result=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转100元'}]});
    expect(result.action).toEqual({type:'prepare_transfer',recipientId:'mom',amount:10000});
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls.every(([url])=>url==='/api/zhiyin/steward-reply')).toBe(true);
  });
  it('动作修复失败提供手动入口，不编造金额和收款人',async()=>{
    const mock=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({output_text:'请核对方案。'})}).mockRejectedValueOnce(Error('unavailable'));
    vi.stubGlobal('fetch',mock);
    const result=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转100元'}]});
    expect(result.action).toEqual({type:'open_transfers'});expect(mock).toHaveBeenCalledTimes(2);
  });
  it('模型漏掉用户的保留条件时不展示普通转账按钮',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({output_text:'请核对[ZHIYIN_ACTION:PREPARE_TRANSFER|mom|200000]'})}));
    const result=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转2000，留够信用卡还款的钱'}]});
    expect(result.action).toBeUndefined();expect(result.text).toContain('保留');
  });
  it("能解析提醒开关和打开订阅中心动作", () => {
    expect(parseStewardReply(
      `已关闭这项提醒。\n[ZHIYIN_ACTION:SET_REMINDER|alipay|sub-video|off]`,
      subscriptions,
    ).action).toEqual({
      type: "set_reminder", provider: "alipay", subscriptionId: "sub-video", enabled: false,
    });
    expect(parseStewardReply(
      `我带你去看完整清单。\n[ZHIYIN_ACTION:OPEN_SUBSCRIPTIONS]`,
      subscriptions,
    ).action).toEqual({ type: "open_subscriptions" });
  });
});
