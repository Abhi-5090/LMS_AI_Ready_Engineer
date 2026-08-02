import { useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, Inbox, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, SkeletonCards, useConfirm } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useCertReviews, useReviewCert } from '@/lib/externalCertificates';
import { usePendingTechTags, useReviewTechTag } from '@/lib/projects';
import { ProjectsApprovalSection } from '@/pages/projects/ProjectsApprovalSection';
import { formatDate } from '@/lib/format';
import '../certificates/certificates.css';
import '../projects/projects.css';
import '../modules/modules.css';

const isImage = (url = '') => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
const STATUS = {
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

/** Trainer/admin: verify and approve/reject student-uploaded external certificates. */
export function ApprovalsPage() {
  const confirm = useConfirm();
  const { data: certs, isLoading, isError, error, refetch } = useCertReviews();
  const review = useReviewCert();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  const list = certs ?? [];
  const pending = list.filter((c) => c.status === 'pending');
  const reviewed = list.filter((c) => c.status !== 'pending');

  async function act(cert, decision) {
    setErr('');
    let note;
    if (decision === 'reject') {
      const input = await confirm({
        prompt: true,
        title: 'Reject certificate',
        message: 'Give the student a reason for rejection.',
        placeholder: 'Reason for rejection…',
        confirmLabel: 'Reject',
        tone: 'danger',
        required: true,
      });
      if (input === null) return; // cancelled
      note = input;
    }
    setBusyId(cert.id);
    try {
      await review.mutateAsync({ id: cert.id, decision, note });
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const row = (c, actionable) => (
    <div key={c.id} className="approval-row">
      <div className="approval-thumb">
        {isImage(c.url) ? <img src={fileSrc(c.url)} alt="" /> : <FileText size={22} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{c.title}</div>
        <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
          {c.student?.name}{c.issuer ? ` · ${c.issuer}` : ''} · submitted {formatDate(c.createdAt)}
        </div>
        <a href={fileSrc(c.url)} target="_blank" rel="noreferrer" className="ext-cert__open" style={{ display: 'inline-flex' }}>
          <ExternalLink size={12} /> View certificate
        </a>
        {!actionable && c.note && (
          <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 2 }}>Note: “{c.note}”</div>
        )}
      </div>
      <div className="approval-actions">
        {actionable ? (
          <>
            <Button size="sm" loading={busyId === c.id} onClick={() => act(c, 'approve')}>
              <CheckCircle2 size={15} /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c, 'reject')}>
              <XCircle size={15} /> Reject
            </Button>
          </>
        ) : (
          <Badge tone={STATUS[c.status]?.tone ?? 'neutral'}>
            {STATUS[c.status]?.label ?? c.status}{c.reviewedBy?.name ? ` · ${c.reviewedBy.name}` : ''}
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Review what students submit — certificates first, then projects. Approved items show on their profile."
      />
      {err && <Card style={{ marginBottom: 'var(--space-4)' }}><p className="field__error">{err}</p></Card>}

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !certs ? (
        <SkeletonCards count={3} height="5rem" />
      ) : (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader title={`Certificates · Pending (${pending.length})`} subtitle="Awaiting your review" />
          {pending.length === 0 ? (
            <EmptyState
              icon={<Inbox size={26} />}
              title="All caught up"
              description="Nothing waiting — you're all caught up."
            />
          ) : (
            <div className="approval-list">{pending.map((c) => row(c, true))}</div>
          )}
        </Card>
      )}

      {!isError && reviewed.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader title="Certificates · Reviewed" subtitle="Recently approved or rejected" />
          <div className="approval-list">{reviewed.map((c) => row(c, false))}</div>
        </Card>
      )}

      <ProjectsApprovalSection />

      <TechTagsApprovalSection />
    </>
  );
}

/** Trainer/admin: approve or reject student-suggested tech-stack tags. */
function TechTagsApprovalSection() {
  const { data: pending, isLoading } = usePendingTechTags();
  const review = useReviewTechTag();
  const list = pending ?? [];

  return (
    <Card style={{ marginTop: 'var(--space-6)' }}>
      <CardHeader title={`Tech tags · Pending (${list.length})`} subtitle="New technologies students added — approve to add them to the suggestion list." />
      {isLoading && !pending ? (
        <SkeletonCards count={2} height="3rem" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Inbox size={24} />} title="No pending tags" />
      ) : (
        <div className="tech-chips" style={{ marginBottom: 0, gap: 'var(--space-2)' }}>
          {list.map((t) => (
            <span key={t.id} className="techtag-review">
              <strong>{t.name}</strong>
              {t.createdBy?.name && <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>by {t.createdBy.name}</span>}
              <button type="button" className="techtag-review__ok" title="Approve" disabled={review.isPending} onClick={() => review.mutate({ id: t.id, decision: 'approve' })}><CheckCircle2 size={15} /></button>
              <button type="button" className="techtag-review__no" title="Reject" disabled={review.isPending} onClick={() => review.mutate({ id: t.id, decision: 'reject' })}><XCircle size={15} /></button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
