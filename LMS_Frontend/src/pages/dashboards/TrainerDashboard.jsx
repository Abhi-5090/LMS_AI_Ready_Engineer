import { BookOpen, CalendarCheck, CalendarClock, GraduationCap, MessageCircleQuestion, Star, TriangleAlert, UsersRound } from 'lucide-react';
import { Badge, Card, CardHeader, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { CountUp } from '@/lib/anim';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { GaugeRing } from '@/components/charts/GaugeRing';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { useAuth } from '@/lib/auth';
import { useTrainerAnalytics } from '@/lib/analytics';
import { useTrainerStats } from '@/lib/profile';

export function TrainerDashboard() {
  const user = useAuth((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useTrainerAnalytics();
  const { data: scoreboard } = useTrainerStats();

  const counts = data?.counts ?? {};
  const batches = data?.batches ?? [];
  const assessments = data?.assessments ?? [];

  // Derived analytics.
  const avgAttendance = batches.length
    ? Math.round(batches.reduce((s, b) => s + (b.avgAttendance || 0), 0) / batches.length)
    : 0;
  const attendanceTone = avgAttendance >= 90 ? 'success' : avgAttendance >= 75 ? 'warning' : 'error';

  const graded = assessments.filter((a) => a.submissions > 0);
  const totalSubs = graded.reduce((s, a) => s + a.submissions, 0);
  const totalPassed = graded.reduce((s, a) => s + Math.round((a.submissions * a.passRate) / 100), 0);
  const totalFailed = Math.max(0, totalSubs - totalPassed);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? 'Trainer'}`}
        subtitle="Performance across your assigned modules, batches, and assessments."
      />

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <div className="dash-stack">
          <SkeletonCards count={4} height="5.5rem" />
          <SkeletonCards count={4} height="5.5rem" />
          <SkeletonCards count={3} height="14rem" />
        </div>
      ) : (
      <div className="dash-stack">
      {/* KPIs */}
      <div className="stat-grid">
        <Stat label="Assigned Modules" value={<CountUp value={counts.modules ?? 0} />} accent icon={<BookOpen size={20} />} />
        <Stat label="Assigned Batches" value={<CountUp value={counts.batches ?? 0} />} icon={<UsersRound size={20} />} />
        <Stat label="Students" value={<CountUp value={counts.students ?? 0} />} icon={<GraduationCap size={20} />} />
        <Stat label="Upcoming Classes" value={<CountUp value={counts.upcomingClasses ?? 0} />} icon={<CalendarClock size={20} />} />
      </div>

      {/* Teaching scoreboard — classes conducted + ratings received */}
      <div className="stat-grid">
        <Stat label="Classes Conducted" value={<CountUp value={scoreboard?.classesConducted ?? 0} />} icon={<CalendarCheck size={20} />} />
        <Stat label="Doubts Cleared" value={<CountUp value={scoreboard?.doubtsResolved ?? 0} />} icon={<MessageCircleQuestion size={20} />} />
        <Stat label="Avg Doubt Rating" value={scoreboard?.doubtsAvgRating ? `${scoreboard.doubtsAvgRating} ★` : '—'} icon={<Star size={20} />} />
        <Stat label="Avg Class Rating" value={scoreboard?.classAvgRating ? `${scoreboard.classAvgRating} ★` : '—'} accent icon={<Star size={20} />} />
      </div>

      {/* Rings row */}
      <div className="dash-grid-3">
        <Card>
          <CardHeader title="Students by Batch" subtitle="Enrolment across your batches" />
          <DonutChart
            data={batches.map((b) => ({ label: b.batch, value: b.students }))}
            centerValue={counts.students ?? 0}
            centerLabel="Students"
            emptyText="No batches assigned yet."
          />
        </Card>

        <Card>
          <CardHeader title="Average Attendance" subtitle="Across all your batches" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0' }}>
            <GaugeRing value={avgAttendance} tone={attendanceTone} label={`${batches.length} batch${batches.length === 1 ? '' : 'es'}`} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Assessment Outcomes" subtitle="Graded submissions across your modules" />
          <DonutChart
            data={[
              { label: 'Passed', value: totalPassed },
              { label: 'Not passed', value: totalFailed },
            ]}
            centerValue={totalSubs}
            centerLabel="Graded"
            emptyText="No graded submissions yet."
          />
        </Card>
      </div>

      {/* Attendance by batch */}
      <Card>
        <CardHeader title="Attendance by Batch" subtitle="Average attendance percentage per batch" />
        <BarChart
          data={batches.map((b) => ({ label: b.batch, value: b.avgAttendance }))}
          max={100}
          suffix="%"
          multicolor
          emptyText="No attendance recorded yet."
        />
      </Card>

      {/* Assessment performance */}
      <Card>
        <CardHeader title="Assessment Performance" subtitle="Submissions split by passed vs not passed" />
        {graded.length === 0 ? (
          <p className="lms-muted">No graded assessments in your modules yet.</p>
        ) : (
          <>
            <StackedBarChart
              rows={graded.map((a) => {
                const passed = Math.round((a.submissions * a.passRate) / 100);
                return { label: a.title, segments: [{ value: passed }, { value: Math.max(0, a.submissions - passed) }] };
              })}
              series={[
                { key: 'passed', label: 'Passed', color: 'var(--color-primary)' },
                { key: 'failed', label: 'Not passed', color: 'var(--color-error)' },
              ]}
            />
            <div className="table-wrap" style={{ marginTop: 'var(--space-5)' }}>
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
          </>
        )}
      </Card>

      {/* Student leaderboard */}
      {(data?.leaderboard ?? []).length > 0 && (
        <Card>
          <CardHeader title="Top Students" subtitle="Highest average score across your assessments" />
          <BarChart
            data={data.leaderboard.map((s) => ({ label: s.student, value: s.avgScore }))}
            suffix="%"
            max={100}
            emptyText="No graded submissions yet."
          />
        </Card>
      )}

      {/* Low-attendance nudge */}
      {avgAttendance > 0 && avgAttendance < 75 && (
        <Card style={{ borderColor: 'var(--color-warning)' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
            <TriangleAlert size={16} style={{ color: 'var(--color-warning)' }} />
            Average attendance is below the 75% minimum — follow up with your batches.
          </p>
        </Card>
      )}
      </div>
      )}
    </>
  );
}
