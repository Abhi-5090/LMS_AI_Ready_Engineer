import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '@/shared';
import { BookOpen } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Select, SkeletonCards, Textarea, useConfirm } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useArchiveModule, useCreateModule, useModules } from '@/lib/modules';
import { LEVEL_OPTIONS, levelTone, titleCase, topicProgress } from './moduleUi';
import './modules.css';

const EMPTY = { name: '', code: '', level: 'beginner', description: '' };

export function ModulesPage() {
  const confirm = useConfirm();
  const role = useAuth((s) => s.user?.role);
  const isAdmin = role === UserRole.ADMIN;
  const navigate = useNavigate();

  const [showArchived, setShowArchived] = useState(false);
  const { data: modules, isLoading, isError, error, refetch } = useModules({ archived: showArchived });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const createModule = useCreateModule();
  const archiveModule = useArchiveModule();

  const subtitle = {
    [UserRole.ADMIN]: 'Create and manage the AI Ready Engineer curriculum.',
    [UserRole.TRAINER]: 'Modules assigned to you. Manage their syllabus and resources.',
    [UserRole.STUDENT]: 'Your structured learning path from Beginner to Expert.',
  }[role];

  async function submitCreate(e) {
    e.preventDefault();
    setFormError('');
    try {
      const created = await createModule.mutateAsync({
        ...form,
        code: form.code.toUpperCase(),
      });
      setCreating(false);
      setForm(EMPTY);
      navigate(`/app/modules/${created.id}`);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  async function onArchive(e, id) {
    e.stopPropagation();
    if (!(await confirm({ title: 'Archive this module?', message: 'It will be hidden from active curriculum.', confirmLabel: 'Archive' }))) return;
    await archiveModule.mutateAsync(id);
  }

  return (
    <>
      <PageHeader title={isAdmin ? 'Modules' : 'My Modules'} subtitle={subtitle} />

      <div className="toolbar">
        {isAdmin && (
          <label className="lms-secondary-text" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        )}
        <span />
        {isAdmin && <Button onClick={() => setCreating(true)}>+ New Module</Button>}
      </div>

      {isError && <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />}

      {isLoading && !modules ? (
        <SkeletonCards count={6} height="11rem" />
      ) : modules && modules.length === 0 ? (
        isAdmin ? (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No modules yet"
            description="Create one, or run the seed script to load the default 10-module curriculum."
            action={<Button onClick={() => setCreating(true)}>+ New Module</Button>}
          />
        ) : (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No modules assigned"
            description="No modules are assigned to you yet."
          />
        )
      ) : (
        <div className="module-grid">
          {modules?.map((m) => {
            const { total } = topicProgress(m.topics);
            return (
              <Card key={m.id} hover className="module-card" onClick={() => navigate(`/app/modules/${m.id}`)}>
                <div className="module-card__top">
                  <span className="module-card__order">{m.order}</span>
                  <div className="module-card__meta">
                    <Badge tone={levelTone(m.level)}>{titleCase(m.level)}</Badge>
                    {m.archived && <Badge tone="neutral">Archived</Badge>}
                  </div>
                </div>
                <div>
                  <div className="module-card__name">{m.name}</div>
                  <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                    {m.code}
                  </div>
                </div>
                <div>
                  <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {total} syllabus section{total === 1 ? '' : 's'}
                  </div>
                </div>
                {isAdmin && (
                  <div className="list-actions">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/app/modules/${m.id}`); }}>
                      Manage
                    </Button>
                    {!m.archived && (
                      <Button size="sm" variant="ghost" onClick={(e) => onArchive(e, m.id)}>
                        Archive
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        title="New Module"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button form="create-module-form" type="submit" loading={createModule.isPending}>
              Create
            </Button>
          </>
        }
      >
        <form id="create-module-form" onSubmit={submitCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Module name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Prompt Engineering"
            required
          />
          <Input
            label="Module code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="e.g. PE"
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
            placeholder="What this module covers…"
          />
          {formError && <span className="field__error">{formError}</span>}
        </form>
      </Modal>
    </>
  );
}
