import { useEffect, useState } from 'react';
import { BookOpen, Film, Link2, PencilLine, Plus, Trash2 } from 'lucide-react';
import { ResourceType } from '@/shared';
import { Button, Input, Modal, Select, useConfirm } from '@/components/ui';
import { apiErrorMessage, articleViewUrl, fileSrc } from '@/lib/api';
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
 * Manage the learning resources for ONE syllabus topic — Videos, Articles (markdown
 * with a live preview), and Links. Resources are scoped to the topic via `resource.topic`.
 */
export function TopicResources({ module, topic, canEdit }) {
  const { data: all, isLoading } = useResources(module.id);
  const add = useAddResource();
  const del = useDeleteResource();
  const confirm = useConfirm();
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // article being edited

  async function onDelete(r) {
    if (await confirm({ title: 'Delete this resource?', message: `“${r.title}” will be removed from this topic.`, confirmLabel: 'Delete', tone: 'danger' })) {
      del.mutate({ id: r.id, module: module.id });
    }
  }

  const resources = (all ?? []).filter((r) => (r.topic ?? null) === topic.id);
  const isArticle = form.type === ResourceType.ARTICLE;
  const isLink = form.type === ResourceType.LINK;
  const useUrl = isLink || form.source === 'link';

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
      <p className="lms-muted" style={{ marginTop: 0, fontSize: 'var(--font-size-sm)' }}>
        Resources added here are shown to learners under <strong>{topic.title}</strong> only.
      </p>

      {isLoading ? (
        <p className="lms-muted">Loading…</p>
      ) : (
        <div className="topic-res__groups">
          {TYPE_META.map(({ value, label, Icon }) => {
            const items = resources.filter((r) => r.type === value);
            const article = value === ResourceType.ARTICLE;
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
                      <a href={article ? articleViewUrl(r.id) : fileSrc(r.url)} target="_blank" rel="noreferrer" className="res-item__title">{r.title}</a>
                      {canEdit && article && (
                        <button type="button" className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                          <PencilLine size={13} />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${r.title}`} onClick={() => onDelete(r)}>
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

      {/* Edit an article. */}
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
