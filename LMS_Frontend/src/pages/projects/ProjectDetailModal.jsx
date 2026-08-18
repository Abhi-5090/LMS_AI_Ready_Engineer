import { CheckCircle2, ExternalLink, FileText, Github, XCircle, Youtube } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { fileSrc } from '@/lib/api';
import './projects.css';

const STATUS = {
  pending: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

/**
 * Project detail "screen": all screenshots, repo link, title, description, status.
 * When `onApprove`/`onReject` are passed (reviewer context) it shows action buttons.
 */
export function ProjectDetailModal({ project, onClose, onApprove, onReject, busy }) {
  if (!project) return null;
  const s = STATUS[project.status] ?? STATUS.pending;
  const reviewer = Boolean(onApprove || onReject);

  return (
    <Modal open title={project.title} size="lg" onClose={onClose}>
      <div className="project-detail">
        <div className="project-detail__meta">
          <Badge tone={s.tone}>{s.label}</Badge>
          {project.student?.name && <span className="lms-muted">by {project.student.name}</span>}
          <a href={project.repoUrl} target="_blank" rel="noreferrer" className="ext-cert__open" style={{ display: 'inline-flex' }}>
            <Github size={14} /> Repository <ExternalLink size={12} />
          </a>
          {project.documentUrl && (
            <a href={fileSrc(project.documentUrl)} target="_blank" rel="noreferrer" className="ext-cert__open" style={{ display: 'inline-flex' }}>
              <FileText size={14} /> Document (PDF) <ExternalLink size={12} />
            </a>
          )}
          {project.videoUrl && (
            <a href={project.videoUrl} target="_blank" rel="noreferrer" className="ext-cert__open" style={{ display: 'inline-flex' }}>
              <Youtube size={14} /> Demo video <ExternalLink size={12} />
            </a>
          )}
        </div>

        {project.images?.length > 0 && (
          <div className="project-detail__images">
            {project.images.map((src, i) => (
              <a key={i} href={fileSrc(src)} target="_blank" rel="noreferrer">
                <img src={fileSrc(src)} alt={`${project.title} screenshot ${i + 1}`} />
              </a>
            ))}
          </div>
        )}

        <p className="project-detail__desc">{project.description}</p>

        {project.role && (
          <p className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}><strong>Role:</strong> {project.role}</p>
        )}
        {project.techStack?.length > 0 && (
          <div className="tech-chips" style={{ marginBottom: 0 }}>
            {project.techStack.map((t) => <span key={t} className="tech-chip" style={{ paddingRight: 10 }}>{t}</span>)}
          </div>
        )}

        {project.status === 'rejected' && project.note && (
          <p className="lms-muted">Reviewer note: “{project.note}”</p>
        )}

        {reviewer && project.status === 'pending' && (
          <div className="project-detail__actions">
            <Button loading={busy} onClick={onApprove}><CheckCircle2 size={15} /> Approve</Button>
            <Button variant="outline" disabled={busy} onClick={onReject}><XCircle size={15} /> Reject</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
