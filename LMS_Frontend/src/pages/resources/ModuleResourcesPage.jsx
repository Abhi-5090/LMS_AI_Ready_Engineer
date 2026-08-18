import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Download, LayoutGrid, List, PencilLine, Play, Plus, Trash2, X } from 'lucide-react';
import { ResourceType, UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, SkeletonText, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, articleViewUrl, fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useModule } from '@/lib/modules';
import { useAddResource, useDeleteResource, useResources, useUpdateResource } from '@/lib/resources';
import { ArticleEditor } from '@/components/ArticleEditor';
import { ArticleReader } from '@/components/ArticleReader';
import { RES_TYPES, resTypeMeta, embedUrl } from './resourceUi';
import './resources.css';

const BLANK = { type: ResourceType.VIDEO, topic: '', title: '', source: 'file', url: '', file: null, content: '' };

export function ModuleResourcesPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { data: module, isLoading, isError, error, refetch } = useModule(code);
  const { data: all, isLoading: resLoading } = useResources(module?.id);
  const del = useDeleteResource();
  const confirm = useConfirm();
  const toast = useToast();

  const [typeFilter, setTypeFilter] = useState(''); // '' = all
  const [view, setView] = useState(() => localStorage.getItem('lms.resView') || 'cards');
  const chooseView = (v) => { setView(v); localStorage.setItem('lms.resView', v); };
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // article being edited
  const [reading, setReading] = useState(null); // article being read (modal)
  const [playing, setPlaying] = useState(null); // video being played (modal)
  const [openTopic, setOpenTopic] = useState(null); // single-open topic accordion
  const toggleTopic = (id) => setOpenTopic((cur) => (cur === id ? null : id));

  const isAdmin = user?.role === UserRole.ADMIN;
  const canManage = useMemo(() => {
    if (!module) return false;
    if (isAdmin) return true;
    return user?.role === UserRole.TRAINER && (module.assignedTrainers ?? []).some((t) => t.id === user.id);
  }, [module, user, isAdmin]);

  const back = (
    <button type="button" className="res-back" onClick={() => navigate('/app/resources')}>
      <ChevronLeft size={16} /> All resources
    </button>
  );

  if (isError || (!isLoading && !module)) {
    return (<>{back}<PageHeader title="Resources" /><ErrorState message={apiErrorMessage(error) || 'Module not found'} onRetry={refetch} /></>);
  }
  if (isLoading && !module) {
    return (<>{back}<PageHeader title="Resources" /><Card><SkeletonText lines={5} /></Card></>);
  }

  const resources = (all ?? []).filter((r) => !typeFilter || r.type === typeFilter);
  const topics = module.topics ?? [];
  // Group by topic, in syllabus order; a resource whose topic no longer exists lands in "Other".
  const byTopic = topics.map((t) => ({ topic: t, items: resources.filter((r) => (r.topic ?? null) === t.id) }));
  const orphan = resources.filter((r) => !topics.some((t) => t.id === (r.topic ?? null)));
  if (orphan.length) byTopic.push({ topic: { id: '__other', title: 'Other' }, items: orphan });
  const total = resources.length;

  function openResource(r) {
    if (r.type === ResourceType.ARTICLE) setReading(r);
    else if (r.type === ResourceType.VIDEO) setPlaying(r);
    else window.open(fileSrc(r.url), '_blank', 'noopener,noreferrer');
  }

  async function onDelete(r) {
    if (await confirm({ title: 'Delete this resource?', message: `“${r.title}” will be removed.`, confirmLabel: 'Delete', tone: 'danger' })) {
      del.mutate({ id: r.id, module: module.id }, { onError: (e) => toast.error(apiErrorMessage(e)) });
    }
  }

  return (
    <>
      {back}
      <PageHeader title={module.name} />

      <div className="res-toolbar">
        <div className="res-toolbar__filter">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by resource type"
            options={[
              { value: '', label: `All types (${all?.length ?? 0})` },
              ...RES_TYPES.map((t) => ({ value: t.value, label: `${t.label} (${(all ?? []).filter((r) => r.type === t.value).length})` })),
            ]}
          />
        </div>
        <div className="res-toolbar__right">
          <div className="view-toggle" role="group" aria-label="View">
            <button type="button" className={`view-toggle__btn${view === 'cards' ? ' is-on' : ''}`} aria-pressed={view === 'cards'} title="Grid view" aria-label="Grid view" onClick={() => chooseView('cards')}><LayoutGrid size={16} /></button>
            <button type="button" className={`view-toggle__btn${view === 'list' ? ' is-on' : ''}`} aria-pressed={view === 'list'} title="List view" aria-label="List view" onClick={() => chooseView('list')}><List size={16} /></button>
          </div>
          {canManage && <Button onClick={() => setAdding(true)}><Plus size={15} style={{ marginRight: 6 }} /> Add resource</Button>}
        </div>
      </div>

      {resLoading && !all ? (
        <Card><SkeletonText lines={4} /></Card>
      ) : total === 0 ? (
        <EmptyState icon={<LayoutGrid size={26} />} title="No resources yet" description={canManage ? 'Add videos, articles or links for this module’s topics.' : 'Your trainer hasn’t added materials for this module yet.'} action={canManage ? <Button onClick={() => setAdding(true)}>+ Add resource</Button> : undefined} />
      ) : (
        <div className="res-acc">
          {byTopic.filter((g) => g.items.length > 0).map((g) => {
            const open = openTopic === g.topic.id;
            return (
              <section key={g.topic.id} className={`res-acc__item${open ? ' is-open' : ''}`}>
                <button type="button" className="res-acc__head" aria-expanded={open} onClick={() => toggleTopic(g.topic.id)}>
                  <span className="res-acc__head-text">
                    <span className="res-acc__title">{g.topic.title}</span>
                    <span className="res-acc__counts">
                      {RES_TYPES.map((t) => {
                        const n = g.items.filter((r) => r.type === t.value).length;
                        if (!n) return null;
                        const M = resTypeMeta(t.value);
                        return <span key={t.value} className="res-acc__chip"><M.Icon size={13} /> {n} {(n === 1 ? t.single : t.label).toLowerCase()}</span>;
                      })}
                      <span className="res-acc__total">{g.items.length} total</span>
                    </span>
                  </span>
                  <ChevronDown className="res-acc__chevron" size={20} aria-hidden />
                </button>
                <div className="res-acc__panel">
                  <div className="res-acc__panel-inner">
                    <div className="res-acc__panel-content">
                      {view === 'cards' ? (
                        <div className="res-card-grid">
                          {g.items.map((r) => <ResourceCard key={r.id} r={r} canManage={canManage} onOpen={openResource} onEdit={setEditing} onDelete={onDelete} />)}
                        </div>
                      ) : (
                        <div className="res-list">
                          {g.items.map((r) => <ResourceRow key={r.id} r={r} canManage={canManage} onOpen={openResource} onEdit={setEditing} onDelete={onDelete} />)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {adding && <AddResourceModal module={module} onClose={() => setAdding(false)} />}
      {editing && <EditArticleModal resource={editing} moduleId={module.id} onClose={() => setEditing(null)} />}

      {/* In-app article reading space — a contents side-nav (jump to any heading)
          beside a comfortable reading column. "Open ↗" opens the standalone page. */}
      <Modal open={Boolean(reading)} title={reading?.title ?? 'Article'} size="xl" onClose={() => setReading(null)}
        headerAction={reading && <a className="res-open-ext" href={articleViewUrl(reading.id)} target="_blank" rel="noreferrer" title="Open in new tab">Open ↗</a>}>
        {reading && <ArticleReader source={reading.content} />}
      </Modal>

      {/* In-app video player */}
      <Modal open={Boolean(playing)} title={playing?.title ?? 'Video'} size="xl" onClose={() => setPlaying(null)}>
        {playing && <VideoPlayer r={playing} />}
      </Modal>
    </>
  );
}

/** Type-aware resource card (grid view). */
function ResourceCard({ r, canManage, onOpen, onEdit, onDelete }) {
  const meta = resTypeMeta(r.type);
  const isVideo = r.type === ResourceType.VIDEO;
  return (
    <div className={`res-card res-card--${r.type}`}>
      <button type="button" className="res-card__hit" onClick={() => onOpen(r)} aria-label={`Open ${r.title}`}>
        <div className="res-card__thumb">
          {isVideo ? <span className="res-card__play"><Play size={30} fill="currentColor" /></span> : <meta.Icon size={42} />}
        </div>
        <div className="res-card__title">{r.title}</div>
      </button>
      <div className="res-card__foot">
        <span className="res-type"><meta.Icon size={13} /> {meta.single}</span>
        {canManage && (
          <span className="res-card__actions">
            {r.type === ResourceType.ARTICLE && <button type="button" className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => onEdit(r)}><PencilLine size={14} /></button>}
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${r.title}`} onClick={() => onDelete(r)}><Trash2 size={14} /></button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Resource row (list view). */
function ResourceRow({ r, canManage, onOpen, onEdit, onDelete }) {
  const meta = resTypeMeta(r.type);
  return (
    <div className="res-row">
      <button type="button" className="res-row__main" onClick={() => onOpen(r)}>
        <span className="res-row__icon">{r.type === ResourceType.VIDEO ? <Play size={15} fill="currentColor" /> : <meta.Icon size={15} />}</span>
        <span className="res-row__title">{r.title}</span>
        <span className="res-row__type">{meta.single}</span>
      </button>
      {canManage && (
        <span className="res-row__actions">
          {r.type === ResourceType.ARTICLE && <button type="button" className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => onEdit(r)}><PencilLine size={14} /></button>}
          <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${r.title}`} onClick={() => onDelete(r)}><Trash2 size={14} /></button>
        </span>
      )}
    </div>
  );
}

/** In-app video player: uploaded/direct files play with native controls; YouTube/Vimeo embed. */
function VideoPlayer({ r }) {
  const embed = embedUrl(r.url);
  if (embed) {
    return (
      <div className="res-video">
        <iframe src={embed} title={r.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
      </div>
    );
  }
  return (
    <div className="res-video">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={fileSrc(r.url)} controls autoPlay controlsList="nodownload" />
    </div>
  );
}

/** Add a resource to any topic of this module (admins / assigned trainers). */
function AddResourceModal({ module, onClose }) {
  const add = useAddResource();
  const toast = useToast();
  const topics = module.topics ?? [];
  const [form, setForm] = useState({ ...BLANK, topic: topics[0]?.id ?? '' });
  const [err, setErr] = useState('');

  const isArticle = form.type === ResourceType.ARTICLE;
  const isLink = form.type === ResourceType.LINK;
  const useUrl = isLink || form.source === 'link';

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.topic) return setErr('Choose a topic.');
    if (!form.title.trim()) return setErr('Enter a title.');
    if (isArticle) { if (!form.content.trim()) return setErr('Write the article, or upload a markdown file.'); }
    else if (useUrl && !form.url.trim()) return setErr('Enter a URL.');
    else if (!useUrl && !form.file) return setErr('Choose a file to upload.');
    try {
      await add.mutateAsync({
        module: module.id,
        topic: form.topic,
        type: form.type,
        title: form.title.trim(),
        ...(isArticle ? { content: form.content } : { url: useUrl ? form.url.trim() : undefined, file: useUrl ? undefined : form.file }),
      });
      toast.success('Resource added.');
      onClose();
    } catch (e2) { setErr(apiErrorMessage(e2)); }
    return undefined;
  }

  return (
    <Modal open title="Add resource" size="lg" onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="res-add-form" type="submit" loading={add.isPending}>Add</Button></>}>
      <form id="res-add-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '12rem' }}>
            <Select label="Topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} options={topics.map((t) => ({ value: t.id, label: t.title }))} />
          </div>
          <div style={{ flex: 1, minWidth: '10rem' }}>
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...BLANK, topic: form.topic, title: form.title, type: e.target.value })} options={RES_TYPES.map((t) => ({ value: t.value, label: t.single }))} />
          </div>
          {!isArticle && !isLink && (
            <div style={{ flex: 1, minWidth: '10rem' }}>
              <Select label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} options={[{ value: 'file', label: 'Upload file' }, { value: 'link', label: 'External link (e.g. YouTube)' }]} />
            </div>
          )}
        </div>
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={isArticle ? 'e.g. Prompt patterns — a primer' : 'e.g. Intro to prompting'} required />
        {isArticle ? (
          <ArticleEditor value={form.content} onChange={(content) => setForm({ ...form, content })} />
        ) : useUrl ? (
          <Input label="URL" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        ) : (
          <label className="field">
            <span className="field__label">File</span>
            <input type="file" className="input" style={{ paddingTop: 6 }}
              accept={form.type === ResourceType.VIDEO ? 'video/*' : undefined}
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {form.type === ResourceType.VIDEO ? 'MP4, WebM or MOV — up to 500 MB.' : 'Up to 500 MB.'}
            </span>
          </label>
        )}
        {err && <span className="field__error">{err}</span>}
      </form>
    </Modal>
  );
}

function EditArticleModal({ resource, moduleId, onClose }) {
  const update = useUpdateResource();
  const [title, setTitle] = useState(resource.title);
  const [content, setContent] = useState(resource.content ?? '');
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    if (!title.trim()) return setErr('Enter a title.');
    if (!content.trim()) return setErr('The article needs some content.');
    try {
      await update.mutateAsync({ id: resource.id, module: moduleId, title: title.trim(), content });
      onClose();
    } catch (e) { setErr(apiErrorMessage(e)); }
    return undefined;
  }

  return (
    <Modal open title="Edit article" size="lg" onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={update.isPending}>Save</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <ArticleEditor value={content} onChange={setContent} />
        {err && <span className="field__error">{err}</span>}
      </div>
    </Modal>
  );
}
