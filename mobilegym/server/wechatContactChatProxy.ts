import type { IncomingMessage, ServerResponse } from 'node:http';

export type WechatContactChatProxyConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type BrowserChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type WechatContactChatProxyPayload = {
  instructions?: unknown;
  input?: unknown;
};

type FetchLike = typeof fetch;

const MAX_BODY_BYTES = 32 * 1024;
const MAX_INSTRUCTIONS_LENGTH = 4_000;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 2_000;

function completionUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('模型服务地址未配置');
  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function normalizePayload(payload: WechatContactChatProxyPayload): {
  instructions: string;
  messages: BrowserChatMessage[];
} {
  const instructions = typeof payload.instructions === 'string' ? payload.instructions.trim() : '';
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) throw new Error('角色设定过长');
  if (!Array.isArray(payload.input) || payload.input.length === 0) throw new Error('对话内容不能为空');
  if (payload.input.length > MAX_MESSAGES) throw new Error('对话记录过多');

  const messages = payload.input.map((value): BrowserChatMessage => {
    if (!value || typeof value !== 'object') throw new Error('对话格式无效');
    const role = 'role' in value ? value.role : undefined;
    const content = 'content' in value && typeof value.content === 'string' ? value.content.trim() : '';
    if (role !== 'user' && role !== 'assistant') throw new Error('对话角色无效');
    if (!content) throw new Error('消息内容不能为空');
    if (content.length > MAX_MESSAGE_LENGTH) throw new Error('消息过长');
    return { role, content };
  });

  return { instructions, messages };
}

function extractCompletionText(data: unknown): string {
  if (!data || typeof data !== 'object' || !('choices' in data) || !Array.isArray(data.choices)) {
    throw new Error('模型服务未返回有效内容');
  }
  const message = data.choices[0]?.message;
  const content = message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map(part => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();
    if (text) return text;
  }
  throw new Error('模型服务未返回有效内容');
}

export async function requestWechatContactReply(
  payload: WechatContactChatProxyPayload,
  config: WechatContactChatProxyConfig,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!apiKey) throw new Error('模型服务密钥未配置');
  if (!model) throw new Error('模型名称未配置');
  const { instructions, messages } = normalizePayload(payload);
  const providerMessages = instructions
    ? [{ role: 'system' as const, content: instructions }, ...messages]
    : messages;

  // MiniMax's limit includes thinking tokens, so 800 can leave no answer at all.
  // Keep one deadline across the bounded retry; never expose reasoning as a reply.
  const reasoningModel=/^MiniMax-M/i.test(model);
  const initialLimit=reasoningModel?4096:800;
  const signal=AbortSignal.timeout(45_000);
  for(let attempt=0;attempt<2;attempt++){
    const response = await fetcher(completionUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: providerMessages,
        stream: false,
        temperature: 0.7,
        max_tokens: initialLimit*(attempt+1),
        ...(reasoningModel?{reasoning_split:true}:{}),
      }),
      signal,
      redirect: 'error',
    });

    if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
    const data=await response.json();
    if(data?.choices?.[0]?.finish_reason==='length'){
      if(attempt===0)continue;
      throw new Error('模型回复超出长度限制，请缩短问题后重试');
    }
    return extractCompletionText(data);
  }
  throw new Error('模型服务未返回有效内容');
}

function readJsonBody(req: IncomingMessage): Promise<WechatContactChatProxyPayload> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('请求格式无效'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function createWechatContactChatProxyMiddleware(config: WechatContactChatProxyConfig | (() => WechatContactChatProxyConfig)) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: '仅支持 POST 请求' });
      return;
    }
    try {
      const outputText = await requestWechatContactReply(await readJsonBody(req), typeof config === 'function' ? config() : config);
      sendJson(res, 200, { output_text: outputText });
    } catch (error) {
      const message = error instanceof Error ? error.message : '联系人回复服务暂时不可用';
      const isInputError = /(不能为空|过长|过多|格式无效|角色无效|内容过大)/.test(message);
      sendJson(res, isInputError ? 400 : 502, { error: message });
    }
  };
}
