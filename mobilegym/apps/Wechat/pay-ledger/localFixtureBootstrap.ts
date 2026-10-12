import { useWechatStore } from '../state';
import type { WechatPayLedgerData, WechatPayTransaction } from '../types';
import { netFetch } from '@/os/NetworkService';
import * as TimeService from '@/os/TimeService';

const BACKUP_KEY = 'zhiyin-local-wechat-ledger-backup-v1';
export type LocalWechatBillImportReport = {
  version: number; fileName: string; sha256: string; sourceRows: number; importedRows: number;
  quarantinedRows: number; quarantineReasons: Record<string, number>; formulaCells: number;
  from: string | null; to: string | null;
};
type Payload = WechatPayLedgerData & { importReport: LocalWechatBillImportReport };
type Backup = { version: 1; ledger: WechatPayLedgerData; importedIds: string[] };
export type LocalBillReplayStatus = { configured: boolean; enabled: boolean; hasBackup: boolean };
function validTransaction(value: unknown): value is WechatPayTransaction {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<WechatPayTransaction>;
  return typeof row.id === 'string' && row.id.length > 0
    && (row.direction === 'expense' || row.direction === 'income')
    && Number.isSafeInteger(row.amountCents) && Number(row.amountCents) > 0
    && typeof row.merchant === 'string' && typeof row.category === 'string'
    && ['shopping','transport','dining','life','service','education','entertainment','gift','transfer','other','income'].includes(row.category)
    && typeof row.occurredAt === 'string' && Number.isFinite(TimeService.parseToTimestamp(row.occurredAt));
}
function validLedger(value: unknown): value is WechatPayLedgerData {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as Partial<WechatPayLedgerData>;
  return Array.isArray(ledger.transactions) && ledger.transactions.length <= 100_000
    && ledger.transactions.every(validTransaction) && Array.isArray(ledger.monthlyHistory)
    && typeof ledger.settings?.dailyReport === 'boolean' && typeof ledger.settings?.includeManualRecords === 'boolean';
}
function readBackup(): Backup | null {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  const backup = JSON.parse(raw) as Backup;
  if (backup.version !== 1 || !validLedger(backup.ledger) || !Array.isArray(backup.importedIds)
    || !backup.importedIds.every(id => typeof id === 'string')) throw new Error('原账单备份损坏，请保留数据后检查');
  return backup;
}
export async function getLocalBillReplayStatus(): Promise<LocalBillReplayStatus> {
  const response = await netFetch('/api/zhiyin/local-wechat-bill/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取本地回放配置，请检查开发服务器');
  const status = await response.json();
  if (typeof status.configured !== 'boolean' || typeof status.enabled !== 'boolean') throw new Error('回放配置响应无效');
  return { configured: status.configured, enabled: status.enabled, hasBackup: Boolean(readBackup()) };
}
async function setEnabled(enabled: boolean) {
  const response = await netFetch('/api/zhiyin/local-wechat-bill', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhiyin-Local-Bill': '1' },
    body: JSON.stringify({ enabled, confirmed: true }),
  });
  if (!response.ok) throw new Error('切换回放失败，请检查本地配置后重试');
}
// This operator action never grants, revokes or overwrites platform permissions.
export async function loadLocalWechatBillFixture(options?: { confirmed: boolean }): Promise<LocalWechatBillImportReport | null> {
  if (!options?.confirmed) return null;
  const previous = readBackup();
  const ledger = previous?.ledger ?? useWechatStore.getState().payLedger;
  if (!validLedger(ledger)) throw new Error('原账单无法备份，已停止回放');
  const status = await getLocalBillReplayStatus();
  if (!status.configured) throw new Error('请先配置 .zhiyin-bill-source.local.json');
  if (!previous) localStorage.setItem(BACKUP_KEY, JSON.stringify({ version: 1, ledger, importedIds: [] }));
  await setEnabled(true);
  try {
    const response = await netFetch('/api/zhiyin/local-wechat-bill', { cache: 'no-store' });
    if (!response.ok) throw new Error('本地账单读取失败，请检查 Excel 路径与哈希');
    const value: unknown = await response.json();
    if (!validLedger(value)) throw new Error('本地账单响应结构无效');
    const payload = value as Payload;
    if (payload.importReport?.importedRows !== payload.transactions.length) throw new Error('本地账单导入计数不一致');
    const importedIds = [...new Set([...(previous?.importedIds ?? []), ...payload.transactions.map(row => row.id)])];
    const priorImported = new Set(previous?.importedIds ?? []);
    const fresh = previous ? useWechatStore.getState().payLedger.transactions.filter(row => !priorImported.has(row.id)) : [];
    const seen = new Set<string>();
    const rows = [...fresh, ...payload.transactions].filter(row => !seen.has(row.id) && Boolean(seen.add(row.id)));
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ version: 1, ledger, importedIds }));
    useWechatStore.setState({ payLedger: { transactions: rows, monthlyHistory: payload.monthlyHistory, settings: payload.settings } });
    return payload.importReport;
  } catch (error) {
    if (!status.enabled) {
      try { await setEnabled(false); } catch { throw new Error('回放失败且后台未能关闭，请在控制台重试恢复；原账单未替换'); }
    }
    throw error;
  }
}
export async function restoreLocalWechatLedger(options?: { confirmed: boolean }): Promise<boolean> {
  if (!options?.confirmed) return false;
  const backup = readBackup();
  if (!backup) return false;
  const ids = new Set(backup.importedIds);
  const current = useWechatStore.getState().payLedger;
  const seen = new Set<string>();
  const transactions = [...current.transactions.filter(row => !ids.has(row.id)), ...backup.ledger.transactions]
    .filter(row => !seen.has(row.id) && Boolean(seen.add(row.id)));
  await setEnabled(false);
  useWechatStore.setState({ payLedger: { ...backup.ledger, transactions } });
  localStorage.removeItem(BACKUP_KEY);
  return true;
}
