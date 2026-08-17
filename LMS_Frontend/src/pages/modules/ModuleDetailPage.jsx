import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Target, Users, X } from 'lucide-react';
import { UserRole } from '@/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
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
import { SyllabusBoard } from './SyllabusBoard';
import { LEVEL_OPTIONS, levelTone, titleCase, topicProgress } from './moduleUi';
import './modules.css';

export function ModuleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === UserRole.ADMIN;

  const { data: module, isLoading, isError, error, refetch } = useModule(id);

  // Clean, visible back control. Students came from My Curriculum; staff from My Modules.
  const backTo = user?.role === UserRole.STUDENT ? '/app/curriculum' : '/app/modules';
  const backBtn = (
    <button type="button" className="page-back" onClick={() => navigate(backTo)}>
      <ChevronLeft size={15} /> Back
    </button>
  );

  if (isLoading && !module) {
    return (
      <>
        <PageHeader
          title={<Skeleton width="14rem" height="1.75rem" />}
          subtitle={backBtn}
        />
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </>
    );
  }
  if (isError || !module) {
    return <ErrorState message={apiErrorMessage(error) || 'Module not found'} onRetry={refetch} />;
  }

  const assignedTrainers = module.assignedTrainers ?? [];
  const isAssignedTrainer =
    user?.role === UserRole.TRAINER && assignedTrainers.some((t) => t.id === user.id);
  const canEdit = isAdmin || isAssignedTrainer;
  const { total } = topicProgress(module.topics);

  return (
    <>
      <PageHeader
        title={module.name}
        subtitle={backBtn}
      />

      <div className="module-card__meta" style={{ marginBottom: 'var(--space-6)' }}>
        <Badge tone="neutral">{module.code}</Badge>
        <Badge tone={levelTone(module.level)}>{titleCase(module.level)}</Badge>
        <span className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
          {total} syllabus section{total === 1 ? '' : 's'}
        </span>
        {module.archived && <Badge tone="neutral">Archived</Badge>}
        {isAdmin && <ModuleMetaEditor module={module} />}
      </div>

      {module.description && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p className="lms-secondary-text">{module.description}</p>
        </Card>
      )}

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <SyllabusBoard module={module} canEdit={canEdit} canMarkTaught={false} />
          <ObjectivesEditor module={module} canEdit={canEdit} />
        </div>
        <TrainersPanel module={module} isAdmin={isAdmin} />
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
      {items.length === 0 && (
        <EmptyState icon={<Target size={26} />} title="No objectives yet" description="No objectives defined yet." />
      )}
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
  // Only admins can call the (admin-only) /users endpoint that backs the picker;
  // for students/trainers we still show the assigned list from the module itself.
  const { data: trainers } = useTrainers({ enabled: isAdmin });
  const [pick, setPick] = useState('');
  const assign = useAssignTrainer();
  const remove = useRemoveTrainer();

  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = (trainers ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <Card>
      <CardHeader title="Assigned Trainers" subtitle="Trainers who manage this module's content" />

      {assigned.length === 0 && (
        <EmptyState icon={<Users size={26} />} title="No trainers assigned" description="No trainers assigned." />
      )}
      {assigned.map((t) => (
        <div className="objective-row" key={t.id}>
          <span style={{ flex: 1 }}>
            {t.name}
            <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
              <a href={`mailto:${t.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.email}</a>
            </div>
          </span>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove.mutate({ id: module.id, trainerId: t.id })}
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
