import React, { useEffect, useState } from 'react';

type PublicConfig = {baseUrl:string; model:string; hasApiKey:boolean};
const endpoint = '/api/sandbox/model-config';

export function ModelConfigPanel({active}: {active:boolean}) {
  const [config, setConfig] = useState<PublicConfig>();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function apply(data:PublicConfig) {
    setConfig(data); setBaseUrl(data.baseUrl); setModel(data.model); setKey('');
  }
  useEffect(() => {
    if (!active) { setKey(''); return; }
    const abort = new AbortController();
    setLoading(true); setError(''); setMessage('');
    fetch(endpoint, {signal:abort.signal, cache:'no-store'})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '无法读取模型配置');
        if (!abort.signal.aborted) apply(data);
      })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : '读取失败，请重新展开重试'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [active]);
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','X-Sandbox-Config':'1'},body:JSON.stringify({baseUrl,model,apiKey:key})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败，原配置未更改');
      apply(data); setMessage('已保存。宁宁和微信联系人从下一条新请求起使用此配置；已在回复的消息不受影响。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
    finally { setSaving(false); setKey(''); }
  }
  return <section className="sandbox-model sandbox-console-section">
    <p className="sandbox-finance-hint">宁宁与微信联系人共用。仅本机 localhost 控制台可配置，保存后无需重启。</p>
    {loading && <p role="status">正在读取后端配置…</p>}
    {config && <p className="sandbox-model-current">当前模型：<strong>{config.model}</strong><br />密钥：{config.hasApiKey ? '已配置（不回显）' : '未配置'}</p>}
    <form onSubmit={save} autoComplete="off">
      <fieldset disabled={loading || saving || !config}>
        <label>服务地址<input type="url" required value={baseUrl} onChange={event=>setBaseUrl(event.target.value)} placeholder="https://api.example.com" maxLength={500} spellCheck={false} /></label>
        <label>模型名称<input required value={model} onChange={event=>setModel(event.target.value)} placeholder="MiniMax-M2.7-highspeed" maxLength={150} spellCheck={false} /></label>
        <label>API 密钥<input type="password" value={key} onChange={event=>setKey(event.target.value)} placeholder={config?.hasApiKey ? '留空保留现有密钥' : '输入服务商密钥'} maxLength={500} autoComplete="new-password" spellCheck={false} /></label>
        <p className="sandbox-finance-hint">密钥仅保存在本机后端，不写入浏览器存储。更换服务商地址时必须重新输入密钥。此处不发起付费模型测试。</p>
        <button type="submit" className="sandbox-console-action">{saving ? '正在保存…' : '保存模型配置'}</button>
      </fieldset>
    </form>
    {error && <p className="sandbox-finance-error" role="alert">{error}</p>}
    {message && <p className="sandbox-finance-feedback" role="status">{message}</p>}
  </section>;
}
