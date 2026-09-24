import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { ConnectedFinancialSource, ExternalFinancialProvider } from "./financial-connections";
import { refreshFinancialSource } from "./phone-bridge";

export type FinancialConnections = Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
export type SubscriptionSyncResult = { connections: FinancialConnections; error: string };

/** One sequential bridge request stream, shared by navigation and chat. */
export function useSubscriptionSync(
  initial: () => FinancialConnections,
  load = refreshFinancialSource,
) {
  const [connections, updateConnections] = useState(initial);
  const current = useRef(connections);
  const revision = useRef(0);
  const mounted = useRef(true);
  const pending = useRef<Promise<SubscriptionSyncResult> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const lifecycleRevision = revision;
    mounted.current = true;
    return () => { mounted.current = false; lifecycleRevision.current++; };
  }, []);

  const setConnections = useCallback((value: SetStateAction<FinancialConnections>) => {
    revision.current++;
    current.current = typeof value === "function" ? value(current.current) : value;
    updateConnections(current.current);
  }, []);

  const refresh = useCallback((): Promise<SubscriptionSyncResult> => {
    if (pending.current) return pending.current;
    const entries = (Object.entries(current.current) as [ExternalFinancialProvider, ConnectedFinancialSource][])
      .filter(([, source]) => source.scopes.some(scope => ["autopay", "transactions", "balance"].includes(scope)));
    if (!entries.length) return Promise.resolve({ connections: current.current, error: "" });
    const startRevision = revision.current;
    setRefreshing(true);
    const work = async (): Promise<SubscriptionSyncResult> => {
      const next = { ...current.current };
      const failures: string[] = [];
      for (const [provider, source] of entries) {
        try {
          const result = await load(provider, source.scopes);
          if (result.status === "granted" && result.source) {
            next[provider] = { ...result.source, scopes: source.scopes };
          } else if (result.status === "denied") {
            delete next[provider];
            failures.push(`${source.displayName}授权已失效，请重新连接。`);
          } else {
            failures.push(`${source.displayName}暂时无法同步，请稍后重试。`);
          }
        } catch {
          failures.push(`${source.displayName}暂时无法同步，请稍后重试。`);
        }
        // A cancellation, reconnect or disconnect takes precedence over a late snapshot.
        if (!mounted.current || revision.current !== startRevision) {
          return { connections: current.current, error: "账户信息已变化，请重试以获取最新订阅。" };
        }
      }
      current.current = next;
      updateConnections(next);
      const message = failures.join(" ");
      setError(message);
      return { connections: next, error: message };
    };
    pending.current = work().finally(() => {
      pending.current = null;
      if (mounted.current) setRefreshing(false);
    });
    return pending.current;
  }, [load]);

  return { connections, setConnections, refresh, refreshing, error, setError };
}
