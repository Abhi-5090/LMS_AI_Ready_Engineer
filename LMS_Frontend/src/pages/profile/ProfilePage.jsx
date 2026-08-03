import { useMemo, useRef, useState } from 'react';
import { Award, CalendarCheck, Camera, Code2, ExternalLink, FileText, FolderOpen, Github, Globe, GraduationCap, Linkedin, Link as LinkIcon, Mail, MessageCircleQuestion, Percent, Plus, Star, Target, Trash2, Upload, Video, X } from 'lucide-react';
import { ProjectStatus, SOCIAL_PLATFORMS, TECH_STACK, UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, FullPageSpinner, Input, Modal, Skeleton, Textarea, useConfirm, useToast } from '@/components/ui';
import { Stat } from '@/components/PageHeader';
import { apiErrorMessage, downloadFile, fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStudentAnalytics } from '@/lib/analytics';
import { useRemoveAvatar, useRemoveCover, useTrainerStats, useUpdateProfile, useUploadAvatar, useUploadCover, useUploadResume } from '@/lib/profile';
import { useAddProject, useDeleteProject, useMyProjects, useTechTags } from '@/lib/projects';
import { ProjectDetailModal } from '@/pages/projects/ProjectDetailModal';
import '@/pages/projects/projects.css';
import '@/pages/modules/modules.css';
import './profile.css';

const initials = (name = '') => name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export function ProfilePage() {
  const user = useAuth((s) => s.user);
  if (!user) return <FullPageSpinner />;
  const isStudent = user.role === UserRole.STUDENT;

  return (
    <>
      <ProfileHero user={user} isStudent={isStudent} />
      {isStudent ? (
        <div className="profile-stack">
          <div className="profile-body">
            <div className="profile-body__side">
              <DetailsCard user={user} />
            </div>
            <div className="profile-body__main">
              <ProjectsCard />
              <ResumeCard user={user} />
            </div>
          </div>
          <LinksCard user={user} wide />
        </div>
      ) : (
        <div className="profile-stack">
          {/* Two equal-height cards in a row. */}
          <div className="profile-duo">
            <DetailsCard user={user} />
            <TrainerStatsCard />
          </div>
          <LinksCard user={user} wide />
        </div>
      )}
    </>
  );
}

// ── Gamified identity hero (GitHub-profile style) ─────────────────────────────
const PLATFORM_ICON = { github: Github, linkedin: Linkedin, leetcode: Code2, codechef: Code2, hackerrank: Code2, portfolio: Globe };

function ProfileHero({ user, isStudent }) {
  const avatar = useUploadAvatar();
  const cover = useUploadCover();
  const removeAvatar = useRemoveAvatar();
  const removeCover = useRemoveCover();
  const toast = useToast();
  const fileRef = useRef(null);
  const coverRef = useRef(null);

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try { await avatar.mutateAsync(file); } catch (e2) { toast.error(apiErrorMessage(e2)); }
  }
  async function onCover(e) {
    const file = e.target.files?.[0];
    if (coverRef.current) coverRef.current.value = '';
    if (!file) return;
    try { await cover.mutateAsync(file); } catch (e2) { toast.error(apiErrorMessage(e2)); }
  }
  async function onRemoveAvatar() {
    try { await removeAvatar.mutateAsync(); } catch (e2) { toast.error(apiErrorMessage(e2)); }
  }
  async function onRemoveCover() {
    try { await removeCover.mutateAsync(); } catch (e2) { toast.error(apiErrorMessage(e2)); }
  }

  const links = [
    ...SOCIAL_PLATFORMS.filter((p) => user.links?.[p.key]).map((p) => ({ key: p.key, label: p.label, url: user.links[p.key], Icon: PLATFORM_ICON[p.key] ?? Globe })),
    ...(user.customLinks ?? []).map((l, i) => ({ key: `c${i}`, label: l.label, url: l.url, Icon: LinkIcon })),
  ];

  return (
    <section className="profile-hero">
      <div
        className={`profile-hero__cover${user.coverUrl ? ' profile-hero__cover--image' : ''}`}
        style={user.coverUrl ? { backgroundImage: `url(${fileSrc(user.coverUrl)})` } : undefined}
      >
        <input ref={coverRef} type="file" accept="image/*" onChange={onCover} hidden />
        <div className="profile-hero__img-actions profile-hero__img-actions--cover">
          {user.coverUrl && (
            <button type="button" className="profile-hero__img-remove" title="Remove banner" aria-label="Remove banner" disabled={removeCover.isPending} onClick={onRemoveCover}>
              <Trash2 size={14} />
            </button>
          )}
          <button type="button" className="profile-hero__cover-edit" title="Change banner image" aria-label="Change banner image" disabled={cover.isPending} onClick={() => coverRef.current?.click()}>
            <Camera size={15} />
          </button>
        </div>
      </div>

      <div className="profile-hero__body">
        <div className="profile-hero__avatar">
          <div className="profile-hero__avatar-inner">
            {user.avatarUrl ? <img src={fileSrc(user.avatarUrl)} alt={user.name} /> : initials(user.name)}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onAvatar} hidden />
          <div className="profile-hero__img-actions profile-hero__img-actions--avatar">
            {user.avatarUrl && (
              <button type="button" className="profile-hero__img-remove" title="Remove photo" aria-label="Remove photo" disabled={removeAvatar.isPending} onClick={onRemoveAvatar}>
                <Trash2 size={13} />
              </button>
            )}
            <button type="button" className="profile-hero__avatar-edit" title="Change photo" aria-label="Change photo" disabled={avatar.isPending} onClick={() => fileRef.current?.click()}>
              <Camera size={15} />
            </button>
          </div>
        </div>

        <div className="profile-hero__id">
          <div className="profile-hero__name">
            {user.name}
            <Badge tone={isStudent ? 'primary' : 'success'}>{isStudent ? 'Student' : 'Trainer'}</Badge>
          </div>
          <div className="profile-hero__handle">
            <Mail size={13} /> {user.email}{user.phone ? ` · ${user.phone}` : ''}
          </div>
          {user.bio && <p className="profile-hero__bio">{user.bio}</p>}
          {links.length > 0 && (
            <div className="profile-hero__links">
              {links.map((l) => (
                <a key={l.key} className="profile-hero__link" href={l.url} target="_blank" rel="noreferrer" title={l.label} aria-label={l.label}>
                  <l.Icon size={16} />
                </a>
              ))}
            </div>
          )}
          {isStudent && <StudentLevel />}
        </div>

        {isStudent && <StudentHeroStats />}
      </div>
    </section>
  );
}

function StudentHeroStats() {
  const { data: a } = useStudentAnalytics();
  const att = a?.attendance?.percentage ?? 0;
  const mods = a?.progress ? `${a.progress.completedCount}/${a.progress.total}` : '—';
  const certs = a?.certificates ?? 0;
  const avg = a?.scoreSummary?.gradedCount ? `${a.scoreSummary.avgScore}%` : '—';
  return (
    <div className="profile-hero__stats">
      <div className="pstat pstat--accent"><span className="pstat__value"><Percent size={15} />{att}%</span><span className="pstat__label">Attendance</span></div>
      <div className="pstat"><span className="pstat__value"><GraduationCap size={15} />{mods}</span><span className="pstat__label">Modules</span></div>
      <div className="pstat"><span className="pstat__value"><Award size={15} />{certs}</span><span className="pstat__label">Certificates</span></div>
      <div className="pstat"><span className="pstat__value"><Target size={15} />{avg}</span><span className="pstat__label">Avg score</span></div>
    </div>
  );
}

function StudentLevel() {
  const { data: a } = useStudentAnalytics();
  const done = a?.progress?.completedCount ?? 0;
  const total = a?.progress?.total ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="profile-hero__level">
      <div className="profile-hero__level-top">
        <span>Curriculum progress</span>
        <span><b>{done}</b> / {total} modules</span>
      </div>
      <div className="profile-hero__bar"><div className="profile-hero__bar-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ── Resume: three formats a student can store ────────────────────────────────────

function ResumeCard({ user }) {
  const update = useUpdateProfile();
  const uploadResume = useUploadResume();
  const toast = useToast();
  const fileRef = useRef(null);
  const [portfolioUrl, setPortfolioUrl] = useState(user.resume?.portfolioUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(user.resume?.videoUrl ?? '');
  const [err, setErr] = useState('');
  const fileUrl = user.resume?.fileUrl;

  async function onPickPdf(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try { await uploadResume.mutateAsync(file); toast.success('Resume uploaded.'); }
    catch (e2) { toast.error(apiErrorMessage(e2)); }
  }
  async function saveLinks() {
    setErr('');
    try {
      await update.mutateAsync({ resume: { portfolioUrl: portfolioUrl.trim(), videoUrl: videoUrl.trim() } });
      toast.success('Resume links saved.');
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  return (
    <Card>
      <CardHeader title="Resume" subtitle="Store your resume in up to three formats — a PDF, a portfolio, and a video." />
      <div className="resume-formats">
        {/* Soft copy (PDF) */}
        <div className="resume-fmt">
          <div className="resume-fmt__head"><span className="resume-fmt__icon"><FileText size={18} /></span> Soft copy (PDF)</div>
          <p className="resume-fmt__hint">Your standard resume as a PDF.</p>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onPickPdf} hidden />
          <div className="resume-fmt__actions">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploadResume.isPending}>
              <Upload size={14} style={{ marginRight: 6 }} /> {fileUrl ? 'Replace' : 'Upload PDF'}
            </Button>
            {fileUrl && <a className="resume-fmt__open" href={fileSrc(fileUrl)} target="_blank" rel="noreferrer">View <ExternalLink size={12} /></a>}
          </div>
        </div>

        {/* Portfolio / digital resume */}
        <div className="resume-fmt">
          <div className="resume-fmt__head"><span className="resume-fmt__icon"><Globe size={18} /></span> Digital / portfolio</div>
          <p className="resume-fmt__hint">A link to your portfolio site.</p>
          <Input value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://your-portfolio.com" />
        </div>

        {/* Video resume */}
        <div className="resume-fmt">
          <div className="resume-fmt__head"><span className="resume-fmt__icon"><Video size={18} /></span> Video resume</div>
          <p className="resume-fmt__hint">A link to your video intro.</p>
          <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <Button onClick={saveLinks} loading={update.isPending}>Save resume links</Button>
        {err && <span className="field__error">{err}</span>}
      </div>
    </Card>
  );
}

// ── Trainer scoreboard ─────────────────────────────────────────────────────────

export function TrainerStatsCard() {
  const { data: stats, isLoading } = useTrainerStats();
  return (
    <Card className="profile-scoreboard">
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
  const [form, setForm] = useState({ name: user.name ?? '', phone: user.phone ?? '', bio: user.bio ?? '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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
    <Card>
      <CardHeader title="Edit details" subtitle="Your name, phone and bio — how you appear across the platform." />
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
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

function LinksCard({ user, wide = false }) {
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
    <Card>
      <div className="panel-head">
        <CardHeader title="Platform Links" subtitle="GitHub, coding profiles & portfolio — so progress is easy to track." />
        <Button type="button" variant="outline" size="sm" onClick={addCustom}><Plus size={15} /> Add link</Button>
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        <div className={`profile-links${wide ? ' profile-links--two' : ''}`}>
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

/** Searchable tech-stack tags; new tags are added on submit (pending approval). */
function TechStackPicker({ value, onChange }) {
  const { data: approved } = useTechTags();
  const all = useMemo(() => {
    const m = new Map();
    [...TECH_STACK, ...(approved ?? [])].forEach((t) => m.set(t.toLowerCase(), t));
    return [...m.values()];
  }, [approved]);
  const [q, setQ] = useState('');
  const selectedKeys = new Set(value.map((t) => t.toLowerCase()));
  const needle = q.trim().toLowerCase();
  const matches = needle ? all.filter((t) => t.toLowerCase().includes(needle) && !selectedKeys.has(t.toLowerCase())).slice(0, 24) : [];
  const exact = needle ? all.some((t) => t.toLowerCase() === needle) : false;
  const add = (t) => { if (t && !selectedKeys.has(t.toLowerCase())) onChange([...value, t]); setQ(''); };

  return (
    <div className="field">
      <label className="field__label">Tech stack <span className="lms-muted">— search & add; new ones need trainer/admin approval</span></label>
      {value.length > 0 && (
        <div className="tech-chips">
          {value.map((t) => (
            <span key={t} className="tech-chip">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X size={12} strokeWidth={3} /></button>
            </span>
          ))}
        </div>
      )}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a technology (e.g. React, Python)…" />
      {needle && (
        <div className="tech-options">
          {matches.map((t) => <button key={t} type="button" className="tech-option" onClick={() => add(t)}>{t}</button>)}
          {!exact && !selectedKeys.has(needle) && (
            <button type="button" className="tech-option tech-option--new" onClick={() => add(q.trim())}>+ Add “{q.trim()}” (new)</button>
          )}
          {matches.length === 0 && exact && <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', padding: '2px 6px' }}>Already selected.</span>}
        </div>
      )}
    </div>
  );
}

function AddProjectModal({ onClose }) {
  const add = useAddProject();
  const [form, setForm] = useState({ title: '', repoUrl: '', description: '', videoUrl: '', role: '' });
  const [tech, setTech] = useState([]);
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.title.trim().length < 2) return setErr('Enter a project title.');
    if (!form.repoUrl.trim()) return setErr('Add your GitHub repository link.');
    if (form.description.trim().length < 10) return setErr('Add a short description (at least 10 characters).');
    if (!doc) return setErr('Upload the project document (PDF, max 10 MB).');
    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('repoUrl', form.repoUrl.trim());
    fd.append('description', form.description.trim());
    if (form.videoUrl.trim()) fd.append('videoUrl', form.videoUrl.trim());
    if (form.role.trim()) fd.append('role', form.role.trim());
    fd.append('techStack', JSON.stringify(tech));
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
        {/* Repo + demo video on one row. */}
        <div className="project-form-row">
          <Input label="GitHub repository URL" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} placeholder="https://github.com/you/project" required />
          <Input label="Demo video URL (optional)" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=…" />
        </div>
        <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it does, the problem it solves, key features…" style={{ minHeight: '6rem' }} />
        <Input label="Your role in the project" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Full-stack developer · built the backend & the model" />
        <TechStackPicker value={tech} onChange={setTech} />
        <label className="field">
          <span className="field__label">Project document (PDF, max 10 MB)</span>
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
