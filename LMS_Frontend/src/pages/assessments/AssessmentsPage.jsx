import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Check, ChevronLeft, ClipboardList, FolderOpen, Layers, Plus, Send, Users } from 'lucide-react';
import { AssessmentAvailability, AssessmentType, ProctoringMode, UserRole } from '@/shared';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Select, SkeletonCards, SkeletonTable, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAssessments, useAssignTemplate, useCreateAssessment, useDeleteAssessment, useSetAvailability } from '@/lib/assessments';
import { useModules } from '@/lib/modules';
import { useBatches } from '@/lib/batches';
import { assessmentLabel, ASSESSMENT_TYPE_LABEL, ASSESSMENT_TYPE_TONE, PROCTORING_LABEL, PROCTORING_OPTIONS, submissionBadge } from './assessmentsUi';
import { combineDateTime, validateExamWindow } from './examWindow';
import '../modules/modules.css';

/** Only two categories now: practice + final. */
const TYPE_OPTIONS = [
  { value: AssessmentType.PRACTICE, label: 'Practice Test (10 questions)' },
  { value: AssessmentType.FINAL, label: 'Final Test' },
];

export function AssessmentsPage() {
  const role = useAuth((s) => s.user?.role);
  return role === UserRole.STUDENT ? <StudentAssessments /> : <StaffAssessments />;
}

// ── Student ────────────────────────────────────────────────────────────────────

const isDone = (a) => a.submission && a.submission.status !== 'not_started';
const recencyOf = (a) => new Date(a.createdAt || a.availableFrom || 0).getTime();

function StudentAssessments() {
  const navigate = useNavigate();
  const { data: items, isLoading, isError, error, refetch } = useAssessments();
  const [moduleId, setModuleId] = useState('');

  // Group the flat list into one entry per module; within a module, newest first.
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of items ?? []) {
      const mid = a.module?.id ?? a.module ?? 'none';
      if (!map.has(mid)) map.set(mid, { id: mid, name: a.module?.name ?? 'Module', code: a.module?.code, items: [] });
      map.get(mid).items.push(a);
    }
    for (const g of map.values()) g.items.sort((x, y) => recencyOf(y) - recencyOf(x));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const selected = groups.find((g) => g.id === moduleId);

  return (
    <>
      <PageHeader title="Assessments" subtitle="Assigned to you by your trainer, grouped by module." />
      {isLoading && !items ? (
        <SkeletonCards count={4} height="9rem" />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items && items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={26} />} title="No assessments yet" description="Your trainer assigns tests as you progress." />
      ) : selected ? (
        // Drill-down: one module's assessments, most recent on top.
        <>
          <div className="toolbar">
            <Button variant="ghost" size="sm" onClick={() => setModuleId('')}><ChevronLeft size={16} /> All modules</Button>
            <strong style={{ fontSize: 'var(--font-size-lg)' }}>{selected.name}</strong>
          </div>
          <div className="module-grid">
            {selected.items.map((a) => <StudentAssessmentCard key={a.id} a={a} navigate={navigate} />)}
          </div>
        </>
      ) : (
        // Module cards, each showing how many assessments are still to take.
        <div className="module-grid">
          {groups.map((g) => {
            const unlocked = g.items.filter((a) => a.availableNow && !isDone(a)).length;
            const pending = g.items.filter((a) => !isDone(a)).length;
            return (
              <Card key={g.id} className="module-card module-card--clickable" onClick={() => setModuleId(g.id)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModuleId(g.id); } }}>
                <div className="module-card__top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span className="module-card__icon"><Layers size={20} /></span>
                    <div>
                      <div className="module-card__name">{g.name}</div>
                      {g.code && <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{g.code}</div>}
                    </div>
                  </div>
                </div>
                {/* Count on the left, unlocked-tests CTA on the right — one row. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'auto' }}>
                  <Badge tone="neutral">{g.items.length} assessment{g.items.length === 1 ? '' : 's'}</Badge>
                  {unlocked > 0 ? (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setModuleId(g.id); }}>
                      {unlocked} unlocked test{unlocked === 1 ? '' : 's'} →
                    </Button>
                  ) : pending > 0 ? (
                    <Badge tone="neutral">Locked for now</Badge>
                  ) : (
                    <Badge tone="success">All done</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function StudentAssessmentCard({ a, navigate }) {
  const badge = submissionBadge(a.submission);
  const done = isDone(a);
  return (
    <Card className="module-card">
      <div className="module-card__top">
        <div>
          <div className="module-card__name">{assessmentLabel(a)}</div>
          <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{a.module?.name}</div>
        </div>
        <Badge tone={ASSESSMENT_TYPE_TONE[a.type]}>{ASSESSMENT_TYPE_LABEL[a.type]}</Badge>
      </div>
      {a.description && (
        <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>{a.description}</div>
      )}
      {(a.topics ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {a.topics.map((t) => <Badge key={t.id ?? t.topic ?? t.title} tone="neutral">{t.title}</Badge>)}
        </div>
      )}
      <div className="module-card__meta">
        <Badge tone="neutral">{a.questionCount} questions</Badge>
        <Badge tone="neutral">Pass ≥ {a.passingScore}%</Badge>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <div className="list-actions">
        {done ? (
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/assessments/${a.id}`)}>View result</Button>
        ) : a.availableNow ? (
          <Button size="sm" onClick={() => navigate(`/app/assessments/${a.id}`)}>Take assessment</Button>
        ) : (
          <Button size="sm" variant="outline" disabled>Not available</Button>
        )}
      </div>
    </Card>
  );
}

// ── Staff shell: module cards → admin authoring or trainer assigning ─────────────

function StaffAssessments() {
  const role = useAuth((s) => s.user?.role);
  const isAdmin = role === UserRole.ADMIN;
  const { data: modules, isLoading: modulesLoading } = useModules();
  const [moduleId, setModuleId] = useState('');
  const moduleObj = (modules ?? []).find((m) => m.id === moduleId);

  return (
    <>
      <PageHeader
        title="Assessments"
        subtitle={isAdmin ? 'Create ready-made tests. Trainers assign them to their students.' : 'Assign ready-made tests to your students.'}
      />
      {!moduleId ? (
        modulesLoading && !modules ? (
          <SkeletonCards count={6} height="7.5rem" />
        ) : (modules ?? []).length === 0 ? (
          <EmptyState icon={<FolderOpen size={26} />} title="No modules yet" description="You'll see a card for each module." />
        ) : (
          <div className="module-grid">
            {(modules ?? []).map((m) => (
              <Card key={m.id} className="module-card module-card--clickable" onClick={() => setModuleId(m.id)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModuleId(m.id); } }}>
                <div className="module-card__top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span className="module-card__icon"><Layers size={20} /></span>
                    <div>
                      <div className="module-card__name">{m.name}</div>
                      <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{m.code}</div>
                    </div>
                  </div>
                </div>
                <div className="module-card__meta">
                  <Badge tone="neutral">{m.topics?.length ?? 0} topics</Badge>
                  <Badge tone="primary">{isAdmin ? 'Ready-made tests →' : 'Assign tests →'}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : isAdmin ? (
        <AdminModuleTemplates moduleId={moduleId} moduleObj={moduleObj} onBack={() => setModuleId('')} />
      ) : (
        <TrainerModuleTests moduleId={moduleId} moduleObj={moduleObj} onBack={() => setModuleId('')} />
      )}
    </>
  );
}

function ModuleBar({ moduleObj, onBack, children }) {
  return (
    <div className="toolbar">
      <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft size={16} /> All modules</Button>
      <strong style={{ fontSize: 'var(--font-size-lg)' }}>{moduleObj?.name}</strong>
      <span style={{ marginLeft: 'auto' }} />
      {children}
    </div>
  );
}

// ── Admin: author ready-made test templates ─────────────────────────────────────

const BLANK_TEMPLATE = { title: '', description: '', type: AssessmentType.PRACTICE, proctoring: ProctoringMode.NONE, durationMinutes: '', passingScore: '' };
const WHOLE_MODULE = '__whole__'; // dropdown sentinel: the test covers every topic
// Keep topic chips short — long titles are clipped to 15 chars with an ellipsis
// (the full title stays available via the chip's tooltip).
const shortTopic = (s) => (s && s.length > 15 ? `${s.slice(0, 15)}…` : s);

function AdminModuleTemplates({ moduleId, moduleObj, onBack }) {
  const navigate = useNavigate();
  const { data: templates, isLoading, isError, error, refetch } = useAssessments({ template: 'true', module: moduleId });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_TEMPLATE);
  const [topicIds, setTopicIds] = useState([]);
  const [wholeModule, setWholeModule] = useState(false); // "cover all topics" — sends no topics
  const [err, setErr] = useState('');
  const create = useCreateAssessment();
  const del = useDeleteAssessment();
  const confirm = useConfirm();
  const timed = form.proctoring !== ProctoringMode.NONE;
  const topics = moduleObj?.topics ?? [];
  const addTopic = (id) => { setWholeModule(false); setTopicIds((prev) => (prev.includes(id) ? prev : [...prev, id])); };
  const removeTopic = (id) => setTopicIds((prev) => prev.filter((x) => x !== id));
  const pickWholeModule = () => { setWholeModule(true); setTopicIds([]); }; // whole module is exclusive
  const availableTopics = topics.filter((t) => !topicIds.includes(t.id)); // not yet picked
  const selectedTopics = topics.filter((t) => topicIds.includes(t.id)); // in module order

  function openCreate() {
    setForm(BLANK_TEMPLATE);
    setTopicIds([]);
    setWholeModule(false);
    setErr('');
    setCreating(true);
  }

  async function submitCreate(e) {
    e.preventDefault();
    setErr('');
    if (timed && (!form.durationMinutes || Number(form.durationMinutes) <= 0)) {
      return setErr('Set a duration (minutes) for a proctored test.');
    }
    try {
      const created = await create.mutateAsync({
        title: form.title,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        module: moduleId,
        type: form.type,
        ...(topicIds.length ? { topics: topicIds } : {}),
        proctoring: form.proctoring,
        ...(timed && form.durationMinutes ? { durationMinutes: Number(form.durationMinutes) } : {}),
        ...(form.passingScore ? { passingScore: Number(form.passingScore) } : {}),
      });
      setCreating(false);
      setForm(BLANK_TEMPLATE);
      setTopicIds([]);
      setWholeModule(false);
      navigate(`/app/assessments/${created.id}`);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  async function onDelete(id) {
    if (await confirm({ title: 'Delete this ready-made test?', message: 'Trainers will no longer be able to assign it. Already-assigned copies are unaffected.', confirmLabel: 'Delete', tone: 'danger' })) {
      del.mutate(id);
    }
  }

  return (
    <>
      <ModuleBar moduleObj={moduleObj} onBack={onBack}>
        <Button onClick={openCreate}><Plus size={15} style={{ marginRight: 6 }} /> New ready-made test</Button>
      </ModuleBar>

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !templates ? (
        <Card><SkeletonTable rows={4} cols={4} /></Card>
      ) : templates && templates.length === 0 ? (
        <EmptyState icon={<ClipboardList size={26} />} title="No ready-made tests yet" description="Create a practice or final test for this module." action={<Button onClick={openCreate}><Plus size={15} style={{ marginRight: 6 }} /> New ready-made test</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Test</th><th>Type</th><th>Questions</th><th>Duration</th><th /></tr></thead>
            <tbody>
              {templates?.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.title}
                    {(a.topics ?? []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
                        {a.topics.map((t) => <Badge key={t.id ?? t.topic ?? t.title} tone="neutral">{t.title}</Badge>)}
                      </div>
                    )}
                    {a.description && <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', maxWidth: '26rem' }}>{a.description}</div>}
                    <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{PROCTORING_LABEL[a.proctoring] ?? 'No proctoring'}</div>
                  </td>
                  <td><Badge tone={ASSESSMENT_TYPE_TONE[a.type]}>{ASSESSMENT_TYPE_LABEL[a.type]}</Badge></td>
                  <td>
                    {a.questions.length}
                    {a.type === AssessmentType.PRACTICE && <span className="lms-muted"> / 10</span>}
                  </td>
                  <td>{a.durationMinutes ? `${a.durationMinutes} min` : '—'}</td>
                  <td>
                    <div className="list-actions">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/app/assessments/${a.id}`)}>Manage</Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(a.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} title="New ready-made test" size="lg" onClose={() => setCreating(false)}
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button form="tmpl-form" type="submit" loading={create.isPending}>Create</Button></>}>
        <form id="tmpl-form" onSubmit={submitCreate} className="tmpl-grid">
          {/* Row 1: name + description side by side */}
          <Input label="Test name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Prompt Patterns — Practice Test" required />
          <div className="field">
            <label className="field__label">Description <span className="lms-muted">— extra notes (optional)</span></label>
            <textarea
              className="input"
              style={{ minHeight: '2.6rem', resize: 'vertical' }}
              placeholder="e.g. Covers Prompt Patterns, Chain of Thought, and Structured Outputs."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {/* Row 2: topics covered — its own row: picker on the left, chosen topics in a box beside it */}
          <div className="field tmpl-grid__full">
            <label className="field__label">Topics covered <span className="lms-muted">— pick from this module</span></label>
            {topics.length === 0 ? (
              <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>This module has no topics yet — add them in Modules.</p>
            ) : (
              <div className="tmpl-topics-row">
                <div className="tmpl-topics-picker">
                  <Select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === WHOLE_MODULE) pickWholeModule();
                      else addTopic(v);
                    }}
                    options={[
                      { value: '', label: 'Add a topic…' },
                      { value: WHOLE_MODULE, label: 'Whole module — all topics' },
                      ...availableTopics.map((t) => ({ value: t.id, label: t.title })),
                    ]}
                  />
                </div>
                <div className="tmpl-topics-box">
                  {wholeModule ? (
                    <button type="button" className="allow-chip allow-chip--on" onClick={() => setWholeModule(false)} title="Remove">
                      <span className="allow-chip__dot" /> Whole module (all topics) ×
                    </button>
                  ) : selectedTopics.length > 0 ? (
                    selectedTopics.map((t) => (
                      <button type="button" key={t.id} className="allow-chip allow-chip--on" onClick={() => removeTopic(t.id)} title={`${t.title} — remove`}>
                        <span className="allow-chip__dot" /> {shortTopic(t.title)} ×
                      </button>
                    ))
                  ) : (
                    <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Selected topics appear here.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: type + proctoring side by side */}
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={TYPE_OPTIONS} />
          <Select label="Proctoring / format" value={form.proctoring} onChange={(e) => setForm({ ...form, proctoring: e.target.value })} options={PROCTORING_OPTIONS} />

          {/* Row 4: duration (proctored) + passing score */}
          {timed && (
            <Input label="Duration (minutes per student)" type="number" min="1" max="600" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="e.g. 30" />
          )}
          <Input label="Passing score % (optional)" type="number" min="0" max="100" value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: e.target.value })} placeholder="Defaults to 70" />

          <p className="lms-muted tmpl-grid__full" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
            After creating, add the questions from this module's question bank{form.type === AssessmentType.PRACTICE ? ' (exactly 10 for a practice test)' : ''}. Trainers assign this test — they can't change the questions or duration.
          </p>
          {err && <span className="field__error tmpl-grid__full">{err}</span>}
        </form>
      </Modal>
    </>
  );
}

// ── Trainer: browse ready-made tests + assign to students ────────────────────────

function TrainerModuleTests({ moduleId, moduleObj, onBack }) {
  const navigate = useNavigate();
  const { data: templates, isLoading: tLoading } = useAssessments({ template: 'true', module: moduleId });
  const { data: assigned, isLoading: aLoading } = useAssessments({ module: moduleId });
  const [assignTarget, setAssignTarget] = useState(null); // a template being assigned

  // Re-assigning a test makes another instance (same template + batch). Collapse those
  // into ONE row per test so the trainer sees one card; Manage opens the consolidated view.
  const assignedGroups = useMemo(() => {
    const m = new Map();
    for (const a of assigned ?? []) {
      const key = `${a.sourceTemplate ?? a.id}::${a.batch?.id ?? a.batch ?? ''}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    }
    return [...m.values()].map((insts) => ({
      rep: insts[insts.length - 1], // any sibling works; the view consolidates them all
      count: insts.length,
      live: insts.some((x) => x.availability === AssessmentAvailability.UNLOCKED),
    }));
  }, [assigned]);

  return (
    <>
      <ModuleBar moduleObj={moduleObj} onBack={onBack} />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div className="panel-head">
          <div>
            <strong>Ready-made tests</strong>
            <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Created by admin — assign them to your students.</div>
          </div>
        </div>
        {tLoading && !templates ? (
          <SkeletonTable rows={3} cols={3} />
        ) : templates && templates.length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title="No ready-made tests for this module yet" description="Ask your admin to create one." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Test</th><th>Type</th><th>Questions</th><th>Duration</th><th /></tr></thead>
              <tbody>
                {templates?.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.title}
                      {a.description && <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', maxWidth: '26rem' }}>{a.description}</div>}
                    </td>
                    <td><Badge tone={ASSESSMENT_TYPE_TONE[a.type]}>{ASSESSMENT_TYPE_LABEL[a.type]}</Badge></td>
                    <td>{a.questions.length}</td>
                    <td>{a.durationMinutes ? `${a.durationMinutes} min` : '—'}</td>
                    <td>
                      <Button size="sm" disabled={a.questions.length === 0} onClick={() => setAssignTarget(a)}>
                        <Send size={14} style={{ marginRight: 6 }} /> Assign
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="panel-head"><strong>Assigned to my students</strong></div>
        {aLoading && !assigned ? (
          <SkeletonTable rows={3} cols={4} />
        ) : assigned && assigned.length === 0 ? (
          <EmptyState icon={<CalendarClock size={26} />} title="Nothing assigned yet" description="Assign a ready-made test above." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Test</th><th>Type</th><th>Status</th><th /></tr></thead>
              <tbody>
                {assignedGroups.map(({ rep, count, live }) => (
                  <tr key={rep.id}>
                    <td>
                      {rep.title}
                      {count > 1 && <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginLeft: 6 }}>· {count} assignments</span>}
                    </td>
                    <td><Badge tone={ASSESSMENT_TYPE_TONE[rep.type]}>{ASSESSMENT_TYPE_LABEL[rep.type]}</Badge></td>
                    <td><Badge tone={live ? 'success' : 'neutral'}>{live ? 'Live' : 'Locked'}</Badge></td>
                    <td><Button size="sm" variant="outline" onClick={() => navigate(`/app/assessments/${rep.id}`)}>Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {assignTarget && <AssignModal template={assignTarget} moduleId={moduleId} onClose={() => setAssignTarget(null)} />}
    </>
  );
}

function AssignModal({ template, moduleId, onClose }) {
  const { data: batches } = useBatches();
  const assign = useAssignTemplate();
  const toast = useToast();
  const [form, setForm] = useState({ batch: '', examDate: '', windowStart: '', windowEnd: '' });
  const [selected, setSelected] = useState(() => new Set());
  const [err, setErr] = useState('');

  const myBatches = (batches ?? []).filter((b) => (b.modules ?? []).some((m) => (m.id ?? m) === moduleId));
  const batchObj = myBatches.find((b) => b.id === form.batch);
  const students = batchObj?.students ?? [];
  const timed = template.proctored;

  function pickBatch(id) {
    setForm({ ...form, batch: id });
    setSelected(new Set()); // reset restriction when batch changes
  }
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.batch) return setErr('Choose a batch.');
    const body = { id: template.id, batch: form.batch, studentIds: [...selected] };
    if (timed) {
      const windowErr = validateExamWindow({ ...form, durationMinutes: template.durationMinutes });
      if (windowErr) return setErr(windowErr);
      body.availableFrom = combineDateTime(form.examDate, form.windowStart);
      body.deadline = combineDateTime(form.examDate, form.windowEnd);
    }
    try {
      await assign.mutateAsync(body);
      toast.success(`Assigned “${template.title}”.`);
      onClose();
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Modal open title={`Assign: ${template.title}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="assign-form" type="submit" loading={assign.isPending}>Assign</Button></>}>
      <form id="assign-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {template.description && (
          <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>{template.description}</div>
        )}
        {(template.topics ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {template.topics.map((t) => <Badge key={t.id ?? t.topic ?? t.title} tone="neutral">{t.title}</Badge>)}
          </div>
        )}
        <div className="module-card__meta">
          <Badge tone={ASSESSMENT_TYPE_TONE[template.type]}>{ASSESSMENT_TYPE_LABEL[template.type]}</Badge>
          <Badge tone="neutral">{template.questions.length} questions</Badge>
          {template.durationMinutes ? <Badge tone="neutral">{template.durationMinutes} min</Badge> : null}
          <Badge tone="neutral">{PROCTORING_LABEL[template.proctoring] ?? 'No proctoring'}</Badge>
        </div>

        <Select
          label="Batch"
          value={form.batch}
          onChange={(e) => pickBatch(e.target.value)}
          options={[{ value: '', label: myBatches.length ? 'Select a batch…' : 'No batch has this module yet' }, ...myBatches.map((b) => ({ value: b.id, label: `${b.name} (${b.code}) · ${b.students?.length ?? 0} students` }))]}
        />

        {form.batch && (
          <div>
            <label className="field__label" style={{ display: 'block', marginBottom: 6 }}>
              Who takes it <span className="lms-muted">({selected.size === 0 ? 'whole batch' : `${selected.size} selected`})</span>
            </label>
            {students.length === 0 ? (
              <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>This batch has no students yet.</p>
            ) : (
              <div className="stu-list">
                {students.map((s) => {
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
            )}
            <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 6 }}>Leave all unselected to assign to the whole batch.</p>
          </div>
        )}

        {timed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)' }}>Exam window (duration is fixed at {template.durationMinutes} min)</strong>
            <Input label="Test date" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Input label="Opens" type="time" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} />
              <Input label="Closes" type="time" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} />
            </div>
          </div>
        )}
        {err && <span className="field__error">{err}</span>}
      </form>
    </Modal>
  );
}
