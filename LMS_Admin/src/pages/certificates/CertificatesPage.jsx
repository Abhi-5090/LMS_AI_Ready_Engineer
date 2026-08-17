import { useEffect, useState } from 'react';
import { Award, Download, Search } from 'lucide-react';
import { UserRole } from '@/shared';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, SkeletonCards, SkeletonTable, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchAllCertificates, useAllCertificates, useMyCertificates } from '@/lib/certificates';
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

const CERT_PAGE_SIZE = 50;

function AdminCertificates() {
  const { data: batches } = useBatches();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState(''); // debounced value sent to the server
  const [batchId, setBatchId] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so we don't hit the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError, error, refetch } = useAllCertificates({ page, pageSize: CERT_PAGE_SIZE, batch: batchId, search });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / CERT_PAGE_SIZE));

  const batchOptions = [
    { value: '', label: 'All batches' },
    ...(batches ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
  ];

  async function exportExcel() {
    setExporting(true);
    try {
      const all = await fetchAllCertificates({ batch: batchId, search });
      if (all.length === 0) { toast.error('Nothing to export.'); return; }
      const XLSX = await import('xlsx'); // load the heavy parser only on demand
      const rows = all.map((c) => ({
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
    } finally {
      setExporting(false);
    }
  }

  const noneAtAll = total === 0 && !search && !batchId;

  return (
    <>
      <PageHeader title="Certificates" subtitle="All certificates issued across the institution." />
      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <SkeletonTable rows={5} cols={5} />
      ) : noneAtAll ? (
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
              <Select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }} options={batchOptions} aria-label="Filter by batch" />
            </div>
            <span className="cert-toolbar__count">{total} total</span>
            <Button variant="outline" onClick={exportExcel} loading={exporting} disabled={total === 0}>
              <Download size={15} style={{ marginRight: 6 }} /> Export to Excel
            </Button>
          </div>

          <div className="table-wrap cert-table-scroll">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Batch</th><th>Certificate</th><th>Type</th><th>Issued</th><th>ID</th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="lms-muted" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>No certificates match your filters.</td></tr>
                ) : (
                  items.map((c) => (
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              {total === 0 ? 'No certificates' : `Showing ${(page - 1) * CERT_PAGE_SIZE + 1}–${(page - 1) * CERT_PAGE_SIZE + items.length} of ${total}`}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>Page {page} of {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
