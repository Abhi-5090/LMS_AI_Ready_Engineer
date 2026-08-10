import { useMemo, useState } from 'react';
import { Award, Download, Search } from 'lucide-react';
import { UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, SkeletonCards, SkeletonTable, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllCertificates, useMyCertificates } from '@/lib/certificates';
import { useBatches } from '@/lib/batches';
import { formatDate } from '@/lib/format';
import { Certificate } from './Certificate';
import './certificates.css';
import '../modules/modules.css';

export function CertificatesPage() {
  const role = useAuth((s) => s.user?.role);
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  return isAdmin ? <AdminCertificates /> : <StudentCertificates />;
}

function certTitle(c) {
  return c.isProgramCertificate ? 'AI Ready Engineer Program' : c.module?.name ?? 'Module';
}

function batchLabel(c) {
  return c.batch?.name ?? c.batch?.code ?? '—';
}

// ── Student ────────────────────────────────────────────────────────────────────

function StudentCertificates() {
  const user = useAuth((s) => s.user);
  const { data: certs, isLoading, isError, error, refetch } = useMyCertificates();
  const [view, setView] = useState(null);

  return (
    <>
      <PageHeader title="Certificates" subtitle="Earned automatically as you complete modules." />
      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !certs ? (
        <SkeletonCards count={4} height="7rem" />
      ) : certs && certs.length === 0 ? (
        <EmptyState
          icon={<Award size={26} />}
          title="No certificates yet"
          description="Complete a module — pass its final assessment and meet the attendance requirement — to earn one automatically."
        />
      ) : (
        <div className="module-grid">
          {certs?.map((c) => (
            <Card key={c.id} className="cert-card">
              <div>
                <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{certTitle(c)}</div>
                <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {formatDate(c.issuedAt)} · {c.certificateId}
                </div>
                {c.isProgramCertificate && <Badge tone="success">Program</Badge>}
              </div>
              <Button size="sm" onClick={() => setView(c)}>View</Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(view)}
        title="Certificate"
        onClose={() => setView(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setView(null)}>Close</Button>
            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </>
        }
      >
        {view && (
          <div className="cert-print-area">
            <Certificate certificate={view} studentName={user?.name ?? 'Student'} />
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Admin ────────────────────────────────────────────────────────────────────

function AdminCertificates() {
  const { data: certs, isLoading, isError, error, refetch } = useAllCertificates();
  const { data: batches } = useBatches();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [batchId, setBatchId] = useState('');

  const batchOptions = [
    { value: '', label: 'All batches' },
    ...(batches ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
  ];

  // Filter by the selected batch, then search by student name/email OR by
  // certificate (module name + certificate ID).
  const filtered = useMemo(() => {
    let list = certs ?? [];
    if (batchId) list = list.filter((c) => c.batch?.id === batchId);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      [c.student?.name, c.student?.email, certTitle(c), batchLabel(c), c.certificateId]
        .some((v) => String(v ?? '').toLowerCase().includes(needle)),
    );
  }, [certs, q, batchId]);

  async function exportExcel() {
    if (filtered.length === 0) { toast.error('Nothing to export.'); return; }
    try {
      const XLSX = await import('xlsx'); // load the heavy parser only on demand
      const rows = filtered.map((c) => ({
        Student: c.student?.name ?? '',
        Email: c.student?.email ?? '',
        Batch: batchLabel(c),
        Certificate: certTitle(c),
        Type: c.isProgramCertificate ? 'Program' : 'Module',
        Issued: formatDate(c.issuedAt),
        'Certificate ID': c.certificateId,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 24 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Certificates');
      XLSX.writeFile(wb, `certificates-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  const hasCerts = certs && certs.length > 0;

  return (
    <>
      <PageHeader title="Certificates" subtitle="All certificates issued across the institution." />
      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !certs ? (
        <SkeletonTable rows={5} cols={5} />
      ) : !hasCerts ? (
        <EmptyState
          icon={<Award size={26} />}
          title="No certificates have been issued yet"
          description="Certificates issued to students across the institution will appear here."
        />
      ) : (
        <>
          <div className="cert-toolbar">
            <div className="cert-toolbar__search">
              <Search size={16} className="cert-toolbar__search-icon" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by student name, email, certificate or ID…"
                aria-label="Search certificates"
              />
            </div>
            <div className="cert-toolbar__batch">
              <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} options={batchOptions} aria-label="Filter by batch" />
            </div>
            <span className="cert-toolbar__count">{filtered.length} of {certs.length}</span>
            <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
              <Download size={15} style={{ marginRight: 6 }} /> Export to Excel
            </Button>
          </div>

          <div className="table-wrap cert-table-scroll">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Batch</th><th>Certificate</th><th>Type</th><th>Issued</th><th>ID</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="lms-muted" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>No certificates match your filters.</td></tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id}>
                      <td>{c.student?.name}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{c.student?.email}</div></td>
                      <td>{batchLabel(c)}</td>
                      <td>{certTitle(c)}</td>
                      <td>{c.isProgramCertificate ? <Badge tone="success">Program</Badge> : <Badge tone="neutral">Module</Badge>}</td>
                      <td>{formatDate(c.issuedAt)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>{c.certificateId}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
