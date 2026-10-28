import {collectionProgress} from './expense-follow-up';
import {expenseRequest} from './expense-service';
import {groupAARequest} from './group-aa';

/** Reconcile an existing collection only. This never prepares or publishes a payment. */
export async function refreshAAHistoryBook(bookId: string) {
  let state = await expenseRequest();
  const original = state.books.find(book => book.id === bookId);
  if (!original) throw new Error('这本账本暂未找到，请刷新列表');
  if (!original.batches.length) return state;
  const response = await groupAARequest('records', {groupId: original.group.id});
  if (!Array.isArray(response.collections)) throw new Error('未取得微信收款记录，已保留上次结果');
  state = await expenseRequest();
  let book = state.books.find(item => item.id === bookId);
  if (!book || book.group.id !== original.group.id) throw new Error('账本已变化，请重新打开后核对');
  const collections = response.collections.filter(collection => book!.batches.some(batch => batch.id === collection.id));
  for (const collection of collections) {
    collectionProgress(book, book.batches.find(batch => batch.id === collection.id)!, collection);
  }
  // A missing published record must not be presented as freshly verified.
  if (book.batches.some(batch => batch.status === 'published' && !collections.some(collection => collection.id === batch.id))) {
    throw new Error('部分收款未取得微信回执，已保留上次记录，请到微信核对');
  }
  for (const collection of collections) {
    if (book.batches.find(batch => batch.id === collection.id)?.status === 'prepared') {
      state = await expenseRequest({type: 'published', bookId, batchId: collection.id, collectionId: collection.id}, state.revision);
      book = state.books.find(item => item.id === bookId)!;
    }
  }
  const previous = book.batches.flatMap(batch => batch.receipt ? [batch.receipt] : []);
  if (JSON.stringify(previous) !== JSON.stringify(collections)) {
    state = await expenseRequest({type: 'sync-collections', bookId, collections}, state.revision);
  }
  return state;
}
