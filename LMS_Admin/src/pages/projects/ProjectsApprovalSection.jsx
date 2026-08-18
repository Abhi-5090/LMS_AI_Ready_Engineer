import { useState } from 'react';
import { Github, Inbox } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, ErrorState, SkeletonCards, useConfirm } from '@/components/ui';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useProjectReviews, useReviewProject } from '@/lib/projects';
import { ProjectDetailModal } from './ProjectDetailModal';
import { formatDate } from '@/lib/format';
import './projects.css';

const STATUS = {
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

/** Projects panel for the Approvals page — cards open a detail modal to approve/reject. */
export function ProjectsApprovalSection() {
  const { data, isLoading, isError, error, refetch } = useProjectReviews();
  const review = useReviewProject();
  const confirm = useConfirm();
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const list = data ?? [];
  const pending = list.filter((p) => p.status === 'pending');
  const reviewed = list.filter((p) => p.status !== 'pending');

  async function act(project, decision) {
    setErr('');
    let note;
    if (decision === 'reject') {
      const input = await confirm({
        prompt: true,
        title: 'Reason for rejection',
        placeholder: 'Let the student know what to fix…',
        confirmLabel: 'Reject',
        tone: 'danger',
        required: true,
      });
      if (input === null) return;
      note = input;
    }
    setBusy(true);
    try {
      await review.mutateAsync({ id: project.id, decision, note });
      setViewing(null);
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const card = (p) => (
    <div key={p.id} className="project-card" role="button" tabIndex={0} onClick={() => setViewing(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(p); } }}>
      <div className="project-card__cover" style={{ position: 'relative' }}>
        {p.images?.length > 1 && <span className="project-card__count">{p.images.length} images</span>}
        {p.images?.[0] ? <img src={fileSrc(p.images[0])} alt={p.title} /> : <Github size={28} />}
      </div>
      <div className="project-card__body">
        <div className="project-card__title">{p.title}</div>
        <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
          {p.student?.name} · {formatDate(p.createdAt)}
        </div>
        <div className="project-card__foot">
          {p.status === 'pending' ? (
            <Badge tone="warning">Pending</Badge>
          ) : (
            <Badge tone={STATUS[p.status]?.tone ?? 'neutral'}>
              {STATUS[p.status]?.label ?? p.status}{p.reviewedBy?.name ? ` · ${p.reviewedBy.name}` : ''}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );

  if (isError && !data) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading && !data) return <SkeletonCards count={3} height="9rem" />;

  return (
    <>
      {err && <Card style={{ marginBottom: 'var(--space-4)' }}><p className="field__error">{err}</p></Card>}

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title={`Projects · Pending (${pending.length})`}
          subtitle="Tap a card to review the screenshots, repo & description, then approve or reject."
        />
        {pending.length === 0 ? (
          <EmptyState icon={<Inbox size={26} />} title="No projects awaiting review." />
        ) : (
          <div className="project-grid" style={{ marginTop: 'var(--space-3)' }}>{pending.map(card)}</div>
        )}
      </Card>

      {reviewed.length > 0 && (
        <Card>
          <CardHeader title="Projects · Reviewed" subtitle="Recently approved or rejected" />
          <div className="project-grid" style={{ marginTop: 'var(--space-3)' }}>{reviewed.map(card)}</div>
        </Card>
      )}

      <ProjectDetailModal
        project={viewing}
        onClose={() => setViewing(null)}
        onApprove={viewing ? () => act(viewing, 'approve') : undefined}
        onReject={viewing ? () => act(viewing, 'reject') : undefined}
        busy={busy}
      />
    </>
  );
}
