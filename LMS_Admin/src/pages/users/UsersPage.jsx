import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, UploadCloud, Users } from 'lucide-react';
import { UserRole, UserStatus } from '@/shared';
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, SkeletonTable, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { BulkUploadUsers } from '@/components/BulkUploadUsers';
import { apiErrorMessage, downloadFile } from '@/lib/api';
import {
  useApproveUser,
  useArchiveUser,
  useCreateUser,
  useEraseUser,
  useUpdateUser,
  useUsers,
} from '@/lib/users';
import { formatDate } from '@/lib/format';
import '../modules/modules.css';

const ROLE_TONE = { admin: 'primary', trainer: 'warning', student: 'neutral' };
const STATUS_TONE = { active: 'success', pending: 'warning', suspended: 'error', archived: 'neutral' };
const titleCase = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_OPTS = Object.values(UserRole).map((v) => ({ value: v, label: titleCase(v) }));
const STATUS_OPTS = Object.values(UserStatus).map((v) => ({ value: v, label: titleCase(v) }));

const NEW_USER = { name: '', email: '', password: '', role: UserRole.STUDENT, phone: '' };
const PAGE_SIZE = 500; // load the full filtered set; the table scrolls instead of paginating

export function UsersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ role: '', status: '', search: '', page: 1 });
  const query = useUsers({ ...filters, pageSize: PAGE_SIZE });
  const data = query.data;

  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [form, setForm] = useState(NEW_USER);
  const [editing, setEditing] = useState(null); // user being edited
  const [err, setErr] = useState('');

  const create = useCreateUser();
  const update = useUpdateUser();
  const approve = useApproveUser();
  const archive = useArchiveUser();
  const erase = useEraseUser();

  async function onExport(u) {
    try {
      await downloadFile(`/users/${u.id}/export`, `user-${u.id}-export.json`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onErase(u) {
    const ok = await confirm({
      title: `Erase ${u.name}'s data?`,
      message:
        'This permanently erases their personal data and uploaded files. It cannot be undone. Academic records are kept but de-identified.',
      confirmLabel: 'Erase',
      tone: 'danger',
    });
    if (!ok) return;
    erase.mutate(u.id, { onError: (err) => toast.error(apiErrorMessage(err)) });
  }

  async function onArchive(u) {
    if (await confirm({ title: `Archive ${u.name}?`, message: 'They will lose access until reactivated.' })) {
      archive.mutate(u.id);
    }
  }

  function setFilter(patch) {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  async function submitCreate(e) {
    e.preventDefault();
    setErr('');
    try {
      await create.mutateAsync({ ...form, phone: form.phone || undefined });
      setCreating(false);
      setForm(NEW_USER);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({ id: editing.id, name: editing.name, phone: editing.phone || undefined, status: editing.status });
      setEditing(null);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader title="User Management" subtitle="Onboard and manage students, trainers, and administrators." />

      <div className="toolbar">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Input placeholder="Search name or email…" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
          <Select
            value={filters.role}
            onChange={(e) => setFilter({ role: e.target.value })}
            options={[{ value: '', label: 'All roles' }, ...ROLE_OPTS]}
          />
          <Select
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value })}
            options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTS]}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="outline" onClick={() => setBulk(true)}>
            <UploadCloud size={16} style={{ marginRight: 6 }} /> Bulk upload
          </Button>
          <Button onClick={() => setCreating(true)}>+ New User</Button>
        </div>
      </div>

      {query.isError && <ErrorState message={apiErrorMessage(query.error)} onRetry={query.refetch} />}

      {query.isLoading && !data ? (
        <SkeletonTable rows={5} cols={5} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="No users match these filters"
          description="Try adjusting the search term, role, or status filters above."
        />
      ) : (
        <>
          <div className="table-wrap users-scroll">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{u.email}</div></td>
                    <td><Badge tone={ROLE_TONE[u.role]}>{titleCase(u.role)}</Badge></td>
                    <td><Badge tone={STATUS_TONE[u.status]}>{titleCase(u.status)}</Badge></td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="list-actions">
                        {u.role === UserRole.STUDENT && (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/app/students/${u.id}`)}>View</Button>
                        )}
                        {u.status === UserStatus.PENDING && (
                          <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(u.id)}>Approve</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setEditing({ id: u.id, name: u.name, phone: u.phone ?? '', status: u.status })}>Edit</Button>
                        <Button size="sm" variant="outline" title="Export this user's data (GDPR)" onClick={() => onExport(u)}><Download size={14} /></Button>
                        {u.status !== UserStatus.ARCHIVED && (
                          <Button size="sm" variant="ghost" onClick={() => onArchive(u)}>Archive</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => onErase(u)}>Erase</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              Showing {data?.items.length ?? 0} of {total} user{total === 1 ? '' : 's'} — scroll for more, or filter above.
            </span>
          </div>
        </>
      )}

      {/* Bulk upload */}
      <Modal open={bulk} title="Bulk upload users" onClose={() => setBulk(false)}>
        <BulkUploadUsers onClose={() => setBulk(false)} />
      </Modal>

      {/* Create */}
      <Modal
        open={creating}
        title="New User"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button form="create-user-form" type="submit" loading={create.isPending}>Create</Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={submitCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Temporary password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" required />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLE_OPTS} />
          <Input label="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={Boolean(editing)}
        title="Edit User"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button form="edit-user-form" type="submit" loading={update.isPending}>Save</Button>
          </>
        }
      >
        {editing && (
          <form id="edit-user-form" onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input label="Full name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            <Input label="Phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Select label="Status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} options={STATUS_OPTS} />
            {err && <span className="field__error">{err}</span>}
          </form>
        )}
      </Modal>
    </>
  );
}
