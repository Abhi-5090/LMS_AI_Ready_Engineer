import { useRef, useState } from 'react';
import { CalendarCheck, Camera, FileText, FolderOpen, Github, MessageCircleQuestion, Plus, Star, Trash2 } from 'lucide-react';
import { ProjectStatus, SOCIAL_PLATFORMS, UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, FullPageSpinner, Input, Modal, Skeleton, Textarea, useConfirm, useToast } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { apiErrorMessage, downloadFile, fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTrainerStats, useUpdateProfile, useUploadAvatar } from '@/lib/profile';
import { useAddProject, useDeleteProject, useMyProjects } from '@/lib/projects';
import { ProjectDetailModal } from '@/pages/projects/ProjectDetailModal';
import { ResumeModal } from './ResumeModal';
import '@/pages/projects/projects.css';
import '@/pages/modules/modules.css';

const initials = (name = '') => name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export function ProfilePage() {
  const user = useAuth((s) => s.user);
  if (!user) return <FullPageSpinner />;
  const isStudent = user.role === UserRole.STUDENT;

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle={isStudent ? 'Your details, platform links, and projects.' : 'Your details, scoreboard, and platform links.'}
      />
      <DetailsCard user={user} />
      {!isStudent && <TrainerStatsCard />}
      <LinksCard user={user} />
      {isStudent && <ProjectsCard />}
      {isStudent && <ResumeCard user={user} />}
    </>
  );
}

// ── Resume generator ────────────────────────────────────────────────────────────

function ResumeCard({ user }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Resume" subtitle="Auto-generate a clean resume from your profile, links, projects & certifications." />
      <Button size="sm" onClick={() => setOpen(true)} style={{ marginTop: 'var(--space-3)' }}>
        <FileText size={15} /> Generate my resume
      </Button>
      <ResumeModal open={open} user={user} onClose={() => setOpen(false)} />
    </Card>
  );
}

// ── Trainer scoreboard ─────────────────────────────────────────────────────────

export function TrainerStatsCard() {
  const { data: stats, isLoading } = useTrainerStats();
  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Scoreboard" subtitle="Your teaching activity and the ratings students gave you." />
      {isLoading || !stats ? (
        <p className="lms-muted" style={{ marginTop: 'var(--space-3)' }}>Loading…</p>
      ) : (
        <div className="stat-grid" style={{ marginTop: 'var(--space-3)' }}>
          <Stat label="Classes conducted" value={stats.classesConducted} icon={<CalendarCheck size={20} />} />
          <Stat label="Doubts cleared" value={stats.doubtsResolved} icon={<MessageCircleQuestion size={20} />} />
          <Stat label="Doubt rating" value={stats.doubtsAvgRating ? `${stats.doubtsAvgRating} ★` : '—'} icon={<Star size={20} />} />
          <Stat label="Class rating" value={stats.classAvgRating ? `${stats.classAvgRating} ★` : '—'} accent icon={<Star size={20} />} />
        </div>
      )}
    </Card>
  );
}

// ── Details + avatar ─────────────────────────────────────────────────────────

function DetailsCard({ user }) {
  const update = useUpdateProfile();
  const avatar = useUploadAvatar();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ name: user.name ?? '', phone: user.phone ?? '', bio: user.bio ?? '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      await avatar.mutateAsync(file);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }
  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await update.mutateAsync({ name: form.name.trim(), phone: form.phone.trim(), bio: form.bio.trim() });
      setMsg('Profile saved.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Profile" subtitle="How you appear across the platform." />
      <div className="profile-avatar" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>
        <div className="profile-avatar__img">
          {user.avatarUrl ? <img src={fileSrc(user.avatarUrl)} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : initials(user.name)}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onAvatar} style={{ display: 'none' }} />
          <Button variant="outline" size="sm" loading={avatar.isPending} onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> Change photo
          </Button>
          <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>PNG/JPG, up to 8 MB.</div>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Email" value={user.email} disabled />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
        <Textarea label="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A short intro about yourself" style={{ minHeight: '5rem' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button type="submit" loading={update.isPending}>Save changes</Button>
          {msg && <span className="lms-muted" style={{ color: 'var(--color-success)' }}>{msg}</span>}
        </div>
        {err && <span className="field__error">{err}</span>}
      </form>
    </Card>
  );
}

// ── Platform links ─────────────────────────────────────────────────────────

function LinksCard({ user }) {
  const update = useUpdateProfile();
  const [links, setLinks] = useState(() =>
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, user.links?.[p.key] ?? ''])),
  );
  const [custom, setCustom] = useState(() => (user.customLinks ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })));
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const addCustom = () => setCustom((c) => [...c, { label: '', url: '' }]);
  const setCustomAt = (i, patch) => setCustom((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeCustom = (i) => setCustom((c) => c.filter((_, idx) => idx !== i));

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const trimmed = Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v.trim()]));
    const customLinks = custom.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label && l.url);
    try {
      await update.mutateAsync({ links: trimmed, customLinks });
      setCustom(customLinks);
      setMsg('Links saved.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <div className="panel-head">
        <CardHeader title="Platform Links" subtitle="GitHub, coding profiles & portfolio — so progress is easy to track." />
        <Button type="button" variant="outline" size="sm" onClick={addCustom}><Plus size={15} /> Add link</Button>
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        <div className="profile-links">
          {SOCIAL_PLATFORMS.map((p) => (
            <Input
              key={p.key}
              label={p.label}
              value={links[p.key]}
              onChange={(e) => setLinks({ ...links, [p.key]: e.target.value })}
              placeholder={p.placeholder}
            />
          ))}
        </div>

        {custom.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label className="field__label">Your links</label>
            {custom.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <input className="input" value={l.label} onChange={(e) => setCustomAt(i, { label: e.target.value })} placeholder="Label (e.g. Kaggle)" style={{ flex: '1 1 7rem', minWidth: 0 }} />
                <input className="input" value={l.url} onChange={(e) => setCustomAt(i, { url: e.target.value })} placeholder="https://…" style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="icon-btn icon-btn--danger" onClick={() => removeCustom(i)} aria-label="Remove link"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button type="submit" loading={update.isPending}>Save links</Button>
          {msg && <span className="lms-muted" style={{ color: 'var(--color-success)' }}>{msg}</span>}
        </div>
        {err && <span className="field__error">{err}</span>}
      </form>
    </Card>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────

function ProjectsCard() {
  const confirm = useConfirm();
  const { data: projects, isLoading } = useMyProjects();
  const del = useDeleteProject();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const list = projects ?? [];
  const approved = list.filter((p) => p.status === ProjectStatus.APPROVED).length;

  return (
    <Card>
      <div className="panel-head">
        <CardHeader
          title="Projects"
          subtitle={`${approved} approved · ${list.length} total. Submitted projects appear after a trainer/admin approves them.`}
        />
        <Button onClick={() => setAdding(true)}><Plus size={15} /> Add project</Button>
      </div>

      {isLoading && !projects ? (
        <div className="project-grid" style={{ marginTop: 'var(--space-3)' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="12rem" radius="var(--radius-lg)" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={26} />}
          title="No projects yet"
          description="Add one — include the GitHub repo, screenshots and a description."
          action={<Button onClick={() => setAdding(true)}><Plus size={15} /> Add project</Button>}
        />
      ) : (
        <div className="project-grid" style={{ marginTop: 'var(--space-3)' }}>
          {list.map((p) => (
            <div key={p.id} className="project-card" onClick={() => setViewing(p)}>
              <div className="project-card__cover" style={{ position: 'relative' }}>
                {p.images?.length > 1 && <span className="project-card__count">{p.images.length} images</span>}
                {p.images?.[0] ? <img src={fileSrc(p.images[0])} alt={p.title} /> : <Github size={28} />}
              </div>
              <div className="project-card__body">
                <div className="project-card__title">{p.title}</div>
                <div className="project-card__foot">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label="Delete project"
                    onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: 'Delete this project?', tone: 'danger', confirmLabel: 'Delete' })) del.mutate(p.id); }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <AddProjectModal onClose={() => setAdding(false)} />}
      <ProjectDetailModal project={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };

function AddProjectModal({ onClose }) {
  const add = useAddProject();
  const [form, setForm] = useState({ title: '', repoUrl: '', description: '', videoUrl: '' });
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.title.trim().length < 2) return setErr('Enter a project title.');
    if (!form.repoUrl.trim()) return setErr('Add your GitHub repository link.');
    if (form.description.trim().length < 10) return setErr('Add a short description (at least 10 characters).');
    if (!doc) return setErr('Upload the project document (PDF).');
    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('repoUrl', form.repoUrl.trim());
    fd.append('description', form.description.trim());
    if (form.videoUrl.trim()) fd.append('videoUrl', form.videoUrl.trim());
    fd.append('document', doc);
    try {
      await add.mutateAsync(fd);
      onClose();
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
    return undefined;
  }

  return (
    <Modal
      open
      title="Add a project"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button form="add-project-form" type="submit" loading={add.isPending}>Submit for approval</Button>
        </>
      }
    >
      <form id="add-project-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input label="Project title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. AI Resume Screener" required />
        <Input label="GitHub repository URL" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} placeholder="https://github.com/you/project" required />
        <Input label="Demo video URL (optional)" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=…" />
        <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it does, the tech stack, your role…" style={{ minHeight: '6rem' }} />
        <label className="field">
          <span className="field__label">Project document (PDF)</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
          {doc && <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 4, display: 'block' }}>{doc.name}</span>}
        </label>
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
          Your project is submitted for trainer/admin approval and appears on your profile once approved.
        </p>
        {err && <span className="field__error">{err}</span>}
      </form>
    </Modal>
  );
}
