import { useWechatStore } from '../state';
import type { WechatPayLedgerData, WechatPayTransaction } from '../types';
import { loadFinancialSource } from '@/apps/Zhiyin/finance-access';
import { revokeFinancialGrant, storeFinancialGrant } from '@/apps/Zhiyin/financial-grants';

const CONNECTIONS_KEY = 'zhiyin-connections';
const FIXTURE_MARKER_KEY = 'zhiyin-local-wechat-fixture-v1';
const TEST_SCOPES = ['transactions'] as const;

export type LocalWechatBillImportReport = {
  version: number;
  fileName: string;
  sha256: string;
  sourceRows: number;
  importedRows: number;
  quarantinedRows: number;
  quarantineReasons: Record<string, number>;
  formulaCells: number;
  from: string | null;
  to: string | null;
};

type LocalWechatBillPayload = WechatPayLedgerData & {
  importReport: LocalWechatBillImportReport;
};

function validTransaction(item: unknown): item is WechatPayTransaction {
  if (!item || typeof item !== 'object') return false;
  const transaction = item as Partial<WechatPayTransaction>;
  const categories = new Set([
    'shopping', 'transport', 'dining', 'life', 'service', 'education',
    'entertainment', 'gift', 'transfer', 'other', 'income',
  ]);
  return typeof transaction.id === 'string'
    && (transaction.direction === 'expense' || transaction.direction === 'income')
    && Number.isSafeInteger(transaction.amountCents)
    && Number(transaction.amountCents) > 0
    && typeof transaction.category === 'string'
    && categories.has(transaction.category)
    && typeof transaction.merchant === 'string'
    && typeof transaction.occurredAt === 'string'
    && Number.isFinite(Date.parse(transaction.occurredAt));
}

function isPayload(value: unknown): value is LocalWechatBillPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<LocalWechatBillPayload>;
  return Array.isArray(payload.transactions)
    && payload.transactions.length <= 100_000
    && payload.transactions.every(validTransaction)
    && Array.isArray(payload.monthlyHistory)
    && Boolean(payload.settings)
    && Boolean(payload.importReport)
    && payload.importReport?.importedRows === payload.transactions.length;
}

function readConnectionState(): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || '{}');
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function clearAutoConnectedFixture() {
  try {
    if (!localStorage.getItem(FIXTURE_MARKER_KEY)) return;
    const connections = readConnectionState();
    delete connections.wechat_pay;
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
    localStorage.removeItem(FIXTURE_MARKER_KEY);
    revokeFinancialGrant('wechat_pay');
    void fetch('/api/zhiyin/bill-source',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bill-Source':'1'},body:JSON.stringify({provider:'wechat_pay',authorized:false})}).catch(()=>{});
  } catch {
    // Storage is optional; the in-memory fixture can still be used by WeChat.
  }
}

async function connectFixtureToZhiyin(report: LocalWechatBillImportReport) {
  storeFinancialGrant('wechat_pay', [...TEST_SCOPES]);
  const result = await loadFinancialSource('wechat_pay', [...TEST_SCOPES]);
  if (result.status !== 'granted' || !result.source) {
    throw new Error('无法建立知银测试账单快照');
  }
  const connections = readConnectionState();
  connections.wechat_pay = { ...result.source, scopes: [...TEST_SCOPES] };
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
  localStorage.setItem(FIXTURE_MARKER_KEY, JSON.stringify({
    sha256: report.sha256,
    importedRows: report.importedRows,
    sourceRows: report.sourceRows,
  }));
  const grant=await fetch('/api/zhiyin/bill-source',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bill-Source':'1'},body:JSON.stringify({provider:'wechat_pay',authorized:true})});
  if(!grant.ok)throw new Error('后台账单授权同步失败');
}

export async function loadLocalWechatBillFixture(): Promise<LocalWechatBillImportReport | null> {
  try {
    const response = await fetch('/api/zhiyin/local-wechat-bill', { cache: 'no-store' });
    if (response.status === 404) {
      clearAutoConnectedFixture();
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isPayload(payload)) throw new Error('响应结构无效');

    useWechatStore.setState({
      payLedger: {
        transactions: payload.transactions,
        monthlyHistory: payload.monthlyHistory,
        settings: payload.settings,
      },
    });
    await connectFixtureToZhiyin(payload.importReport);
    console.info(
      `[Zhiyin] 已载入并自动连接本地微信账单：${payload.importReport.importedRows}/${payload.importReport.sourceRows} 条，` +
      `隔离 ${payload.importReport.quarantinedRows} 条。`,
    );
    return payload.importReport;
  } catch (error) {
    clearAutoConnectedFixture();
    console.warn('[Zhiyin] 本地微信账单未载入，将使用内置演示数据。', error);
    return null;
  }
}
