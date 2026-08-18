import { useState } from 'react';
import { BookOpen, Check, ChevronRight, FileSpreadsheet, Library, ListChecks, Pencil, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, ErrorState, Input, Modal, SkeletonText, Textarea, useConfirm, useToast } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import {
  useAddTopic,
  useDeleteTopic,
  useImportSyllabusFromMaster,
  useMasterSyllabusPreview,
  useRequestMasterSyllabus,
  useUpdateTopic,
} from '@/lib/modules';
import { SubtopicsTable, SubtopicsHeader } from './SubtopicsTable';
import { AddSyllabusModal } from './AddSyllabusModal';

/**
 * Syllabus as a board of topic cards. Each card opens that topic's concepts
 * (subtopics + descriptions) and learning resources in a modal. Staff can bulk
 * import the whole syllabus from an Excel sheet ("Add syllabus").
 */
export function SyllabusBoard({ module, canEdit, canImportFromMaster = false, canRequestFromMaster = false }) {
  const [newTitle, setNewTitle] = useState('');
  const [editing, setEditing] = useState(null); // { topicId, title, description }
  const [openTopicId, setOpenTopicId] = useState(null);
  const [addSyllabusOpen, setAddSyllabusOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const addTopic = useAddTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const confirm = useConfirm();

  async function onDeleteTopic(topicId) {
    if (await confirm({ title: 'Delete this topic?', message: 'Its concepts and resource links will be removed.', confirmLabel: 'Delete', tone: 'danger' })) {
      deleteTopic.mutate({ id: module.id, topicId });
    }
  }

  // Derive the open topic from the live module so it stays fresh after edits.
  const openTopic = module.topics.find((t) => t.id === openTopicId) ?? null;

  async function add(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await addTopic.mutateAsync({ id: module.id, title: newTitle.trim() });
    setNewTitle('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    await updateTopic.mutateAsync({
      id: module.id,
      topicId: editing.topicId,
      title: editing.title,
      description: editing.description,
    });
    setEditing(null);
  }

  const saveSubtopics = (subtopics) =>
    updateTopic.mutateAsync({ id: module.id, topicId: openTopicId, subtopics });

  return (
    <Card>
      <div className="panel-head">
        <CardHeader
          title="Syllabus"
          subtitle="Click a topic to add its concepts, videos, documents, presentations & links"
        />
        {/* Bulk import sits up top, beside the title. */}
        {canEdit && (
          <Button onClick={() => setAddSyllabusOpen(true)} style={{ marginLeft: 'auto' }}>
            <FileSpreadsheet size={15} style={{ marginRight: 6 }} /> Add syllabus
          </Button>
        )}
      </div>

      {/* One tidy row: New topic, Add topic, View syllabus, Request syllabus. */}
      {(canEdit || canImportFromMaster || canRequestFromMaster) && (
        <div className="syllabus-toolbar">
          {canEdit && (
            <form className="add-inline" onSubmit={add}>
              <Input placeholder="New topic…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Button type="submit" variant="outline" loading={addTopic.isPending}>Add topic</Button>
            </form>
          )}
          {canImportFromMaster && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Library size={15} style={{ marginRight: 6 }} /> Import from Master
            </Button>
          )}
          {canRequestFromMaster && (
            <>
              <Button variant="outline" onClick={() => setViewOpen(true)}>
                <BookOpen size={15} style={{ marginRight: 6 }} /> View from Master
              </Button>
              <Button variant="outline" onClick={() => setRequestOpen(true)}>
                <Library size={15} style={{ marginRight: 6 }} /> Request from Master
              </Button>
            </>
          )}
        </div>
      )}

      {module.topics.length === 0 ? (
        <p className="lms-muted">No topics yet. Add a topic, or import the whole syllabus from Excel with “Add syllabus”.</p>
      ) : (
        <div className="topic-board">
          {module.topics.map((t) => {
            const subs = t.subtopics?.length ?? 0;
            return (
              <div
                className="topic-card"
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenTopicId(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpenTopicId(t.id); }}
              >
                {/* Row 1 — book icon + topic name (wraps to max 2 lines) */}
                <div className="topic-card__head">
                  <span className="topic-card__icon"><BookOpen size={16} strokeWidth={2} /></span>
                  <div className="topic-card__title">{t.title}</div>
                </div>
                {/* Row 2 — concepts count */}
                <div className="topic-card__row">
                  <span className="topic-card__count">
                    <ListChecks size={13} /> {subs} concept{subs === 1 ? '' : 's'}
                  </span>
                </div>
                {/* Row 3 — topic actions (edit / delete) */}
                {canEdit && (
                <div className="topic-card__row topic-card__row--last">
                  <span />
                  <span className="topic-card__actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit topic"
                        onClick={() => setEditing({ topicId: t.id, title: t.title, description: t.description ?? '' })}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        title="Delete topic"
                        onClick={() => onDeleteTopic(t.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                  </span>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-topic concepts */}
      <Modal
        open={Boolean(openTopic)}
        title={openTopic ? openTopic.title : ''}
        size="xl"
        onClose={() => setOpenTopicId(null)}
      >
        {openTopic && (
          <section>
            <SubtopicsHeader count={openTopic.subtopics?.length ?? 0} />
            <SubtopicsTable
              subtopics={openTopic.subtopics ?? []}
              canEdit={canEdit}
              onSave={saveSubtopics}
              saving={updateTopic.isPending}
            />
          </section>
        )}
      </Modal>

      {/* Bulk syllabus import (Excel) */}
      <Modal open={addSyllabusOpen} title="Add syllabus from Excel" size="lg" onClose={() => setAddSyllabusOpen(false)}>
        <AddSyllabusModal module={module} onClose={() => setAddSyllabusOpen(false)} />
      </Modal>

      {/* Preview the master syllabus, then import on confirm. */}
      {previewOpen && (
        <MasterSyllabusPreviewModal moduleId={module.id} onClose={() => setPreviewOpen(false)} />
      )}

      {/* Org admin: view the master syllabus first, then request it if it looks good. */}
      {viewOpen && (
        <ViewMasterSyllabusModal moduleId={module.id} onClose={() => setViewOpen(false)} onRequest={() => setRequestOpen(true)} />
      )}

      {/* Org admin: request the master syllabus (super admin approves it). */}
      {requestOpen && (
        <RequestMasterSyllabusModal moduleId={module.id} moduleName={module.name} onClose={() => setRequestOpen(false)} />
      )}

      {/* Edit topic */}
      <Modal
        open={Boolean(editing)}
        title="Edit Topic"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button form="edit-topic-form" type="submit" loading={updateTopic.isPending}>Save</Button>
          </>
        }
      >
        {editing && (
          <form id="edit-topic-form" onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            <Textarea label="Description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </form>
        )}
      </Modal>
    </Card>
  );
}

// ── Org admin: request the master syllabus ───────────────────────────────────────

function RequestMasterSyllabusModal({ moduleId, moduleName, onClose }) {
  const request = useRequestMasterSyllabus();
  const toast = useToast();
  const [note, setNote] = useState('');

  async function send() {
    try {
      await request.mutateAsync({ id: moduleId, note: note.trim() || undefined });
      toast.success('Request sent to the super admin for approval.');
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <Modal
      open
      title="Request syllabus from Master"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={request.isPending} onClick={send}>Send request</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p className="lms-secondary-text" style={{ margin: 0 }}>
          Ask the super admin to import the master syllabus for <strong>{moduleName}</strong> onto this module.
          They'll review and approve it — on approval, its topics, subtopics and descriptions land here.
        </p>
        <Textarea
          label="Note to the super admin (optional)"
          placeholder="e.g. We'd like the latest topics for this module."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ── Master syllabus: view / preview + import ─────────────────────────────────────

/** Presentational: the master syllabus (description, objectives, topics, subtopics). */
function SyllabusPreview({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {data.description && (
        <div>
          <div className="field__label">Module description</div>
          <p className="lms-secondary-text" style={{ margin: 0 }}>{data.description}</p>
        </div>
      )}
      {data.learningObjectives?.length > 0 && (
        <div>
          <div className="field__label">Learning objectives ({data.learningObjectives.length})</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {data.learningObjectives.map((o, i) => <li key={i} className="lms-secondary-text">{o}</li>)}
          </ul>
        </div>
      )}
      {data.topics.length === 0 ? (
        <p className="lms-muted">The master syllabus for this module is empty.</p>
      ) : (
        <div className="syllabus-preview">
          {data.topics.map((t, i) => (
            <div key={i} className="syllabus-preview__topic">
              <div className="syllabus-preview__topic-title">
                <BookOpen size={15} /> <strong>{i + 1}. {t.title}</strong>
                {t.subtopics.length > 0 && (
                  <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                    · {t.subtopics.length} subtopic{t.subtopics.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {t.description && <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: '2px 0 0 22px' }}>{t.description}</div>}
              {t.subtopics.length > 0 && (
                <ul className="syllabus-preview__subs">
                  {t.subtopics.map((s, j) => (
                    <li key={j}>
                      <ChevronRight size={13} style={{ color: 'var(--color-primary)', flex: 'none' }} />
                      <span>{s.title}{s.description ? <span className="lms-muted"> — {s.description}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Super admin (drilled in): preview the master syllabus, then import (replaces). */
function MasterSyllabusPreviewModal({ moduleId, onClose }) {
  const { data, isLoading, isError, error, refetch } = useMasterSyllabusPreview(moduleId, true);
  const importSyllabus = useImportSyllabusFromMaster();
  const toast = useToast();

  async function apply() {
    try {
      await importSyllabus.mutateAsync(moduleId);
      toast.success('Master syllabus imported.');
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <Modal
      open
      title="Import syllabus from Master"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={isLoading || isError || !data} loading={importSyllabus.isPending} onClick={apply}>
            <Check size={15} style={{ marginRight: 6 }} /> Import &amp; replace
          </Button>
        </>
      }
    >
      {isLoading ? <SkeletonText lines={6} /> : isError ? <ErrorState message={apiErrorMessage(error)} onRetry={refetch} /> : data ? (
        <>
          <p className="lms-secondary-text" style={{ margin: '0 0 var(--space-4)' }}>
            The master has <strong>{data.topicCount}</strong> topic{data.topicCount === 1 ? '' : 's'} and{' '}
            <strong>{data.subtopicCount}</strong> subtopic{data.subtopicCount === 1 ? '' : 's'}. Importing{' '}
            <strong>replaces this module’s current syllabus</strong> with the one below.
          </p>
          <SyllabusPreview data={data} />
        </>
      ) : null}
    </Modal>
  );
}

/** Org admin: VIEW the master syllabus first; if it looks good, request it. */
function ViewMasterSyllabusModal({ moduleId, onClose, onRequest }) {
  const { data, isLoading, isError, error, refetch } = useMasterSyllabusPreview(moduleId, true);
  return (
    <Modal
      open
      title="Master syllabus"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={isLoading || isError || !data} onClick={() => { onClose(); onRequest(); }}>
            <Library size={15} style={{ marginRight: 6 }} /> Request from Master
          </Button>
        </>
      }
    >
      {isLoading ? <SkeletonText lines={6} /> : isError ? <ErrorState message={apiErrorMessage(error)} onRetry={refetch} /> : data ? (
        <>
          <p className="lms-secondary-text" style={{ margin: '0 0 var(--space-4)' }}>
            This is the master syllabus for this module — <strong>{data.topicCount}</strong> topic{data.topicCount === 1 ? '' : 's'} and{' '}
            <strong>{data.subtopicCount}</strong> subtopic{data.subtopicCount === 1 ? '' : 's'}. If it looks good, request it and the super admin can import it here.
          </p>
          <SyllabusPreview data={data} />
        </>
      ) : null}
    </Modal>
  );
}
