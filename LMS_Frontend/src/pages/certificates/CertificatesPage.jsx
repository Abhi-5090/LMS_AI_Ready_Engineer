import { useEffect, useState } from 'react';
import { Award, Download, Eye, ExternalLink, FileText, Share2, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Skeleton, SkeletonCards, Spinner, useConfirm, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useMyCertificates, downloadCertificatePdf, fetchCertificatePdfUrl } from '@/lib/certificates';
import {
  useAddExternalCertificate,
  useDeleteExternalCertificate,
  useMyExternalCertificates,
} from '@/lib/externalCertificates';
import './certificates.css';
import '../modules/modules.css';

// Share a certificate link — the native share sheet (any app) when available,
// otherwise a LinkedIn share dialog.
function shareLink(url, title) {
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => { /* user cancelled */ });
  } else {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
  }
}
// An absolute external URL we can safely share (not a private in-app upload).
const isShareable = (u = '') => /^https?:\/\//i.test(u) && !u.includes('/api/uploads/') && !u.startsWith('/uploads/');

export function CertificatesPage() {
  return <StudentCertificates />;
}

function certTitle(c) {
  return c.isProgramCertificate ? 'AI Ready Engineer Program' : c.module?.name ?? 'Module';
}

const certSlug = (c) =>
  `${certTitle(c)}-${c.certificateId}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'certificate';

const isImage = (url = '') => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);

// Approval state badges for student-uploaded certificates.
const CERT_STATUS = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

/** Renders the actual certificate PDF as the card's preview (non-interactive). */
function CertificateThumb({ certificateId, title }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let created = null;
    setUrl(null);
    setFailed(false);
    fetchCertificatePdfUrl(certificateId)
      .then((u) => { if (active) { created = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [certificateId]);

  return (
    <div className="cert-thumb" aria-label={title}>
      {failed ? (
        <div className="cert-thumb__fallback"><Award size={30} /></div>
      ) : !url ? (
        <div className="cert-thumb__loading"><Spinner size={22} /></div>
      ) : (
        <object
          data={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
          type="application/pdf"
          className="cert-thumb__pdf"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function StudentCertificates() {
  const toast = useToast();
  const { data: certs, isLoading, isError, error, refetch } = useMyCertificates();
  const [preview, setPreview] = useState(null); // { cert, url } — the certificate PDF preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busyId, setBusyId] = useState(null); // certificate currently downloading

  async function openPreview(c) {
    setPreview({ cert: c, url: null });
    setPreviewLoading(true);
    try {
      const url = await fetchCertificatePdfUrl(c.certificateId);
      setPreview({ cert: c, url });
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }
  function closePreview() {
    setPreview((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });
  }
  async function download(c) {
    setBusyId(c.id);
    try {
      await downloadCertificatePdf(c.certificateId, `${certSlug(c)}.pdf`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Certificates"
        subtitle="Your AI Ready Engineer certificates, plus any you've earned elsewhere."
      />

      <div className="cert-columns">
        {/* ── AI Ready Engineer certificates (auto-earned) ── */}
        <Card>
          <CardHeader
            title="AI Ready Engineer Certificates"
            subtitle="Earned automatically as you complete each module in the program."
          />
          {isError ? (
            <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
          ) : isLoading && !certs ? (
            <SkeletonCards count={3} height="4rem" />
          ) : certs && certs.length === 0 ? (
            <EmptyState
              icon={<Award size={26} />}
              title="No certificates yet"
              description="No certificates yet. Complete a module — pass its final assessment and meet the attendance requirement — to earn one automatically."
            />
          ) : (
            <div className="cert-card-grid cert-card-grid--preview">
              {certs?.map((c) => (
                <div key={c.id} className="cert-card cert-card--preview">
                  {/* The whole certificate, rendered as the preview — nothing overlaid. */}
                  <div className="cert-tile">
                    <CertificateThumb certificateId={c.certificateId} title={certTitle(c)} />
                    {/* Revealed on hover, at the bottom: preview · download · share. */}
                    <div className="cert-card__hover">
                      <button type="button" className="cert-hover-btn" aria-label={`Preview ${certTitle(c)}`} onClick={() => openPreview(c)}>
                        <Eye size={15} /> Preview
                      </button>
                      <button type="button" className="cert-hover-btn" aria-label={`Download ${certTitle(c)}`} disabled={busyId === c.id} onClick={() => download(c)}>
                        <Download size={15} /> Download
                      </button>
                      <button type="button" className="cert-hover-btn" aria-label={`Share ${certTitle(c)}`} onClick={() => shareLink(`${window.location.origin}/verify/${c.certificateId}`, `${certTitle(c)} — AI Ready Engineer certificate`)}>
                        <Share2 size={15} /> Share
                      </button>
                    </div>
                  </div>
                  {/* Certificate name (module name) below the preview. */}
                  <div className="cert-card__caption">
                    {certTitle(c)}
                    {c.isProgramCertificate && <Badge tone="success">Program</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Other certificates (student-uploaded, external) ── */}
        <Card>
          <ExternalCertificates />
        </Card>
      </div>

      <Modal
        open={Boolean(preview)}
        size="lg"
        title={preview ? certTitle(preview.cert) : 'Certificate'}
        onClose={closePreview}
        footer={
          <>
            <Button variant="outline" onClick={closePreview}>Close</Button>
            {preview?.cert && (
              <Button onClick={() => download(preview.cert)} disabled={busyId === preview.cert.id}>
                <Download size={15} style={{ marginRight: 6 }} /> Download
              </Button>
            )}
          </>
        }
      >
        {previewLoading || !preview?.url ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}><Spinner size={30} /></div>
        ) : (
          <object data={preview.url} type="application/pdf" className="cert-preview-pdf" aria-label="Certificate preview">
            <p className="lms-muted" style={{ padding: 'var(--space-4)' }}>
              Preview isn’t available here — <a href={preview.url} target="_blank" rel="noreferrer">open the PDF</a> instead.
            </p>
          </object>
        )}
      </Modal>
    </>
  );
}

const BLANK = { title: '', issuer: '', url: '', file: null, mode: 'link' };

function ExternalCertificates() {
  const confirm = useConfirm();
  const { data: items, isLoading, isError, error, refetch } = useMyExternalCertificates();
  const add = useAddExternalCertificate();
  const del = useDeleteExternalCertificate();
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.title.trim()) return setErr('Enter a certificate title.');
    if (form.mode === 'link' && !form.url.trim()) return setErr('Paste the certificate link.');
    if (form.mode === 'file' && !form.file) return setErr('Choose a PDF or image to upload.');
    try {
      if (form.mode === 'file') {
        const fd = new FormData();
        fd.append('title', form.title.trim());
        if (form.issuer.trim()) fd.append('issuer', form.issuer.trim());
        fd.append('file', form.file);
        await add.mutateAsync(fd);
      } else {
        await add.mutateAsync({
          title: form.title.trim(),
          ...(form.issuer.trim() ? { issuer: form.issuer.trim() } : {}),
          url: form.url.trim(),
        });
      }
      setForm(BLANK);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <>
      <CardHeader
        title="Other Certificates"
        subtitle="Add certificates you've earned outside the program — paste a link or upload a PDF/image."
      />

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !items ? (
        <Skeleton height="7rem" radius="var(--radius-lg)" />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={<Award size={26} />}
          title="Nothing here yet"
          description="Nothing here yet. Add your first external certificate below."
        />
      ) : (
        <div className="ext-cert-grid">
          {items.map((c) => (
            <div key={c.id} className="ext-cert">
              <div className="ext-cert__head">
                <div className="ext-cert__thumb">
                  {isImage(c.url) ? <img src={fileSrc(c.url)} alt={c.title} /> : <FileText size={20} />}
                </div>
                <Badge tone={CERT_STATUS[c.status]?.tone ?? 'neutral'}>
                  {CERT_STATUS[c.status]?.label ?? 'Pending'}
                </Badge>
              </div>
              <div className="ext-cert__title">{c.title}</div>
              {c.issuer && <div className="ext-cert__issuer lms-muted">{c.issuer}</div>}
              {c.status === 'rejected' && c.note && (
                <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>“{c.note}”</div>
              )}
              <div className="ext-cert__foot">
                <a href={fileSrc(c.url)} target="_blank" rel="noreferrer" className="ext-cert__open">
                  <ExternalLink size={13} /> Open
                </a>
                {isShareable(c.url) && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Share ${c.title}`}
                    title="Share on LinkedIn"
                    onClick={() => shareLink(c.url, `${c.title}${c.issuer ? ` — ${c.issuer}` : ''}`)}
                  >
                    <Share2 size={13} />
                  </button>
                )}
                {/* Approved certificates are locked; only pending/rejected can be removed. */}
                {c.status !== 'approved' && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Remove ${c.title}`}
                    title="Remove"
                    onClick={async () => { if (await confirm({ title: 'Remove this certificate?', tone: 'danger', confirmLabel: 'Remove' })) del.mutate(c.id); }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="ext-cert-add">
        <Input label="Certificate title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. AWS Certified AI Practitioner" />
        <Input label="Issuer (optional)" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="e.g. Amazon, Coursera" />

        <div className="ext-cert-add__toggle">
          <button type="button" className={form.mode === 'link' ? 'is-active' : ''} onClick={() => setForm({ ...form, mode: 'link' })}>Paste link</button>
          <button type="button" className={form.mode === 'file' ? 'is-active' : ''} onClick={() => setForm({ ...form, mode: 'file' })}>Upload file</button>
        </div>

        {form.mode === 'link' ? (
          <Input label="Certificate link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
        ) : (
          <label className="field">
            <span className="field__label">PDF or image</span>
            <input type="file" accept=".pdf,image/*" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
          </label>
        )}

        {err && <span className="field__error">{err}</span>}
        <Button type="submit" loading={add.isPending} style={{ alignSelf: 'flex-start' }}>
          <Upload size={15} /> Add certificate
        </Button>
      </form>
    </>
  );
}
