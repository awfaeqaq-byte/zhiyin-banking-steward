import { useCallback, useEffect, useState } from 'react';
import {
  getWechatPayBackend,
  type NewWechatPayTransaction,
  type WechatPayLedgerQuery,
  type WechatPayLedgerResult,
} from './backend';
import type { WechatPayLedgerSettings, WechatPayTransaction } from '../types';
import { useWechatStore } from '../state';

export function useWechatPayLedger(query: WechatPayLedgerQuery) {
  const ledgerRevision = useWechatStore(state => state.payLedger.transactions
    .map(transaction => transaction.id)
    .join('|'));
  const [data, setData] = useState<WechatPayLedgerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const category = query.category || 'all';
  const search = query.search || '';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getWechatPayBackend().getLedger({ month: query.month, category, search }));
    } catch {
      setError('账单暂时加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [category, query.month, search]);

  useEffect(() => {
    void refresh();
  }, [ledgerRevision, refresh]);

  const addTransaction = useCallback(async (input: NewWechatPayTransaction) => {
    const added = await getWechatPayBackend().addTransaction(input);
    await refresh();
    return added;
  }, [refresh]);

  const updateSettings = useCallback(async (updates: Partial<WechatPayLedgerSettings>) => {
    const settings = await getWechatPayBackend().updateSettings(updates);
    await refresh();
    return settings;
  }, [refresh]);

  return { data, loading, error, refresh, addTransaction, updateSettings };
}

export function useWechatPayTransaction(id?: string) {
  const [data, setData] = useState<WechatPayTransaction | null>(null);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void getWechatPayBackend().getTransaction(id).then(transaction => {
      if (active) setData(transaction);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  return { data, loading };
}
