import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WechatContactChatProxyConfig } from './wechatContactChatProxy';

type Config = WechatContactChatProxyConfig;
function validate(input: unknown, previous: Config): Config {
  if (!input || typeof input !== 'object') throw new Error('配置格式无效');
  const data = input as Record<string, unknown>;
  if (typeof data.baseUrl !== 'string' || typeof data.model !== 'string'
    || (data.apiKey !== undefined && typeof data.apiKey !== 'string')) throw new Error('请填写服务地址和模型名称');
  let url: URL;
  try { url = new URL(data.baseUrl.trim()); } catch { throw new Error('服务地址无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /\.(local|localhost|internal)$/.test(url.hostname)) {
    throw new Error('请使用不含账号、参数的公网 HTTPS 服务地址');
  }
  const model = data.model.trim();
  if (!model || model.length > 150 || /[\r\n\x00-\x1f]/.test(model)) throw new Error('模型名称无效');
  const replacement = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
  if (replacement.length > 500 || /[\s\x00-\x1f]/.test(replacement)) throw new Error('密钥格式无效');
  if (previous.apiKey && !replacement && url.origin !== new URL(previous.baseUrl).origin) {
    throw new Error('更换服务商时请重新输入该服务商的密钥，避免将原密钥发送到其他地址');
  }
  const apiKey = replacement || previous.apiKey;
  if (!apiKey) throw new Error('请输入 API 密钥');
  return { baseUrl: url.toString().replace(/\/+$/, ''), model, apiKey };
}

export function createModelConfigStore(file: string, fallback: Config) {
  let current = { ...fallback };
  if (existsSync(file)) {
    // Fail closed on corrupt private configuration; never silently use another provider.
    current = validate(JSON.parse(readFileSync(file, 'utf8')), {apiKey:'',baseUrl:'',model:''});
  }
  return {
    get: () => ({ ...current }),
    publicConfig: () => ({baseUrl: current.baseUrl, model: current.model, hasApiKey: Boolean(current.apiKey)}),
    save(input: unknown) {
      const next = validate(input, current);
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify(next, null, 2), {mode:0o600, flag:'wx'});
        renameSync(temp, file);
      } catch {
        if (existsSync(temp)) unlinkSync(temp);
        throw new Error('无法保存后端配置，原配置未更改');
      }
      current = next;
    },
  };
}

export function isLocalConfigRequest(req: IncomingMessage) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return false;
  try {
    const target = new URL(`http://${req.headers.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return false;
    if (req.headers.origin && req.headers.origin !== target.origin) return false;
    return !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin' || req.headers['sec-fetch-site'] === 'none';
  } catch { return false; }
}

export function createModelConfigMiddleware(store: ReturnType<typeof createModelConfigStore>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, data: object) => {
      res.statusCode = status;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify(data));
    };
    if (!isLocalConfigRequest(req)) return send(403,{error:'模型配置仅允许本机 localhost 控制台访问'});
    if (req.method === 'GET') return send(200,store.publicConfig());
    if (req.method !== 'POST') return send(405,{error:'仅支持 GET 和 POST'});
    if (req.headers['x-sandbox-config'] !== '1' || req.headers['content-type'] !== 'application/json') return send(403,{error:'配置请求校验失败'});
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 4096) return send(413,{error:'配置内容过长'});
      }
      let data: unknown;
      try { data = JSON.parse(body); } catch { return send(400,{error:'配置格式无效'}); }
      store.save(data);
      send(200,store.publicConfig());
    } catch (error) {
      send(400,{error:error instanceof Error ? error.message : '配置保存失败'});
    }
  };
}
