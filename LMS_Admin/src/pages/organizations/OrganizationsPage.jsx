import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, LogIn, Plus, Search, Settings2, Trash2, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, SkeletonCards, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCreateOrganization, useDeleteOrganization, useOrganizations } from '@/lib/organizations';
import '../modules/modules.css';

const BLANK = { name: '', code: '', adminName: '', adminEmail: '', adminPassword: '' };

export function OrganizationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setOrgView = useAuth((s) => s.setOrgView);
  const { data: orgs, isLoading, isError, error, refetch } = useOrganizations();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(null); // org pending delete
  const [confirmText, setConfirmText] = useState('');
  const [q, setQ] = useState('');
  const create = useCreateOrganization();
  const del = useDeleteOrganization();
  const toast = useToast();

  async function confirmDelete() {
    try {
      await del.mutateAsync(deleting.id);
      toast.success(`“${deleting.name}” and all its data were deleted.`);
      setDeleting(null);
      setConfirmText('');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  // Drill into an org: act as its admin. Clear cached (global) data first.
  function enter(org) {
    setOrgView({ id: org.id, name: org.name });
    qc.clear();
    navigate('/app', { replace: true });
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const wantsAdmin = form.adminName || form.adminEmail || form.adminPassword;
    if (wantsAdmin && !(form.adminName && form.adminEmail && form.adminPassword.length >= 8)) {
      return setErr('For the first admin, fill name, email, and a password of at least 8 characters (or leave all three blank).');
    }
    try {
      const body = { name: form.name.trim(), code: form.code.trim() };
      if (wantsAdmin) Object.assign(body, { adminName: form.adminName.trim(), adminEmail: form.adminEmail.trim(), adminPassword: form.adminPassword });
      await create.mutateAsync(body);
      setCreating(false);
      setForm(BLANK);
      toast.success('Organization created.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  const term = q.trim().toLowerCase();
  const filtered = (orgs ?? []).filter((o) => !term || `${o.name} ${o.code}`.toLowerCase().includes(term));

  return (
    <>
      <PageHeader title="Organizations" subtitle="Each organization is an isolated tenant with its own admins, trainers, students, and curriculum." />

      <div className="toolbar">
        <div style={{ position: 'relative', flex: 1, minWidth: '15rem', maxWidth: '22rem' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code…" aria-label="Search organizations" style={{ paddingLeft: '2.2rem' }} />
        </div>
        <span style={{ marginLeft: 'auto' }} />
        <Button onClick={() => setCreating(true)}><Plus size={15} style={{ marginRight: 6 }} /> New organization</Button>
      </div>

      {isLoading && !orgs ? (
        <SkeletonCards count={4} height="10rem" />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : orgs && orgs.length === 0 ? (
        <EmptyState icon={<Building2 size={26} />} title="No organizations yet" description="Create the first organization and its admin." action={<Button onClick={() => setCreating(true)}><Plus size={15} style={{ marginRight: 6 }} /> New organization</Button>} />
      ) : filtered.length === 0 ? (
        <p className="lms-muted" style={{ padding: 'var(--space-4)' }}>No organizations match “{q}”.</p>
      ) : (
        <div className="module-grid">
          {filtered.map((o) => (
            <Card key={o.id} className="module-card">
              <div className="module-card__top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span className="module-card__icon"><Building2 size={20} /></span>
                  <div>
                    <div className="module-card__name">{o.name}</div>
                    <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>{o.code}</div>
                  </div>
                </div>
                <Badge tone={o.status === 'active' ? 'success' : 'warning'}>{o.status === 'active' ? 'Active' : 'Suspended'}</Badge>
              </div>
              <div className="module-card__meta">
                <Badge tone="neutral">{o.counts?.admins ?? 0} admins</Badge>
                <Badge tone="neutral">{o.counts?.trainers ?? 0} trainers</Badge>
                <Badge tone="neutral">{o.counts?.students ?? 0} students</Badge>
                <Badge tone="neutral">{o.counts?.batches ?? 0} batches</Badge>
              </div>
              <div className="list-actions">
                <Button size="sm" onClick={() => enter(o)}><LogIn size={14} style={{ marginRight: 6 }} /> Enter</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/app/organizations/${o.id}`)}><Settings2 size={14} style={{ marginRight: 6 }} /> Manage</Button>
                <Button size="sm" variant="ghost" title="Delete organization" onClick={() => { setDeleting(o); setConfirmText(''); }}><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={creating} title="New organization" onClose={() => setCreating(false)}
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button form="org-form" type="submit" loading={create.isPending}>Create</Button></>}>
        <form id="org-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Organization name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Institute" required />
          <Input label="Short code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. ACME" required />
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)' }}>
              <Users size={16} /> First admin <span className="lms-muted" style={{ fontWeight: 400 }}>(optional — you can add admins later)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Input label="Admin name" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="e.g. Priya Sharma" />
              <Input label="Admin email" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@acme.com" />
              <Input label="Admin password" type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="At least 8 characters" />
            </div>
          </div>
          <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>The new organization gets its own private copy of the default curriculum.</p>
          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>

      {/* Cascade delete — type the code to confirm. */}
      <Modal
        open={Boolean(deleting)}
        title="Delete organization"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={del.isPending} disabled={confirmText.trim().toUpperCase() !== deleting?.code} onClick={confirmDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        {deleting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0 }}>
              This permanently deletes <strong>{deleting.name}</strong> and <strong>everything inside it</strong> —
              all its admins, trainers, students, batches, curriculum, assessments, submissions, resources, and records.
              <strong> This cannot be undone.</strong>
            </p>
            <Input
              label={`Type the code “${deleting.code}” to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleting.code}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
