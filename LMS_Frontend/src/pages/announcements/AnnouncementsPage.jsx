import { useState } from 'react';
import { UserRole } from '@/shared';
import { ImagePlus, Megaphone, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, SkeletonCards, Textarea, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement } from '@/lib/announcements';
import { useBatches } from '@/lib/batches';
import { formatDate } from '@/lib/format';
import './announcements.css';

const BLANK = { title: '', body: '', isGlobal: false };

export function AnnouncementsPage() {
  const user = useAuth((s) => s.user);
  const role = user?.role;
  const canPost = role === UserRole.ADMIN || role === UserRole.TRAINER;
  const isAdmin = role === UserRole.ADMIN;

  const { data: items, isLoading, isError, error, refetch } = useAnnouncements();
  const { data: batches } = useBatches({ enabled: canPost });
  const create = useCreateAnnouncement();
  const del = useDeleteAnnouncement();
  const toast = useToast();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [selectedBatches, setSelectedBatches] = useState([]); // batch ids
  const [modulesByBatch, setModulesByBatch] = useState({}); // { batchId: [moduleId] }
  const [image, setImage] = useState(null);
  const [err, setErr] = useState('');

  const batchList = batches ?? [];
  const preview = image ? URL.createObjectURL(image) : null;

  function reset() {
    setForm(BLANK); setSelectedBatches([]); setModulesByBatch({}); setImage(null); setErr('');
  }
  function toggleBatch(id) {
    setSelectedBatches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleModule(batchId, moduleId) {
    setModulesByBatch((prev) => {
      const cur = prev[batchId] ?? [];
      return { ...prev, [batchId]: cur.includes(moduleId) ? cur.filter((x) => x !== moduleId) : [...cur, moduleId] };
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.title.trim().length < 2) return setErr('Enter a title.');
    if (!form.body.trim()) return setErr('Write a message.');
    if (!form.isGlobal && selectedBatches.length === 0) return setErr('Select at least one batch, or post to everyone.');

    const targets = selectedBatches.map((bid) => ({ batch: bid, modules: modulesByBatch[bid] ?? [] }));
    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('body', form.body.trim());
    if (isAdmin && form.isGlobal) fd.append('isGlobal', 'true');
    fd.append('targets', JSON.stringify(form.isGlobal ? [] : targets));
    if (image) fd.append('image', image);
    try {
      await create.mutateAsync(fd);
      setOpen(false); reset();
      toast.success('Announcement posted.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
    return undefined;
  }

  async function remove(id) {
    if (!(await confirm({ title: 'Delete this announcement?', tone: 'danger', confirmLabel: 'Delete' }))) return;
    try { await del.mutateAsync(id); toast.success('Announcement deleted.'); }
    catch (e2) { toast.error(apiErrorMessage(e2)); }
  }

  return (
    <>
      <PageHeader title="Announcements" subtitle={canPost ? 'Post updates to your batches and modules.' : 'Updates from your trainers.'} />

      <div className="toolbar">
        <span />
        {canPost && <Button onClick={() => { reset(); setOpen(true); }}>+ New Announcement</Button>}
      </div>

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !items ? (
        <SkeletonCards count={4} height="7rem" />
      ) : items && items.length === 0 ? (
        <EmptyState icon={<Megaphone size={26} />} title="No announcements yet" description="No announcements yet."
          action={canPost ? <Button onClick={() => { reset(); setOpen(true); }}>+ New Announcement</Button> : undefined} />
      ) : (
        <div className="ann-grid">
          {items?.map((a) => (
            <Card key={a.id} pad={false} className="ann-card">
              {a.imageUrl && (
                <a href={fileSrc(a.imageUrl)} target="_blank" rel="noreferrer" className="ann-card__media">
                  <img src={fileSrc(a.imageUrl)} alt={a.title} />
                </a>
              )}
              <div className="ann-card__content">
                <div className="ann-card__head">
                  <strong className="ann-card__title">{a.title}</strong>
                  {(isAdmin || a.author?.id === user?.id) && (
                    <button type="button" className="ann-card__del" aria-label="Delete announcement" onClick={() => remove(a.id)}><X size={15} /></button>
                  )}
                </div>
                <div className="ann-card__targets"><AnnouncementTargets a={a} /></div>
                <p className="ann-card__body">{a.body}</p>
                <div className="ann-card__meta">{a.author?.name ?? 'Trainer'} · {formatDate(a.createdAt)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title="New Announcement"
        size="lg"
        onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button form="ann-form" type="submit" loading={create.isPending}>Post</Button></>}
      >
        <form id="ann-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required style={{ minHeight: '7rem' }} />

          {/* Image attachment */}
          <div className="field">
            <span className="field__label">Image <span className="lms-muted">(optional)</span></span>
            {preview ? (
              <div className="ann-upload-preview">
                <img src={preview} alt="preview" />
                <button type="button" className="ann-upload-preview__x" onClick={() => setImage(null)} aria-label="Remove image"><X size={14} /></button>
              </div>
            ) : (
              <label className="ann-drop">
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} hidden />
                <ImagePlus size={18} /> Add an image
              </label>
            )}
          </div>

          {isAdmin && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={form.isGlobal} onChange={(e) => setForm({ ...form, isGlobal: e.target.checked })} />
              Post to everyone (global)
            </label>
          )}

          {!form.isGlobal && (
            <div className="field">
              <span className="field__label">Batches <span className="lms-muted">— pick one or more</span></span>
              {batchList.length === 0 ? (
                <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>No batches available.</p>
              ) : (
                <div className="ann-chips">
                  {batchList.map((b) => (
                    <button type="button" key={b.id} className={`ann-chip${selectedBatches.includes(b.id) ? ' is-on' : ''}`} onClick={() => toggleBatch(b.id)}>
                      {b.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Split: per selected batch, choose which modules (optional). */}
              {selectedBatches.map((bid) => {
                const b = batchList.find((x) => x.id === bid);
                const mods = (b?.modules ?? []).map((m) => ({ id: m.id ?? m, name: m.name ?? 'Module' }));
                const picked = modulesByBatch[bid] ?? [];
                return (
                  <div key={bid} className="ann-batchblock">
                    <div className="ann-batchblock__head">{b?.name} <span className="lms-muted">— modules ({picked.length ? `${picked.length} selected` : 'whole batch'})</span></div>
                    {mods.length === 0 ? (
                      <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>No modules in this batch.</span>
                    ) : (
                      <div className="ann-chips">
                        {mods.map((m) => (
                          <button type="button" key={m.id} className={`ann-chip ann-chip--mod${picked.includes(m.id) ? ' is-on' : ''}`} onClick={() => toggleModule(bid, m.id)}>
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>
    </>
  );
}

/** Show who an announcement targets: Everyone, or batch (+ module) chips. */
function AnnouncementTargets({ a }) {
  if (a.isGlobal) return <Badge tone="warning">Everyone</Badge>;
  const targets = a.targets?.length ? a.targets : (a.batch ? [{ batch: a.batch, modules: a.module ? [a.module] : [] }] : []);
  if (targets.length === 0) return null;
  return (
    <>
      {targets.map((t, i) => (
        <span key={t.batch?.id ?? t.batch ?? i} className="ann-target">
          <Badge tone="primary">{t.batch?.name ?? 'Batch'}</Badge>
          {(t.modules ?? []).map((m) => <Badge key={m.id ?? m} tone="neutral">{m.name ?? 'Module'}</Badge>)}
        </span>
      ))}
    </>
  );
}
