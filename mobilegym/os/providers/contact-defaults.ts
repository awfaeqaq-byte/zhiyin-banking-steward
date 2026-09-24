type ContactLike = { id?: unknown };
type ContactState<T extends ContactLike> = { contacts: T[] };

/** Preserve the saved address book while adding newly shipped system fixtures. */
export function mergeMissingContactDefaults<T extends ContactLike>(
  raw: unknown,
  defaults: ContactState<T>,
): ContactState<T> {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as ContactState<T>).contacts)) {
    return structuredClone(defaults);
  }
  const saved = (raw as ContactState<T>).contacts.filter(
    contact => contact && typeof contact === 'object',
  );
  const savedIds = new Set(saved.map(contact => contact.id).filter(id => typeof id === 'string'));
  const missing = defaults.contacts
    .filter(contact => typeof contact.id !== 'string' || !savedIds.has(contact.id))
    .map(contact => structuredClone(contact));
  return { ...(raw as ContactState<T>), contacts: [...saved, ...missing] };
}
