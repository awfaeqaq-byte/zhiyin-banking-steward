import { useEffect, useRef } from "react";
import {validWechatShare,receiveWechatShare} from './wechat-message-share';
import type {
  ExternalFinancialProvider,
  FinancialScope,
  FinancialSourceSnapshot,
  FinancialTransaction,
  FinancialAutopay,
} from "./financial-connections";

const CHANNEL = "zhiyin-phone";
const REQUEST_TIMEOUT_MS = 8_000;
const handlers = new Set<{ run: () => boolean; priority: number }>();
export type PhoneContact = {
  id: string;
  displayName: string;
  phoneLast4: string;
  avatarColor?: string;
};
export type PhoneContactsResult = {
  status: "granted" | "denied" | "unavailable";
  contacts: PhoneContact[];
};
let contactsSequence = 0;
let activeContactRequest: ((result: PhoneContactsResult) => void) | null = null;
let financeSequence = 0;
let activeFinanceRequest: {
  provider: ExternalFinancialProvider;
  resolve: (result: FinancialSourceResult) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;
let cancellationSequence = 0;
let activeCancellationRequest: {
  provider: ExternalFinancialProvider;
  subscriptionId: string;
  resolve: (result: FinancialAutopayCancellationResult) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;
let revokeSequence = 0;
let activeRevocationRequest: {
  provider: ExternalFinancialProvider;
  resolve: (result: FinancialSourceRevocationResult) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;
let sendToPhone: ((data: Record<string, unknown>) => void) | null = null;

function waitForPhoneConnection(timeoutMs = 1_500) {
  if (sendToPhone) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (sendToPhone || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(Boolean(sendToPhone));
      }
    }, 50);
  });
}

export type FinancialSourceResult = {
  status: "granted" | "denied" | "unavailable";
  source?: FinancialSourceSnapshot;
};

export type FinancialAutopayCancellationResult = {
  status: "cancelled" | "error" | "unavailable";
  provider?: ExternalFinancialProvider;
  subscriptionId?: string;
  message?: string;
};

export type FinancialSourceRevocationResult = {
  status: "revoked" | "error" | "unavailable";
  provider: ExternalFinancialProvider;
  message?: string;
};

function sanitizeFinancialSource(value: unknown): FinancialSourceSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (
    !["alipay", "wechat_pay"].includes(String(source.provider)) ||
    typeof source.displayName !== "string" || typeof source.accountMasked !== "string" ||
    typeof source.syncedAt !== "string" || !Array.isArray(source.transactions) || !Array.isArray(source.autopays)
  ) return undefined;

  const scannedTransactions = source.transactions.slice(0, 5_000);
  const transactions = scannedTransactions.flatMap((value): FinancialTransaction[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" || typeof item.title !== "string" ||
      !Number.isSafeInteger(item.amount) || typeof item.category !== "string" ||
      typeof item.occurredAt !== "string"
    ) return [];
    const kind = ["payment", "refund", "income", "transfer"].includes(String(item.kind))
      ? item.kind as FinancialTransaction["kind"] : undefined;
    return [{
      id: item.id.slice(0, 80), title: item.title.slice(0, 80), amount: item.amount as number,
      category: item.category.slice(0, 30), occurredAt: item.occurredAt.slice(0, 30),
      ...(kind ? { kind } : {}),
      ...(typeof item.linkedId === "string" ? { linkedId: item.linkedId.slice(0, 100) } : {}),
    }];
  });
  const localInvalidTransactions = scannedTransactions.length - transactions.length;
  const localTransactionsOmitted = source.transactions.length > scannedTransactions.length;
  const rawCoverage = source.transactionCoverage && typeof source.transactionCoverage === "object"
    ? source.transactionCoverage as Record<string, unknown> : undefined;
  const coverageIsValid = rawCoverage &&
    Number.isSafeInteger(rawCoverage.total) && (rawCoverage.total as number) >= 0 &&
    Number.isSafeInteger(rawCoverage.returned) && (rawCoverage.returned as number) >= 0 &&
    Number.isSafeInteger(rawCoverage.invalid) && (rawCoverage.invalid as number) >= 0 &&
    typeof rawCoverage.complete === "boolean";
  const transactionCoverage = source.transactions.length || coverageIsValid ? {
    total: coverageIsValid
      ? Math.max(rawCoverage.total as number, source.transactions.length, transactions.length)
      : source.transactions.length,
    returned: transactions.length,
    invalid: (coverageIsValid ? rawCoverage.invalid as number : 0) + localInvalidTransactions,
    complete: Boolean(coverageIsValid ? rawCoverage.complete : true) &&
      !localTransactionsOmitted && localInvalidTransactions === 0,
    ...(coverageIsValid && typeof rawCoverage.from === "string" ? { from: rawCoverage.from.slice(0, 30) } : {}),
    ...(coverageIsValid && typeof rawCoverage.to === "string" ? { to: rawCoverage.to.slice(0, 30) } : {}),
  } : undefined;
  const validAutopays = source.autopays.flatMap((value): FinancialAutopay[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" || !item.id.trim() || item.id.length > 80 ||
      typeof item.title !== "string" || !item.title.trim() ||
      !Number.isSafeInteger(item.amount) || (item.amount as number) < 0 ||
      typeof item.cycle !== "string" || !item.cycle.trim()
    ) return [];
    return [{
      id: item.id.slice(0, 80), title: item.title.slice(0, 80),
      amount: item.amount as number, cycle: item.cycle.slice(0, 30),
      ...(typeof item.merchant === "string" ? { merchant: item.merchant.slice(0, 80) } : {}),
      ...(Number.isFinite(item.createdAt) ? { createdAt: item.createdAt as number } : {}),
      ...(Number.isFinite(item.nextChargeAt) ? { nextChargeAt: item.nextChargeAt as number } : {}),
      ...(Number.isFinite(item.lastChargedAt) ? { lastChargedAt: item.lastChargedAt as number } : {}),
    }];
  });
  const autopays = validAutopays.slice(0, 1000);
  const omittedAutopays = validAutopays.length !== source.autopays.length || validAutopays.length > autopays.length;

  return {
    provider: source.provider as ExternalFinancialProvider,
    displayName: source.displayName.slice(0, 30), accountMasked: source.accountMasked.slice(0, 50),
    ...(Number.isSafeInteger(source.balance) && (source.balance as number) >= 0
      ? { balance: source.balance as number } : {}),
    transactions, autopays, syncedAt: source.syncedAt.slice(0, 50),
    ...(transactionCoverage ? { transactionCoverage } : {}),
    ...(omittedAutopays || typeof source.autopaysIncomplete === "boolean"
      ? { autopaysIncomplete: omittedAutopays || source.autopaysIncomplete === true } : {}),
    ...(Array.isArray(source.cancelledAutopayIds) ? {
      cancelledAutopayIds: source.cancelledAutopayIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 80).slice(0, 1000),
    } : {}),
  };
}

/** Navigation only: this bridge never exposes banking or authorization commands. */
export function registerPhoneBack(run: () => boolean, priority = 0) {
  const entry = { run, priority };
  handlers.add(entry);
  return () => { handlers.delete(entry); };
}

export function dispatchPhoneBack() {
  return [...handlers].reverse().sort((a, b) => b.priority - a.priority)
    .some((handler) => handler.run());
}

export function usePhoneBack(run: () => boolean, priority = 0, enabled = true) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (enabled) return registerPhoneBack(() => latest.current(), priority);
  }, [enabled, priority]);
}

export function connectPhoneBridge(host: Window, peer: Window) {
  const origin = host.location.origin;
  const reply = (data: Record<string, unknown>) =>
    peer.postMessage({ channel: CHANNEL, version: 1, ...data }, origin);
  const ready = () => reply({ type: "ready" });
  sendToPhone = reply;
  const receive = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== peer) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.version !== 1) return;
    if (data.type === "ping") ready();
    if(data.type==='wechat-share'&&validWechatShare(data.share)){
      try{
        receiveWechatShare(data.share);
        host.dispatchEvent(new Event('zhiyin-wechat-share'));
        reply({type:'wechat-share-result',id:data.share.id,status:'received'});
      }catch(cause){
        host.dispatchEvent(new CustomEvent('zhiyin-wechat-share-error',{detail:cause instanceof Error?cause.message:'微信分享暂未保存，请重试。'}));
      }
    }
    if (data.type === "foreground") host.dispatchEvent(new Event("zhiyin-phone-foreground"));
    if (data.type === "bank-updated") host.dispatchEvent(new Event("zhiyin-bank-updated"));
    if (
      data.type === "contacts-result" && typeof data.requestId === "string" &&
      data.requestId === `contacts-${contactsSequence}` && activeContactRequest &&
      ["granted", "denied", "unavailable"].includes(data.status) && Array.isArray(data.contacts)
    ) {
      const contacts = data.contacts.slice(0, 200).flatMap((contact: unknown) => {
        if (!contact || typeof contact !== "object") return [];
        const item = contact as Record<string, unknown>;
        if (
          typeof item.id !== "string" || typeof item.displayName !== "string" ||
          typeof item.phoneLast4 !== "string" || !/^\d{4}$/.test(item.phoneLast4)
        ) return [];
        return [{
          id: item.id.slice(0, 80), displayName: item.displayName.slice(0, 80),
          phoneLast4: item.phoneLast4,
          ...(typeof item.avatarColor === "string" ? { avatarColor: item.avatarColor.slice(0, 24) } : {}),
        }];
      });
      const resolve = activeContactRequest;
      activeContactRequest = null;
      resolve({ status: data.status, contacts });
    }
    if (
      data.type === "finance-source-result" && typeof data.requestId === "string" &&
      data.requestId === `finance-${financeSequence}` && activeFinanceRequest &&
      ["granted", "denied", "unavailable"].includes(data.status)
    ) {
      const source = sanitizeFinancialSource(data.source);
      const active = activeFinanceRequest;
      if (source && source.provider !== active.provider) return;
      clearTimeout(active.timer);
      activeFinanceRequest = null;
      active.resolve({
        status: data.status === "granted" && !source ? "unavailable" : data.status,
        ...(source ? { source } : {}),
      });
    }
    if (
      data.type === "finance-autopay-cancel-result" &&
      typeof data.requestId === "string" &&
      data.requestId === `cancel-${cancellationSequence}` && activeCancellationRequest &&
      ["cancelled", "error"].includes(data.status) &&
      data.provider === activeCancellationRequest.provider &&
      data.subscriptionId === activeCancellationRequest.subscriptionId
    ) {
      const active = activeCancellationRequest;
      clearTimeout(active.timer);
      activeCancellationRequest = null;
      active.resolve({
        status: data.status,
        ...(["alipay", "wechat_pay"].includes(data.provider) ? { provider: data.provider } : {}),
        ...(typeof data.subscriptionId === "string" ? { subscriptionId: data.subscriptionId.slice(0, 80) } : {}),
        ...(typeof data.message === "string" ? { message: data.message.slice(0, 120) } : {}),
      });
    }
    if (
      data.type === "finance-source-revoke-result" &&
      typeof data.requestId === "string" && data.requestId === `revoke-${revokeSequence}` &&
      activeRevocationRequest && data.provider === activeRevocationRequest.provider &&
      ["revoked", "error"].includes(data.status)
    ) {
      const active = activeRevocationRequest;
      clearTimeout(active.timer);
      activeRevocationRequest = null;
      active.resolve({
        status: data.status,
        provider: active.provider,
        ...(typeof data.message === "string" ? { message: data.message.slice(0, 120) } : {}),
      });
    }
    if (data.type === "back" && typeof data.requestId === "string" && data.requestId.length <= 64) {
      reply({ type: "back-result", requestId: data.requestId, handled: dispatchPhoneBack() });
    }
  };
  host.addEventListener("message", receive);
  ready();
  return () => {
    host.removeEventListener("message", receive);
    if (sendToPhone === reply) sendToPhone = null;
    if (activeContactRequest) {
      activeContactRequest({ status: "unavailable", contacts: [] });
      activeContactRequest = null;
    }
    if (activeFinanceRequest) {
      clearTimeout(activeFinanceRequest.timer);
      activeFinanceRequest.resolve({ status: "unavailable" });
      activeFinanceRequest = null;
    }
    if (activeCancellationRequest) {
      clearTimeout(activeCancellationRequest.timer);
      activeCancellationRequest.resolve({ status: "unavailable" });
      activeCancellationRequest = null;
    }
    if (activeRevocationRequest) {
      clearTimeout(activeRevocationRequest.timer);
      activeRevocationRequest.resolve({
        status: "unavailable", provider: activeRevocationRequest.provider,
        message: "与支付平台的连接已断开，请重试。",
      });
      activeRevocationRequest = null;
    }
  };
}

export function cancelFinancialAutopay(
  provider: ExternalFinancialProvider,
  subscriptionId: string,
): Promise<FinancialAutopayCancellationResult> {
  const id = subscriptionId.trim();
  if (!sendToPhone || activeCancellationRequest || !id || id.length > 80) {
    return Promise.resolve({ status: "unavailable" });
  }
  const requestId = `cancel-${++cancellationSequence}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!activeCancellationRequest || activeCancellationRequest.subscriptionId !== id) return;
      activeCancellationRequest = null;
      resolve({ status: "unavailable", message: "操作超时，请检查连接后重试。" });
    }, REQUEST_TIMEOUT_MS);
    activeCancellationRequest = { provider, subscriptionId: id, resolve, timer };
    sendToPhone?.({
      type: "finance-autopay-cancel-request", requestId, provider,
      subscriptionId: id,
    });
  });
}

export function requestFinancialSource(
  provider: ExternalFinancialProvider,
  scopes: FinancialScope[],
): Promise<FinancialSourceResult> {
  if (!sendToPhone || activeFinanceRequest) return Promise.resolve({ status: "unavailable" });
  const safeScopes = [...new Set(scopes)].filter(scope => ["balance", "transactions", "autopay"].includes(scope));
  if (!safeScopes.length) return Promise.resolve({ status: "denied" });
  const requestId = `finance-${++financeSequence}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!activeFinanceRequest || activeFinanceRequest.provider !== provider) return;
      activeFinanceRequest = null;
      resolve({ status: "unavailable" });
    }, REQUEST_TIMEOUT_MS);
    activeFinanceRequest = { provider, resolve, timer };
    sendToPhone?.({ type: "finance-source-request", requestId, provider, scopes: safeScopes });
  });
}

export function refreshFinancialSource(
  provider: ExternalFinancialProvider,
  scopes: FinancialScope[],
): Promise<FinancialSourceResult> {
  if (!sendToPhone || activeFinanceRequest) return Promise.resolve({ status: "unavailable" });
  const safeScopes = [...new Set(scopes)].filter(scope => ["balance", "transactions", "autopay"].includes(scope));
  if (!safeScopes.length) return Promise.resolve({ status: "denied" });
  const requestId = `finance-${++financeSequence}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!activeFinanceRequest || activeFinanceRequest.provider !== provider) return;
      activeFinanceRequest = null;
      resolve({ status: "unavailable" });
    }, REQUEST_TIMEOUT_MS);
    activeFinanceRequest = { provider, resolve, timer };
    sendToPhone?.({ type: "finance-source-refresh-request", requestId, provider, scopes: safeScopes });
  });
}

/** Restore a persisted phone-side grant after the embedded Zhiyin view mounts. */
export async function restoreFinancialSource(
  provider: ExternalFinancialProvider,
  scopes: FinancialScope[],
): Promise<FinancialSourceResult> {
  const connected = await waitForPhoneConnection(3_000);
  return connected ? refreshFinancialSource(provider, scopes) : { status: "unavailable" };
}

/**
 * Partner authorization may temporarily recreate the phone app while the
 * provider activity is in front. If that drops the first reply, the provider
 * grant is already persisted, so retry once through the read-only refresh path.
 */
export async function requestAuthorizedFinancialSource(
  provider: ExternalFinancialProvider,
  scopes: FinancialScope[],
) {
  const first = await requestFinancialSource(provider, scopes);
  if (first.status !== "unavailable") return first;
  const connected = await waitForPhoneConnection();
  return connected ? refreshFinancialSource(provider, scopes) : first;
}

export function revokeFinancialSource(
  provider: ExternalFinancialProvider,
): Promise<FinancialSourceRevocationResult> {
  if (!sendToPhone || activeRevocationRequest) {
    return Promise.resolve({ status: "unavailable", provider });
  }
  const requestId = `revoke-${++revokeSequence}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!activeRevocationRequest || activeRevocationRequest.provider !== provider) return;
      activeRevocationRequest = null;
      resolve({ status: "unavailable", provider, message: "支付平台确认超时，连接仍然保留。" });
    }, REQUEST_TIMEOUT_MS);
    activeRevocationRequest = { provider, resolve, timer };
    sendToPhone?.({
      type: "finance-source-revoke-request", requestId, provider,
    });
  });
}

export function requestPhoneContacts(): Promise<PhoneContactsResult> {
  if (!sendToPhone) return Promise.resolve({ status: "unavailable", contacts: [] });
  if (activeContactRequest) return Promise.resolve({ status: "unavailable", contacts: [] });
  const requestId = `contacts-${++contactsSequence}`;
  return new Promise((resolve) => {
    activeContactRequest = resolve;
    sendToPhone?.({ type: "contacts-request", requestId });
  });
}

export function usePhoneBridge() {
  useEffect(() => {
    if (window.parent !== window && new URLSearchParams(window.location.search).get("phone") === "mobilegym") {
      return connectPhoneBridge(window, window.parent);
    }
  }, []);
}
