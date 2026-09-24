import ContentResolver from '@/os/ContentResolver';
import PermissionService from '@/os/PermissionService';
import { PERMISSIONS, type PermissionStatus } from '@/os/permissions';

export type ZhiyinPhoneContact = {
  id: string;
  displayName: string;
  phoneLast4: string;
  avatarColor?: string;
};

export type ZhiyinContactsResult = {
  status: 'granted' | 'denied' | 'unavailable';
  contacts: ZhiyinPhoneContact[];
};

type ContactRow = {
  id?: unknown;
  displayName?: unknown;
  avatarColor?: unknown;
  phones?: Array<{ number?: unknown; isPrimary?: unknown }>;
};

type Dependencies = {
  requestPermission: () => Promise<PermissionStatus | undefined>;
  queryContacts: () => ContactRow[];
};

export function sanitizeContacts(rows: ContactRow[]): ZhiyinPhoneContact[] {
  return rows.slice(0, 200).flatMap((row) => {
    const displayName = typeof row.displayName === 'string' ? row.displayName.trim() : '';
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const phones = Array.isArray(row.phones) ? row.phones : [];
    const primary = phones.find(phone => phone?.isPrimary) ?? phones[0];
    const digits = typeof primary?.number === 'string' ? primary.number.replace(/\D/g, '') : '';
    if (!id || !displayName || digits.length < 4) return [];
    return [{
      id,
      displayName,
      phoneLast4: digits.slice(-4),
      ...(typeof row.avatarColor === 'string' ? { avatarColor: row.avatarColor } : {}),
    }];
  });
}

const defaults: Dependencies = {
  requestPermission: async () => {
    const result = await PermissionService.requestPermissions(
      'zhiyin',
      [PERMISSIONS.READ_CONTACTS],
      { rationale: '用于选择转账收款人。知银只会使用联系人姓名和手机号后四位进行账户匹配。' },
    );
    return result[PERMISSIONS.READ_CONTACTS];
  },
  queryContacts: () => ContentResolver.query<ContactRow>(
    'content://contacts/contacts',
    ['id', 'displayName', 'phones', 'avatarColor'],
  ).items,
};

export async function loadZhiyinContacts(
  dependencies: Dependencies = defaults,
): Promise<ZhiyinContactsResult> {
  const status = await dependencies.requestPermission();
  if (status !== 'granted') return { status: 'denied', contacts: [] };
  try {
    return { status: 'granted', contacts: sanitizeContacts(dependencies.queryContacts()) };
  } catch {
    return { status: 'unavailable', contacts: [] };
  }
}
