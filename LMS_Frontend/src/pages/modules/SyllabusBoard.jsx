import { useState } from 'react';
import { BookOpen, Check, FileSpreadsheet, Layers, LayoutGrid, ListChecks, Pencil, Table2, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, Modal, Textarea, useConfirm } from '@/components/ui';
import {
  useAddTopic,
  useDeleteTopic,
  useSetTopicCompletion,
  useUpdateTopic,
} from '@/lib/modules';
import { useResources } from '@/lib/resources';
import { TopicResources } from './TopicResources';
import { SubtopicsTable, SubtopicsHeader } from './SubtopicsTable';
import { AddSyllabusModal } from './AddSyllabusModal';

/**
 * Syllabus as a board of topic cards. Each card opens that topic's learning
 * resources (videos/docs/presentations/assignments/links) in a modal — so
 * resources are added per topic, not per whole module.
 */
export function SyllabusBoard({ module, canEdit, canMarkTaught = true }) {
  const confirm = useConfirm();
  const [newTitle, setNewTitle] = useState('');
  const [editing, setEditing] = useState(null); // { topicId, title, description }
  const [openTopicId, setOpenTopicId] = useState(null);
  const [addSyllabusOpen, setAddSyllabusOpen] = useState(false);
  const [resView, setResView] = useState('grid'); // 'grid' | 'table'
  const addTopic = useAddTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const setCompletion = useSetTopicCompletion();
  const { data: resources } = useResources(module.id);

  // Derive the open topic from the live module so it stays fresh after edits.
  const openTopic = module.topics.find((t) => t.id === openTopicId) ?? null;
  const countFor = (topicId) => (resources ?? []).filter((r) => (r.topic ?? null) === topicId).length;
  const saveSubtopics = ({ subtopics, contentDeliverables }) =>
    updateTopic.mutateAsync({ id: module.id, topicId: openTopicId, subtopics, contentDeliverables });

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

  return (
    <Card>
      <div className="panel-head">
        <CardHeader
          title="Syllabus"
          subtitle="Click a topic to add its videos, documents, presentations, assignments & links"
        />
        {canEdit && (
          <Button onClick={() => setAddSyllabusOpen(true)} style={{ marginLeft: 'auto' }}>
            <FileSpreadsheet size={15} style={{ marginRight: 6 }} /> Add syllabus
          </Button>
        )}
      </div>

      {canEdit && (
        <form className="add-inline" onSubmit={add} style={{ marginBottom: 'var(--space-5)', justifyContent: 'flex-start', flex: '0 0 auto' }}>
          <Input placeholder="New topic…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Button type="submit" variant="outline" loading={addTopic.isPending}>Add topic</Button>
        </form>
      )}

      {module.topics.length === 0 ? (
        <p className="lms-muted">No topics yet. Add a topic, or import the whole syllabus from Excel with “Add syllabus”.</p>
      ) : (
        <div className="topic-board">
          {module.topics.map((t) => {
            const count = countFor(t.id);
            const subs = t.subtopics?.length ?? 0;
            return (
              <div
                className={`topic-card${canMarkTaught && t.completed ? ' topic-card--done' : ''}`}
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
                {/* Row 2 — concepts count (+ taught badge) */}
                <div className="topic-card__row">
                  <span className="topic-card__count">
                    <ListChecks size={13} /> {subs} concept{subs === 1 ? '' : 's'}
                  </span>
                  {canMarkTaught && t.completed && (
                    <span className="topic-card__done"><Check size={12} strokeWidth={3} /> Taught</span>
                  )}
                </div>
                {/* Row 3 — materials count + actions */}
                <div className="topic-card__row topic-card__row--last">
                  <span className="topic-card__count">
                    <Layers size={13} /> {count} material{count === 1 ? '' : 's'}
                  </span>
                  {canEdit && (
                    <span className="topic-card__actions" onClick={(e) => e.stopPropagation()}>
                      {canMarkTaught && (
                        <button
                          type="button"
                          className={`icon-btn${t.completed ? ' icon-btn--on' : ''}`}
                          title={t.completed ? 'Mark not taught' : 'Mark taught'}
                          onClick={() => setCompletion.mutate({ id: module.id, topicId: t.id, completed: !t.completed })}
                        >
                          <Check size={14} />
                        </button>
                      )}
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
                        onClick={async () => { if (await confirm({ title: 'Delete this topic?', tone: 'danger', confirmLabel: 'Delete' })) deleteTopic.mutate({ id: module.id, topicId: t.id }); }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-topic concepts + resources */}
      <Modal
        open={Boolean(openTopic)}
        size="xl"
        title={openTopic ? openTopic.title : ''}
        onClose={() => setOpenTopicId(null)}
        headerAction={
          <button
            type="button"
            className="modal__action"
            title={resView === 'grid' ? 'Switch to table view' : 'Switch to grid view'}
            aria-label="Toggle view"
            onClick={() => setResView((v) => (v === 'grid' ? 'table' : 'grid'))}
          >
            {resView === 'grid' ? <Table2 size={16} /> : <LayoutGrid size={16} />}
          </button>
        }
      >
        {openTopic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <section>
              <SubtopicsHeader count={openTopic.subtopics?.length ?? 0} />
              <SubtopicsTable
                subtopics={openTopic.subtopics ?? []}
                contentDeliverables={openTopic.contentDeliverables ?? ''}
                canEdit={canEdit}
                onSave={saveSubtopics}
                saving={updateTopic.isPending}
              />
            </section>
            <section>
              <TopicResources module={module} topic={openTopic} canEdit={canEdit} view={resView} />
            </section>
          </div>
        )}
      </Modal>

      {/* Bulk syllabus import (Excel) */}
      <Modal open={addSyllabusOpen} title="Add syllabus from Excel" size="lg" onClose={() => setAddSyllabusOpen(false)}>
        <AddSyllabusModal module={module} onClose={() => setAddSyllabusOpen(false)} />
      </Modal>

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
