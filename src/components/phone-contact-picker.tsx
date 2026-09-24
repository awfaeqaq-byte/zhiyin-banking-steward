import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ContactRound, LoaderCircle, RefreshCw } from "lucide-react";
import { CONTACTS, type Contact } from "../lib/native-banking";
import {
  requestPhoneContacts,
  type PhoneContact,
  type PhoneContactsResult,
} from "../lib/phone-bridge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (recipient: Contact) => void;
};

type ViewState = PhoneContactsResult | { status: "loading"; contacts: PhoneContact[] };

function matchedRecipient(contact: PhoneContact): Contact | null {
  const entry = Object.entries(CONTACTS).find(
    ([name, last4]) => name === contact.displayName && last4 === contact.phoneLast4,
  );
  return entry ? entry[0] as Contact : null;
}

export function PhoneContactPicker({ open, onOpenChange, onSelect }: Props) {
  const [result, setResult] = useState<ViewState>({ status: "loading", contacts: [] });

  const load = useCallback(async () => {
    setResult({ status: "loading", contacts: [] });
    setResult(await requestPhoneContacts());
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setResult({ status: "loading", contacts: [] });
    void requestPhoneContacts().then((next) => {
      if (active) setResult(next);
    });
    return () => { active = false; };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="选择通讯录联系人"
      description="只读取姓名和手机号后四位，用于匹配已保存的收款账户。"
      className="contact-picker-sheet"
    >
      {result.status === "loading" ? (
        <div className="contact-picker-state" role="status">
          <LoaderCircle className="spin" size={25} />
          <strong>正在读取通讯录…</strong>
          <span>首次使用时，请在系统弹窗中确认权限。</span>
        </div>
      ) : result.status !== "granted" ? (
        <div className="contact-picker-state">
          <ContactRound size={28} />
          <strong>{result.status === "denied" ? "没有获得通讯录权限" : "当前无法访问手机通讯录"}</strong>
          <span>{result.status === "denied" ? "你仍可手动填写收款人，也可以再次尝试。" : "请从 MobileGym 手机沙箱中打开知银。"}</span>
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={17} />再次尝试
          </Button>
        </div>
      ) : result.contacts.length === 0 ? (
        <div className="contact-picker-state">
          <ContactRound size={28} />
          <strong>通讯录里还没有可用联系人</strong>
          <span>请先在手机通讯录中添加包含手机号的联系人。</span>
        </div>
      ) : (
        <div className="phone-contact-list">
          {result.contacts.map((contact) => {
            const recipient = matchedRecipient(contact);
            const state = recipient ? "已匹配银行收款账户" : "未匹配银行收款账户";
            return (
              <button
                type="button"
                key={contact.id}
                className="phone-contact-row"
                disabled={!recipient}
                aria-label={`${contact.displayName}，手机号尾号 ${contact.phoneLast4}，${state}`}
                onClick={() => {
                  if (!recipient) return;
                  onSelect(recipient);
                  onOpenChange(false);
                }}
              >
                <span className="phone-contact-avatar" style={{ background: contact.avatarColor || "#78959a" }}>
                  {contact.displayName.slice(0, 1)}
                </span>
                <span className="phone-contact-copy">
                  <strong>{contact.displayName}</strong>
                  <small>手机号尾号 {contact.phoneLast4}</small>
                </span>
                <span className={recipient ? "contact-match matched" : "contact-match"}>
                  {recipient ? <CheckCircle2 size={15} /> : null}{recipient ? `已匹配 · ${recipient}` : "未匹配"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="fine-print left contact-privacy-note">
        知银不会读取短信、备注或完整手机号；选择联系人不会发起转账。
      </p>
    </Dialog>
  );
}
