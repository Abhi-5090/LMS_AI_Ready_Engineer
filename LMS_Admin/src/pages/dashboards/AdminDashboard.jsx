import { Award, BookOpen, ClipboardCheck, FileText, GraduationCap, MessageCircleQuestion, Star, UserCog, UsersRound } from 'lucide-react';
import { Card, CardHeader, ErrorState, SkeletonCards } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { PageHeader, Stat } from '@/components/PageHeader';
import { CountUp } from '@/lib/anim';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { GaugeRing } from '@/components/charts/GaugeRing';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { useAdminAnalytics } from '@/lib/analytics';

const C = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  muted: 'var(--color-border)',
};

export function AdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useAdminAnalytics();

  const counts = data?.counts ?? {};
  const low = data?.lowAttendance ?? { count: 0, threshold: 75, students: [] };
  const dist = data?.attendanceDistribution ?? { present: 0, late: 0, absent: 0, excused: 0 };
  const batchPerf = data?.batchPerformance ?? [];
  const moduleCompletion = data?.moduleCompletion ?? [];
  const assess = data?.assessments ?? { overall: { submissions: 0, passRate: 0, avgScore: 0 }, byType: {} };
  const funnel = data?.funnel ?? [];
  const certTrend = data?.certificatesTrend ?? [];
  const doubts = data?.doubtStats ?? { total: 0, resolved: 0, resolutionRate: 0, avgRating: 0 };

  const totalCompleted = moduleCompletion.reduce((s, m) => s + (m.completed || 0), 0);
  const totalInProgress = moduleCompletion.reduce((s, m) => s + (m.inProgress || 0), 0);

  // At-risk students grouped per batch → a vertical bar per batch (0 if none).
  const riskByBatch = batchPerf.map((b) => ({
    label: b.batch,
    value: (low.students ?? []).filter((s) => s.batch === b.batch).length,
  }));

  const students = counts.students ?? 0;
  const onTrack = Math.max(0, students - low.count);
  const compliancePct = students > 0 ? Math.round((onTrack / students) * 100) : 100;
  const complianceTone = compliancePct >= 90 ? 'success' : compliancePct >= 70 ? 'warning' : 'error';
  const typeLabel = { practice: 'Practice', preparation: 'Preparation', final: 'Final' };

  return (
    <>
      <PageHeader title="Administrator Dashboard" subtitle="Institution-wide analytics — people, attendance, assessments, and progress." />

      {isError && !data ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <SkeletonCards count={6} height="7rem" />
      ) : (
        <div className="dash-stack">
          {/* KPI tiles */}
          <div className="stat-grid">
            <Stat label="Students" value={<CountUp value={students} />} accent icon={<GraduationCap size={20} />} />
            <Stat label="Trainers" value={<CountUp value={counts.trainers ?? 0} />} icon={<UserCog size={20} />} />
            <Stat label="Active Batches" value={<CountUp value={counts.batches ?? 0} />} icon={<UsersRound size={20} />} />
            <Stat label="Modules" value={<CountUp value={counts.modules ?? 0} />} icon={<BookOpen size={20} />} />
            <Stat label="Assessments" value={<CountUp value={counts.assessments ?? 0} />} icon={<FileText size={20} />} />
            <Stat label="Certificates" value={<CountUp value={counts.certificates ?? 0} />} icon={<Award size={20} />} />
          </div>

          {/* Attendance health */}
          <div className="dash-grid-3">
            <Card>
              <CardHeader title="Attendance Compliance" subtitle={`On track vs below ${low.threshold}% minimum`} />
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0' }}>
                <GaugeRing value={compliancePct} tone={complianceTone} label={`${onTrack} of ${students} students on track`} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Attendance Breakdown" subtitle="Every marked class, platform-wide" />
              <DonutChart
                data={[
                  { label: 'Present', value: dist.present, color: C.success },
                  { label: 'Late', value: dist.late, color: C.warning },
                  { label: 'Absent', value: dist.absent, color: C.error },
                  { label: 'Excused', value: dist.excused, color: C.muted },
                ]}
                centerValue={dist.present + dist.late + dist.absent + dist.excused}
                centerLabel="Records"
                emptyText="No attendance recorded yet."
              />
            </Card>
            <Card>
              <CardHeader title="Module Status" subtitle="Enrolment progress across all modules" />
              <DonutChart
                data={[
                  { label: 'Completed', value: totalCompleted, color: C.primary },
                  { label: 'In progress', value: totalInProgress, color: C.secondary },
                ]}
                centerValue={totalCompleted + totalInProgress}
                centerLabel="Enrolments"
                emptyText="No progress yet."
              />
            </Card>
          </div>

          {/* Assessments + funnel */}
          <div className="dash-grid-2">
            <Card>
              <CardHeader title="Assessment Performance" subtitle={`${assess.overall.submissions} graded submissions`} />
              <div style={{ display: 'flex', justifyContent: 'space-around', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                <GaugeRing value={assess.overall.passRate} tone="success" label="Pass rate" />
                <GaugeRing value={assess.overall.avgScore} tone="primary" label="Average score" />
              </div>
              <StackedBarChart
                rows={['final', 'preparation', 'practice'].map((t) => ({
                  label: typeLabel[t],
                  segments: [{ value: assess.byType?.[t]?.passRate ?? 0 }],
                }))}
                series={[{ key: 'passRate', label: 'Pass rate %', color: C.primary }]}
                emptyText="No assessments graded yet."
              />
            </Card>
            <Card>
              <CardHeader title="Learning Funnel" subtitle="From enrolment to certification" />
              <BarChart data={funnel} emptyText="No progression data yet." />
            </Card>
          </div>

          {/* Progress by module — split into two columns so all modules fit on one screen. */}
          <Card>
            <CardHeader title="Progress by Module" subtitle="Completed and in-progress students per module" />
            {(() => {
              const mkRows = (list) => list.map((m) => ({ label: m.code || m.module, segments: [{ value: m.completed || 0 }, { value: m.inProgress || 0 }] }));
              const series = [
                { key: 'completed', label: 'Completed', color: C.primary },
                { key: 'inProgress', label: 'In progress', color: C.secondary },
              ];
              const half = Math.ceil(moduleCompletion.length / 2);
              return (
                <div className="dash-grid-2">
                  <StackedBarChart rows={mkRows(moduleCompletion.slice(0, half))} series={series} emptyText="No module progress recorded yet." />
                  <StackedBarChart rows={mkRows(moduleCompletion.slice(half))} series={series} emptyText="" />
                </div>
              );
            })()}
          </Card>

          {/* Batch enrolment + attendance */}
          <div className="dash-grid-2">
            <Card>
              <CardHeader title="Enrolment by Batch" subtitle="Students per active batch" />
              <BarChart data={batchPerf.map((b) => ({ label: b.batch, value: b.students }))} emptyText="No active batches yet." />
            </Card>
            <Card>
              <CardHeader title="Attendance by Batch" subtitle="Average attendance % per batch" />
              <BarChart data={batchPerf.map((b) => ({ label: b.batch, value: b.avgAttendance }))} suffix="%" max={100} emptyText="No attendance recorded yet." />
            </Card>
          </div>

          {/* Certificates trend + at-risk */}
          <div className="dash-grid-2">
            <Card>
              <CardHeader title="Certificates Issued" subtitle="Last 8 weeks" />
              <TrendChart data={certTrend} color={C.success} emptyText="No certificates issued recently." />
            </Card>
            <Card>
              <CardHeader title="Students at Risk" subtitle={`Below ${low.threshold}% attendance · ${low.count} student(s) at risk`} />
              {low.count === 0 ? (
                <p className="lms-muted">No students are below the attendance threshold. 🎉</p>
              ) : (
                // One vertical bar per batch; height = number of at-risk students there.
                <BarChart data={riskByBatch} column emptyText="No students at risk." />
              )}
            </Card>
          </div>

          {/* Doubt support */}
          <Card>
            <CardHeader title="Doubt Support Health" subtitle="How the trainer team is resolving student doubts" />
            <div className="stat-grid" style={{ marginTop: 'var(--space-2)' }}>
              <Stat label="Total Doubts" value={<CountUp value={doubts.total} />} icon={<MessageCircleQuestion size={20} />} />
              <Stat label="Resolved" value={<CountUp value={doubts.resolved} />} icon={<ClipboardCheck size={20} />} />
              <Stat label="Resolution Rate" value={`${doubts.resolutionRate}%`} accent icon={<ClipboardCheck size={20} />} />
              <Stat label="Avg Rating" value={doubts.avgRating ? `${doubts.avgRating} ★` : '—'} icon={<Star size={20} />} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
