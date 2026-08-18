import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, ChevronRight, X } from 'lucide-react';
import { UserRole } from '@/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
  SkeletonText,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  useAssignTrainer,
  useModule,
  useRemoveTrainer,
  useTrainers,
  useUpdateModule,
  useUpdateObjectives,
} from '@/lib/modules';
import { useCertTemplate, useIssueModuleCertificates } from '@/lib/certificateTemplates';
import { useConfirm, useToast } from '@/components/ui';
import { CertificateDesignerModal } from './CertificateDesignerModal';
import { SyllabusBoard } from './SyllabusBoard';
import { LEVEL_OPTIONS, levelTone, titleCase, topicProgress } from './moduleUi';
import './modules.css';

export function ModuleDetailPage() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const orgView = useAuth((s) => s.orgView);
  // The super admin edits the master-template curriculum here, so they get the
  // same authoring powers as an org admin (topics, subtopics, details, etc.).
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  // …but a super admin editing the TEMPLATE (not drilled into an org) never assigns
  // trainers — trainers are per-org and assigned by that org's admin. Hide the panel.
  const editingTemplate = user?.role === UserRole.SUPER_ADMIN && !orgView;
  // A super admin drilled INTO an org can pull the master syllabus directly; a plain
  // org admin instead REQUESTS it (the super admin approves).
  const canImportSyllabus = user?.role === UserRole.SUPER_ADMIN && Boolean(orgView);
  const canRequestSyllabus = user?.role === UserRole.ADMIN;

  const { data: module, isLoading, isError, error, refetch } = useModule(id);

  if (isLoading && !module) {
    return (
      <>
        <PageHeader
          title={<Skeleton width="14rem" height="1.6rem" />}
          subtitle={
            <Link to="/app/modules" className="lms-muted">
              ← All modules
            </Link>
          }
        />
        <div style={{ marginTop: 'var(--space-6)' }}>
          <SkeletonText lines={4} />
        </div>
      </>
    );
  }
  if (isError || !module) {
    return (
      <>
        <PageHeader
          title="Module"
          subtitle={
            <Link to="/app/modules" className="lms-muted">
              ← All modules
            </Link>
          }
        />
        <ErrorState message={apiErrorMessage(error) || 'Module not found'} onRetry={refetch} />
      </>
    );
  }

  const assignedTrainers = module.assignedTrainers ?? [];
  const isAssignedTrainer =
    user?.role === UserRole.TRAINER && assignedTrainers.some((t) => t.id === user.id);
  const canEdit = isAdmin || isAssignedTrainer;
  const { done, total, pct } = topicProgress(module.topics);

  return (
    <>
      <PageHeader
        title={module.name}
        subtitle={
          <Link to="/app/modules" className="lms-muted">
            ← All modules
          </Link>
        }
      />

      <div className="module-card__meta" style={{ marginBottom: 'var(--space-6)' }}>
        <Badge tone="neutral">{module.code}</Badge>
        <Badge tone={levelTone(module.level)}>{titleCase(module.level)}</Badge>
        <span className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
          Syllabus {done}/{total} sections complete ({pct}%)
        </span>
        {module.archived && <Badge tone="neutral">Archived</Badge>}
        {isAdmin && <ModuleMetaEditor module={module} />}
      </div>

      {module.description && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p className="lms-secondary-text">{module.description}</p>
        </Card>
      )}

      {isAdmin && <CertificateTemplateCard moduleId={module.id} moduleName={module.name} moduleCode={module.code} />}

      <div className={`detail-grid${editingTemplate ? ' detail-grid--full' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <SyllabusBoard module={module} canEdit={canEdit} canImportFromMaster={canImportSyllabus} canRequestFromMaster={canRequestSyllabus} />
          <ObjectivesEditor module={module} canEdit={canEdit} />
        </div>
        {!editingTemplate && <TrainersPanel module={module} isAdmin={isAdmin} />}
      </div>
    </>
  );
}

// ── Module meta (admin) ───────────────────────────────────────────────────────

function ModuleMetaEditor({ module }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: module.name,
    code: module.code,
    level: module.level,
    description: module.description ?? '',
  });
  const [err, setErr] = useState('');
  const update = useUpdateModule();

  useEffect(() => {
    setForm({
      name: module.name,
      code: module.code,
      level: module.level,
      description: module.description ?? '',
    });
  }, [module]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({ id: module.id, ...form, code: form.code.toUpperCase() });
      setOpen(false);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <Modal
        open={open}
        title="Edit Module"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="edit-module-form" type="submit" loading={update.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="edit-module-form"
          onSubmit={save}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <Input
            label="Module name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Module code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Select
            label="Level"
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
            options={LEVEL_OPTIONS}
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>
    </>
  );
}

// ── Learning objectives ──────────────────────────────────────────────────────

function ObjectivesEditor({ module, canEdit }) {
  const [items, setItems] = useState(module.learningObjectives ?? []);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const update = useUpdateObjectives();

  useEffect(() => {
    setItems(module.learningObjectives ?? []);
    setDirty(false);
  }, [module]);

  function addItem() {
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft('');
    setDirty(true);
  }
  function removeItem(idx) {
    setItems(items.filter((_, i) => i !== idx));
    setDirty(true);
  }
  async function save() {
    await update.mutateAsync({ id: module.id, learningObjectives: items });
    setDirty(false);
  }

  return (
    <Card>
      <CardHeader title="Learning Objectives" />
      {items.length === 0 && <p className="lms-muted">No objectives defined yet.</p>}
      {items.map((obj, idx) => (
        <div className="objective-row" key={`${obj}-${idx}`}>
          <ChevronRight size={15} strokeWidth={2.5} style={{ color: 'var(--color-primary)', flex: 'none' }} />
          <span style={{ flex: 1 }}>{obj}</span>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>
              <X size={15} />
            </Button>
          )}
        </div>
      ))}

      {canEdit && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <Input
              placeholder="Add a learning objective…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem();
                }
              }}
            />
            <Button variant="outline" onClick={addItem}>
              Add
            </Button>
          </div>
          {dirty && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button onClick={save} loading={update.isPending}>
                Save objectives
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Assigned trainers (admin manages) ─────────────────────────────────────────

function TrainersPanel({ module, isAdmin }) {
  const assigned = module.assignedTrainers ?? [];
  const { data: trainers } = useTrainers();
  const [pick, setPick] = useState('');
  const assign = useAssignTrainer();
  const remove = useRemoveTrainer();
  const confirm = useConfirm();

  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = (trainers ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <Card>
      <CardHeader title="Assigned Trainers" subtitle="Trainers who manage this module's content" />

      {assigned.length === 0 && <p className="lms-muted">No trainers assigned.</p>}
      {assigned.map((t) => (
        <div className="objective-row" key={t.id}>
          <span style={{ flex: 1 }}>
            {t.name}
            <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
              {t.email}
            </div>
          </span>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => { if (await confirm({ title: `Remove ${t.name} from this module?`, message: 'They lose access to manage this module’s content.', confirmLabel: 'Remove', tone: 'danger' })) remove.mutate({ id: module.id, trainerId: t.id }); }}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      {isAdmin && (
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={[
              { value: '', label: available.length ? 'Select a trainer…' : 'No trainers available' },
              ...available.map((t) => ({ value: t.id, label: `${t.name} (${t.email})` })),
            ]}
          />
          <Button
            disabled={!pick}
            loading={assign.isPending}
            onClick={async () => {
              await assign.mutateAsync({ id: module.id, trainerId: pick });
              setPick('');
            }}
          >
            Assign trainer
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Admin: upload/manage this module's completion-certificate template. */
function CertificateTemplateCard({ moduleId, moduleName, moduleCode }) {
  const { data: tpl, isLoading } = useCertTemplate(moduleId);
  const issueAll = useIssueModuleCertificates();
  const toast = useToast();
  const [designing, setDesigning] = useState(false);

  async function issueToPassers() {
    try {
      const r = await issueAll.mutateAsync(moduleId);
      if (!r.hasFinal) toast.error('This module has no final test yet.');
      else toast.success(`${r.issued} certificate${r.issued === 1 ? '' : 's'} issued · ${r.totalPassed} student${r.totalPassed === 1 ? '' : 's'} passed the final.`);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  }

  return (
    <Card className="certcard">
      <div className="certcard__head">
        <span className="certcard__icon"><Award size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="certcard__title">Completion certificate</div>
          <div className="certcard__sub">Auto-issued to students who pass the {moduleName} final — their name (and, optionally, the certificate ID) is drawn onto your template.</div>
        </div>
        <span className={`certcard__status${tpl ? ' is-on' : ''}`}>{tpl ? 'Template ready' : 'Not set'}</span>
      </div>

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : (
        <>
          <div className="certcard__actions">
            <Button onClick={() => setDesigning(true)}>{tpl ? 'Design certificate' : 'Upload & design certificate'}</Button>
          </div>

          {/* Bulk issue */}
          <div className="certcard__issue">
            <div style={{ minWidth: 0 }}>
              <div className="certcard__issue-title">Issue to passed students</div>
              <div className="certcard__issue-sub">Sends this certificate to everyone who passed the final (score ≥ pass mark). Safe to run again anytime.</div>
            </div>
            <Button variant="secondary" onClick={issueToPassers} loading={issueAll.isPending}>Issue certificates</Button>
          </div>
        </>
      )}

      <CertificateDesignerModal
        open={designing}
        onClose={() => setDesigning(false)}
        moduleId={moduleId}
        moduleName={moduleName}
        moduleCode={moduleCode}
        tpl={tpl}
      />
    </Card>
  );
}
