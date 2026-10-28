import {useId} from 'react';
import {ChevronDown} from 'lucide-react';
import {entryAllocations, type ExpenseBatch, type ExpenseBook, type ExpenseEntry} from '../lib/expense-notebook';
import {calculateGroupAA} from '../lib/group-aa';
import {collectionProgress} from '../lib/expense-follow-up';
import {sourceExpenseIssue, sourceExpenseNet} from '../lib/scene-expenses';

const money = (amount: number) => `¥${(amount / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const date = (at: number) => Number.isFinite(at) && at > 0
  ? new Date(at).toLocaleString('zh-CN', {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})
  : '日期未记录';

function memberName(book: ExpenseBook, id: string) {
  const member = book.group.members.find(item => item.id === id);
  return member?.self ? '你' : member?.name || '成员信息待核对';
}

function EntryDetail({book, entry}: {book: ExpenseBook; entry: ExpenseEntry}) {
  const fixedAmount = entry.fixed.reduce((sum, item) => sum + item.amount, 0);
  const sharedAmount = entry.amount - fixedAmount;
  const allocations = entryAllocations(book.group, entry).filter(member => member.amount > 0);
  const sourceIssue = sourceExpenseIssue(entry);
  const batch = book.batches.find(item => item.id === entry.batchId);
  const status = entry.source && sourceExpenseNet(entry.source) === 0 ? '已全额退款'
    : sourceIssue || batch?.sourceChanged ? '差额待核对'
    : entry.batchId ? '已纳入收款方案' : '尚未结算';
  return <details className="aa-history-entry">
    <summary>
      <span><strong>{entry.title}</strong><small className="aa-history-muted">{date(entry.at)} · {memberName(book, entry.payerId)}垫付</small></span>
      <span><strong className="aa-history-money">{money(entry.amount)}</strong><small className="aa-history-muted">{status}</small></span>
      <ChevronDown className="aa-history-chevron" size={16} aria-hidden="true"/>
    </summary>
    <div className="aa-history-entry-content">
      {sourceIssue && <p className="aa-history-warning">{sourceIssue}。以下保留账本中的分摊记录，不代表退款后的应付金额。</p>}
      <div className="aa-history-split-rule">
        <strong>分摊依据</strong>
        {entry.fixed.length > 0 && <p>固定承担：{entry.fixed.map(item => `${memberName(book, item.memberId)} ${money(item.amount)}`).join('；')}。</p>}
        {sharedAmount > 0 && <p>{fixedAmount > 0 ? `剩余 ${money(sharedAmount)}` : `本笔 ${money(sharedAmount)}`}按{entry.shares.every(item => item.weight === entry.shares[0]?.weight) ? '相同份数' : '相对份数'}分摊：{entry.shares.map(item => `${memberName(book, item.memberId)} ${item.weight} 份`).join('、')}。</p>}
        {sharedAmount === 0 && <p>金额已由指定成员承担，不再平分。</p>}
      </div>
      <dl className="aa-history-members" aria-label={`${entry.title}的分摊金额`}>
        {allocations.map(member => <div className="aa-history-member" key={member.id}><dt>{member.self ? '你' : member.name}</dt><dd className="aa-history-money">{money(member.amount)}</dd></div>)}
      </dl>
      {entry.source && <div className="aa-history-source">
        <strong>原订单与付款依据</strong>
        <p>{entry.source.merchant} · {entry.source.title}</p>
        <dl className="aa-history-facts">
          <div><dt>原订单实付</dt><dd>{money(entry.source.paidAmount)}</dd></div>
          <div><dt>已退款</dt><dd>{money(entry.source.refundedAmount)}</dd></div>
          <div><dt>退款后净实付</dt><dd>{money(sourceExpenseNet(entry.source))}</dd></div>
        </dl>
        <p className="aa-history-muted">付款时间：{date(entry.source.paidAt)}<br/>上次核对：{date(entry.source.checkedAt)}</p>
        <p className="aa-history-muted">订单：{entry.source.orderId}<br/>付款：{entry.source.paymentId}</p>
      </div>}
    </div>
  </details>;
}

function BatchDetail({book, batch, index}: {book: ExpenseBook; batch: ExpenseBatch; index: number}) {
  const amounts = calculateGroupAA(book.group, batch.plan);
  let progress: ReturnType<typeof collectionProgress> | undefined;
  let receiptError = '';
  if (batch.receipt) {
    try { progress = collectionProgress(book, batch, batch.receipt); }
    catch (error) { receiptError = error instanceof Error ? error.message : '微信回执暂时无法核对'; }
  }
  const status = batch.sourceChanged ? '差额待核对'
    : receiptError ? '回执待核对'
    : batch.status === 'prepared' ? '待微信确认'
    : progress?.cancelled ? '已取消收款'
    : progress?.complete ? '已收齐（上次核对）'
    : progress ? '收款中（上次核对）' : '尚未取得回执';
  return <details className="aa-history-batch">
    <summary>
      <span><strong>第 {index + 1} 笔收款</strong><small className="aa-history-muted">{batch.entryIds.length} 笔消费 · {date(batch.at)}</small></span>
      <span><strong className="aa-history-money">{money(amounts.collectAmount)}</strong><small className="aa-history-collection-state">{status}</small></span>
      <ChevronDown className="aa-history-chevron" size={16} aria-hidden="true"/>
    </summary>
    <div className="aa-history-batch-content">
      <dl className="aa-history-facts">
        <div><dt>方案总额</dt><dd>{money(amounts.total)}</dd></div>
        <div><dt>你自己承担</dt><dd>{money(amounts.selfAmount)}</dd></div>
        <div><dt>向其他人收取</dt><dd>{money(amounts.collectAmount)}</dd></div>
      </dl>
      <p className="aa-history-muted">包含：{batch.entryIds.map(id => book.entries.find(entry => entry.id === id)?.title || '原消费记录暂不可用').join('、')}</p>
      {batch.sourceChanged && <p className="aa-history-warning">原订单退款产生差额，以下为原收款方案及已保存回执。请核对微信付款与退款，处理前不能视为结清。</p>}
      {batch.status === 'prepared' && <p className="aa-history-muted">尚未确认这份方案已在微信发布；准备收款不代表已经到账。</p>}
      {receiptError && <p className="aa-history-warning">{receiptError}。原收款方案仍然保留。</p>}
      {!batch.receipt && <p className="aa-history-muted">尚未取得微信回执，不能确认谁已付款。</p>}
      {progress && <>
        {progress.cancelled
          ? <p className="aa-history-warning">微信已取消这笔收款。取消前已付 {money(progress.paid)}；退款情况需要在微信核对，不会自动重新收取。</p>
          : <p className="aa-history-collection-state">上次核对：已收 {money(progress.paid)}{progress.remaining > 0 ? `，未收 ${money(progress.remaining)}` : '，已收齐'}。</p>}
        <dl className="aa-history-members" aria-label={`第 ${index + 1} 笔收款的付款记录`}>
          {progress.members.map(member => <div className="aa-history-member" key={member.id}>
            <dt>{member.name}</dt>
            <dd><span className="aa-history-money">{money(member.amount)}</span><small className="aa-history-muted">{progress.cancelled ? '取消前' : '上次核对：'}{member.paid ? '已付' : '未付'}</small></dd>
          </div>)}
        </dl>
        <p className="aa-history-muted">付款状态为已保存的微信回执，可能与当前状态存在时间差。</p>
      </>}
    </div>
  </details>;
}

/** A read-only account of stored expense rules and verified receipt snapshots. */
export function AAHistoryDetail({book}: {book: ExpenseBook}) {
  const sectionId = useId();
  const allocations = book.entries.map(entry => ({entry, members: entryAllocations(book.group, entry)}));
  const included = new Set([...book.participants, ...book.entries.flatMap(entry => [entry.payerId, ...entry.fixed.map(item => item.memberId), ...entry.shares.map(item => item.memberId)])]);
  const members = book.group.members.filter(member => included.has(member.id)).map(member => ({
    ...member,
    allocated: allocations.reduce((sum, value) => sum + (value.members.find(item => item.id === member.id)?.amount || 0), 0),
    advanced: book.entries.filter(entry => entry.payerId === member.id).reduce((sum, entry) => sum + entry.amount, 0),
  }));
  const hasSourceChange = book.entries.some(entry => !!sourceExpenseIssue(entry)) || book.batches.some(batch => batch.sourceChanged);
  return <div className="aa-history-detail">
    <section className="aa-history-section" aria-labelledby={`${sectionId}-expenses`}>
      <div className="aa-history-section-heading"><h3 id={`${sectionId}-expenses`}>消费明细</h3><span className="aa-history-muted">{book.entries.length} 笔</span></div>
      <p className="aa-history-muted">展开查看垫付人、分摊依据和订单来源。</p>
      {book.entries.length > 0 ? book.entries.map(entry => <EntryDetail key={entry.id} book={book} entry={entry}/>) : <p className="aa-history-muted">这本账还没有记录消费。</p>}
    </section>
    <section className="aa-history-section" aria-labelledby={`${sectionId}-members`}>
      <div className="aa-history-section-heading"><h3 id={`${sectionId}-members`}>每人分摊</h3><span className="aa-history-muted">{members.length} 人</span></div>
      <p className="aa-history-muted">按每笔消费的实际规则汇总。分摊金额不代表已经付款；付款进度见下方收款记录。</p>
      {hasSourceChange && <p className="aa-history-warning">存在退款或待核对差额。以下为账本保留的分摊与垫付记录，不能直接作为当前应付金额。</p>}
      <dl className="aa-history-members" aria-label="账本成员分摊汇总">
        {members.map(member => <div className="aa-history-member" key={member.id}>
          <dt>{member.self ? '你' : member.name}<small className="aa-history-muted">记录垫付 {money(member.advanced)}</small></dt>
          <dd><strong className="aa-history-money">{money(member.allocated)}</strong><small className="aa-history-muted">账本分摊</small></dd>
        </div>)}
      </dl>
    </section>
    <section className="aa-history-section" aria-labelledby={`${sectionId}-collections`}>
      <div className="aa-history-section-heading"><h3 id={`${sectionId}-collections`}>收款记录</h3><span className="aa-history-muted">{book.batches.length} 笔</span></div>
      {book.batches.length > 0 ? book.batches.map((batch, index) => <BatchDetail key={batch.id} book={book} batch={batch} index={index}/>) : <p className="aa-history-muted">还没有收款方案，已记录的消费会继续保留。</p>}
    </section>
  </div>;
}
