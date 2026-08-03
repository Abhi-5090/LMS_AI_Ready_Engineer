import { useMemo, useState } from 'react';
import { BookOpen, CalendarX, ChevronLeft, ChevronRight, TriangleAlert, Users } from 'lucide-react';
import { UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, Input, Select, Skeleton, SkeletonTable, EmptyState, ErrorState } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBatchAttendance, useMyAttendance } from '@/lib/attendance';
import { useBatches } from '@/lib/batches';
import { useClasses } from '@/lib/classes';
import { formatDate, toDateInput } from '@/lib/format';
import { RosterEditor } from './RosterEditor';
import { ATT_LABEL, ATT_TONE, pctTone, summarize } from './attendanceUi';
import '../schedule/schedule.css';

export function AttendancePage() {
  const role = useAuth((s) => s.user?.role);
  if (role === UserRole.STUDENT) return <StudentAttendanceView />;
  return <StaffAttendanceView />;
}

// ── Student: my attendance ─────────────────────────────────────────────────────

function StudentAttendanceView() {
  const { data, isLoading, isError, error, refetch } = useMyAttendance();
  const [moduleId, setModuleId] = useState('');

  const records = data?.records ?? [];

  // Modules the student actually has attendance for → the filter options.
  const modules = [];
  const seen = new Set();
  for (const r of records) {
    const m = r.module;
    if (m?.id && !seen.has(m.id)) { seen.add(m.id); modules.push(m); }
  }
  modules.sort((a, b) => a.name.localeCompare(b.name));

  // Filter + recompute the cards for the selected module ('' = overall).
  const shown = moduleId ? records.filter((r) => r.module?.id === moduleId) : records;
  const summary = summarize(shown);
  const scope = moduleId ? (modules.find((m) => m.id === moduleId)?.name ?? 'Module') : 'all modules';

  return (
    <>
      <div className="att-overall-head">
        <PageHeader title="Overall Attendance" subtitle={`Your class attendance across ${scope}.`} />
        <div className="att-overall-filter">
          <Select
            label="Module"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            options={[
              { value: '', label: 'All modules' },
              ...modules.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <>
          <div className="stat-grid">
            <Skeleton height="5.5rem" radius="var(--radius-lg)" />
            <Skeleton height="5.5rem" radius="var(--radius-lg)" />
            <Skeleton height="5.5rem" radius="var(--radius-lg)" />
            <Skeleton height="5.5rem" radius="var(--radius-lg)" />
          </div>
          <Card>
            <CardHeader title="History" subtitle="All classes" />
            <SkeletonTable rows={5} cols={5} />
          </Card>
        </>
      ) : (
        <>
      <div className="stat-grid">
        <Stat label="Attendance" value={`${summary.percentage}%`} accent />
        <Stat label="Classes Attended" value={`${summary.attended} / ${summary.totalClasses}`} />
        <Stat label="Late" value={summary.byStatus.late} />
        <Stat label="Absent" value={summary.byStatus.absent} />
      </div>

      <Card>
        <CardHeader title="History" subtitle={moduleId ? scope : 'All classes'} />
        {shown.length === 0 ? (
          <EmptyState
            icon={<CalendarX size={26} />}
            title="No attendance yet"
            description={moduleId ? 'No attendance recorded for this module yet.' : 'No attendance recorded yet.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Class</th><th>Module</th><th>Status</th><th>Remarks</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.classSession?.date ?? r.markedAt)}</td>
                    <td>{r.classSession?.title ?? '—'}</td>
                    <td>{r.module?.name ?? '—'}</td>
                    <td><Badge tone={ATT_TONE[r.status]}>{ATT_LABEL[r.status]}</Badge></td>
                    <td className="lms-muted">{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}
    </>
  );
}

// ── Trainer / Admin: entry + compliance ────────────────────────────────────────

function StaffAttendanceView() {
  const [tab, setTab] = useState('entry');
  return (
    <>
      <PageHeader title="Attendance" subtitle="Record attendance after each class and monitor compliance." />
      <div className="toolbar">
        <div className="sched-tabs">
          <button className={`sched-tab${tab === 'entry' ? ' active' : ''}`} onClick={() => setTab('entry')}>
            Mark Attendance
          </button>
          <button className={`sched-tab${tab === 'compliance' ? ' active' : ''}`} onClick={() => setTab('compliance')}>
            Compliance
          </button>
        </div>
      </div>
      {tab === 'entry' ? <EntryView /> : <ComplianceView />}
    </>
  );
}

function EntryView() {
  const { data: classes, isLoading } = useClasses();
  const [moduleKey, setModuleKey] = useState(null); // which module's sessions are open
  const [selected, setSelected] = useState(null);   // which class's roster is open
  const [q, setQ] = useState('');                    // search by class name
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  function backToModules() {
    setModuleKey(null);
    setSelected(null);
    setQ(''); setBatchFilter(''); setStatusFilter(''); setDateFilter('');
  }

  // Group the sessions by module → one card per module (LLMs, Prompting, …).
  const modules = useMemo(() => {
    const map = new Map();
    for (const c of classes ?? []) {
      const key = c.module?.id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { key, name: c.module?.name ?? 'Unassigned', code: c.module?.code ?? '', classes: [] });
      }
      map.get(key).classes.push(c);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const active = moduleKey != null ? modules.find((m) => m.key === moduleKey) : null;

  if (isLoading && !classes) return <Card><SkeletonTable rows={5} cols={5} /></Card>;
  if (!classes || classes.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CalendarX size={26} />} title="No classes scheduled" description="No classes scheduled yet." />
      </Card>
    );
  }

  // ── Step 1: pick a module (cards) ──
  if (!active) {
    return (
      <div className="mod-att-grid">
        {modules.map((m) => {
          const total = m.classes.length;
          const pending = m.classes.filter((c) => !c.attendanceMarked).length;
          return (
            <button key={m.key} type="button" className="mod-att-card" onClick={() => setModuleKey(m.key)}>
              <span className="mod-att-card__icon"><BookOpen size={20} /></span>
              <span className="mod-att-card__body">
                <span className="mod-att-card__name">{m.name}</span>
                {m.code && <span className="mod-att-card__code">{m.code}</span>}
                <span className="mod-att-card__meta">
                  <Badge tone="neutral">{total} session{total === 1 ? '' : 's'}</Badge>
                  {pending > 0 ? <Badge tone="warning">{pending} pending</Badge> : <Badge tone="success">All marked</Badge>}
                </span>
              </span>
              <ChevronRight size={18} className="mod-att-card__chev" />
            </button>
          );
        })}
      </div>
    );
  }

  // ── Step 2: sessions for the chosen module ──
  const total = active.classes.length;
  const pending = active.classes.filter((c) => !c.attendanceMarked).length;

  // Batches present in this module's sessions → the batch filter's options.
  const batchesInModule = [
    ...new Map(active.classes.filter((c) => c.batch?.id).map((c) => [c.batch.id, c.batch])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const needle = q.trim().toLowerCase();
  const shown = active.classes
    .filter((c) => {
      if (batchFilter && c.batch?.id !== batchFilter) return false;
      if (statusFilter === 'marked' && !c.attendanceMarked) return false;
      if (statusFilter === 'pending' && c.attendanceMarked) return false;
      if (dateFilter && toDateInput(c.date) !== dateFilter) return false;
      if (needle && !`${c.title} ${c.batch?.name ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    })
    // Most recent on top: date desc, then start time desc.
    .sort((a, b) => `${toDateInput(b.date)} ${b.startTime ?? ''}`.localeCompare(`${toDateInput(a.date)} ${a.startTime ?? ''}`));

  return (
    <>
      <div className="mod-att-head">
        <Button variant="outline" size="sm" onClick={backToModules}>
          <ChevronLeft size={15} style={{ marginRight: 4 }} /> All modules
        </Button>
        <div className="mod-att-head__title">
          <strong>{active.name}</strong>
          {active.code && <span className="lms-muted"> · {active.code}</span>}
          <span className="lms-muted"> · {total} session{total === 1 ? '' : 's'}{pending > 0 ? ` · ${pending} pending` : ''}</span>
        </div>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div className="att-sessions-head">
          <CardHeader title="Select a class" subtitle="Newest first — choose a session to record attendance for." />
          <div className="att-filters">
            <Select
              label="Batch"
              className="att-filters__ctl"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              options={[{ value: '', label: 'All batches' }, ...batchesInModule.map((b) => ({ value: b.id, label: b.name }))]}
            />
            <Select
              label="Status"
              className="att-filters__ctl"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'marked', label: 'Marked' }]}
            />
            <Input label="Date" type="date" className="att-filters__ctl" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <Input
              label="Search"
              className="att-filters__search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by class name…"
            />
          </div>
        </div>

        <div className="att-sessions-scroll table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Class</th><th>Batch</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={5} className="lms-muted" style={{ textAlign: 'center' }}>No classes match your filters.</td></tr>
              ) : shown.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td>{c.title}</td>
                  <td>{c.batch?.name}</td>
                  <td>
                    {c.attendanceMarked ? <Badge tone="success">Marked</Badge> : <Badge tone="neutral">Pending</Badge>}
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant={selected === c.id ? 'primary' : 'outline'}
                      onClick={() => setSelected(c.id)}
                    >
                      {c.attendanceMarked ? 'Edit' : 'Mark'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <RosterEditor classId={selected} />}
    </>
  );
}

function ComplianceView() {
  const { data: batches } = useBatches();
  const [batchId, setBatchId] = useState('');
  const { data, isLoading } = useBatchAttendance(batchId);

  return (
    <>
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <Select
          label="Batch"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          options={[
            { value: '', label: 'Select a batch…' },
            ...(batches ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
          ]}
        />
      </Card>

      {batchId && isLoading && !data && (
        <Card>
          <SkeletonTable rows={5} cols={7} />
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader
            title={`${data.batch.name} — Attendance Compliance`}
            subtitle={`Minimum required: ${data.minAttendance}% · ${
              data.students.filter((s) => s.belowMinimum).length
            } below minimum`}
          />
          {data.students.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title="No students enrolled"
              description="No students enrolled."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th><th>Attended</th><th>Present</th><th>Late</th>
                    <th>Absent</th><th>Excused</th><th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.student.id}>
                      <td>
                        {s.student.name}
                        <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{s.student.email}</div>
                      </td>
                      <td>{s.attended} / {s.totalClasses}</td>
                      <td>{s.byStatus.present}</td>
                      <td>{s.byStatus.late}</td>
                      <td>{s.byStatus.absent}</td>
                      <td>{s.byStatus.excused}</td>
                      <td>
                        <Badge tone={pctTone(s.percentage, data.minAttendance)}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {s.percentage}%{s.belowMinimum ? <TriangleAlert size={12} strokeWidth={2.5} /> : null}
                          </span>
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
