import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useActivityContext } from "@/os/ActivityContext";
import { useWechatStore } from "../state";
import { useWechatGestures } from "../hooks/useWechatGestures";
import { useWechatStrings } from "../hooks/useWechatStrings";
import { IcNavBack } from "../res/icons";
import {
  normalizeGroupAA,
  grantGroupAA,
  publishGroupAA,
  simulateGroupAAPayment,
  cancelGroupAA,
} from "../group-aa/backend";
import { calculateGroupAA, type AAPlan } from "../../../../src/lib/group-aa";
import "./group-aa.css";
import { GroupMosaic, MemberAvatar } from "./GroupChat";

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
export function GroupAAChatRows() {
  const stored = useWechatStore((s) => s.groupAA);
  const state = useMemo(() => normalizeGroupAA(stored), [stored]);
  const { bindTap } = useWechatGestures();
  const t = useWechatStrings();
  return (
    <>
      {[...state.groups]
        .sort(
          (a, b) =>
            Number(!!state.settings?.[b.id]?.pinned) -
            Number(!!state.settings?.[a.id]?.pinned),
        )
        .map((group) => {
          const latest = state.collections.find((c) => c.groupId === group.id);
          return (
            <button
              key={group.id}
              className="wx-aa-chat-row"
              {...bindTap("wechat.groupAA.open", {
                params: { groupId: group.id },
              })}
            >
              <GroupMosaic members={group.members} />
              <span>
                <strong>{group.name}</strong>
                <small>
                  {latest
                    ? `${t.aa_collection} · ${latest.plan.title}`
                    : (state.messages?.[group.id]?.at(-1)?.text ??
                      t.aa_group_preview)}
                </small>
              </span>
            </button>
          );
        })}
    </>
  );
}
export function GroupAAPage() {
  const { groupId, collectionId } = useParams();
  const { activityId } = useActivityContext();
  const { bindTap, bindBack } = useWechatGestures();
  const t = useWechatStrings();
  const stored = useWechatStore((s) => s.groupAA);
  const state = useMemo(() => normalizeGroupAA(stored), [stored]);
  const [error, setError] = useState("");
  const request = useMemo(
    () => window.__OS__?.getIntentPayload?.(activityId)?.data,
    [activityId],
  );
  const external = !groupId && request?.clientId === "zhiyin";
  const choosing = external && request.operation === "choose";
  const publishing = external && request.operation === "publish";
  const group = state.groups.find(
    (g) => g.id === (groupId ?? request?.groupId),
  );
  let calculation: ReturnType<typeof calculateGroupAA> | undefined;
  let invalid = "";
  if (publishing)
    try {
      if (
        !group ||
        !state.grants.includes(group.id) ||
        request.revision !== group.revision
      )
        throw new Error(t.aa_stale);
      calculation = calculateGroupAA(group, request.plan as AAPlan);
      if (calculation.collectAmount <= 0) throw new Error(t.aa_invalid);
    } catch (e) {
      invalid = e instanceof Error ? e.message : t.aa_invalid;
    }
  function perform(work: () => void) {
    setError("");
    try {
      work();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.aa_invalid);
    }
  }
  const finish = (data: Record<string, unknown>) =>
    window.__OS__?.setResult({ resultCode: "OK", data });
  return (
    <div className="wx-aa-page" data-status-bar-foreground="dark">
      <header>
        <button aria-label={t.aa_back} {...bindBack()}>
          <IcNavBack size={24} />
        </button>
        <h1>
          {choosing ? t.aa_choose : publishing ? t.aa_confirm : t.aa_collection}
        </h1>
      </header>
      <main data-scroll-container="main" data-scroll-direction="vertical">
        {choosing ? (
          <>
            <h2>{t.aa_consent_title}</h2>
            <p className="wx-aa-muted">{t.aa_consent_description}</p>
            {state.groups.map((g) => (
              <section key={g.id}>
                <h3>{g.name}</h3>
                <p>{g.members.map((m) => m.name).join("、")}</p>
                <button
                  className="wx-aa-primary"
                  {...bindTap(
                    { kind: "action", id: "wechat.groupAA.authorize.submit" },
                    {
                      params: { groupId: g.id },
                      onTrigger: () =>
                        perform(() => finish({ group: grantGroupAA(g.id) })),
                    },
                  )}
                >
                  {t.aa_authorize}
                </button>
              </section>
            ))}
            <p className="wx-aa-muted">{t.aa_sandbox}</p>
          </>
        ) : publishing ? (
          <>
            <div className="wx-aa-mode">
              <strong>{t.aa_by_person}</strong>
              <span>{t.aa_prepared}</span>
            </div>
            <p className="wx-aa-muted">{t.aa_confirm_hint}</p>
            {invalid ? (
              <p role="alert">{invalid}</p>
            ) : (
              calculation &&
              group && (
                <section>
                  <h3>{group.name}</h3>
                  <p>{(request.plan as AAPlan).title}</p>
                  <div className="wx-aa-participant-title">
                    <span>
                      {t.aa_participants} ({calculation.members.length})
                    </span>
                    <span>{t.aa_amount}</span>
                  </div>
                  {calculation.members.map((m) => (
                    <div className="wx-aa-line" key={m.id}>
                      <span className="wx-aa-person">
                        <MemberAvatar member={m} />
                        <span>
                          {m.name}
                          {m.self ? ` · ${t.aa_self}` : ""}
                          <small>{m.note}</small>
                        </span>
                      </span>
                      <b>{money(m.amount)}</b>
                    </div>
                  ))}
                  <div className="wx-aa-line">
                    <span>{t.aa_to_collect}</span>
                    <b>{money(calculation.collectAmount)}</b>
                  </div>
                  <button
                    className="wx-aa-primary"
                    {...bindTap(
                      { kind: "action", id: "wechat.groupAA.publish.submit" },
                      {
                        onTrigger: () =>
                          perform(() =>
                            finish({
                              collection: publishGroupAA(
                                String(request.id ?? ""),
                                group.id,
                                Number(request.revision),
                                request.plan as AAPlan,
                              ),
                            }),
                          ),
                      },
                    )}
                  >
                    {t.aa_publish}
                  </button>
                  <p className="wx-aa-muted">{t.aa_no_debit}</p>
                </section>
              )
            )}
          </>
        ) : group ? (
          <>
            {!state.collections.some((c) => c.groupId === group.id) && (
              <p className="wx-aa-muted">{t.aa_empty}</p>
            )}
            {state.collections
              .filter((c) => c.groupId === group.id && c.id === collectionId)
              .map((c) => (
                <section key={c.id}>
                  <h2>{c.plan.title}</h2>
                  <p className="wx-aa-status">
                    {c.status === "completed"
                      ? t.aa_completed
                      : c.status === "cancelled"
                        ? t.aa_cancelled
                        : t.aa_pending}{" "}
                  </p>
                  <div className="wx-aa-money-summary">
                    <span>
                      <small>{t.aa_total_collection}</small>
                      <b>{money(c.collectAmount)}</b>
                    </span>
                    <span>
                      <small>{t.aa_collected_amount}</small>
                      <b>
                        {money(
                          c.members
                            .filter((m) => !m.self && m.paid)
                            .reduce((sum, m) => sum + m.amount, 0),
                        )}
                      </b>
                    </span>
                    <span>
                      <small>{t.aa_unpaid_amount}</small>
                      <b>
                        {money(
                          c.members
                            .filter((m) => !m.self && !m.paid)
                            .reduce((sum, m) => sum + m.amount, 0),
                        )}
                      </b>
                    </span>
                  </div>
                  {c.members
                    .filter((m) => !m.self)
                    .map((m) => (
                      <div className="wx-aa-line" key={m.id}>
                        <span>
                          {m.name}
                          <small>{m.note}</small>
                        </span>
                        <span>
                          {money(m.amount)}
                          <small>{m.paid ? t.aa_paid : t.aa_unpaid}</small>
                        </span>
                      </div>
                    ))}
                  {c.status === "pending" && (
                    <details>
                      <summary>{t.aa_test_tools}</summary>
                      <p className="wx-aa-muted">{t.aa_test_hint}</p>
                      {c.members
                        .filter((m) => !m.self && !m.paid)
                        .map((m) => (
                          <button
                            className="wx-aa-test"
                            key={m.id}
                            {...bindTap(
                              {
                                kind: "action",
                                id: "wechat.groupAA.payment.submit",
                              },
                              {
                                params: { collectionId: c.id, memberId: m.id },
                                onTrigger: () =>
                                  perform(() =>
                                    simulateGroupAAPayment(c.id, m.id),
                                  ),
                              },
                            )}
                          >
                            {t.aa_simulate} {m.name} · {money(m.amount)}
                          </button>
                        ))}
                      <p className="wx-aa-muted">{t.aa_stop_hint}</p>
                      <button
                        className="wx-aa-link"
                        {...bindTap(
                          {
                            kind: "action",
                            id: "wechat.groupAA.cancel.submit",
                          },
                          {
                            params: { collectionId: c.id },
                            onTrigger: () => perform(() => cancelGroupAA(c.id)),
                          },
                        )}
                      >
                        {t.aa_stop}
                      </button>
                    </details>
                  )}
                </section>
              ))}
          </>
        ) : (
          <GroupAAChatRows />
        )}
        {error && (
          <p role="alert" className="wx-aa-error">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
