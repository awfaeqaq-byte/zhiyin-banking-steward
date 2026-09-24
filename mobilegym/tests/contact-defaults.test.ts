import { describe, expect, it } from 'vitest';
import { mergeMissingContactDefaults } from '../os/providers/contact-defaults';

describe('contact default migration', () => {
  it('adds new sandbox beneficiaries without overwriting saved contacts', () => {
    const savedMother = { id: 'c_mother', displayName: '我的妈妈', phones: [] };
    const existing = { contacts: [{ id: 'custom', displayName: '自定义联系人', phones: [] }, savedMother] };
    const defaults = { contacts: [
      { id: 'c_mother', displayName: '妈妈', phones: [{ number: '6621' }] },
      { id: 'c_father', displayName: '爸爸', phones: [{ number: '7316' }] },
    ] };

    const migrated = mergeMissingContactDefaults(existing, defaults);
    expect(migrated.contacts).toHaveLength(3);
    expect(migrated.contacts.find(contact => contact.id === 'c_mother')).toBe(savedMother);
    expect(migrated.contacts.some(contact => contact.id === 'c_father')).toBe(true);
  });
});
