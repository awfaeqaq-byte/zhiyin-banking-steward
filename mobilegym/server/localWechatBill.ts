import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';

type LocalBillConfig = {
  sourcePath: string;
  expectedSha256?: string;
  enabled?: boolean;
};

type CacheEntry = {
  key: string;
  json: string;
};
const execFileAsync=promisify(execFile);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function createLocalWechatBillMiddleware(configPath: string, importerPath: string) {
  let cache: CacheEntry | null = null;

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site'
        || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) {
        sendJson(res, 403, {error:'仅允许同源访问'}); return;
      }
      const configured = fs.existsSync(configPath);
      const config: LocalBillConfig | null = configured ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
      if (req.method === 'GET' && req.url?.split('?')[0] === '/status') {
        sendJson(res, 200, {configured, enabled:config?.enabled === true}); return;
      }
      if (req.method === 'POST') {
        if (req.headers['x-zhiyin-local-bill'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) {
          sendJson(res, 403, {error:'请求格式无效'}); return;
        }
        let body=''; for await(const chunk of req) {body+=chunk.toString();if(Buffer.byteLength(body)>512){sendJson(res,413,{error:'请求过大'});return;}}
        const input=JSON.parse(body) as {enabled?:boolean;confirmed?:boolean};
        if(typeof input.enabled!=='boolean'||input.confirmed!==true){sendJson(res,400,{error:'请明确确认回放切换'});return;}
        if(!config){sendJson(res,404,{error:'尚未配置本地账单'});return;}
        fs.writeFileSync(configPath+'.tmp',JSON.stringify({...config,enabled:input.enabled}),{mode:0o600});
        fs.renameSync(configPath+'.tmp',configPath); cache=null;
        sendJson(res,200,{configured:true,enabled:input.enabled});return;
      }
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed'});return;}
      if(!config||config.enabled!==true){sendJson(res,404,{status:'disabled'});return;}
      if (!path.isAbsolute(config.sourcePath) || path.extname(config.sourcePath).toLowerCase() !== '.xlsx') {
        throw new Error('本地账单配置必须使用绝对 xlsx 路径');
      }
      const stat = fs.statSync(config.sourcePath);
      const importerStat = fs.statSync(importerPath);
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024) {
        throw new Error('本地账单不存在或超过 50MB');
      }
      const cacheKey = `${config.sourcePath}:${stat.size}:${stat.mtimeMs}:${importerStat.mtimeMs}:${config.expectedSha256 || ''}`;
      if (cache?.key === cacheKey) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(cache.json);
        return;
      }

      const {stdout} = await execFileAsync(process.env.ZHIYIN_PYTHON || 'python3', [importerPath, config.sourcePath], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
      });
      const payload = JSON.parse(stdout) as { importReport?: { sha256?: string } };
      if (config.expectedSha256 && payload.importReport?.sha256 !== config.expectedSha256) {
        throw new Error('账单文件哈希与本地配置不一致');
      }
      const json = JSON.stringify(payload);
      cache = { key: cacheKey, json };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(json);
    } catch (error) {
      console.error('[zhiyin/local-wechat-bill] import failed:', error instanceof Error ? error.message : String(error));
      sendJson(res, 500, { status: 'error', message: '本地微信账单导入失败，请查看开发服务器日志。' });
    }
  };
}
