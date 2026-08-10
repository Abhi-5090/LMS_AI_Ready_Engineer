import { useState } from 'react';
import { Award, BookOpen, ClipboardCheck, ClipboardList, CircleCheck, Users } from 'lucide-react';
import { UserRole } from '@/shared';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Select, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBatchAnalytics, useTrainerAnalytics } from '@/lib/analytics';
import { useBatches } from '@/lib/batches';

export function AnalyticsPage() {
  const role = useAuth((s) => s.user?.role);
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  return isAdmin ? <AdminAnalytics /> : <TrainerAnalytics />;
}

/** Admin analytics: pick a batch to drill in, or "All batches" for the institution view. */
function AdminAnalytics() {
  const { data: batches } = useBatches();
  const [batchId, setBatchId] = useState('');
  const options = [
    { value: '', label: 'All batches (institution)' },
    ...(batches ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
  ];
  return (
    <>
      <PageHeader title="Analytics" subtitle="Institution-wide, or drill into a single batch." />
      <div className="toolbar">
        <span />
        <div className="toolbar__right" style={{ minWidth: '16rem' }}>
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} options={options} aria-label="Select batch" />
        </div>
      </div>
      <BatchAnalytics batchId={batchId || 'all'} />
    </>
  );
}

function BatchAnalytics({ batchId }) {
  const { data, isLoading, isError, error, refetch } = useBatchAnalytics(batchId);
  if (isError && !data) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading && !data) return <SkeletonCards count={4} height="7rem" />;

  const { batch, counts, attendance, moduleProgress, assessments, atRisk, attendanceThreshold } = data;
  const isAll = batch?.id === 'all';
  const scope = isAll ? 'across all batches' : 'this batch';
  const half = Math.ceil(moduleProgress.length / 2);
  const mkRows = (list) => list.map((m) => ({ label: m.code || m.module, segments: [{ value: m.completed || 0 }, { value: m.inProgress || 0 }] }));
  const series = [
    { key: 'completed', label: 'Completed', color: 'var(--color-primary)' },
    { key: 'inProgress', label: 'In progress', color: 'var(--color-secondary)' },
  ];
  const attData = [
    { label: 'Present', value: attendance.present, color: 'var(--color-success)' },
    { label: 'Late', value: attendance.late, color: '#f59e0b' },
    { label: 'Absent', value: attendance.absent, color: 'var(--color-error)' },
    { label: 'Excused', value: attendance.excused, color: 'var(--color-text-muted)' },
  ];

  return (
    <>
      <div className="stat-grid">
        <Stat label="Students" value={counts.students} accent icon={<Users size={20} />} />
        <Stat label="Modules Completed" value={`${counts.modulesCompleted}/${counts.modules}`} icon={<BookOpen size={20} />} />
        <Stat label="Attendance" value={`${attendance.percentage}%`} icon={<ClipboardCheck size={20} />} />
        <Stat label="Certificates" value={counts.certificates} icon={<Award size={20} />} />
      </div>

      <div className="dash-grid-2" style={{ margin: 'var(--space-6) 0' }}>
        <Card>
          <CardHeader title="Attendance" subtitle={`${attendance.percentage}% present across ${attendance.total} marks`} />
          <DonutChart data={attData} centerValue={`${attendance.percentage}%`} centerLabel="Attendance" emptyText="No attendance recorded." />
        </Card>
        <Card>
          <CardHeader title="Syllabus Completion" subtitle={`${counts.completionPct}% of modules fully taught`} />
          <DonutChart
            data={[
              { label: 'Completed', value: counts.modulesCompleted, color: 'var(--color-primary)' },
              { label: 'Remaining', value: Math.max(0, counts.modules - counts.modulesCompleted), color: 'var(--color-border)' },
            ]}
            centerValue={`${counts.completionPct}%`}
            centerLabel="Modules"
            emptyText="No modules."
          />
        </Card>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Progress by Module" subtitle="Completed and in-progress students per module" />
        <div className="dash-grid-2">
          <StackedBarChart rows={mkRows(moduleProgress.slice(0, half))} series={series} emptyText="No module progress yet." />
          <StackedBarChart rows={mkRows(moduleProgress.slice(half))} series={series} emptyText="" />
        </div>
      </Card>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Assessment Performance" subtitle={`Submissions, pass rate & average score — ${scope}`} />
        {assessments.length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title={`No assessments ${scope} yet.`} />
        ) : (
          <div className="table-wrap" style={{ maxHeight: '28rem', overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Assessment</th><th>Module</th><th>Submissions</th><th>Pass rate</th><th>Avg score</th></tr></thead>
              <tbody>
                {assessments.map((a, i) => (
                  <tr key={i}>
                    <td>{a.title}</td>
                    <td>{a.module}</td>
                    <td>{a.submissions}</td>
                    <td><Badge tone={a.submissions === 0 ? 'neutral' : a.passRate >= 70 ? 'success' : 'warning'}>{a.submissions ? `${a.passRate}%` : '—'}</Badge></td>
                    <td>{a.submissions ? `${a.avgScore}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Students at Risk" subtitle={`Below ${attendanceThreshold}% attendance`} />
        {atRisk.length === 0 ? (
          <p className="lms-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <CircleCheck size={16} style={{ color: 'var(--color-success)' }} /> Everyone is meeting the attendance requirement.
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '22rem', overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Student</th><th>Attendance</th></tr></thead>
              <tbody>{atRisk.map((s, i) => (<tr key={i}><td>{s.name}</td><td><Badge tone="error">{s.percentage}%</Badge></td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function TrainerAnalytics() {
  const { data, isLoading, isError, error, refetch } = useTrainerAnalytics();

  if (isError && !data) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="Performance across your batches and modules." />
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      </>
    );
  }
  if (isLoading && !data) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="Performance across your batches and modules." />
        <SkeletonCards count={4} height="7rem" />
      </>
    );
  }

  const { counts, batches, assessments } = data;
  return (
    <>
      <PageHeader title="Analytics" subtitle="Performance across your batches and modules." />

      <div className="stat-grid">
        <Stat label="Assigned Modules" value={counts.modules} accent />
        <Stat label="Assigned Batches" value={counts.batches} />
        <Stat label="Students" value={counts.students} />
        <Stat label="Upcoming Classes" value={counts.upcomingClasses} />
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Average Attendance by Batch" />
        <BarChart
          data={batches.map((b) => ({ label: b.batch, value: b.avgAttendance }))}
          max={100}
          suffix="%"
        />
      </Card>

      <Card>
        <CardHeader title="Assessment Performance" subtitle="Submissions, pass rate & average score" />
        {assessments.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={26} />}
            title="No assessments in your modules yet."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Assessment</th><th>Module</th><th>Submissions</th><th>Pass rate</th><th>Avg score</th></tr>
              </thead>
              <tbody>
                {assessments.map((a, i) => (
                  <tr key={i}>
                    <td>{a.title}</td>
                    <td>{a.module}</td>
                    <td>{a.submissions}</td>
                    <td>
                      <Badge tone={a.submissions === 0 ? 'neutral' : a.passRate >= 70 ? 'success' : 'warning'}>
                        {a.submissions ? `${a.passRate}%` : '—'}
                      </Badge>
                    </td>
                    <td>{a.submissions ? `${a.avgScore}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
