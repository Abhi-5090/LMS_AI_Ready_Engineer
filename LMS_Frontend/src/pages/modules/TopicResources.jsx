import { useEffect, useState } from 'react';
import { BookOpen, Film, Link2, Lock, Plus, PencilLine, Trash2 } from 'lucide-react';
import { ResourceType, UserRole } from '@/shared';
import { Button, Input, Modal, Select, SkeletonText, useConfirm } from '@/components/ui';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArticleReader } from '@/components/ArticleReader';
import { ArticleEditor } from '@/components/ArticleEditor';
import { useAddResource, useDeleteResource, useResources, useUpdateResource } from '@/lib/resources';

// Materials are Videos, Articles (markdown), and Links only.
const TYPE_META = [
  { value: ResourceType.VIDEO, label: 'Videos', single: 'Video', Icon: Film },
  { value: ResourceType.ARTICLE, label: 'Articles', single: 'Article', Icon: BookOpen },
  { value: ResourceType.LINK, label: 'Links', single: 'Link', Icon: Link2 },
];
const TYPE_OPTIONS = TYPE_META.map((t) => ({ value: t.value, label: t.single }));
const BLANK = { type: ResourceType.VIDEO, title: '', source: 'file', url: '', file: null, content: '' };

/**
 * Learning resources for ONE topic — Videos, Articles (markdown, read in a modal),
 * and Links. Scoped to the topic via `resource.topic`.
 */
export function TopicResources({ module, topic, canEdit, view = 'grid' }) {
  const confirm = useConfirm();
  const { data: all, isLoading } = useResources(module.id);
  const role = useAuth((s) => s.user?.role);
  const isStudent = role === UserRole.STUDENT;
  const add = useAddResource();
  const del = useDeleteResource();
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState('');
  const [viewing, setViewing] = useState(null); // article being read
  const [editing, setEditing] = useState(null); // article being edited

  const resources = (all ?? []).filter((r) => (r.topic ?? null) === topic.id);
  const byType = TYPE_META.map((t) => ({ ...t, items: resources.filter((r) => r.type === t.value) }));

  const removeResource = async (r) => {
    if (await confirm({ title: 'Delete this resource?', tone: 'danger', confirmLabel: 'Delete' })) del.mutate({ id: r.id, module: module.id });
  };

  // For students, the backend only returns resources of topics the trainer has
  // marked taught in their batch. If none come back, the topic isn't released.
  if (isStudent && !isLoading && resources.length === 0) {
    return (
      <div className="topic-res" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-2)' }}>
        <Lock size={28} style={{ color: 'var(--color-text-muted)' }} />
        <p className="lms-muted" style={{ marginTop: 'var(--space-3)' }}>
          Your trainer hasn&apos;t covered this topic yet. Its resources will appear here once
          they mark it taught in class.
        </p>
      </div>
    );
  }

  const isArticle = form.type === ResourceType.ARTICLE;
  const isLink = form.type === ResourceType.LINK;
  const useUrl = isLink || form.source === 'link';

  /** A resource's clickable title — articles open a reader; others open the file/link. */
  function ResTitle({ r, className }) {
    if (r.type === ResourceType.ARTICLE) {
      return (
        <button type="button" className={className} style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit' }} onClick={() => setViewing(r)}>
          {r.title}
        </button>
      );
    }
    return <a href={fileSrc(r.url)} target="_blank" rel="noreferrer" className={className}>{r.title}</a>;
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.title.trim()) return setErr('Enter a title.');
    if (isArticle) {
      if (!form.content.trim()) return setErr('Write the article, or upload a markdown file.');
    } else if (useUrl && !form.url.trim()) {
      return setErr('Enter a URL.');
    } else if (!useUrl && !form.file) {
      return setErr('Choose a file to upload.');
    }
    try {
      await add.mutateAsync({
        module: module.id,
        topic: topic.id,
        type: form.type,
        title: form.title.trim(),
        ...(isArticle
          ? { content: form.content }
          : { url: useUrl ? form.url.trim() : undefined, file: useUrl ? undefined : form.file }),
      });
      setForm(BLANK);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <div className="topic-res">
      {canEdit && (
        <p className="lms-muted" style={{ marginTop: 0, fontSize: 'var(--font-size-sm)' }}>
          Resources added here are shown to learners under <strong>{topic.title}</strong> — but only
          after you mark this topic taught in a batch.
        </p>
      )}

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : view === 'table' ? (
        <div className="table-wrap res-table-wrap">
          <table className="table res-table">
            <thead>
              <tr><th>Type</th><th>Resource</th>{canEdit && <th aria-label="Actions" />}</tr>
            </thead>
            <tbody>
              {resources.length === 0 ? (
                <tr><td colSpan={canEdit ? 3 : 2} className="lms-muted" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>No resources for this topic yet.</td></tr>
              ) : (
                // Grouped by type (same order as the cards view) → one clean row each.
                byType.flatMap((t) => t.items).map((r) => {
                  const meta = byType.find((t) => t.value === r.type);
                  const Icon = meta?.Icon;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="res-type">{Icon && <Icon size={14} strokeWidth={2} />} {meta?.single ?? r.type}</span>
                      </td>
                      <td><ResTitle r={r} className="res-table__link" /></td>
                      {canEdit && (
                        <td>
                          <div className="res-table__actions">
                            {r.type === ResourceType.ARTICLE && (
                              <button type="button" className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                                <PencilLine size={14} />
                              </button>
                            )}
                            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${r.title}`} onClick={() => removeResource(r)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="topic-res__groups">
          {TYPE_META.map(({ value, label, Icon }) => {
            const items = resources.filter((r) => r.type === value);
            return (
              <div className="res-group" key={value}>
                <div className="res-group__head">
                  <Icon size={15} strokeWidth={2} />
                  <span>{label}</span>
                  <span className="res-group__count">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="res-group__empty">None yet.</p>
                ) : (
                  items.map((r) => (
                    <div className="res-item" key={r.id}>
                      <ResTitle r={r} className="res-item__title" />
                      {canEdit && r.type === ResourceType.ARTICLE && (
                        <button type="button" className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                          <PencilLine size={13} />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${r.title}`} onClick={() => removeResource(r)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <form onSubmit={submit} className="res-add">
          <div className="res-add__row">
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...BLANK, title: form.title, type: e.target.value })} options={TYPE_OPTIONS} />
            {!isArticle && !isLink && (
              <Select
                label="Source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                options={[{ value: 'file', label: 'Upload file' }, { value: 'link', label: 'External link' }]}
              />
            )}
          </div>
          <Input label="Title" placeholder={isArticle ? 'e.g. Prompt patterns — a primer' : 'e.g. Intro to prompting (Part 1)'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          {isArticle ? (
            <ArticleEditor value={form.content} onChange={(content) => setForm({ ...form, content })} />
          ) : useUrl ? (
            <Input label="URL" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          ) : (
            <label className="field">
              <span className="field__label">File</span>
              <input type="file" className="input" style={{ paddingTop: 6 }} onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            </label>
          )}
          {err && <span className="field__error">{err}</span>}
          <div>
            <Button type="submit" loading={add.isPending}>
              <Plus size={15} style={{ marginRight: 6 }} /> Add to this topic
            </Button>
          </div>
        </form>
      )}

      {/* Read an article (exactly how it renders for students), with a contents nav. */}
      <Modal open={Boolean(viewing)} title={viewing?.title ?? 'Article'} size="lg" onClose={() => setViewing(null)}>
        {viewing && <ArticleReader source={viewing.content} />}
      </Modal>

      {editing && <EditArticleModal resource={editing} moduleId={module.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditArticleModal({ resource, moduleId, onClose }) {
  const update = useUpdateResource();
  const [title, setTitle] = useState(resource.title);
  const [content, setContent] = useState(resource.content ?? '');
  const [err, setErr] = useState('');

  useEffect(() => { setTitle(resource.title); setContent(resource.content ?? ''); setErr(''); }, [resource]);

  async function save() {
    setErr('');
    if (!title.trim()) return setErr('Enter a title.');
    if (!content.trim()) return setErr('The article needs some content.');
    try {
      await update.mutateAsync({ id: resource.id, module: moduleId, title: title.trim(), content });
      onClose();
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  }

  return (
    <Modal
      open
      title="Edit article"
      size="lg"
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={update.isPending}>Save</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <ArticleEditor value={content} onChange={setContent} />
        {err && <span className="field__error">{err}</span>}
      </div>
    </Modal>
  );
}
