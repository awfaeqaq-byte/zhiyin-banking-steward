import { FormEvent, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import {
  applyFinancialFocusCommand,
  readFinancialFocus,
  writeFinancialFocus,
  type FinancialFocusRule,
} from "../lib/financial-focus";

type Props = { stewardName: string };

export function FinancialFocusRules({ stewardName }: Props) {
  const [rules, setRules] = useState(readFinancialFocus);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  function save(next: FinancialFocusRule[]) {
    setRules(next);
    try { writeFinancialFocus(next); } catch { /* Device storage is optional in the demo. */ }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const change = applyFinancialFocusCommand(draft, rules);
    if (!change) {
      setNotice("可以直接说：以后外卖每月超过 800 元提醒我。此版本先支持餐饮、外卖、打车、游戏、订阅、教育、旅行和大额消费。");
      return;
    }
    save(change.rules);
    setNotice(change.message);
    setDraft("");
  }

  function remove(rule: FinancialFocusRule) {
    save(rules.filter((item) => item.id !== rule.id));
    setNotice(`已取消关注“${rule.title}”。`);
  }

  const samples = [
    "以后外卖每月超过 800 元提醒我",
    "发现新的自动续费时告诉我",
    "只提醒我单笔超过 2000 元的支出",
  ];

  return (
    <section className="surface focus-rules-panel" aria-labelledby="focus-rules-title">
      <header>
        <div>
          <span>你定义的管家规则</span>
          <h2 id="focus-rules-title">我的关注</h2>
          <p>对{stewardName}说一次，之后会按这条规则定期检查。</p>
        </div>
        <small>{rules.length ? `正在关注 ${rules.length} 件事` : "还没有设置"}</small>
      </header>

      <form onSubmit={submit} className="focus-rule-composer">
        <input
          aria-label="用自然语言设置我的关注"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="例如：打车支出每月超过 1000 元提醒我"
          maxLength={200}
        />
        <button type="submit" aria-label="添加关注规则" disabled={!draft.trim()}><Send size={18} /></button>
      </form>

      <div className="focus-rule-samples" aria-label="关注规则示例">
        {samples.map((sample) => (
          <button type="button" key={sample} onClick={() => setDraft(sample)}><Plus size={14} />{sample}</button>
        ))}
      </div>

      {notice && <p className="focus-rule-notice" role="status">{notice}</p>}
      {rules.length ? (
        <div className="focus-rule-list">
          {rules.map((rule) => (
            <article key={rule.id}>
              <i aria-hidden="true" />
              <div><strong>{rule.title}</strong><p>{rule.description}</p></div>
              <button type="button" aria-label={`取消关注${rule.title}`} onClick={() => remove(rule)}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
      ) : (
        <p className="focus-rule-empty">还没有管家规则。你可以用一句自然语言创建第一条关注。</p>
      )}
    </section>
  );
}
