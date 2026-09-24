import { describe, expect, it, vi } from 'vitest';
import { loadZhiyinContacts, sanitizeContacts } from '../apps/Zhiyin/contact-access';

describe('Zhiyin contact access', () => {
  it('keeps only the minimum matching fields and never exposes a full phone number', () => {
    expect(sanitizeContacts([{
      id: 'c_mother', displayName: ' 妈妈 ', avatarColor: '#D58B68',
      phones: [{ number: '+86 138 0000 6621', isPrimary: true }],
    }])).toEqual([{
      id: 'c_mother', displayName: '妈妈', avatarColor: '#D58B68', phoneLast4: '6621',
    }]);
  });

  it('does not query the provider after permission is denied', async () => {
    const queryContacts = vi.fn(() => []);
    await expect(loadZhiyinContacts({
      requestPermission: vi.fn(async () => 'denied'), queryContacts,
    })).resolves.toEqual({ status: 'denied', contacts: [] });
    expect(queryContacts).not.toHaveBeenCalled();
  });

  it('returns unavailable when the provider fails after permission is granted', async () => {
    await expect(loadZhiyinContacts({
      requestPermission: vi.fn(async () => 'granted'),
      queryContacts: () => { throw new Error('provider unavailable'); },
    })).resolves.toEqual({ status: 'unavailable', contacts: [] });
  });
});
