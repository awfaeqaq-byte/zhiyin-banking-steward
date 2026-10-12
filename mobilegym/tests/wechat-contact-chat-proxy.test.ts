import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createWechatContactChatProxyMiddleware,
  requestWechatContactReply,
} from '../server/wechatContactChatProxy';

const config = {
  apiKey: 'server-only-test-key',
  baseUrl: 'https://api.example.test/',
  model: 'MiniMax-M2.7',
};

const payload = {
  instructions: '你是张伟，说话直接、简短。',
  input: [
    { role: 'user' as const, content: '晚上吃什么？' },
    { role: 'assistant' as const, content: '都可以。' },
    { role: 'user' as const, content: '那吃火锅？' },
  ],
};

async function callMiddleware(options: {
  method?: string;
  body?: string;
  middleware: ReturnType<typeof createWechatContactChatProxyMiddleware>;
}) {
  const req = Readable.from([options.body ?? JSON.stringify(payload)]) as Readable & { method?: string };
  req.method = options.method ?? 'POST';
  return new Promise<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>(resolve => {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      end(value: string) {
        resolve({ status: this.statusCode, headers, body: JSON.parse(value) });
      },
    };
    void options.middleware(req as never, res as never);
  });
}

describe('WeChat contact chat server proxy', () => {
  it('给MiniMax的思考与正式答复留足空间，长度截断时只重试一次且不泄漏思考',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'',reasoning_content:'private internal reasoning'}}]})))
      .mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'我收到你的消息了。',reasoning_content:'private internal reasoning'}}]})));
    await expect(requestWechatContactReply(payload,config,fetcher)).resolves.toBe('我收到你的消息了。');
    const first=JSON.parse(fetcher.mock.calls[0][1].body),second=JSON.parse(fetcher.mock.calls[1][1].body);
    expect(first.max_tokens).toBeGreaterThanOrEqual(4096);expect(first.reasoning_split).toBe(true);
    expect(second.max_tokens).toBeGreaterThan(first.max_tokens);expect(second.messages).toEqual(first.messages);
    expect(fetcher.mock.calls[1][1].signal).toBe(fetcher.mock.calls[0][1].signal);
  });
  it('两次截断明确报错，正常结束但正文为空不把思考当回复或无限重试',async()=>{
    const truncated=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'未完成的答复',reasoning_content:'private'}}]})));
    await expect(requestWechatContactReply(payload,config,truncated)).rejects.toThrow('长度');expect(truncated).toHaveBeenCalledTimes(2);
    const empty=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'',reasoning_content:'private'}}]})));
    await expect(requestWechatContactReply(payload,config,empty)).rejects.toThrow('未返回有效内容');expect(empty).toHaveBeenCalledOnce();
  });
  it('reads live settings on every new request instead of capturing startup settings', async () => {
    let current = { ...config };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'ok'}}]})));
    try {
      const middleware = createWechatContactChatProxyMiddleware(() => current);
      current = {...config,model:'MiniMax-M2.7-highspeed'};
      const response = await callMiddleware({middleware});
      expect(response.status).toBe(200);
      expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).model).toBe('MiniMax-M2.7-highspeed');
    } finally { fetcher.mockRestore(); }
  });
  it('converts the browser payload to an authenticated chat completion request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '行，你定地方。' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(requestWechatContactReply(payload, config, fetcher)).resolves.toBe('行，你定地方。');
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer server-only-test-key',
        'Content-Type': 'application/json',
      }),
    }));

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toEqual({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: payload.instructions },
        ...payload.input,
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 800,
    });
  });

  it('accepts a base URL that already ends in /v1', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '好。' } }],
    }), { status: 200 }));

    await requestWechatContactReply(payload, { ...config, baseUrl: 'https://api.example.test/v1' }, fetcher);

    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/chat/completions', expect.any(Object));
  });

  it('rejects invalid or oversized browser input before calling the provider', async () => {
    const fetcher = vi.fn();

    await expect(requestWechatContactReply({ ...payload, input: [] }, config, fetcher)).rejects.toThrow('对话内容不能为空');
    await expect(requestWechatContactReply({
      ...payload,
      input: [{ role: 'user', content: 'x'.repeat(2001) }],
    }, config, fetcher)).rejects.toThrow('消息过长');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a sanitized provider error without exposing its response body', async () => {
    const fetcher = vi.fn(async () => new Response('upstream secret diagnostic', { status: 401 }));

    await expect(requestWechatContactReply(payload, config, fetcher)).rejects.toThrow('模型服务请求失败（HTTP 401）');
    await expect(requestWechatContactReply(payload, config, fetcher)).rejects.not.toThrow(/secret diagnostic/);
  });

  it('joins structured text parts and rejects malformed provider responses', async () => {
    const structuredFetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: [{ type: 'text', text: '好，' }, { type: 'text', text: '吃火锅。' }] } }],
    }), { status: 200 }));
    await expect(requestWechatContactReply(payload, config, structuredFetcher)).resolves.toBe('好，吃火锅。');

    const malformedFetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(requestWechatContactReply(payload, config, malformedFetcher)).rejects.toThrow('模型服务未返回有效内容');
  });

  it('validates server configuration and message roles', async () => {
    await expect(requestWechatContactReply(payload, { ...config, apiKey: '' })).rejects.toThrow('模型服务密钥未配置');
    await expect(requestWechatContactReply(payload, { ...config, model: '' })).rejects.toThrow('模型名称未配置');
    await expect(requestWechatContactReply(payload, { ...config, baseUrl: '' })).rejects.toThrow('模型服务地址未配置');
    await expect(requestWechatContactReply({
      ...payload,
      input: [{ role: 'system', content: '不允许' }],
    }, config)).rejects.toThrow('对话角色无效');
  });

  it('serves the same-origin endpoint and enforces its HTTP/input boundary', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '烧烤。' } }],
    }), { status: 200 })) as typeof fetch;
    try {
      const middleware = createWechatContactChatProxyMiddleware(config);
      const success = await callMiddleware({ middleware });
      expect(success).toEqual(expect.objectContaining({
        status: 200,
        body: { output_text: '烧烤。' },
      }));
      expect(success.headers['Cache-Control']).toBe('no-store');

      const wrongMethod = await callMiddleware({ middleware, method: 'GET' });
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.Allow).toBe('POST');

      const invalidJson = await callMiddleware({ middleware, body: '{' });
      expect(invalidJson.status).toBe(400);

      const emptyInput = await callMiddleware({ middleware, body: JSON.stringify({ input: [] }) });
      expect(emptyInput.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
