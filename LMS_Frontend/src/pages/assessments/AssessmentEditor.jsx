import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Check, Database, Download, HelpCircle, ScrollText, Trash2, UploadCloud, Users } from 'lucide-react';
import { AssessmentAvailability, AssessmentType, ProctoringMode, QuestionType } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, SkeletonTable, SkeletonText, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, downloadFile, fileSrc } from '@/lib/api';
import {
  useAssessment,
  useDeleteQuestion,
  useSetAllowedStudents,
  useSetAvailability,
  useSubmissions,
  useUpdateAssessment,
} from '@/lib/assessments';
import {
  assessmentLabel,
  ASSESSMENT_TYPE_LABEL,
  ASSESSMENT_TYPE_TONE,
  PROCTORING_LABEL,
  PROCTORING_OPTIONS,
  PROCTORING_TONE,
  QUESTION_TYPE_LABEL,
} from './assessmentsUi';
import { combineDateTime, splitDateTime, validateExamWindow } from './examWindow';
import { BankPicker } from './BankPicker';
import { formatDate } from '@/lib/format';
import '../modules/modules.css';

export function AssessmentEditor() {
  const { id } = useParams();
  const { data: a, isLoading, isError, error, refetch } = useAssessment(id);
  const setAvailability = useSetAvailability();
  const del = useDeleteQuestion();
  const confirm = useConfirm();
  const [pickerOpen, setPickerOpen] = useState(false);

  async function onRemoveQuestion(questionId) {
    if (await confirm({ title: 'Remove this question?', message: 'It stays in the question bank — only this test loses it.', confirmLabel: 'Remove', tone: 'danger' })) {
      del.mutate({ id, questionId });
    }
  }

  if (isLoading && !a) {
    return (
      <>
        <PageHeader
          title="Assessment"
          subtitle={<Link to="/app/assessments" className="lms-muted">← All assessments</Link>}
        />
        <Card><SkeletonText lines={4} /></Card>
      </>
    );
  }
  if (isError || !a) {
    return (
      <>
        <PageHeader
          title="Assessment"
          subtitle={<Link to="/app/assessments" className="lms-muted">← All assessments</Link>}
        />
        <ErrorState message={apiErrorMessage(error) || 'Assessment not found'} onRetry={refetch} />
      </>
    );
  }

  const unlocked = a.availability === AssessmentAvailability.UNLOCKED;
  const isTemplate = a.isTemplate;
  const canAddMore = !(a.type === AssessmentType.PRACTICE && a.questions.length >= 10);

  return (
    <>
      <PageHeader
        title={assessmentLabel(a)}
        subtitle={<Link to="/app/assessments" className="lms-muted">← All assessments</Link>}
      />

      <Card className="asmt-overview">
        <div className="asmt-overview__head">
          <div className="asmt-overview__lead">
            <span className="asmt-overview__module">{a.module?.name}</span>
            {(a.topics ?? []).length > 0 && (
              <div className="asmt-overview__topics">
                {a.topics.map((t) => <Badge key={t.id ?? t.topic ?? t.title} tone="primary">{t.title}</Badge>)}
              </div>
            )}
          </div>
          {isTemplate ? (
            <Badge tone="primary">Ready-made test</Badge>
          ) : (
            <div className="asmt-overview__status">
              <Badge tone={unlocked ? 'success' : 'neutral'}>{unlocked ? 'Live' : 'Locked'}</Badge>
              <Button
                size="sm"
                variant={unlocked ? 'outline' : 'primary'}
                loading={setAvailability.isPending}
                disabled={!unlocked && a.questions.length === 0}
                onClick={() => setAvailability.mutate({ id: a.id, unlock: !unlocked })}
              >
                {unlocked ? 'Lock' : 'Make live'}
              </Button>
            </div>
          )}
        </div>

        <div className="asmt-overview__facts">
          <div className="asmt-fact"><span className="asmt-fact__label">Type</span><span className="asmt-fact__value"><Badge tone={ASSESSMENT_TYPE_TONE[a.type]}>{ASSESSMENT_TYPE_LABEL[a.type]}</Badge></span></div>
          <div className="asmt-fact"><span className="asmt-fact__label">Questions</span><span className="asmt-fact__value">{a.questions.length}</span></div>
          <div className="asmt-fact"><span className="asmt-fact__label">Duration</span><span className="asmt-fact__value">{a.durationMinutes ? `${a.durationMinutes} min` : 'Untimed'}</span></div>
          <div className="asmt-fact"><span className="asmt-fact__label">Pass mark</span><span className="asmt-fact__value">{a.passingScore}%</span></div>
          <div className="asmt-fact"><span className="asmt-fact__label">Proctoring</span><span className="asmt-fact__value"><Badge tone={PROCTORING_TONE[a.proctoring] ?? 'neutral'}>{PROCTORING_LABEL[a.proctoring] ?? 'No proctoring'}</Badge></span></div>
          {a.batch && <div className="asmt-fact"><span className="asmt-fact__label">Batch</span><span className="asmt-fact__value">{a.batch.name}</span></div>}
        </div>
      </Card>

      {isTemplate && <DescriptionCard a={a} />}

      <ProctoringCard a={a} isTemplate={isTemplate} />

      {!isTemplate && <AllowedStudentsCard a={a} />}

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div className="panel-head">
          <CardHeader
            title={`Questions (${a.questions.length}${a.type === AssessmentType.PRACTICE ? ' / 10' : ''})`}
            subtitle={isTemplate ? 'Picked from this module’s question bank. MCQs are auto-graded.' : 'Fixed by the admin who created this ready-made test.'}
          />
          {isTemplate && (
            <Button onClick={() => setPickerOpen(true)} disabled={!canAddMore} title={!canAddMore ? 'A practice test is limited to 10 questions' : ''}>
              <Database size={15} style={{ marginRight: 6 }} /> Add from question bank
            </Button>
          )}
        </div>

        {a.questions.length === 0 && (
          <EmptyState
            icon={<HelpCircle size={26} />}
            title="No questions yet"
            description={isTemplate ? 'Add some from the question bank to build this test.' : 'This test has no questions.'}
            action={isTemplate ? <Button onClick={() => setPickerOpen(true)}><Database size={15} style={{ marginRight: 6 }} /> Add from question bank</Button> : undefined}
          />
        )}
        {a.questions.map((q, i) => (
          <div key={q.id} className="topic-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>
                {i + 1}. {q.prompt}
              </div>
              <div className="class-meta" style={{ marginTop: 4 }}>
                <Badge tone="neutral">{QUESTION_TYPE_LABEL[q.type]}</Badge>
                <span>{q.points} pt{q.points > 1 ? 's' : ''}</span>
              </div>
              {q.type === QuestionType.MCQ && (
                <ul style={{ margin: 'var(--space-2) 0 0 var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
                  {q.options?.map((opt, oi) => (
                    <li key={oi} style={{ color: oi === q.correctOption ? 'var(--color-success)' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {opt} {oi === q.correctOption ? <Check size={14} strokeWidth={3} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {isTemplate && (
              <div className="list-actions">
                <Button size="sm" variant="ghost" title="Remove from this test" onClick={() => onRemoveQuestion(q.id)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      {!isTemplate && <CompletionCard a={a} />}

      {!isTemplate && <SubmissionsCard id={a.id} />}

      <Modal open={pickerOpen} title="Add questions from the bank" size="lg" onClose={() => setPickerOpen(false)}>
        <BankPicker assessment={a} onClose={() => setPickerOpen(false)} />
      </Modal>
    </>
  );
}

function ProctoringCell({ s }) {
  const shots = s.proctorShots ?? [];
  const warnings = s.warnings ?? 0;
  if (!s.disqualified && warnings === 0 && shots.length === 0) return <span className="lms-muted">—</span>;
  const reasons = (s.warningLog ?? []).map((w) => w.reason).filter(Boolean).join('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {s.disqualified && (
        <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
          ⚠ {s.disqualifiedReason || 'Left the exam'}
        </span>
      )}
      {warnings > 0 && (
        <span title={reasons} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', fontWeight: 'var(--font-weight-semibold)' }}>
          ⚠ {warnings} warning{warnings === 1 ? '' : 's'}
        </span>
      )}
      {shots.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {shots.map((u, i) => (
            <a key={i} href={fileSrc(u)} target="_blank" rel="noreferrer" title="Open snapshot">
              <img src={fileSrc(u)} alt={`Snapshot ${i + 1}`} style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border)' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin edits a ready-made test's name + description (the topics it covers). */
function DescriptionCard({ a }) {
  const update = useUpdateAssessment();
  const [title, setTitle] = useState(a.title);
  const [description, setDescription] = useState(a.description ?? '');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    setMsg(''); setErr('');
    try {
      await update.mutateAsync({ id: a.id, title, description });
      setMsg('Saved.');
    } catch (e) { setErr(apiErrorMessage(e)); }
  }

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Name & description" subtitle="Shown with the test to trainers and students." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <Input label="Test name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="field">
          <label className="field__label">Description <span className="lms-muted">— topics this test covers</span></label>
          <textarea
            className="input"
            style={{ minHeight: '5rem', resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Covers Prompt Patterns, Chain of Thought, and Structured Outputs."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button onClick={save} loading={update.isPending}>Save</Button>
          {msg && <span className="lms-muted" style={{ color: 'var(--color-success)' }}>{msg}</span>}
        </div>
        {err && <span className="field__error" style={{ display: 'block' }}>{err}</span>}
      </div>
    </Card>
  );
}

/**
 * Template: admin edits proctoring + duration (no schedule).
 * Instance: trainer edits the schedule (window); proctoring + duration are fixed by admin.
 */
function ProctoringCard({ a, isTemplate }) {
  const update = useUpdateAssessment();
  const init = splitDateTime(a.availableFrom);
  const end = splitDateTime(a.deadline);
  const [form, setForm] = useState({
    proctoring: a.proctoring ?? ProctoringMode.NONE,
    examDate: init.date || end.date,
    windowStart: init.time,
    windowEnd: end.time,
    durationMinutes: a.durationMinutes ?? '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const timed = form.proctoring !== ProctoringMode.NONE;

  async function saveTemplate() {
    setErr(''); setMsg('');
    try {
      await update.mutateAsync({
        id: a.id,
        proctoring: form.proctoring,
        durationMinutes: timed && form.durationMinutes ? Number(form.durationMinutes) : null,
      });
      setMsg('Saved.');
    } catch (e) { setErr(apiErrorMessage(e)); }
  }

  async function saveSchedule() {
    setErr(''); setMsg('');
    if (a.proctored) {
      const windowErr = validateExamWindow({ ...form, durationMinutes: a.durationMinutes });
      if (windowErr) return setErr(windowErr);
    }
    try {
      await update.mutateAsync({
        id: a.id,
        availableFrom: combineDateTime(form.examDate, form.windowStart) ?? null,
        deadline: combineDateTime(form.examDate, form.windowEnd) ?? null,
      });
      setMsg('Saved.');
    } catch (e) { setErr(apiErrorMessage(e)); }
  }

  // ── Template: format + duration ─────────────────────────────────────────────
  if (isTemplate) {
    return (
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Format & duration" subtitle="How this ready-made test is invigilated. Trainers can't change this." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <div style={{ maxWidth: '24rem' }}>
            <Select label="Proctoring / format" value={form.proctoring} onChange={(e) => setForm({ ...form, proctoring: e.target.value })} options={PROCTORING_OPTIONS} />
          </div>
          {timed && (
            <Input label="Duration (minutes per student)" type="number" min="1" max="600" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} style={{ maxWidth: '16rem' }} />
          )}
          {form.proctoring === ProctoringMode.SEB && (
            <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>Set the global SEB Config Key in Settings.</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button onClick={saveTemplate} loading={update.isPending}>Save</Button>
            {msg && <span className="lms-muted" style={{ color: 'var(--color-success)' }}>{msg}</span>}
          </div>
        </div>
        {err && <span className="field__error" style={{ display: 'block', marginTop: 'var(--space-2)' }}>{err}</span>}
      </Card>
    );
  }

  // ── Instance: schedule only ─────────────────────────────────────────────────
  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Schedule" subtitle="When your students can take it. Format & duration are fixed by the admin." />
      <div className="module-card__meta" style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>
        <Badge tone={PROCTORING_TONE[a.proctoring] ?? 'neutral'}>{PROCTORING_LABEL[a.proctoring] ?? 'No proctoring'}</Badge>
        {a.durationMinutes ? <Badge tone="neutral">{a.durationMinutes} min</Badge> : <Badge tone="neutral">Untimed</Badge>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
        <Input label="Test date" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
        <Input label="Opens" type="time" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} />
        <Input label="Closes" type="time" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <Button onClick={saveSchedule} loading={update.isPending}>Save schedule</Button>
        {msg && <span className="lms-muted" style={{ color: 'var(--color-success)' }}>{msg}</span>}
      </div>
      {err && <span className="field__error" style={{ display: 'block', marginTop: 'var(--space-2)' }}>{err}</span>}
    </Card>
  );
}

/** Restrict an assessment to specific students in its batch — chips + Excel-of-emails. */
function AllowedStudentsCard({ a }) {
  const save = useSetAllowedStudents();
  const toast = useToast();
  const students = a.batch?.students ?? [];
  const [selected, setSelected] = useState(() => new Set((a.allowedStudents ?? []).map(String)));
  const [importMsg, setImportMsg] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  // Legacy assessment with no batch → nothing to scope.
  if (!a.batch) {
    return (
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Who can take this" subtitle="Restrict the assessment to specific students" />
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          This assessment isn’t tied to a batch, so it uses the old module-wide visibility. Create assessments with a batch to control who takes them.
        </p>
      </Card>
    );
  }

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(students.map((s) => s.id)));
  const clear = () => setSelected(new Set());

  async function onExcel(e) {
    setErr(''); setImportMsg('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const emails = new Set();
      for (const row of rows) {
        for (const v of Object.values(row)) {
          const s = String(v).trim().toLowerCase();
          if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) emails.add(s);
        }
      }
      const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s.id]));
      const matched = [...emails].map((em) => byEmail.get(em)).filter(Boolean);
      const notFound = [...emails].filter((em) => !byEmail.has(em)).length;
      if (!matched.length) { setErr('No emails in that file matched a student in this batch.'); return; }
      setSelected(new Set(matched));
      setImportMsg(`Selected ${matched.length} student(s) from the file${notFound ? ` · ${notFound} email(s) not in this batch were ignored` : ''}.`);
    } catch {
      setErr('Could not read that file. Use a .xlsx or .csv with an email column.');
    }
  }

  async function onSave() {
    setErr('');
    try {
      await save.mutateAsync({ id: a.id, studentIds: [...selected] });
      toast.success(selected.size === 0 ? 'Everyone in the batch can take this.' : `Restricted to ${selected.size} student(s).`);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={18} style={{ color: 'var(--color-primary)' }} /> Who can take this</span>}
        subtitle={`Batch ${a.batch.name} (${a.batch.code}) · ${students.length} student${students.length === 1 ? '' : 's'}`}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: 'var(--space-3) 0' }}>
        <Button size="sm" variant="outline" onClick={selectAll} disabled={!students.length}>Select all</Button>
        <Button size="sm" variant="ghost" onClick={clear} disabled={!selected.size}>Clear (whole batch)</Button>
        <label className="btn btn--outline btn--sm" style={{ cursor: 'pointer' }}>
          <UploadCloud size={15} style={{ marginRight: 6 }} /> Import emails (Excel)
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onExcel} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
        {selected.size === 0
          ? '✓ Everyone in the batch can take this. Select students below to restrict it.'
          : `Restricted to ${selected.size} of ${students.length} students — only they will see it.`}
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No students in this batch yet" />
      ) : (
        <>
          {students.length > 6 && (
            <Input className="stu-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students by name or email…" />
          )}
          <div className="stu-list">
            {students
              .filter((s) => {
                const needle = q.trim().toLowerCase();
                return !needle || s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle);
              })
              .map((s) => {
                const on = selected.has(s.id);
                const initials = s.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
                return (
                  <button type="button" key={s.id} className={`stu-row${on ? ' is-on' : ''}`} onClick={() => toggle(s.id)} aria-pressed={on}>
                    <span className="stu-row__avatar">{initials}</span>
                    <span className="stu-row__info">
                      <span className="stu-row__name">{s.name}</span>
                      <span className="stu-row__email">{s.email}</span>
                    </span>
                    <span className="stu-row__check">{on && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                );
              })}
          </div>
        </>
      )}

      {importMsg && <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)', color: 'var(--color-success)' }}>{importMsg}</p>}
      {err && <span className="field__error" style={{ display: 'block', marginTop: 'var(--space-2)' }}>{err}</span>}

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Button onClick={onSave} loading={save.isPending}>Save who can take this</Button>
      </div>
    </Card>
  );
}

/** Who's completed it: every assigned student's status (incl. those who haven't started). */
function CompletionCard({ a }) {
  const { data: subs, isLoading } = useSubmissions(a.id);
  const roster = a.batch?.students ?? [];
  const allow = (a.allowedStudents ?? []).map(String);
  // Assigned = the allow-list if set, otherwise the whole batch.
  const assigned = allow.length ? roster.filter((s) => allow.includes(String(s.id))) : roster;
  const byStudent = new Map((subs ?? []).map((s) => [String(s.student?.id ?? s.student), s]));

  const DONE = ['submitted', 'evaluating', 'graded'];
  const rows = assigned.map((s) => {
    const sub = byStudent.get(String(s.id));
    let status = 'not_started';
    if (sub) {
      if (sub.disqualified) status = 'disqualified';
      else if (DONE.includes(sub.status)) status = 'done';
      else if (sub.status === 'in_progress') status = 'in_progress';
    }
    return { s, sub, status };
  });
  const count = (k) => rows.filter((r) => r.status === k).length;
  const done = count('done') + count('disqualified');
  const total = assigned.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const STATUS = {
    done: { tone: 'success', label: 'Submitted' },
    disqualified: { tone: 'error', label: 'Disqualified' },
    in_progress: { tone: 'warning', label: 'In progress' },
    not_started: { tone: 'neutral', label: 'Not started' },
  };

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={18} style={{ color: 'var(--color-primary)' }} /> Who's completed it</span>}
        subtitle={total ? `${done} of ${total} student${total === 1 ? '' : 's'} submitted` : 'No students assigned yet'}
      />
      {total > 0 && (
        <>
          <div className="module-card__progress-track" style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>
            <div className="module-card__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="module-card__meta" style={{ marginBottom: 'var(--space-3)' }}>
            <Badge tone="success">{count('done')} submitted</Badge>
            {count('disqualified') > 0 && <Badge tone="error">{count('disqualified')} disqualified</Badge>}
            <Badge tone="warning">{count('in_progress')} in progress</Badge>
            <Badge tone="neutral">{count('not_started')} not started</Badge>
          </div>
        </>
      )}

      {isLoading && !subs ? (
        <SkeletonTable rows={4} cols={3} />
      ) : total === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No students assigned" description="Assign students on the schedule/allow-list above." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Status</th><th>Score</th></tr></thead>
            <tbody>
              {rows.map(({ s, sub, status }) => (
                <tr key={s.id}>
                  <td>{s.name}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{s.email}</div></td>
                  <td><Badge tone={STATUS[status].tone}>{status === 'done' && sub?.status === 'graded' ? 'Graded' : STATUS[status].label}</Badge></td>
                  <td>{sub && sub.status === 'graded' && !sub.disqualified ? `${sub.score}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SubmissionsCard({ id }) {
  const toast = useToast();
  const { data: subs, isLoading } = useSubmissions(id);
  const [exporting, setExporting] = useState(false);
  const hasSubs = subs && subs.length > 0;
  const onExport = async () => {
    setExporting(true);
    try {
      await downloadFile(`/assessments/${id}/submissions.csv`, 'submissions.csv');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <CardHeader title="Submissions" subtitle="Student attempts and scores" />
        {hasSubs && (
          <Button variant="secondary" size="sm" onClick={onExport} loading={exporting} style={{ flexShrink: 0 }}>
            <Download size={16} /> Export CSV
          </Button>
        )}
      </div>
      {isLoading && !subs ? (
        <SkeletonTable rows={5} cols={5} />
      ) : !subs || subs.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={26} />}
          title="No submissions yet"
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Score</th><th>Result</th><th>Proctoring</th><th>Submitted</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>{s.student?.name}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{s.student?.email}</div></td>
                  <td>{s.score ?? '—'}%</td>
                  <td>
                    {s.disqualified ? (
                      <Badge tone="error">Disqualified</Badge>
                    ) : s.status === 'graded' ? (
                      <Badge tone={s.passed ? 'success' : 'error'}>{s.passed ? 'Passed' : 'Failed'}</Badge>
                    ) : s.status === 'evaluating' ? (
                      <Badge tone="primary">Evaluating</Badge>
                    ) : (
                      <Badge tone="warning">Pending review</Badge>
                    )}
                  </td>
                  <td><ProctoringCell s={s} /></td>
                  <td>{formatDate(s.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
