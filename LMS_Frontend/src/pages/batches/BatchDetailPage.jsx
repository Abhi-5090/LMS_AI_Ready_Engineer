import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, ChevronRight, Users, BookOpen } from 'lucide-react';
import { Badge, Card, CardHeader, Modal, Skeleton, SkeletonText, EmptyState, ErrorState } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { UserRole } from '@/shared';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBatch, useSetTopicTaught } from '@/lib/batches';
import { useModule } from '@/lib/modules';
import { formatDateRange } from '@/lib/format';
import { levelTone, titleCase } from '@/pages/modules/moduleUi';
import '../modules/modules.css';

/** Set of topic ids already marked taught for a module in this batch. */
function taughtSet(batch, moduleId) {
  const entry = (batch.taughtTopics ?? []).find((tt) => (tt.module?.id ?? tt.module) === moduleId);
  return new Set((entry?.topics ?? []).map(String));
}

/** Trainer's view of a batch they're assigned to — mark which topics they've taught. */
export function BatchDetailPage() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const { data: batch, isLoading, isError, error, refetch } = useBatch(id);
  const [topicModule, setTopicModule] = useState(null); // module whose topics we're ticking

  if (isLoading && !batch) {
    return (
      <>
        <PageHeader
          title={<Skeleton width="14rem" height="1.75rem" />}
          subtitle={
            <Link to="/app/batches" className="lms-muted">
              ← All batches
            </Link>
          }
        />
        <div className="batch-grid-two">
          <Card><SkeletonText lines={4} /></Card>
          <Card><SkeletonText lines={4} /></Card>
        </div>
        <Card style={{ marginTop: 'var(--space-6)' }}><SkeletonText lines={4} /></Card>
      </>
    );
  }
  if (isError || !batch) {
    return (
      <>
        <PageHeader
          title="Batch"
          subtitle={
            <Link to="/app/batches" className="lms-muted">
              ← All batches
            </Link>
          }
        />
        <ErrorState message={apiErrorMessage(error) || 'Batch not found'} onRetry={refetch} />
      </>
    );
  }

  const students = batch.students ?? [];
  const trainers = batch.trainers ?? [];
  const allModules = (batch.modules ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // A trainer only sees the modules they actually deliver in THIS batch (from the
  // batch's per-module trainer mapping). Admins/others see every module.
  const myModuleIds = new Set(
    (batch.moduleTrainers ?? [])
      .filter((mt) => (mt.trainers ?? []).some((t) => (t.id ?? t) === user?.id))
      .map((mt) => String(mt.module?.id ?? mt.module)),
  );
  const modules =
    user?.role === UserRole.TRAINER ? allModules.filter((m) => myModuleIds.has(String(m.id))) : allModules;

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={
          <Link to="/app/batches" className="lms-muted">
            ← All batches
          </Link>
        }
      />

      <div className="module-card__meta" style={{ marginBottom: 'var(--space-6)' }}>
        <Badge tone="neutral">{batch.code}</Badge>
        <span className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
          {formatDateRange(batch.startDate, batch.endDate)}
        </span>
        {batch.archived && <Badge tone="neutral">Archived</Badge>}
      </div>

      {/* Students + Trainers side by side, equal cards */}
      <div className="batch-grid-two">
        <Card>
          <CardHeader title={`Students (${students.length})`} subtitle="Enrolled in this batch" />
          {students.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title="No students"
              description="No students enrolled yet."
            />
          ) : (
            <MemberTable rows={students} />
          )}
        </Card>

        <Card>
          <CardHeader title={`Trainers (${trainers.length})`} subtitle="Delivering this batch" />
          {trainers.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title="No trainers"
              description="No trainers assigned yet."
            />
          ) : (
            <MemberTable rows={trainers} />
          )}
        </Card>
      </div>

      {/* Modules — open one to mark the topics you've taught for THIS batch */}
      <Card style={{ marginTop: 'var(--space-6)' }}>
        <CardHeader title={`Modules (${modules.length})`} subtitle="Open a module to tick the topics you've taught this batch" />
        {modules.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No modules"
            description="No modules assigned to this batch yet."
          />
        ) : (
          <div className="module-list">
            {modules.map((m) => {
              const taughtCount = taughtSet(batch, m.id).size;
              return (
                <button type="button" key={m.id} className="module-row-link" onClick={() => setTopicModule(m)}>
                  <span className="module-card__order">{m.order}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="module-card__name">{m.name}</div>
                    <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{m.code}</div>
                  </div>
                  {taughtCount > 0 && (
                    <span className="chip" style={{ fontSize: 'var(--font-size-xs)' }}>{taughtCount} taught</span>
                  )}
                  {m.level && <Badge tone={levelTone(m.level)}>{titleCase(m.level)}</Badge>}
                  <ChevronRight size={18} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(topicModule)}
        title={topicModule ? `${topicModule.name} — Topics taught` : ''}
        onClose={() => setTopicModule(null)}
      >
        {topicModule && <TopicTaughtPanel batch={batch} module={topicModule} />}
      </Modal>
    </>
  );
}

/** Members (students/trainers) as a scrollable table — ~10 rows visible, then scroll. */
function MemberTable({ rows }) {
  return (
    <div className="member-scroll">
      <table className="table member-table">
        <thead><tr><th className="member-table__no">#</th><th>Name</th><th>Email</th></tr></thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m.id}>
              <td className="member-table__no">{i + 1}</td>
              <td>{m.name}</td>
              <td className="lms-muted">{m.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicTaughtPanel({ batch, module }) {
  const { data: full, isLoading } = useModule(module.id);
  const setTaught = useSetTopicTaught();
  const taught = taughtSet(batch, module.id);
  const topics = (full?.topics ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (isLoading && !full) return <SkeletonText lines={5} />;
  if (topics.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={26} />}
        title="No topics"
        description="This module has no syllabus topics yet."
      />
    );
  }

  return (
    <div>
      <p className="lms-muted" style={{ marginTop: 0, fontSize: 'var(--font-size-sm)' }}>
        Tick a topic once you&apos;ve taught it to <strong>{batch.name}</strong>. {taught.size}/{topics.length} taught.
      </p>
      {topics.map((t) => {
        const isTaught = taught.has(String(t.id));
        return (
          <div className="topic-row" key={t.id}>
            <button
              type="button"
              className={`topic-check${isTaught ? ' done' : ''}`}
              aria-label={isTaught ? 'Mark not taught' : 'Mark taught'}
              disabled={setTaught.isPending}
              onClick={() => setTaught.mutate({ id: batch.id, moduleId: module.id, topicId: t.id, taught: !isTaught })}
            >
              {isTaught ? <Check size={14} strokeWidth={3} /> : null}
            </button>
            <div className={`topic-row__title${isTaught ? ' done' : ''}`}>
              {t.order}. {t.title}
              {t.description && (
                <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{t.description}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
