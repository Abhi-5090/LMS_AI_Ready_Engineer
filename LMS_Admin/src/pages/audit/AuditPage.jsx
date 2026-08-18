import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, SkeletonTable } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuditLog } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import '../modules/modules.css';

const ACTION_TONE = {
  'assessment.unlock': 'success',
  'assessment.lock': 'neutral',
  'submission.regrade': 'warning',
  'submission.grade': 'warning',
  'settings.update': 'warning',
  'user.archive': 'error',
  'user.approve': 'success',
  'user.create': 'primary',
};

const FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'assessment.unlock', label: 'Exam unlocked' },
  { value: 'assessment.lock', label: 'Exam locked' },
  { value: 'submission.regrade', label: 'Grade re-run' },
  { value: 'submission.grade', label: 'Grade set manually' },
  { value: 'settings.update', label: 'Settings changed' },
  { value: 'user.create', label: 'User created' },
  { value: 'user.approve', label: 'User approved' },
  { value: 'user.archive', label: 'User archived' },
];

const PAGE_SIZE = 50;

export function AuditPage() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAuditLog({ action, from, to, page, pageSize: PAGE_SIZE });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pick = (setter) => (v) => { setter(v); setPage(1); };

  return (
    <>
      <PageHeader title="Audit Log" subtitle="A record of sensitive actions — who did what, and when." />
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`sched-tab${action === f.value ? ' active' : ''}`}
              onClick={() => pick(setAction)(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <div style={{ width: '10rem' }}><Input label="From" type="date" value={from} onChange={(e) => pick(setFrom)(e.target.value)} max={to || undefined} /></div>
          <div style={{ width: '10rem' }}><Input label="To" type="date" value={to} onChange={(e) => pick(setTo)(e.target.value)} min={from || undefined} /></div>
          {(from || to) && <Button size="sm" variant="outline" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear dates</Button>}
        </div>
      </div>

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <SkeletonTable rows={5} cols={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title={total === 0 && !action && !from && !to ? 'No audit entries yet.' : 'No entries match these filters.'} />
      ) : (
        <>
          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(e.createdAt)}</td>
                      <td>{e.actor?.name ?? e.actorName ?? '—'}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{e.actorRole}</div></td>
                      <td><Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action}</Badge></td>
                      <td className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{e.targetType}{e.targetId ? ` · ${e.targetId.slice(-6)}` : ''}</td>
                      <td className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', maxWidth: '20rem' }}>{e.meta ? JSON.stringify(e.meta) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + items.length} of {total}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Page {page} of {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
