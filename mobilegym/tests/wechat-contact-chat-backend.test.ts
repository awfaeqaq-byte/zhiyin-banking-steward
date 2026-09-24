import { describe, expect, it, vi } from 'vitest';
import {
  buildContactChatMessages,
  createLocalContactChatBackend,
  createResponsesContactChatBackend,
} from '../apps/Wechat/chat-ai/backend';

const request = {
  contact: {
    wxid: 'wxid_zhangwei',
    name: '张伟',
    signature: '有事直说',
  },
  currentUserName: '小鹏',
  systemPrompt: '你是张伟，说话直接、简短。',
  messages: [
    { role: 'user' as const, content: '晚上吃什么？' },
  ],
};

describe('Wechat contact chat backend', () => {
  it('keeps the demo conversational when no remote model is configured', async () => {
    const backend = createLocalContactChatBackend({ delayMs: 0 });

    const reply = await backend.reply(request);

    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.text).not.toMatch(/AI|人工智能|有什么可以帮助/);
  });

  it('never invents a successful receipt from transfer-related chat text', async () => {
    const backend = createLocalContactChatBackend({ delayMs: 0 });

    const reply = await backend.reply({
      ...request,
      messages: [{ role: 'user', content: '我还没转账，晚点给你。' }],
    });

    expect(reply.text).not.toMatch(/收到|已收款|到账/);
    expect(reply.incomingTransfer).toBeUndefined();
  });

  it('creates a bounded incoming transfer only for an explicit request with an amount', async () => {
    const backend = createLocalContactChatBackend({ delayMs: 0 });

    const reply = await backend.reply({
      ...request,
      messages: [{ role: 'user', content: 'AA的35元转我吧' }],
    });

    expect(reply.incomingTransfer).toEqual({ amountCents: 3500, note: 'AA收款' });

    const excessive = await backend.reply({
      ...request,
      messages: [{ role: 'user', content: '给我转3000元' }],
    });
    expect(excessive.incomingTransfer).toBeUndefined();
  });

  it('sends a privacy-conscious Responses API request to a server-side proxy', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: '火锅吧，我订位置。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({
      endpoint: '/api/wechat/contact-reply',
      fetcher,
      model: 'gpt-5-mini',
    });

    await expect(backend.reply(request)).resolves.toEqual({ text: '火锅吧，我订位置。' });
    expect(fetcher).toHaveBeenCalledWith('/api/wechat/contact-reply', expect.objectContaining({
      method: 'POST',
    }));

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toEqual(expect.objectContaining({
      model: 'gpt-5-mini',
      input: request.messages,
      store: false,
    }));
    expect(body.instructions).toContain(request.systemPrompt);
    expect(body.instructions).toContain('微信转账记录是已经发生的真实系统事实');
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });

  it('executes a requested transfer only when the model explicitly chooses the transfer action', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '行，这就转你。\n[WECHAT_ACTION:SEND_TRANSFER]',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      messages: [{ role: 'user', content: '还我50.5元' }],
    })).resolves.toEqual({
      text: '行，这就转你。',
      incomingTransfer: { amountCents: 5050, note: '还款' },
    });
  });

  it('lets a contact proactively transfer without an explicit user request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '你今天辛苦了，给你转88块买点好吃的。\n[WECHAT_ACTION:SEND_TRANSFER:88.00]',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, wxid: 'wxid_huangyong_brave', name: '黄勇' },
      messages: [{ role: 'user', content: '今天加班到好晚，饭都没顾上吃。' }],
    })).resolves.toEqual({
      text: '你今天辛苦了，给你转88块买点好吃的。',
      incomingTransfer: { amountCents: 8800, note: '转账给你' },
    });

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.instructions).toContain('可以根据关系和上下文主动发起转账');
    expect(body.instructions).toContain('[WECHAT_ACTION:SEND_TRANSFER:金额]');
    expect(body.instructions).not.toContain('不得在对方没有明确提出转账请求时发起转账');
  });

  it('does not force a transfer when the model refuses the request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '我先不转，等我想想再说。',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: '李娜' },
      messages: [{ role: 'user', content: '你能转我520吗' }],
    })).resolves.toEqual({ text: '我先不转，等我想想再说。' });

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.instructions).toContain('是否转账由你根据关系和上下文自主决定');
    expect(body.instructions).toContain('[WECHAT_ACTION:SEND_TRANSFER]');
  });

  it('carries a contact transfer offer into the user follow-up confirmation', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '转咗啦～去食饭啦靓仔。\n[WECHAT_ACTION:SEND_TRANSFER]',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: '李娜' },
      messages: [
        { role: 'assistant', content: '好啦，我转返520比你食饭啦。' },
        { role: 'user', content: '好好好，你转给我' },
      ],
    })).resolves.toEqual({
      text: '转咗啦～去食饭啦靓仔。',
      incomingTransfer: { amountCents: 52000, note: '转账给你' },
    });
  });

  it('accepts a matching GLM transfer record as a model action and removes it from chat text', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '[微信转账：我向你转账¥520.00] 转咗啦～去食饭啦靓仔。',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: '李娜' },
      messages: [
        { role: 'assistant', content: '好啦，我转返520比你食饭啦。' },
        { role: 'user', content: '好好好，你转给我' },
      ],
    })).resolves.toEqual({
      text: '转咗啦～去食饭啦靓仔。',
      incomingTransfer: { amountCents: 52000, note: '转账给你' },
    });
  });

  it('treats a transfer-looking text bubble as an unexecuted promise rather than a real payment', () => {
    expect(buildContactChatMessages([
      {
        id: 'fake-transfer-text',
        type: 'text',
        content: '[微信转账：我向你转账¥520.00] 转咗啦～去食饭啦靓仔。',
        senderId: 'wxid_lina_lina',
        timestamp: 1,
      },
    ], 'xiaoming001', 15)).toEqual([
      {
        role: 'assistant',
        content: '[系统提示：你曾口头表示要向对方转账¥520.00，但没有生成独立转账卡片，因此该转账并未实际发起。]',
      },
    ]);
  });

  it('can retry an amount from an earlier fake transfer promise after the user asks again', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '原来刚才没发成功，我现在转返俾你。\n[WECHAT_ACTION:SEND_TRANSFER]',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: '李娜' },
      messages: [
        {
          role: 'assistant',
          content: '[系统提示：你曾口头表示要向对方转账¥520.00，但没有生成独立转账卡片，因此该转账并未实际发起。]',
        },
        { role: 'user', content: '你再转给我' },
      ],
    })).resolves.toEqual({
      text: '原来刚才没发成功，我现在转返俾你。',
      incomingTransfer: { amountCents: 52000, note: '转账给你' },
    });
  });

  it('surfaces a useful error when the model proxy fails', async () => {
    const backend = createResponsesContactChatBackend({
      endpoint: '/api/wechat/contact-reply',
      fetcher: vi.fn(async () => new Response('bad gateway', { status: 502 })),
      failureMode: 'throw',
      retryDelayMs: 0,
    });

    await expect(backend.reply(request)).rejects.toThrow('联系人回复服务暂时不可用');
  });

  it('retries one transient proxy failure before returning the model reply', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '刚刚断了一下，我在。' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    const backend = createResponsesContactChatBackend({
      endpoint: '/api/wechat/contact-reply',
      fetcher,
      retryDelayMs: 0,
    });

    await expect(backend.reply(request)).resolves.toEqual({ text: '刚刚断了一下，我在。' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a received-transfer acknowledgement visible when the proxy stays unavailable', async () => {
    const fetcher = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const backend = createResponsesContactChatBackend({
      endpoint: '/api/wechat/contact-reply',
      fetcher,
      retryDelayMs: 0,
    });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: '李娜' },
      receiptEvent: {
        type: 'contact_received_user_transfer',
        amountCents: 52000,
        note: '给宝宝的',
      },
      messages: [{ role: 'user', content: '[微信转账：我向你转账¥520.00；状态：你已收款]' }],
    })).resolves.toEqual({ text: '收到，¥520.00 给宝宝的这笔我已经收款了。' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never creates a transfer from the network fallback path', async () => {
    const fetcher = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const backend = createResponsesContactChatBackend({
      endpoint: '/api/wechat/contact-reply',
      fetcher,
      retryDelayMs: 0,
    });

    await expect(backend.reply({
      ...request,
      messages: [{ role: 'user', content: '你能转我520吗' }],
    })).resolves.toEqual({ text: '刚刚网络有点卡，我看到你的消息了，等下再聊。' });
  });

  it('keeps transfer cards in model history with perspective-aware status', () => {
    expect(buildContactChatMessages([
      {
        id: 'transfer-out',
        type: 'transfer',
        content: '转账',
        senderId: 'xiaoming001',
        timestamp: 1,
        transferAmountCents: 8800,
        transferStatus: 'received',
        transferNote: '团建垫付',
      },
      {
        id: 'transfer-in',
        type: 'transfer',
        content: '转账',
        senderId: 'wxid_boss_007',
        timestamp: 2,
        transferAmountCents: 3500,
        transferStatus: 'refunded',
      },
    ], 'xiaoming001', 15)).toEqual([
      { role: 'user', content: '[微信转账：我向你转账¥88.00；状态：你已收款；备注：团建垫付]' },
      { role: 'assistant', content: '[微信转账：我向你转账¥35.00；状态：你已退还]' },
    ]);
  });

  it('turns a receipt event into a mandatory scene instruction instead of a fake user message', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: '收到，这笔费用下周走报销。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });
    const eventContext = '你刚刚确认收取了小明发出的微信转账¥88.00，备注“团建垫付”。';

    await backend.reply({
      ...request,
      eventContext,
      messages: [{ role: 'user', content: '[微信转账：我向你转账¥88.00；状态：你已收款；备注：团建垫付]' }],
    });

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.input).toEqual([{ role: 'user', content: '[微信转账：我向你转账¥88.00；状态：你已收款；备注：团建垫付]' }]);
    expect(body.instructions).toContain(eventContext);
    expect(body.instructions).toContain('必须直接回应这个事件');
  });

  it('repairs a model reply that reverses the direction of a received transfer', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      output_text: '收到，团建报销已转你。',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: 'Boss' },
      receiptEvent: {
        type: 'contact_received_user_transfer',
        amountCents: 8800,
        note: '团建费用垫付',
      },
      messages: [{ role: 'user', content: '[微信转账：我向你转账¥88.00；状态：你已收款；备注：团建费用垫付]' }],
    })).resolves.toEqual({
      text: '收到，¥88.00 团建费用垫付款已确认，后续按报销流程处理。',
    });
  });

  it('adds transaction context when the model only gives a generic acknowledgement', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: 'OK，收到。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const backend = createResponsesContactChatBackend({ endpoint: '/api/wechat/contact-reply', fetcher });

    await expect(backend.reply({
      ...request,
      contact: { ...request.contact, name: 'Boss' },
      receiptEvent: {
        type: 'contact_received_user_transfer',
        amountCents: 6600,
        note: '团建费用补款',
      },
      messages: [{ role: 'user', content: '[微信转账：我向你转账¥66.00；状态：你已收款；备注：团建费用补款]' }],
    })).resolves.toEqual({
      text: '收到，¥66.00 团建费用补款已确认，后续按报销流程处理。',
    });
  });
});
