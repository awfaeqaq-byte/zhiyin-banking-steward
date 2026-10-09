import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';

type LocalBillConfig = {
  sourcePath: string;
  expectedSha256?: string;
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
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!fs.existsSync(configPath)) {
      sendJson(res, 404, { status: 'disabled' });
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as LocalBillConfig;
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
