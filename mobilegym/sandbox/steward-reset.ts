import { getOriginLocalStorage } from '../os/storageIsolation';
import { consoleStrings } from './res/strings';

type ResetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type ResetOptions = { storage?: ResetStorage; stop?: () => void; request?: typeof fetch };
export type StewardResetResult = { reset: true; backupId: string; memoryRevision: number };
const conversationKeys = [
  'zhiyin-steward-chat-v3', 'zhiyin-steward-conversation-v1',
  'zhiyin-steward-context-cutoff', 'zhiyin-steward-conversation-cutoff',
  'zhiyin-workspace-active', 'zhiyin-transfer-workspace', 'zhiyin-bill-scenes-v1',
  'zhiyin-duplicate-preferences-v1', 'zhiyin-recurring-reviews-v1',
];

export async function resetSteward(options: ResetOptions = {}): Promise<StewardResetResult> {
  // Zhiyin's iframe shares the origin's storage area, not MobileGym's tab prefix.
  // Resolve this even when the app is closed, before selecting the backend scope.
  let storage: ResetStorage;
  try { storage = options.storage ?? getOriginLocalStorage(); }
  catch (error) {
    if (error instanceof Error && error.message === 'STORAGE_ISOLATION_RELOAD_REQUIRED') throw new Error(consoleStrings.steward.reload);
    throw error;
  }
  const request = options.request ?? fetch;
  const stop = options.stop ?? (() => window.__OS__?.closeApp('zhiyin'));
  let scope = storage.getItem('zhiyin-expense-scope');
  if (!scope) { scope = crypto.randomUUID(); storage.setItem('zhiyin-expense-scope', scope); }
  // Unmount the old app first; pending model responses cannot repaint/re-save its context.
  stop();
  const response = await request('/api/zhiyin/reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhiyin-Reset': '1', 'X-Zhiyin-Expense-Scope': scope },
    body: JSON.stringify({ confirm: 'reset-steward' }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '重置未完成，请重试');
  if (result.reset !== true || typeof result.backupId !== 'string' || !Number.isSafeInteger(result.memoryRevision)) throw new Error('未收到有效重置结果，请重试');
  for (const key of conversationKeys) storage.removeItem(key);
  storage.setItem('zhiyin-memory-revision', String(result.memoryRevision));
  return result;
}
