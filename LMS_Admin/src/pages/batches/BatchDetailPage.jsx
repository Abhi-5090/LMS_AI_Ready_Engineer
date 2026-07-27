import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Trash2, UploadCloud, X } from 'lucide-react';
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
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { BulkUploadUsers } from '@/components/BulkUploadUsers';
import { UserSearchSelect } from '@/components/UserSearchSelect';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  useAssignModules,
  useAssignStudents,
  useBatch,
  useRemoveModule,
  useRemoveStudent,
  useSetModuleTrainers,
  useUpdateBatch,
} from '@/lib/batches';
import { formatDateRange, toDateInput } from '@/lib/format';
import { useModules } from '@/lib/modules';
import '../modules/modules.css';

export function BatchDetailPage() {
  const { id } = useParams();
  const isAdmin = useAuth((s) => s.user?.role) === UserRole.ADMIN;
  const { data: batch, isLoading, isError, error, refetch } = useBatch(id);

  if (isLoading && !batch) {
    return (
      <>
        <PageHeader
          title={<Skeleton width="14rem" height="1.6rem" />}
          subtitle={
            <Link to="/app/batches" className="lms-muted">
              ← All batches
            </Link>
          }
        />
        <div style={{ marginTop: 'var(--space-6)' }}>
          <SkeletonText lines={4} />
        </div>
      </>
    );
  }
  if (isError || !batch) {
    return (
      <>
        <PageHeader
          title="Batch"
          subtitle={
            <Link to="/app/batches" className="lms-muted">
              ← All batches
            </Link>
          }
        />
        <ErrorState message={apiErrorMessage(error) || 'Batch not found'} onRetry={refetch} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={
          <Link to="/app/batches" className="lms-muted">
            ← All batches
          </Link>
        }
      />

      <div className="module-card__meta" style={{ marginBottom: 'var(--space-6)' }}>
        <Badge tone="neutral">{batch.code}</Badge>
        <span className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
          {formatDateRange(batch.startDate, batch.endDate)}
        </span>
        {batch.archived && <Badge tone="neutral">Archived</Badge>}
        {isAdmin && <EditBatch batch={batch} />}
      </div>

      <div className="batch-panels">
        <StudentsPanel batch={batch} isAdmin={isAdmin} />
        <ModuleTrainersPanel batch={batch} isAdmin={isAdmin} />
      </div>
    </>
  );
}

// ── Reusable assignment panel ──────────────────────────────────────────────────

function diff(all, assigned) {
  const ids = new Set(assigned.map((a) => a.id));
  return (all ?? []).filter((a) => !ids.has(a.id));
}

function StudentsPanel({ batch, isAdmin }) {
  const assign = useAssignStudents();
  const remove = useRemoveStudent();
  const qc = useQueryClient();
  const toast = useToast();
  const [bulk, setBulk] = useState(false);

  const enrolled = batch.students ?? [];
  const enrolledIds = enrolled.map((s) => s.id);

  async function addStudent(user) {
    try {
      await assign.mutateAsync({ id: batch.id, ids: [user.id] });
      toast.success(`${user.name} added to the batch.`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <>
      <Card>
        <div className="panel-head">
          <CardHeader title={`Students (${enrolled.length})`} subtitle="Each student belongs to exactly one batch" />
          {isAdmin && (
            // A search box (by name or email) instead of a dropdown — scales to
            // thousands of students without an unusable, mile-long list.
            <div className="add-inline" style={{ flex: '1 1 18rem' }}>
              <UserSearchSelect
                role="student"
                excludeIds={enrolledIds}
                disabled={assign.isPending}
                placeholder="Search students by name or email…"
                onPick={addStudent}
              />
            </div>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setBulk(true)}>
              <UploadCloud size={15} style={{ marginRight: 6 }} /> Bulk upload
            </Button>
          )}
        </div>

        {enrolled.length === 0 ? (
          <p className="lms-muted" style={{ margin: 0 }}>No students enrolled yet.</p>
        ) : (
          <div className="member-scroll">
            <table className="table member-table">
              <thead><tr><th className="member-table__no">#</th><th>Name</th><th>Email</th>{isAdmin && <th className="member-table__no" />}</tr></thead>
              <tbody>
                {enrolled.map((s, i) => (
                  <tr key={s.id}>
                    <td className="member-table__no">{i + 1}</td>
                    <td>{s.name}</td>
                    <td className="lms-muted">{s.email}</td>
                    {isAdmin && (
                      <td className="member-table__no">
                        <button type="button" className="chip__x member-table__x" aria-label={`Remove ${s.name}`} onClick={() => remove.mutateAsync({ id: batch.id, memberId: s.id })}>
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={bulk} title="Bulk upload students to this batch" onClose={() => setBulk(false)}>
        <BulkUploadUsers
          batchId={batch.id}
          lockRole
          onClose={() => setBulk(false)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ['batches'] })}
        />
      </Modal>
    </>
  );
}

// ── Modules & Trainers mapping (who delivers each module in this batch) ────────

/** Trainers currently mapped to a given module in this batch. */
function trainersForModule(batch, moduleId) {
  const entry = (batch.moduleTrainers ?? []).find((mt) => (mt.module?.id ?? mt.module) === moduleId);
  return entry?.trainers ?? [];
}

function ModuleTrainersPanel({ batch, isAdmin }) {
  const { data: allModules, isLoading: modLoading } = useModules();
  const assignModule = useAssignModules();
  const [pickModule, setPickModule] = useState('');

  const modules = (batch.modules ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const availableModules = diff(allModules, modules);
  const moduleNoneText = modLoading
    ? 'Loading…'
    : (allModules?.length ?? 0) === 0
      ? 'No modules yet — create them in Modules'
      : 'All modules already added';

  return (
    <Card>
      <div className="panel-head">
        <CardHeader title="Modules & Trainers" subtitle="Pick a module, then assign the trainers who deliver it" />
        {isAdmin && (
          <div className="add-inline add-inline--right">
            <Select
              value={pickModule}
              onChange={(e) => setPickModule(e.target.value)}
              options={[
                { value: '', label: availableModules.length ? 'Add a module to this batch…' : moduleNoneText },
                ...availableModules.map((m) => ({ value: m.id, label: `${m.order}. ${m.name} (${m.code})` })),
              ]}
            />
            <Button
              disabled={!pickModule}
              loading={assignModule.isPending}
              onClick={async () => {
                await assignModule.mutateAsync({ id: batch.id, ids: [pickModule] });
                setPickModule('');
              }}
            >
              Add module
            </Button>
          </div>
        )}
      </div>

      {modules.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} />}
          title="No modules in this batch yet"
          description={isAdmin ? 'Add a module above to start mapping trainers.' : 'No modules in this batch yet.'}
        />
      ) : (
        <div className="map-grid">
          {modules.map((m) => (
            <ModuleRow
              key={m.id}
              batch={batch}
              module={m}
              assignedTrainers={trainersForModule(batch, m.id)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ModuleRow({ batch, module, assignedTrainers, isAdmin }) {
  const setTrainers = useSetModuleTrainers();
  const removeModule = useRemoveModule();
  const toast = useToast();

  // Assigned trainers can arrive as populated objects or bare ids, and an
  // anonymized/removed account can surface without a usable id. Normalize to real
  // trainers with a string id so we never send null/undefined — JSON turns an
  // undefined array element into null, which the API rejects (trainerIds.0).
  const assigned = (assignedTrainers ?? [])
    .filter(Boolean)
    .map((t) => (typeof t === 'string' ? { id: t, name: 'Trainer' } : t))
    .filter((t) => typeof t.id === 'string' && t.id.length > 0);
  const currentIds = assigned.map((t) => t.id);

  // Add any number of trainers to this module: pick from a search over ALL org
  // trainers (already-assigned ones are excluded), appending each to the set.
  const save = (trainerIds, okMsg) =>
    setTrainers.mutateAsync({ id: batch.id, moduleId: module.id, trainerIds })
      .then(() => { if (okMsg) toast.success(okMsg); })
      .catch((e) => toast.error(apiErrorMessage(e)));

  const addTrainer = (tid) => {
    if (!tid || currentIds.includes(tid)) return undefined;
    return save([...currentIds, tid], 'Trainer assigned to this module.');
  };
  const removeTrainer = (tid) => save(currentIds.filter((x) => x !== tid), 'Trainer removed from this module.');

  return (
    <div className="map-row">
      {/* Module name (left) + Remove button (top-right corner) */}
      <div className="map-row__head">
        <div className="map-row__title">
          <strong>{module.order}. {module.name}</strong>
          <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{module.code}</span>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="tile-remove"
            title="Remove module"
            aria-label={`Remove ${module.name}`}
            onClick={() => removeModule.mutateAsync({ id: batch.id, memberId: module.id })}
          >
            <Trash2 size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="map-row__add">
          <UserSearchSelect
            role="trainer"
            excludeIds={currentIds}
            placeholder="Search trainers by name or email…"
            disabled={setTrainers.isPending}
            onPick={(u) => addTrainer(u.id)}
          />
        </div>
      )}

      <div className="map-row__chips">
        {assigned.length === 0 && (
          <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>No trainers assigned yet.</span>
        )}
        {assigned.map((t) => (
          <span className="chip" key={t.id}>
            {t.name}
            {isAdmin && (
              <button type="button" className="chip__x" aria-label={`Remove ${t.name}`} onClick={() => removeTrainer(t.id)}>
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Edit batch (admin) ─────────────────────────────────────────────────────────

function EditBatch({ batch }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: batch.name,
    code: batch.code,
    startDate: toDateInput(batch.startDate),
    endDate: toDateInput(batch.endDate),
  });
  const [err, setErr] = useState('');
  const update = useUpdateBatch();

  useEffect(() => {
    setForm({
      name: batch.name,
      code: batch.code,
      startDate: toDateInput(batch.startDate),
      endDate: toDateInput(batch.endDate),
    });
  }, [batch]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({ id: batch.id, ...form, code: form.code.toUpperCase() });
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
        title="Edit Batch"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="edit-batch-form" type="submit" loading={update.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="edit-batch-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Batch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Batch code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Input label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            <Input label="End date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          </div>
          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>
    </>
  );
}
