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

export type WechatContactChatReplyResult = {
  outputText: string;
  finishReason: string | null;
  retried: boolean;
};

type Completion = {
  outputText: string;
  finishReason: string | null;
};

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

function extractCompletion(data: unknown): Completion {
  if (!data || typeof data !== 'object' || !('choices' in data) || !Array.isArray(data.choices)) {
    throw new Error('模型服务未返回有效内容');
  }
  const choice = data.choices[0];
  const message = choice?.message;
  const content = message?.content;
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  if (typeof content === 'string' && content.trim()) {
    return { outputText: content.trim(), finishReason };
  }
  if (Array.isArray(content)) {
    const text = content
      .map(part => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();
    if (text) return { outputText: text, finishReason };
  }
  if (finishReason === 'length') return { outputText: '', finishReason };
  throw new Error('模型服务未返回有效内容');
}

function isLikelyIncomplete(completion: Completion): boolean {
  if (completion.finishReason === 'length') return true;
  const text = completion.outputText.trim();
  if (text.length < 50) return false;
  if (/[[（【“‘《]$/.test(text)) return true;
  if (/\[ZHIYIN_(?:ACTION|VIEW):[^\]\r\n]+\]$/.test(text)) return false;
  return !/(?:[。！？.!?…]|\]\]|\})$/.test(text);
}

const COMPLETENESS_RETRY_INSTRUCTION =
  '必须完整回答，不得在句中停止；结尾必须是完整句子或合法的结构化标记。';

async function fetchCompletion(
  providerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config: WechatContactChatProxyConfig,
  fetcher: FetchLike,
  signal: AbortSignal,
  attempt = 0,
): Promise<Completion> {
  const response = await fetcher(completionUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages: providerMessages,
      stream: false,
      temperature: 0.7,
      max_tokens: (/^MiniMax-M/i.test(config.model.trim()) ? 4096 : 800) * (attempt + 1),
      ...(/^MiniMax-M/i.test(config.model.trim()) ? { reasoning_split: true } : {}),
    }),
    signal,
    redirect: 'error',
  });

  if (!response.ok) throw new Error(`模型服务请求失败（HTTP ${response.status}）`);
  return extractCompletion(await response.json());
}

export async function requestWechatContactReplyResult(
  payload: WechatContactChatProxyPayload,
  config: WechatContactChatProxyConfig,
  fetcher: FetchLike = fetch,
): Promise<WechatContactChatReplyResult> {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!apiKey) throw new Error('模型服务密钥未配置');
  if (!model) throw new Error('模型名称未配置');
  const { instructions, messages } = normalizePayload(payload);
  const providerMessages = instructions
    ? [{ role: 'system' as const, content: instructions }, ...messages]
    : messages;

  const signal = AbortSignal.timeout(45_000);
  const first = await fetchCompletion(providerMessages, config, fetcher, signal);
  if (!isLikelyIncomplete(first)) {
    return { ...first, retried: false };
  }

  const retryMessages = providerMessages[0]?.role === 'system'
    ? [
        { ...providerMessages[0], content: `${providerMessages[0].content}\n${COMPLETENESS_RETRY_INSTRUCTION}` },
        ...providerMessages.slice(1),
      ]
    : [{ role: 'system' as const, content: COMPLETENESS_RETRY_INSTRUCTION }, ...providerMessages];
  const second = await fetchCompletion(first.finishReason === 'length' ? providerMessages : retryMessages, config, fetcher, signal, 1);
  if (second.finishReason === 'length') throw new Error('模型连续返回不完整回答：达到长度限制，请缩短问题后重试');
  if (isLikelyIncomplete(second)) throw new Error('模型连续返回不完整回答，请重试');
  return { ...second, retried: true };
}

export async function requestWechatContactReply(
  payload: WechatContactChatProxyPayload,
  config: WechatContactChatProxyConfig,
  fetcher: FetchLike = fetch,
): Promise<string> {
  return (await requestWechatContactReplyResult(payload, config, fetcher)).outputText;
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
      const result = await requestWechatContactReplyResult(
        await readJsonBody(req),
        typeof config === 'function' ? config() : config,
      );
      sendJson(res, 200, {
        output_text: result.outputText,
        finish_reason: result.finishReason,
        completeness_retried: result.retried,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '联系人回复服务暂时不可用';
      const isInputError = /(不能为空|过长|过多|格式无效|角色无效|内容过大)/.test(message);
      sendJson(res, isInputError ? 400 : 502, { error: message });
    }
  };
}
