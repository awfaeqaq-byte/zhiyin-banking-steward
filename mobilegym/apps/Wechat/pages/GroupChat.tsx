import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as TimeService from "@/os/TimeService";
import { useWechatStore } from "../state";
import { useWechatGestures } from "../hooks/useWechatGestures";
import { useWechatStrings } from "../hooks/useWechatStrings";
import { IcNavBack, IcMore, IcFile, IcBellOff } from "../res/icons";
import {
  normalizeGroupAA,
  sendGroupAAMessage,
  updateGroupAASettings,
  revokeGroupAA,
} from "../group-aa/backend";
import type { AAMember } from "../../../../src/lib/group-aa";
import "./group-aa.css";
import "./group-chat.css";
import {useMessageShare} from '../components/useMessageShare';

export function MemberAvatar({ member }: { member?: AAMember }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="wx-group-avatar">
      {member?.avatar && !failed ? (
        <img src={member.avatar} alt="" onError={() => setFailed(true)} />
      ) : (
        (member?.name.slice(0, 1) ?? "?")
      )}
    </span>
  );
}
export function GroupMosaic({ members }: { members: AAMember[] }) {
  return (
    <span className="wx-group-mosaic" aria-hidden="true">
      {members.slice(0, 9).map((m) => (
        <MemberAvatar key={m.id} member={m} />
      ))}
    </span>
  );
}
function useGroup() {
  const { groupId } = useParams();
  const stored = useWechatStore((s) => s.groupAA);
  const state = useMemo(() => normalizeGroupAA(stored), [stored]);
  return { state, group: state.groups.find((g) => g.id === groupId) };
}
function timestamp(value: number) {
  const date = TimeService.fromTimestamp(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function GroupChatPage() {
  const { group, state } = useGroup();
  const t = useWechatStrings();
  const { bindBack, bindTap } = useWechatGestures();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const messages = group ? (state.messages?.[group.id] ?? []) : [];
  const messageShare=useMessageShare({id:group?.id||'',name:group?.name||'',kind:'group'},messages.map(m=>({id:m.id,sender:group?.members.find(member=>member.id===m.memberId)?.name||t.zhiyin_share_unknown_sender,text:m.text,sentAt:m.createdAt})));
  const collections = state.collections.filter((c) => c.groupId === group?.id);
  const timeline = [
    ...messages.map((m) => ({ id: m.id, createdAt: m.createdAt, message: m })),
    ...collections.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      collection: c,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [group?.id, messages.length, collections.length]);
  function send() {
    if (!group) return;
    try {
      sendGroupAAMessage(group.id, draft);
      setDraft("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t.aa_invalid);
    }
  }
  return (
    <div className="wx-aa-page wx-group-chat" data-status-bar-foreground="dark">
      <header>
        <button aria-label={t.aa_back} {...bindBack()}>
          <IcNavBack size={25} />
        </button>
        <h1>
          {group?.name.replace("（演示群）", "") ?? t.aa_members}
          {group && ` (${group.members.length})`}
          {group && state.settings?.[group.id]?.muted && (
            <IcBellOff size={15} />
          )}
        </h1>
        {group && (
          <button
            aria-label={t.aa_chat_info}
            {...bindTap("wechat.groupAA.info.open", {
              params: { groupId: group.id },
            })}
          >
            <IcMore size={25} />
          </button>
        )}
      </header>
      <main data-scroll-container="main" data-scroll-direction="vertical">
        {timeline.map((entry, index) => {
          const collection =
            "collection" in entry ? entry.collection : undefined;
          const message = "message" in entry ? entry.message : undefined;
          const member = group?.members.find((m) =>
            collection ? m.self : m.id === message?.memberId,
          );
          const outgoing = !!member?.self;
          return (
            <div key={entry.id}>
              {(index === 0 ||
                entry.createdAt - timeline[index - 1].createdAt > 300000) && (
                <time className="wx-group-time">
                  {timestamp(entry.createdAt)}
                </time>
              )}
              <div className={`wx-group-message ${outgoing ? "is-self" : ""}`}>
                <MemberAvatar member={member} />
                <div className="wx-group-message-body">
                  {!outgoing && (
                    <span className="wx-group-sender">{member?.name}</span>
                  )}
                  {collection && group ? (
                    <button
                      className={`wx-group-collection ${collection.status === "cancelled" ? "is-stopped" : ""}`}
                      {...bindTap("wechat.groupAA.collection.open", {
                        params: {
                          groupId: group.id,
                          collectionId: collection.id,
                        },
                      })}
                    >
                      <span className="wx-group-collection-main">
                        <span className="wx-group-receipt-icon">
                          <IcFile size={24} />
                        </span>
                        <span>
                          <strong>{collection.plan.title}</strong>
                          <span>
                            {collection.status === "cancelled"
                              ? t.aa_cancelled
                              : collection.status === "completed"
                                ? t.aa_completed
                                : t.aa_started_collection}
                          </span>
                        </span>
                      </span>
                      <small>{t.aa_collection}</small>
                    </button>
                  ) : (
                    <div className="wx-group-bubble" {...(message?messageShare.bindMessage(message.id):{})}>{message?.text}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!timeline.length && <p className="wx-group-time">{t.aa_chat_empty}</p>}
        <div ref={end} />
      </main>
      {messageShare.overlay}
      {error && (
        <p className="wx-aa-error" role="alert">
          {error}
        </p>
      )}
      <footer className="wx-group-composer" data-keep-keyboard="true">
        <input
          aria-label={t.aa_group_message}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          disabled={!draft.trim() || !group}
          {...bindTap(
            { kind: "action", id: "wechat.groupAA.message.submit" },
            { onTrigger: send },
          )}
        >
          {t.aa_send}
        </button>
      </footer>
    </div>
  );
}
export function GroupInfoPage() {
  const { group, state } = useGroup();
  const t = useWechatStrings();
  const { bindBack, bindTap } = useWechatGestures();
  const settings = group ? (state.settings?.[group.id] ?? {}) : {};
  return (
    <div className="wx-aa-page wx-group-info" data-status-bar-foreground="dark">
      <header>
        <button aria-label={t.aa_back} {...bindBack()}>
          <IcNavBack size={25} />
        </button>
        <h1>
          {t.aa_chat_info}
          {group && ` (${group.members.length})`}
        </h1>
      </header>
      <main data-scroll-container="main" data-scroll-direction="vertical">
        {group && (
          <>
            <div className="wx-group-members-grid">
              {group.members.map((m) => (
                <div key={m.id}>
                  <MemberAvatar member={m} />
                  <span>{m.self ? t.aa_me : m.name}</span>
                  <small>
                    {m.gender === "female"
                      ? t.aa_female
                      : m.gender === "male"
                        ? t.aa_male
                        : t.aa_gender_unknown}
                  </small>
                </div>
              ))}
            </div>
            <div className="wx-group-info-block">
              <div className="wx-group-info-row">
                <span>{t.aa_group_name}</span>
                <span>{group.name.replace("（演示群）", "")}</span>
              </div>
              <div className="wx-group-info-row">
                <span>{t.aa_members}</span>
                <span>{group.members.length}</span>
              </div>
            </div>
            <div className="wx-group-info-block">
              <button
                className="wx-group-info-row"
                role="switch"
                aria-checked={!!settings.muted}
                {...bindTap(
                  { kind: "action", id: "wechat.groupAA.mute.toggle" },
                  {
                    params: { groupId: group.id },
                    onTrigger: () =>
                      updateGroupAASettings(group.id, {
                        muted: !settings.muted,
                      }),
                  },
                )}
              >
                <span>{t.aa_mute}</span>
                <span
                  className={`wx-group-switch ${settings.muted ? "is-on" : ""}`}
                />
              </button>
              <button
                className="wx-group-info-row"
                role="switch"
                aria-checked={!!settings.pinned}
                {...bindTap(
                  { kind: "action", id: "wechat.groupAA.pin.toggle" },
                  {
                    params: { groupId: group.id },
                    onTrigger: () =>
                      updateGroupAASettings(group.id, {
                        pinned: !settings.pinned,
                      }),
                  },
                )}
              >
                <span>{t.aa_pin}</span>
                <span
                  className={`wx-group-switch ${settings.pinned ? "is-on" : ""}`}
                />
              </button>
            </div>
            <div className="wx-group-info-block">
              <div className="wx-group-info-row">
                <span>{t.aa_profile_access}</span>
                <span>
                  {state.grants.includes(group.id)
                    ? t.aa_shared
                    : t.aa_not_shared}
                </span>
              </div>
              {state.grants.includes(group.id) && (
                <button
                  className="wx-aa-link"
                  {...bindTap(
                    { kind: "action", id: "wechat.groupAA.revoke.submit" },
                    {
                      params: { groupId: group.id },
                      onTrigger: () => revokeGroupAA(group.id),
                    },
                  )}
                >
                  {t.aa_revoke}
                </button>
              )}
            </div>
            <p className="wx-aa-muted wx-group-disclosure">
              {t.aa_profile_hint}
            </p>
            <p className="wx-aa-muted wx-group-disclosure">{t.aa_sandbox}</p>
          </>
        )}
      </main>
    </div>
  );
}
