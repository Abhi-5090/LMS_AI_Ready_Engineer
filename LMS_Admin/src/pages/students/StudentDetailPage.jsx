import { Link, useParams } from 'react-router-dom';
import { Check, Users, X } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useStudentProgress, useStudentSubmissions } from '@/lib/progress';
import { useStudentAttendance } from '@/lib/attendance';
import { useStudentCertificates } from '@/lib/certificates';
import { levelTone, titleCase } from '@/pages/modules/moduleUi';
import { formatDate } from '@/lib/format';
import '@/pages/modules/modules.css';

const STATUS = {
  completed: { tone: 'success', label: 'Completed' },
  in_progress: { tone: 'primary', label: 'In progress' },
  locked: { tone: 'neutral', label: 'Locked' },
};

const A_TYPE = { practice: 'Practice', preparation: 'Preparation', final: 'Final' };

/** Admin/trainer drill-down: one student's progression, attendance, certificates. */
export function StudentDetailPage() {
  const { id } = useParams();
  const progress = useStudentProgress(id);
  const attendance = useStudentAttendance(id);
  const certs = useStudentCertificates(id);
  const submissions = useStudentSubmissions(id);

  if (progress.isLoading && !progress.data) {
    return (
      <>
        <PageHeader title="Student" subtitle={<Link to="/app/users" className="lms-muted">← All users</Link>} />
        <SkeletonCards count={4} height="5rem" />
      </>
    );
  }
  if (progress.isError) {
    return (
      <>
        <PageHeader title="Student" subtitle={<Link to="/app/users" className="lms-muted">← All users</Link>} />
        <ErrorState message={apiErrorMessage(progress.error)} onRetry={progress.refetch} />
      </>
    );
  }

  const p = progress.data;
  const student = p.student;
  const att = attendance.data?.summary;
  const certificates = certs.data?.certificates ?? [];
  const subs = submissions.data ?? [];

  return (
    <>
      <PageHeader
        title={student?.name ?? 'Student'}
        subtitle={<Link to="/app/users" className="lms-muted">← All users</Link>}
      />

      <div className="stat-grid">
        <Stat label="Attendance" value={att ? `${att.percentage}%` : '—'} accent />
        <Stat label="Modules Completed" value={p.hasBatch ? `${p.completedCount} / ${p.total}` : '—'} />
        <Stat label="Assessments Taken" value={subs.length} />
        <Stat label="Certificates" value={certificates.length} />
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Curriculum progression" subtitle={p.hasBatch ? `Pass ≥ ${p.passingScore}% · attendance ≥ ${p.minAttendance}%` : undefined} />
        {!p.hasBatch ? (
          <EmptyState
            icon={<Users size={26} />}
            title="Not enrolled in a batch"
            description="This student is not enrolled in a batch."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Module</th><th>Status</th><th>Attendance</th><th>Final</th><th>Practice</th></tr>
              </thead>
              <tbody>
                {p.modules.map((m) => {
                  const s = STATUS[m.status] ?? STATUS.locked;
                  return (
                    <tr key={m.module.id}>
                      <td>{m.module.order}</td>
                      <td>{m.module.name} <Badge tone={levelTone(m.module.level)}>{titleCase(m.module.level)}</Badge></td>
                      <td><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{m.attendancePercentage}% {m.attendanceMet ? <Check size={14} strokeWidth={3} style={{ color: 'var(--color-success)' }} /> : null}</span></td>
                      <td>
                        {m.finalScore !== undefined ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {m.finalScore}% {m.finalPassed ? <Check size={14} strokeWidth={3} style={{ color: 'var(--color-success)' }} /> : <X size={14} strokeWidth={3} style={{ color: 'var(--color-error)' }} />}
                          </span>
                        ) : m.hasFinal ? '—' : 'no final'}
                      </td>
                      <td>{m.practiceTestsCompleted}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Completed assessments" subtitle="Tests this student has submitted, newest first." />
        {subs.length === 0 ? (
          <EmptyState icon={<Users size={26} />} title="No assessments taken yet" description="This student hasn't submitted any assessments." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Assessment</th><th>Module</th><th>Type</th><th>Score</th><th>Result</th><th>Submitted</th></tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.assessment}</td>
                    <td>{s.module || '—'}</td>
                    <td><Badge tone="neutral">{A_TYPE[s.type] ?? s.type}</Badge></td>
                    <td>{s.status === 'graded' && s.score != null ? `${s.score}%` : '—'}</td>
                    <td>
                      {s.status === 'graded' ? (
                        <Badge tone={s.passed ? 'success' : 'error'}>{s.passed ? 'Passed' : 'Failed'}</Badge>
                      ) : (
                        <Badge tone="neutral">{s.status === 'evaluating' ? 'Grading…' : 'Submitted'}</Badge>
                      )}
                    </td>
                    <td className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{s.submittedAt ? formatDate(s.submittedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        <Card>
          <CardHeader title="Attendance breakdown" />
          {!att ? (
            <p className="lms-muted">No attendance recorded.</p>
          ) : (() => {
            const bs = att.byStatus || {};
            const present = bs.present || 0;
            const late = bs.late || 0;
            const absent = bs.absent || 0;
            const excused = bs.excused || 0;
            const total = present + late + absent + excused;
            const attended = present + late; // present or late = attended
            const pct = att.percentage ?? (total ? Math.round((attended / total) * 100) : 0);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', lineHeight: 1 }}>{pct}%</span>
                  <span className="lms-secondary-text">Attended <b>{attended}</b> of <b>{total}</b> classes</span>
                </div>
                <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' }} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Badge tone="success">Present {present}</Badge>
                  {late > 0 && <Badge tone="warning">Late {late}</Badge>}
                  {absent > 0 && <Badge tone="error">Absent {absent}</Badge>}
                  {excused > 0 && <Badge tone="neutral">Excused {excused}</Badge>}
                </div>
              </div>
            );
          })()}
        </Card>
        <Card>
          <CardHeader title="Certificates" />
          {certificates.length === 0 ? (
            <p className="lms-muted">None issued yet.</p>
          ) : (
            certificates.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
                <span>{c.isProgramCertificate ? 'AI Ready Engineer Program' : c.module?.name}</span>
                <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{formatDate(c.issuedAt)}</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </>
  );
}
