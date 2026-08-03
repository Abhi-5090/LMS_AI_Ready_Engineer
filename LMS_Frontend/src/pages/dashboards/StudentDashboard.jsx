import { useState } from 'react';
import { Award, CalendarCheck, CalendarX, Compass, GraduationCap, Percent, Target } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { GaugeRing } from '@/components/charts/GaugeRing';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyAttendance } from '@/lib/attendance';
import { useStudentAnalytics } from '@/lib/analytics';
import { useClasses, useJoinClass } from '@/lib/classes';
import { useClassRatingsPending, ratingEligible } from '@/lib/classRatings';
import { classHasEnded, todayISO } from '@/pages/schedule/scheduleUi';
import { ClassRatingModal } from '@/pages/schedule/ClassRatingModal';
import { AttendanceHeatmap } from './AttendanceHeatmap';
import '@/pages/schedule/schedule.css';

const C = { success: 'var(--color-success)', primary: 'var(--color-primary)', warning: 'var(--color-warning)', error: 'var(--color-error)', muted: 'var(--color-border)' };
const STATUS = { completed: { label: 'Completed', tone: 'success' }, in_progress: { label: 'In progress', tone: 'primary' }, locked: { label: 'Locked', tone: 'neutral' } };

export function StudentDashboard() {
  const user = useAuth((s) => s.user);
  const { data: attendance, isLoading: attLoading, isError: attError, error: attErr, refetch: refetchAtt } = useMyAttendance();
  const { data: a } = useStudentAnalytics();
  const { data: upcoming } = useClasses({ from: todayISO() });
  const joinClass = useJoinClass();
  const { data: pendingRatings } = useClassRatingsPending(true);
  const eligiblePending = (pendingRatings ?? []).filter(ratingEligible);
  const mustRate = eligiblePending.length > 0;
  const [rateTarget, setRateTarget] = useState(null);

  function handleJoin(c) {
    if (mustRate) { setRateTarget(eligiblePending[0]); return; }
    joinClass.mutate(c.id);
    window.open(c.meetingLink, '_blank', 'noopener,noreferrer');
  }

  const att = a?.attendance ?? { percentage: attendance?.summary?.percentage ?? 0, present: 0, late: 0, absent: 0, excused: 0 };
  const sc = a?.statusCounts ?? { completed: 0, in_progress: 0, locked: 0 };
  const prog = a?.progress ?? { completedCount: 0, total: 0 };
  const scoreSummary = a?.scoreSummary ?? { gradedCount: 0, avgScore: 0, passRate: 0 };
  const scores = a?.scores ?? [];
  const modStatus = a?.moduleStatus ?? [];
  const completionPct = prog.total ? Math.round((prog.completedCount / prog.total) * 100) : 0;
  const currentModule = modStatus.find((m) => m.status === 'in_progress')?.module ?? '—';
  const next = (upcoming ?? []).slice(0, 5);

  return (
    <>
      <PageHeader title={`Welcome, ${user?.name?.split(' ')[0] ?? 'Student'}`} subtitle="Your AI engineering journey — progress, attendance, and results at a glance." />

      {attError ? (
        <ErrorState message={apiErrorMessage(attErr)} onRetry={refetchAtt} />
      ) : attLoading && !attendance ? (
        <div className="dash-stack"><SkeletonCards count={4} height="5.5rem" /><SkeletonCards count={2} height="12rem" /></div>
      ) : (
        <>
          {mustRate && (
            <Card className="rate-gate">
              <div>
                <strong>Rate your previous class to continue.</strong>
                <div className="lms-muted">You have {eligiblePending.length} class{eligiblePending.length > 1 ? 'es' : ''} awaiting your rating. You can&apos;t join a new class until you do.</div>
              </div>
              <Button size="sm" onClick={() => setRateTarget(eligiblePending[0])}>Rate now</Button>
            </Card>
          )}

          <div className="dash-stack">
            <div className="stat-grid">
              <Stat label="Attendance" value={`${att.percentage}%`} accent icon={<Percent size={20} />} />
              <Stat label="Modules Completed" value={`${prog.completedCount} / ${prog.total}`} icon={<GraduationCap size={20} />} />
              <Stat label="Average Score" value={scoreSummary.gradedCount ? `${scoreSummary.avgScore}%` : '—'} icon={<Target size={20} />} />
              <Stat label="Certificates" value={a?.certificates ?? 0} icon={<Award size={20} />} />
              <Stat label="Current Module" value={currentModule} icon={<Compass size={20} />} />
            </div>

            {/* Progress + status + attendance rings */}
            <div className="dash-grid-3">
              <Card>
                <CardHeader title="Curriculum Progress" subtitle="Your progress through the curriculum" />
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0' }}>
                  <GaugeRing value={completionPct} tone="primary" label={`${prog.completedCount} of ${prog.total} modules`} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Module Status" subtitle="Where you are in the path" />
                <DonutChart
                  data={[
                    { label: 'Completed', value: sc.completed, color: C.success },
                    { label: 'In progress', value: sc.in_progress, color: C.primary },
                    { label: 'Locked', value: sc.locked, color: C.muted },
                  ]}
                  centerValue={prog.total}
                  centerLabel="Modules"
                  emptyText="No modules yet."
                />
              </Card>
              <Card>
                <CardHeader title="Attendance Breakdown" subtitle="Across all your classes" />
                <DonutChart
                  data={[
                    { label: 'Present', value: att.present, color: C.success },
                    { label: 'Late', value: att.late, color: C.warning },
                    { label: 'Absent', value: att.absent, color: C.error },
                    { label: 'Excused', value: att.excused, color: C.muted },
                  ]}
                  centerValue={`${att.percentage}%`}
                  centerLabel="Attended"
                  emptyText="No attendance yet."
                />
              </Card>
            </div>

            <AttendanceHeatmap records={attendance?.records} />

            {/* Score history */}
            {scores.length > 0 && (
              <Card>
                <CardHeader title="Assessment Scores" subtitle={`${scoreSummary.gradedCount} graded · ${scoreSummary.passRate}% passed`} />
                <BarChart data={scores.map((s) => ({ label: s.title, value: s.score }))} suffix="%" max={100} emptyText="No graded assessments yet." />
              </Card>
            )}

            {/* Upcoming + module list */}
            <div className="dash-grid-2">
              <Card>
                <CardHeader title="Upcoming Classes" subtitle="Your scheduled live sessions" />
                {next.length === 0 ? (
                  <EmptyState icon={<CalendarX size={26} />} title="No upcoming classes" description="No upcoming classes scheduled." />
                ) : (
                  next.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ flex: 1 }}>
                        {c.title}
                        <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                          {new Date(c.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {c.startTime}–{c.endTime}
                        </div>
                      </span>
                      {c.meetingLink && !classHasEnded(c) ? (
                        <button type="button" onClick={() => handleJoin(c)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                          <Badge tone="primary">{mustRate ? 'Rate to join' : 'Join'}</Badge>
                        </button>
                      ) : classHasEnded(c) ? <Badge tone="neutral">Ended</Badge> : null}
                    </div>
                  ))
                )}
              </Card>
              <Card>
                <CardHeader title="Your Modules" subtitle="Status of each module in your path" />
                {modStatus.length === 0 ? (
                  <p className="lms-muted">No modules assigned yet.</p>
                ) : (
                  modStatus.slice(0, 8).map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ flex: 1 }}>{m.module}</span>
                      {m.finalScore != null && <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{m.finalScore}%</span>}
                      <Badge tone={STATUS[m.status]?.tone ?? 'neutral'}>{STATUS[m.status]?.label ?? m.status}</Badge>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <ClassRatingModal pending={rateTarget} onClose={() => setRateTarget(null)} onRated={() => setRateTarget(null)} />
    </>
  );
}
