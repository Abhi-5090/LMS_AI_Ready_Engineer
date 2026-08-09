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
import { useAdminAnalytics, useBatchAnalytics, useTrainerAnalytics } from '@/lib/analytics';
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
      {batchId ? <BatchAnalytics batchId={batchId} /> : <InstitutionAnalytics />}
    </>
  );
}

function BatchAnalytics({ batchId }) {
  const { data, isLoading, isError, error, refetch } = useBatchAnalytics(batchId);
  if (isError && !data) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading && !data) return <SkeletonCards count={4} height="7rem" />;

  const { counts, attendance, moduleProgress, assessments, atRisk, attendanceThreshold } = data;
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
        <CardHeader title="Assessment Performance" subtitle="Submissions, pass rate & average score — this batch" />
        {assessments.length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title="No assessments for this batch yet." />
        ) : (
          <div className="table-wrap">
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

function InstitutionAnalytics() {
  const { data, isLoading, isError, error, refetch } = useAdminAnalytics();

  if (isError && !data) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading && !data) return <SkeletonCards count={5} height="7rem" />;

  // Defensive defaults: the /analytics/admin payload can come back partial, and
  // destructuring without defaults would white-screen the page.
  const counts = data.counts ?? {};
  const lowAttendance = data.lowAttendance ?? { count: 0, threshold: 75, students: [] };
  const batchSizes = data.batchSizes ?? [];
  const moduleCompletion = data.moduleCompletion ?? [];
  return (
    <>
      <div className="stat-grid">
        <Stat label="Students" value={counts.students ?? 0} accent />
        <Stat label="Trainers" value={counts.trainers ?? 0} />
        <Stat label="Active Batches" value={counts.batches ?? 0} />
        <Stat label="Modules" value={counts.modules ?? 0} />
        <Stat label="Certificates Issued" value={counts.certificates ?? 0} />
      </div>

      <div className="dash-grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        <Card>
          <CardHeader title="Module Completion" subtitle="Students who have completed each module" />
          <BarChart data={moduleCompletion.map((m) => ({ label: m.module, value: m.completed }))} />
        </Card>
        <Card>
          <CardHeader title="Batch Sizes" subtitle="Enrolled students per active batch" />
          <BarChart data={batchSizes.map((b) => ({ label: b.batch, value: b.students }))} multicolor />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Low Attendance Alerts"
          subtitle={`${lowAttendance.count ?? 0} student(s) below the ${lowAttendance.threshold ?? 75}% minimum`}
        />
        {(lowAttendance.students ?? []).length === 0 ? (
          <p className="lms-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <CircleCheck size={16} style={{ color: 'var(--color-success)' }} />
            All students are meeting the attendance requirement.
          </p>
        ) : (
          // One vertical bar per batch; height = number of at-risk students there.
          <BarChart
            column
            multicolor
            emptyText="No students at risk."
            data={batchSizes.map((b) => ({
              label: b.batch,
              value: (lowAttendance.students ?? []).filter((s) => s.batch === b.batch).length,
            }))}
          />
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
