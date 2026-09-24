import type { ContactChatReplyRequest } from './backend';

export type ContactReceiptEvent = NonNullable<ContactChatReplyRequest['receiptEvent']>;
export type ContactReplyJob = { receiptEvent?: ContactReceiptEvent };

export interface ContactReplyQueue {
  begin: (wxid: string, receiptEvent?: ContactReceiptEvent) => boolean;
  finish: (wxid: string) => ContactReplyJob | undefined;
  clear: () => void;
}

export function createContactReplyQueue(): ContactReplyQueue {
  const activeContacts = new Set<string>();
  const pendingJobs = new Map<string, ContactReplyJob[]>();

  return {
    begin(wxid, receiptEvent) {
      if (!activeContacts.has(wxid)) {
        activeContacts.add(wxid);
        return true;
      }

      const queued = pendingJobs.get(wxid) || [];
      const isDuplicateConversationFollowUp = !receiptEvent
        && queued.length > 0
        && !queued[queued.length - 1].receiptEvent;
      if (!isDuplicateConversationFollowUp) {
        pendingJobs.set(wxid, [...queued, receiptEvent ? { receiptEvent } : {}]);
      }
      return false;
    },

    finish(wxid) {
      activeContacts.delete(wxid);
      const queued = pendingJobs.get(wxid);
      const next = queued?.shift();
      if (!queued?.length) pendingJobs.delete(wxid);
      return next;
    },

    clear() {
      activeContacts.clear();
      pendingJobs.clear();
    },
  };
}
