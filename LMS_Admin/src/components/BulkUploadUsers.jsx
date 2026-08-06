import { useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { UserRole } from '@/shared';
import { Button, Select } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useBulkCreateUsers } from '@/lib/users';

const ROLE_OPTS = [
  { value: UserRole.STUDENT, label: 'Student' },
  { value: UserRole.TRAINER, label: 'Trainer' },
];

const TEMPLATE_HEADERS = ['first name', 'last name', 'email', 'phone no'];

/** Map a spreadsheet header to a known field (case/space/punctuation tolerant). */
function fieldFor(header) {
  const k = String(header).toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'firstname' || k === 'first' || k === 'fname' || k === 'givenname') return 'firstName';
  if (k === 'lastname' || k === 'last' || k === 'lname' || k === 'surname') return 'lastName';
  if (k === 'name' || k === 'fullname') return 'name';
  if (k === 'email' || k === 'emailaddress' || k === 'mail' || k === 'emailid') return 'email';
  if (k === 'phone' || k === 'phoneno' || k === 'phonenumber' || k === 'mobile' || k === 'contact') return 'phone';
  return null;
}

function normalizeRows(raw) {
  return raw.map((row) => {
    const out = {};
    for (const [header, value] of Object.entries(row)) {
      const f = fieldFor(header);
      if (f && value != null && String(value).trim() !== '') out[f] = String(value).trim();
    }
    return out;
  });
}

/**
 * Bulk-import users from an .xlsx/.csv file. Renders the body of a Modal
 * (parent provides the <Modal> wrapper). When `batchId` is set, imported
 * students are enrolled into that batch and the role is locked to Student.
 */
export function BulkUploadUsers({ batchId = null, lockRole = false, onClose, onUploaded }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [role, setRole] = useState(UserRole.STUDENT);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const bulk = useBulkCreateUsers();

  const valid = (rows ?? []).filter((r) => r.email && (r.name || r.firstName || r.lastName));
  const invalid = (rows ?? []).length - valid.length;

  async function onFile(e) {
    setError('');
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = normalizeRows(raw);
      if (!mapped.length) setError('That file has no data rows.');
      setRows(mapped);
    } catch {
      setError('Could not read that file. Use a .xlsx or .csv export.');
      setRows(null);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['Ada', 'Lovelace', 'ada@example.com', '+1 555 0100'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'user-import-template.xlsx');
  }

  async function submit() {
    setError('');
    try {
      const res = await bulk.mutateAsync({
        users: valid.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          name: r.name,
          email: r.email,
          phone: r.phone,
        })),
        role: lockRole ? UserRole.STUDENT : role,
        ...(batchId ? { batchId } : {}),
      });
      setResult(res);
      onUploaded?.(res);
    } catch (e2) {
      setError(apiErrorMessage(e2));
    }
  }

  // ── Result view ───────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={20} />
          <strong>{result.createdCount} new user(s) added{batchId ? `, ${result.enrolledCount} enrolled` : ''}.</strong>
        </div>
        {result.existingCount > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              <Users size={16} /> {result.existingCount} already existing{batchId ? ' (enrolled into this batch)' : ''} — not re-created
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: 140, overflow: 'auto', fontSize: 'var(--font-size-sm)' }}>
              {result.existing.map((s, i) => (
                <li key={i} className="lms-muted">{s.email}</li>
              ))}
            </ul>
          </div>
        )}
        {result.skippedCount - (result.existingCount ?? 0) > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)', marginBottom: 4 }}>
              <AlertTriangle size={16} /> {result.skippedCount - (result.existingCount ?? 0)} skipped
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: 160, overflow: 'auto', fontSize: 'var(--font-size-sm)' }}>
              {result.skipped.filter((s) => s.reason !== 'Already exists').map((s, i) => (
                <li key={i} className="lms-muted">{s.email} — {s.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          Imported users have no password yet. They set one on first sign-in via an emailed OTP.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // ── Upload / preview view ─────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        Upload an Excel/CSV with columns <strong>first name</strong>, <strong>last name</strong>,{' '}
        <strong>email</strong>, <strong>phone no</strong>.
        {batchId ? ' Imported students are enrolled into this batch.' : ''}
      </p>

      <div style={{ alignSelf: 'flex-start' }}>
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          <Download size={15} style={{ marginRight: 6 }} /> Download template
        </Button>
      </div>

      {!lockRole && (
        <Select
          label="Import as"
          value={role}
          options={ROLE_OPTS}
          onChange={(e) => setRole(e.target.value)}
        />
      )}

      <label className="bulk-drop">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <UploadCloud size={28} />
        <span>{fileName || 'Choose a .xlsx or .csv file'}</span>
      </label>

      {rows && (
        <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSpreadsheet size={16} style={{ color: 'var(--color-primary)' }} />
          <span><strong>{valid.length}</strong> ready to import{invalid > 0 ? ` · ${invalid} row(s) missing email/name will be skipped` : ''}.</span>
        </div>
      )}

      {error && <div className="field__error">{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={bulk.isPending} disabled={!valid.length}>
          Import {valid.length || ''} user{valid.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
