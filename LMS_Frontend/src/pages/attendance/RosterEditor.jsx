import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Download, FileSpreadsheet, UserCheck, UserCog, Users, UserX } from 'lucide-react';
import { AttendanceStatus } from '@/shared';
import { Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, SkeletonTable } from '@/components/ui';
import { Stat } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useClassRoster, useSaveAttendance } from '@/lib/attendance';
import { parseTeamsAttendance, classStartMs, classifyJoin } from '@/lib/teamsAttendance';
import { downloadAttendanceTemplate } from '@/lib/attendanceTemplate';
import { ATT_OPTIONS } from './attendanceUi';
import { formatDate } from '@/lib/format';
import './attendance.css';

/** Absolute ms → local clock time, e.g. "4:34 PM". */
function fmtClock(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Seconds → "6m 31s" / "45s" / "1h 5m"; em dash when unknown. */
function fmtWatch(s) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m ${sec}s` : `${sec}s`;
}

/** Per-session attendance entry: one row per enrolled student. */
export function RosterEditor({ classId, onSaved }) {
  const { data, isLoading, isError, error, refetch } = useClassRoster(classId);
  const save = useSaveAttendance();
  const [rows, setRows] = useState([]);
  const [buffer, setBuffer] = useState(10);
  const [teamsData, setTeamsData] = useState(null); // Map<email, joinMs> from the import
  const [teamsWatch, setTeamsWatch] = useState(null); // Map<email, watchSeconds>
  const [importInfo, setImportInfo] = useState(null);
  const [organizer, setOrganizer] = useState(null); // trainer who ran the session
  const [importError, setImportError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState(''); // roster search
  const [showUnmatched, setShowUnmatched] = useState(false); // "emails that didn't match" modal
  const fileRef = useRef(null);

  useEffect(() => {
    if (!data) return;
    // Default unmarked students to Present so a trainer can save fast.
    setRows(
      data.roster.map((r) => ({
        student: r.student.id,
        name: r.student.name,
        email: r.student.email,
        status: r.status ?? AttendanceStatus.PRESENT,
        remarks: r.remarks ?? '',
        watchSeconds: r.watchSeconds ?? null,
      })),
    );
    setBuffer(data.class.bufferMinutes ?? 10);
    setTeamsData(null);
    setTeamsWatch(null);
    setImportInfo(null);
    setOrganizer(null);
    setImportError('');
    setSaved(false);
    setQ('');
  }, [data]);

  function setRow(id, patch) {
    setRows((rs) => rs.map((r) => (r.student === id ? { ...r, ...patch } : r)));
  }
  function setAll(status) {
    setRows((rs) => rs.map((r) => ({ ...r, status })));
  }

  /**
   * Compute each student's status from the imported Teams join times against the
   * class start + buffer: on time → Present, after the buffer → Late, not in the
   * sheet → Absent. Runs on import and whenever the buffer changes.
   */
  function applyTeams(byEmail, bufferVal, currentRows, watchMap) {
    const startMs = classStartMs(data.class.date, data.class.startTime);
    const counts = { present: 0, late: 0, absent: 0, matched: 0 };
    const next = currentRows.map((r) => {
      const key = r.email?.toLowerCase();
      const join = key ? byEmail.get(key) : undefined;
      const status = classifyJoin(join ?? null, startMs, bufferVal);
      if (status === AttendanceStatus.ABSENT) counts.absent += 1;
      else { counts.matched += 1; if (status === AttendanceStatus.PRESENT) counts.present += 1; else counts.late += 1; }
      // Only overwrite watch time when a fresh import provides it.
      const watchSeconds = watchMap ? (key ? (watchMap.get(key) ?? null) : null) : r.watchSeconds;
      return { ...r, status, watchSeconds };
    });
    setRows(next);
    const rosterEmails = new Set(currentRows.map((r) => r.email?.toLowerCase()).filter(Boolean));
    const unmatchedList = [...byEmail.keys()].filter((e) => !rosterEmails.has(e)).sort();
    counts.unmatched = unmatchedList.length;
    counts.unmatchedList = unmatchedList;
    setImportInfo(counts);
  }

  async function onTeamsFile(e) {
    setImportError('');
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      const classDayIso = new Date(data.class.date).toISOString().slice(0, 10);
      const { byEmail, byEmailWatch, organizer: org } = parseTeamsAttendance(await file.arrayBuffer(), classDayIso);
      setTeamsData(byEmail);
      setTeamsWatch(byEmailWatch);
      setOrganizer(org ?? null);
      applyTeams(byEmail, buffer, rows, byEmailWatch);
    } catch (err) {
      setTeamsData(null);
      setTeamsWatch(null);
      setOrganizer(null);
      setImportInfo(null);
      setImportError(err.message || 'Could not read that file.');
    }
  }

  function onBufferChange(v) {
    const next = Math.max(0, Math.min(240, Number(v) || 0));
    setBuffer(next);
    if (teamsData) applyTeams(teamsData, next, rows, teamsWatch); // re-grade against the new grace window
  }

  async function submit() {
    setSaveError('');
    try {
      await save.mutateAsync({
        classId,
        bufferMinutes: buffer,
        records: rows.map((r) => ({ student: r.student, status: r.status, remarks: r.remarks || undefined, watchSeconds: r.watchSeconds ?? null })),
      });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setSaveError(apiErrorMessage(e));
    }
  }

  if (isLoading && !data) return <Card><SkeletonTable rows={5} cols={3} /></Card>;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  // Live tallies for the analytics row (reflect the current statuses as you edit).
  const total = rows.length;
  const present = rows.filter((r) => r.status === AttendanceStatus.PRESENT).length;
  const absent = rows.filter((r) => r.status === AttendanceStatus.ABSENT).length;
  const late = rows.filter((r) => r.status === AttendanceStatus.LATE).length;

  return (
    <>
      {total > 0 && (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
          <Stat label="Total Students" value={total} accent icon={<Users size={20} />} />
          <Stat label="Present" value={present} icon={<UserCheck size={20} />} />
          <Stat label="Absent" value={absent} icon={<UserX size={20} />} />
          <Stat label="Late" value={late} icon={<Clock size={20} />} />
        </div>
      )}
      <Card>
      <CardHeader
        title={`Attendance — ${data.class.title}`}
        subtitle={`${formatDate(data.class.date)} · starts ${data.class.startTime} · ${rows.length} students${data.class.attendanceMarked ? ' · already marked' : ''}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="No students enrolled in this batch yet"
        />
      ) : (
        <>
          {/* Teams import: compute attendance from the meeting's participant sheet. */}
          <div className="teams-import">
            <div className="teams-import__row">
              <div className="teams-import__buffer">
                <label className="field__label" htmlFor="att-buffer">Grace period (minutes)</label>
                <Input
                  id="att-buffer"
                  type="number"
                  min="0"
                  max="240"
                  value={buffer}
                  onChange={(e) => onBufferChange(e.target.value)}
                  style={{ maxWidth: '7rem' }}
                />
              </div>
              <div className="teams-import__action">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onTeamsFile} style={{ display: 'none' }} />
                <Button variant="outline" onClick={() => downloadAttendanceTemplate(data.class, rows)}>
                  <Download size={15} style={{ marginRight: 6 }} /> Download template
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet size={15} style={{ marginRight: 6 }} /> Import attendance
                </Button>
              </div>
            </div>
            <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
              Upload an attendance sheet (email + first join time) — or <strong>Download template</strong> to
              get a sheet pre-filled with this batch&apos;s students, fill in each attendee&apos;s <strong>First Join</strong> time
              (e.g. 9:32&nbsp;AM), and re-upload it here. Students who joined within the grace period count as
              <strong> Present</strong>, later joins as <strong>Late</strong>, and anyone left blank as <strong>Absent</strong>.
              You can adjust below before saving.
            </p>
            {importError && <span className="field__error">{importError}</span>}
            {importInfo && (
              <div className="teams-import__summary">
                <Check size={15} strokeWidth={3} style={{ color: 'var(--color-success)' }} />
                <span>
                  {importInfo.present} present · {importInfo.late} late · {importInfo.absent} absent
                  {importInfo.unmatched > 0 && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => setShowUnmatched(true)}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        {importInfo.unmatched} sheet email{importInfo.unmatched === 1 ? '' : 's'} didn’t match an enrolled student
                      </button>
                    </>
                  )}
                </span>
              </div>
            )}
            {organizer && (
              <div className="teams-organizer">
                <span className="teams-organizer__icon"><UserCog size={16} /></span>
                <span>
                  Session led by <strong>{organizer.name}</strong> · started <strong>{fmtClock(organizer.joinMs)}</strong>
                  {organizer.watchSeconds != null && <> · in the meeting for <strong>{fmtWatch(organizer.watchSeconds)}</strong></>}
                </span>
              </div>
            )}
          </div>

          <div className="roster-tools">
            <span className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)', alignSelf: 'center' }}>
              Quick set:
            </span>
            {ATT_OPTIONS.map((o) => (
              <Button key={o.value} size="sm" variant="outline" onClick={() => setAll(o.value)}>
                All {o.label}
              </Button>
            ))}
            <Input
              className="roster-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students by name or email…"
            />
          </div>

          {(() => {
            const needle = q.trim().toLowerCase();
            const shown = needle
              ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
              : rows;
            return (
              <div className="roster-scroll table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th style={{ width: 160 }}>Status</th>
                      <th style={{ width: 110 }}>Watch time</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr><td colSpan={4} className="lms-muted" style={{ textAlign: 'center' }}>No students match “{q}”.</td></tr>
                    ) : shown.map((r) => (
                      <tr key={r.student}>
                        <td>
                          {r.name}
                          <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{r.email}</div>
                        </td>
                        <td>
                          <Select value={r.status} onChange={(e) => setRow(r.student, { status: e.target.value })} options={ATT_OPTIONS} />
                        </td>
                        <td className="lms-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWatch(r.watchSeconds)}</td>
                        <td>
                          <Input
                            placeholder="Optional…"
                            value={r.remarks}
                            onChange={(e) => setRow(r.student, { remarks: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Button onClick={submit} loading={save.isPending}>
              Save attendance
            </Button>
            {saved && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={15} strokeWidth={3} /> Saved</span>}
            {saveError && <span className="field__error">{saveError}</span>}
          </div>

          <Modal
            open={showUnmatched}
            title="Emails that didn’t match a student"
            onClose={() => setShowUnmatched(false)}
            footer={<Button variant="outline" onClick={() => setShowUnmatched(false)}>Close</Button>}
          >
            <p className="lms-muted" style={{ marginTop: 0, fontSize: 'var(--font-size-sm)' }}>
              These {importInfo?.unmatchedList?.length ?? 0} email{(importInfo?.unmatchedList?.length ?? 0) === 1 ? '' : 's'} from the uploaded sheet aren’t enrolled in this batch, so their rows were skipped. Check for typos, or add them to the batch and re-import.
            </p>
            <div className="roster-scroll table-wrap">
              <table className="table">
                <thead><tr><th style={{ width: 48 }}>#</th><th>Email</th></tr></thead>
                <tbody>
                  {(importInfo?.unmatchedList ?? []).map((em, i) => (
                    <tr key={em}><td className="lms-muted">{i + 1}</td><td>{em}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        </>
      )}
      </Card>
    </>
  );
}
