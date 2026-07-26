import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Boxes, CheckCircle2, Copy, Download, FileQuestion, FolderOpen, Library, Lock, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { QuestionType, QuestionComplexity, UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Select, SkeletonTable, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useModules } from '@/lib/modules';
import {
  useAddBankQuestion,
  useBulkAddBankQuestions,
  useDeleteBankQuestion,
  useDeleteUploadBatch,
  useDuplicates,
  useImportFromMaster,
  useQuestionBank,
  useUpdateBankQuestion,
  useUploadBatches,
} from '@/lib/questionBank';
import { formatDate } from '@/lib/format';
import { QUESTION_TYPE_LABEL, QUESTION_TYPE_OPTIONS } from '../assessments/assessmentsUi';
import '../modules/modules.css';


// Complexity (difficulty) UI helpers.
export const COMPLEXITY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const COMPLEXITY_TONE = { easy: 'success', medium: 'warning', hard: 'danger' };
const COMPLEXITY_OPTIONS = Object.values(QuestionComplexity).map((v) => ({ value: v, label: COMPLEXITY_LABEL[v] }));

export function QuestionBankPage() {
  const role = useAuth((s) => s.user?.role);
  const orgView = useAuth((s) => s.orgView);
  // The super admin, ONLY while drilled into an org, can pull from the master bank.
  const canImportFromMaster = role === UserRole.SUPER_ADMIN && Boolean(orgView);
  const { data: modules } = useModules();
  const [moduleId, setModuleId] = useState('');
  const [topicFilter, setTopicFilter] = useState(''); // '' = all topics, or a topicId
  const [complexityFilter, setComplexityFilter] = useState(''); // '' = all
  const { data: items, isLoading } = useQuestionBank({ module: moduleId, complexity: complexityFilter });

  const moduleObj = useMemo(() => (modules ?? []).find((m) => m.id === moduleId), [modules, moduleId]);
  const topics = moduleObj?.topics ?? [];

  const [editing, setEditing] = useState(null); // question item or {} for new
  const [importing, setImporting] = useState(false);
  const [importMaster, setImportMaster] = useState(false);
  const [managing, setManaging] = useState(false); // uploads + duplicates manager
  const del = useDeleteBankQuestion();
  const confirm = useConfirm();

  async function onDelete(id) {
    if (await confirm({ title: 'Delete this question?', message: 'It will be removed from the bank.', confirmLabel: 'Delete', tone: 'danger' })) {
      del.mutate(id);
    }
  }

  if (role === UserRole.STUDENT) {
    return (
      <EmptyState
        icon={<Lock size={26} />}
        title="Trainers and admins only"
        description="The question bank is for trainers and admins."
      />
    );
  }

  const filtered = (items ?? []).filter((q) => {
    if (!topicFilter) return true; // "All topics" — every question in the module
    return q.topic === topicFilter;
  });

  return (
    <>
      <PageHeader
        title="Question Bank"
        subtitle="Dump questions per module (manually or from Excel). Tests are built by picking from here."
      />

      <div className="toolbar">
        <div style={{ flex: '1 1 16rem', minWidth: 0, maxWidth: '22rem' }}>
          <Select
            value={moduleId}
            onChange={(e) => { setModuleId(e.target.value); setTopicFilter(''); }}
            options={[
              { value: '', label: 'Select a module…' },
              ...(modules ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
            ]}
          />
        </div>
        {moduleId && (
          <div style={{ flex: '1 1 12rem', minWidth: 0, maxWidth: '16rem' }}>
            <Select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              options={[
                { value: '', label: 'All topics' },
                ...topics.map((t) => ({ value: t.id, label: t.title })),
              ]}
            />
          </div>
        )}
        {moduleId && (
          <div style={{ flex: '1 1 9rem', minWidth: 0, maxWidth: '12rem' }}>
            <Select
              value={complexityFilter}
              onChange={(e) => setComplexityFilter(e.target.value)}
              options={[{ value: '', label: 'All complexity' }, ...COMPLEXITY_OPTIONS]}
            />
          </div>
        )}
        {moduleId && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
            {canImportFromMaster && (
              <Button variant="outline" onClick={() => setImportMaster(true)}>
                <Library size={15} style={{ marginRight: 6 }} /> Import from Master
              </Button>
            )}
            <Button variant="outline" onClick={() => setImporting(true)}>
              <UploadCloud size={15} style={{ marginRight: 6 }} /> Import Excel
            </Button>
            <Button variant="outline" onClick={() => setManaging(true)}>
              <Boxes size={15} style={{ marginRight: 6 }} /> Uploads &amp; duplicates
            </Button>
            <Button onClick={() => setEditing({})}>
              <Plus size={15} style={{ marginRight: 6 }} /> Add question
            </Button>
          </div>
        )}
      </div>

      {!moduleId ? (
        <EmptyState
          icon={<FolderOpen size={26} />}
          title="Choose a module"
          description="Choose a module to view and build its question bank."
        />
      ) : isLoading && !items ? (
        <SkeletonTable rows={5} cols={7} />
      ) : (
        <Card>
          <CardHeader
            title={`${filtered.length} question${filtered.length === 1 ? '' : 's'}`}
            subtitle={topicFilter ? 'Filtered by topic' : 'All topics in this module'}
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileQuestion size={26} />}
              title="No questions yet"
              description="Add one, or import an Excel file."
              action={
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button variant="outline" onClick={() => setImporting(true)}>
                    <UploadCloud size={15} style={{ marginRight: 6 }} /> Import Excel
                  </Button>
                  <Button onClick={() => setEditing({})}>
                    <Plus size={15} style={{ marginRight: 6 }} /> Add question
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Question</th><th>Type</th><th>Complexity</th><th>Topic</th><th>Answer</th><th>Pts</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map((q, i) => (
                    <tr key={q.id}>
                      <td>{i + 1}</td>
                      <td style={{ maxWidth: '24rem' }}>{q.prompt}</td>
                      <td><Badge tone="neutral">{QUESTION_TYPE_LABEL[q.type]}</Badge></td>
                      <td><Badge tone={COMPLEXITY_TONE[q.complexity] ?? 'neutral'}>{COMPLEXITY_LABEL[q.complexity] ?? q.complexity ?? '—'}</Badge></td>
                      <td>{q.topicTitle ? <Badge tone="primary">{q.topicTitle}</Badge> : <span className="lms-muted">General</span>}</td>
                      <td className="lms-muted">
                        {q.type === QuestionType.MCQ && q.options?.[q.correctOption] != null ? q.options[q.correctOption] : '—'}
                      </td>
                      <td>{q.points}</td>
                      <td>
                        <div className="list-actions">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(q)}><Pencil size={14} /></Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDelete(q.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <BankQuestionModal
          moduleId={moduleId}
          topics={topics}
          question={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}

      <Modal open={importing} title="Import questions from Excel" size="lg" onClose={() => setImporting(false)}>
        <BankExcelImport moduleId={moduleId} topics={topics} onClose={() => setImporting(false)} />
      </Modal>

      {importMaster && (
        <Modal open title="Import from the Master Question Bank" size="lg" onClose={() => setImportMaster(false)}>
          <ImportFromMasterModal modules={modules ?? []} defaultModuleId={moduleId} onClose={() => setImportMaster(false)} />
        </Modal>
      )}

      {managing && (
        <Modal open title="Uploads & duplicates" size="xl" onClose={() => setManaging(false)}>
          <UploadsManagerModal moduleId={moduleId} onClose={() => setManaging(false)} />
        </Modal>
      )}
    </>
  );
}

// ── Uploads (batch cards) + duplicates report ────────────────────────────────────

/**
 * Manage a module's bank hygiene: review each Excel/import batch and delete it (or
 * individual questions from it) as a card, and see a read-only report of questions
 * already duplicated in the bank so the extras can be removed.
 */
function UploadsManagerModal({ moduleId, onClose }) {
  const [tab, setTab] = useState('uploads'); // 'uploads' | 'duplicates'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button size="sm" variant={tab === 'uploads' ? 'primary' : 'outline'} onClick={() => setTab('uploads')}>
          <Boxes size={14} style={{ marginRight: 6 }} /> Uploads
        </Button>
        <Button size="sm" variant={tab === 'duplicates' ? 'primary' : 'outline'} onClick={() => setTab('duplicates')}>
          <Copy size={14} style={{ marginRight: 6 }} /> Duplicates
        </Button>
      </div>
      {tab === 'uploads' ? <UploadsTab moduleId={moduleId} /> : <DuplicatesTab moduleId={moduleId} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/** One card per upload; expand to see its questions, delete individually or all. */
function UploadsTab({ moduleId }) {
  const { data: batches, isLoading } = useUploadBatches(moduleId);
  const delBatch = useDeleteUploadBatch();
  const confirm = useConfirm();
  const toast = useToast();
  const [openId, setOpenId] = useState(null);

  async function removeBatch(b) {
    if (await confirm({ title: `Delete this upload (${b.count} questions)?`, message: `Every question from “${b.source || 'this upload'}” will be removed from the bank.`, confirmLabel: 'Delete all', tone: 'danger' })) {
      try { await delBatch.mutateAsync(b.uploadBatch); toast.success('Upload deleted.'); if (openId === b.uploadBatch) setOpenId(null); }
      catch (e) { toast.error(apiErrorMessage(e)); }
    }
  }

  if (isLoading && !batches) return <SkeletonTable rows={3} cols={2} />;
  if (!batches || batches.length === 0) {
    return <EmptyState icon={<Boxes size={26} />} title="No uploads yet" description="Excel imports and master imports appear here as cards you can review or delete." />;
  }
  return (
    <div className="dash-grid-2">
      {batches.map((b) => (
        <Card key={b.uploadBatch} className="upload-card">
          <div className="panel-head">
            <div>
              <strong>{b.source || 'Upload'}</strong>
              <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                {b.count} question{b.count === 1 ? '' : 's'}{b.topicTitle ? ` · ${b.topicTitle}` : ''} · {formatDate(b.uploadedAt)}
              </div>
            </div>
            <Badge tone="neutral">{b.count}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button size="sm" variant="outline" onClick={() => setOpenId(openId === b.uploadBatch ? null : b.uploadBatch)}>
              {openId === b.uploadBatch ? 'Hide' : 'View questions'}
            </Button>
            <Button size="sm" variant="danger" loading={delBatch.isPending} onClick={() => removeBatch(b)}>
              <Trash2 size={14} style={{ marginRight: 6 }} /> Delete upload
            </Button>
          </div>
          {openId === b.uploadBatch && <BatchQuestions moduleId={moduleId} batchId={b.uploadBatch} />}
        </Card>
      ))}
    </div>
  );
}

/** The questions inside one upload batch, each individually deletable. */
function BatchQuestions({ moduleId, batchId }) {
  const { data: items, isLoading } = useQuestionBank({ module: moduleId, uploadBatch: batchId });
  const del = useDeleteBankQuestion();
  const confirm = useConfirm();
  if (isLoading && !items) return <SkeletonTable rows={2} cols={1} />;
  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {(items ?? []).map((q, i) => (
        <div key={q.id} className="q-item" style={{ padding: 'var(--space-2) var(--space-3)' }}>
          <div className="q-item__body">
            <div className="q-item__prompt">{i + 1}. {q.prompt}</div>
            {q.type === QuestionType.MCQ && q.options?.length > 0 && (
              <div className="q-item__meta">{q.options.map((o, oi) => (
                <Badge key={oi} tone={oi === q.correctOption ? 'success' : 'neutral'}>{o}</Badge>
              ))}</div>
            )}
          </div>
          <Button size="sm" variant="ghost" title="Remove this question"
            onClick={async () => { if (await confirm({ title: 'Delete this question?', message: 'It will be removed from the bank.', confirmLabel: 'Delete', tone: 'danger' })) del.mutate(q.id); }}>
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      {(items ?? []).length === 0 && <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>This upload is now empty.</span>}
    </div>
  );
}

/** Read-only report of questions already duplicated in the bank — delete the extras. */
function DuplicatesTab({ moduleId }) {
  const { data, isLoading } = useDuplicates(moduleId);
  const del = useDeleteBankQuestion();
  const confirm = useConfirm();
  const toast = useToast();

  if (isLoading && !data) return <SkeletonTable rows={3} cols={2} />;
  const groups = data?.groups ?? [];
  if (groups.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={26} />} title="No duplicates" description="Every question in this module is unique." />;
  }

  async function removeExtra(id) {
    if (await confirm({ title: 'Delete this copy?', message: 'This duplicate will be removed. The other copies stay.', confirmLabel: 'Delete copy', tone: 'danger' })) {
      try { await del.mutateAsync(id); } catch (e) { toast.error(apiErrorMessage(e)); }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
        <strong>{groups.length}</strong> duplicated question{groups.length === 1 ? '' : 's'} · <strong>{data.removableCount}</strong> extra cop{data.removableCount === 1 ? 'y' : 'ies'} could be removed. The first (oldest) of each is kept below; delete the rest.
      </div>
      {groups.map((g, gi) => (
        <Card key={gi}>
          <div className="q-item__prompt" style={{ fontWeight: 'var(--font-weight-medium)' }}>{g.prompt}</div>
          {g.topicTitle && <Badge tone="primary" style={{ marginTop: 4 }}>{g.topicTitle}</Badge>}
          <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                <Badge tone={i === 0 ? 'success' : 'warning'}>{i === 0 ? 'Keep' : 'Duplicate'}</Badge>
                <span className="lms-muted" style={{ flex: 1 }}>{it.uploadSource || 'Added manually'} · {formatDate(it.createdAt)}</span>
                {i > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => removeExtra(it.id)}><Trash2 size={14} /></Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Add / edit a single question ────────────────────────────────────────────────

// ── Super admin: import from the master (template) question bank ──────────────────

function ImportFromMasterModal({ modules, defaultModuleId, onClose }) {
  const [moduleId, setModuleId] = useState(defaultModuleId || '');
  const [topic, setTopic] = useState('all'); // 'all' | 'general' | topicId
  const [type, setType] = useState('all'); // 'all' | QuestionType
  const [complexity, setComplexity] = useState('all'); // 'all' | complexity
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const imp = useImportFromMaster();

  const moduleObj = (modules ?? []).find((m) => m.id === moduleId);
  const topics = moduleObj?.topics ?? [];

  async function run() {
    setErr('');
    try {
      const res = await imp.mutateAsync({ module: moduleId, topic, type, complexity });
      setResult(res);
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  }

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={20} /> <strong>{result.imported} question(s) imported into this organization.</strong>
        </div>
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
          {result.matched} matched the filter{result.skipped > 0 ? `; ${result.skipped} were skipped (already present)` : ''}.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={onClose}>Done</Button></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        Copy questions from the master question bank into <strong>this organization</strong>. Choose a module and,
        optionally, narrow by topic, type, and complexity. Questions already present are skipped.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 16rem' }}>
          <Select
            label="Module"
            value={moduleId}
            onChange={(e) => { setModuleId(e.target.value); setTopic('all'); }}
            options={[{ value: '', label: 'Select a module…' }, ...(modules ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))]}
          />
        </div>
        <div style={{ flex: '1 1 12rem' }}>
          <Select
            label="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            options={[
              { value: 'all', label: 'All topics' },
              ...topics.map((t) => ({ value: t.id, label: t.title })),
            ]}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 12rem' }}>
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[{ value: 'all', label: 'All types' }, ...QUESTION_TYPE_OPTIONS]}
          />
        </div>
        <div style={{ flex: '1 1 10rem' }}>
          <Select
            label="Complexity"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
            options={[{ value: 'all', label: 'All complexity' }, ...COMPLEXITY_OPTIONS]}
          />
        </div>
      </div>
      {err && <div className="field__error">{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={run} loading={imp.isPending} disabled={!moduleId}>
          <Library size={15} style={{ marginRight: 6 }} /> Import from Master
        </Button>
      </div>
    </div>
  );
}

const BLANK_Q = { type: QuestionType.MCQ, complexity: QuestionComplexity.MEDIUM, prompt: '', options: ['', ''], correctOption: 0, referenceAnswer: '', points: 1, topic: '' };

function BankQuestionModal({ moduleId, topics, question, onClose }) {
  const isEdit = Boolean(question);
  const [form, setForm] = useState(BLANK_Q);
  const [err, setErr] = useState('');
  const add = useAddBankQuestion();
  const update = useUpdateBankQuestion();

  useEffect(() => {
    setErr('');
    setForm(
      question
        ? {
            type: question.type,
            complexity: question.complexity ?? QuestionComplexity.MEDIUM,
            prompt: question.prompt,
            options: question.options?.length ? [...question.options] : ['', ''],
            correctOption: question.correctOption ?? 0,
            referenceAnswer: question.referenceAnswer ?? '',
            points: question.points ?? 1,
            topic: question.topic ?? '',
          }
        : BLANK_Q,
    );
  }, [question]);

  const isMcq = form.type === QuestionType.MCQ;
  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? v : o)) }));
  const addOption = () => setForm((f) => ({ ...f, options: [...f.options, ''] }));
  const removeOption = (i) =>
    setForm((f) => {
      const options = f.options.filter((_, idx) => idx !== i);
      return { ...f, options, correctOption: Math.min(f.correctOption, options.length - 1) };
    });

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (!form.topic) { setErr('Choose a topic for this question.'); return; }
    const payload = {
      type: form.type,
      complexity: form.complexity,
      prompt: form.prompt,
      points: Number(form.points) || 1,
      topic: form.topic,
      ...(isMcq
        ? { options: form.options.map((o) => o.trim()).filter(Boolean), correctOption: form.correctOption, referenceAnswer: '' }
        : { options: [], referenceAnswer: form.referenceAnswer?.trim() || '' }),
    };
    try {
      if (isEdit) await update.mutateAsync({ id: question.id, ...payload });
      else await add.mutateAsync({ module: moduleId, ...payload });
      onClose();
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Edit question' : 'Add question'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button form="bank-q-form" type="submit" loading={add.isPending || update.isPending}>Save</Button>
        </>
      }
    >
      <form id="bank-q-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 12rem' }}>
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={QUESTION_TYPE_OPTIONS} />
          </div>
          <div style={{ flex: '1 1 10rem' }}>
            <Select label="Complexity" value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })} options={COMPLEXITY_OPTIONS} />
          </div>
        </div>
        <Select
          label="Topic"
          value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })}
          options={[{ value: '', label: topics.length ? 'Select a topic…' : 'Add topics to this module first' }, ...topics.map((t) => ({ value: t.id, label: t.title }))]}
        />
        <Input label="Question prompt" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} required />
        {isMcq && (
          <div className="field">
            <label className="field__label">Options (select the correct answer)</label>
            {form.options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <input type="radio" name="bank-correct" checked={form.correctOption === i} onChange={() => setForm({ ...form, correctOption: i })} />
                <input className="input" value={opt} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                {form.options.length > 2 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeOption(i)}><X size={15} /></Button>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={addOption}>+ Option</Button>
          </div>
        )}
        {!isMcq && (
          <div className="field">
            <label className="field__label">Expected answer / grading rubric <span className="lms-muted">(optional)</span></label>
            <textarea
              className="input"
              style={{ minHeight: '6rem', resize: 'vertical' }}
              placeholder={
                form.type === QuestionType.CODING
                  ? 'What a strong repo should contain: required features, expected architecture, must-have files…'
                  : 'The model answer or key points a correct response must cover. The AI uses this to grade accurately.'
              }
              value={form.referenceAnswer}
              onChange={(e) => setForm({ ...form, referenceAnswer: e.target.value })}
            />
            <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
              Graded by the AI evaluation engine. Providing a model answer here makes grading far more accurate — it is never shown to students.
            </p>
          </div>
        )}
        <Input label="Points" type="number" min="1" max="100" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
        {err && <span className="field__error">{err}</span>}
      </form>
    </Modal>
  );
}

// ── Excel import → bank ───────────────────────────────────────────────────────

function fieldFor(header) {
  const k = String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k === 'question' || k === 'prompt' || k === 'scenario' || k === 'questiontext') return 'prompt';
  if (k === 'option1' || k === 'optiona' || k === 'a') return 'opt1';
  if (k === 'option2' || k === 'optionb' || k === 'b') return 'opt2';
  if (k === 'option3' || k === 'optionc' || k === 'c') return 'opt3';
  if (k === 'option4' || k === 'optiond' || k === 'd') return 'opt4';
  if (k === 'correctanswer' || k === 'correct' || k === 'answer' || k === 'correctoption') return 'correct';
  if (k === 'expectedanswer' || k === 'modelanswer' || k === 'answerkey' || k === 'rubric' || k === 'gradingnotes' || k === 'guidance') return 'reference';
  if (k === 'points' || k === 'marks' || k === 'point') return 'points';
  if (k === 'complexity' || k === 'difficulty') return 'complexity';
  return null;
}
/** Map a free-text complexity cell to easy | medium | hard (default medium). */
function normalizeComplexity(v) {
  const c = String(v ?? '').trim().toLowerCase();
  if (c === 'easy' || c === 'e') return 'easy';
  if (c === 'hard' || c === 'h' || c === 'difficult') return 'hard';
  return 'medium';
}
function normalizeRows(raw) {
  return raw.map((row) => {
    const out = {};
    for (const [header, value] of Object.entries(row)) {
      const f = fieldFor(header);
      if (f && value != null && String(value).trim() !== '') out[f] = String(value).trim();
    }
    return out;
  });
}
function resolveCorrect(correctRaw, options) {
  if (!correctRaw) return -1;
  const c = String(correctRaw).trim();
  const asNum = Number(c);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= options.length) return asNum - 1;
  const letter = c.toUpperCase();
  if (/^[A-D]$/.test(letter)) return letter.charCodeAt(0) - 65;
  return options.findIndex((o) => o.toLowerCase() === c.toLowerCase());
}
/**
 * Convert a normalized row to a question. Returns `{ question }` on success or
 * `{ error }` with a human reason so the import UI can list skipped rows.
 */
function rowToQuestion(row, type) {
  if (!row.prompt) return { error: 'Missing question text' };
  const points = Math.max(1, Math.min(100, Math.round(Number(row.points) || 1)));
  const complexity = normalizeComplexity(row.complexity);
  if (type !== QuestionType.MCQ) return { question: { type, complexity, prompt: row.prompt, points, referenceAnswer: row.reference || '' } };
  const options = [row.opt1, row.opt2, row.opt3, row.opt4].filter((o) => o && o.trim() !== '');
  if (options.length < 2) return { error: 'Needs at least 2 options' };
  const correctOption = resolveCorrect(row.correct, options);
  if (correctOption < 0) return { error: 'Correct answer does not match any option' };
  return { question: { type, complexity, prompt: row.prompt, options, correctOption, points } };
}

const MCQ_HEADERS = ['question', 'complexity', 'option 1', 'option 2', 'option 3', 'option 4', 'correct answer', 'points'];
const TEXT_HEADERS = ['question', 'complexity', 'expected answer', 'points'];

function BankExcelImport({ moduleId, topics, onClose }) {
  const [type, setType] = useState(QuestionType.MCQ);
  const [topic, setTopic] = useState('');
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const bulk = useBulkAddBankQuestions();

  const isMcq = type === QuestionType.MCQ;
  // Convert every row, keeping the valid questions and a per-row list of skips.
  const parsed = (rows ?? []).map((r, i) => ({ row: i + 1, prompt: r.prompt, ...rowToQuestion(r, type) }));
  const questions = parsed.filter((p) => p.question).map((p) => p.question);
  const skippedRows = parsed.filter((p) => p.error);

  async function onFile(e) {
    setError('');
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = normalizeRows(raw);
      if (!mapped.length) setError('That file has no data rows.');
      setRows(mapped);
    } catch {
      setError('Could not read that file. Use a .xlsx or .csv export.');
      setRows(null);
    }
  }

  function downloadTemplate() {
    const headers = isMcq ? MCQ_HEADERS : TEXT_HEADERS;
    const example = isMcq
      ? ['What does LLM stand for?', 'easy', 'Large Language Model', 'Low Level Machine', 'Linear Logic Map', 'Long Lived Memory', 'Large Language Model', 1]
      : ['Describe how you would design a RAG pipeline for a support chatbot.', 'hard', 'Should cover: chunking strategy, embeddings + vector store, retrieval, and grounding the LLM answer in retrieved context.', 5];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, `question-bank-${type}-template.xlsx`);
  }

  async function submit() {
    setError('');
    if (!topic) { setError('Choose a topic for these questions.'); return; }
    try {
      const res = await bulk.mutateAsync({ module: moduleId, topic, source: fileName || undefined, items: questions });
      // Duplicates the server refused (already in the bank / repeated in the file) +
      // rows we dropped while parsing the sheet.
      const serverDupes = Array.isArray(res?.duplicates) ? res.duplicates : [];
      setResult({
        added: res?.added ?? 0,
        duplicateCount: res?.duplicateCount ?? serverDupes.length,
        skipped: [
          ...skippedRows.map((s) => ({ label: `Row ${s.row}${s.prompt ? ` — ${s.prompt}` : ''}`, reason: s.error })),
          ...serverDupes.map((s) => ({ label: s.prompt ?? 'Question', reason: 'Already in the bank' })),
        ],
      });
    } catch (e2) {
      setError(apiErrorMessage(e2));
    }
  }

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={20} /> <strong>{result.added} question(s) added to the bank.</strong>
        </div>
        {result.duplicateCount > 0 && (
          <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
            {result.duplicateCount} were already in the bank (same wording + options) and were skipped.
          </div>
        )}
        {result.skipped.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)', marginBottom: 4 }}>
              <AlertTriangle size={16} /> {result.skipped.length} skipped
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: 160, overflow: 'auto', fontSize: 'var(--font-size-sm)' }}>
              {result.skipped.map((s, i) => (
                <li key={i} className="lms-muted">{s.label} — {s.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 12rem' }}>
          <Select label="Question type" value={type} options={QUESTION_TYPE_OPTIONS} onChange={(e) => { setType(e.target.value); setRows(null); setFileName(''); setError(''); }} />
        </div>
        <div style={{ flex: '1 1 12rem' }}>
          <Select
            label="Topic for these questions"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            options={[{ value: '', label: topics.length ? 'Select a topic…' : 'Add topics to this module first' }, ...topics.map((t) => ({ value: t.id, label: t.title }))]}
          />
        </div>
      </div>

      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        {isMcq ? (
          <>Columns: <strong>question</strong>, <strong>complexity</strong> (easy / medium / hard), <strong>option 1–4</strong>, <strong>correct answer</strong> (option text, or 1–4, or A–D), optional <strong>points</strong>.</>
        ) : (
          <>Columns: a <strong>question</strong> column (the scenario / prompt / repo task), <strong>complexity</strong> (easy / medium / hard), an optional <strong>expected answer</strong> (model answer or rubric — improves grading accuracy, never shown to students), and optional <strong>points</strong>.</>
        )}
      </p>

      <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={downloadTemplate}>
        <Download size={15} style={{ marginRight: 6 }} /> Download {QUESTION_TYPE_LABEL[type]} template
      </button>

      <label className="bulk-drop">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <UploadCloud size={28} />
        <span>{fileName || 'Choose a .xlsx or .csv file'}</span>
      </label>

      {rows && (
        <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} />
          <span><strong>{questions.length}</strong> ready to add{skippedRows.length > 0 ? ` · ${skippedRows.length} row(s) will be skipped` : ''}.</span>
        </div>
      )}
      {rows && skippedRows.length > 0 && (
        <div style={{ fontSize: 'var(--font-size-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)', marginBottom: 4 }}>
            <AlertTriangle size={15} /> {skippedRows.length} row(s) will be skipped
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: 140, overflow: 'auto' }}>
            {skippedRows.map((s) => (
              <li key={s.row} className="lms-muted">Row {s.row}{s.prompt ? ` — ${s.prompt}` : ''} — {s.error}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <div className="field__error">{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={bulk.isPending} disabled={!questions.length}>
          Add {questions.length || ''} question{questions.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
