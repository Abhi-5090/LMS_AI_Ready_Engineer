import { FileText, ExternalLink } from 'lucide-react';
import { fileSrc } from '@/lib/api';

/**
 * The stimulus a prompt-writing question shows the student: an image inline, a PDF
 * embedded (with an open-in-new-tab fallback), or a document as a download link.
 * The student writes a prompt to achieve the question's goal based on this.
 */
export function QuestionMedia({ url, type, name }) {
  if (!url) return null;
  const src = fileSrc(url);

  return (
    <div className="q-media">
      {type === 'image' ? (
        <a href={src} target="_blank" rel="noopener noreferrer" title="Open full size">
          <img className="q-media__img" src={src} alt={name || 'Question stimulus'} />
        </a>
      ) : type === 'pdf' ? (
        <>
          <object className="q-media__pdf" data={src} type="application/pdf" aria-label={name || 'PDF stimulus'}>
            <p className="q-media__fallback">
              <a href={src} target="_blank" rel="noopener noreferrer">Open the PDF ({name || 'document.pdf'})</a>
            </p>
          </object>
          <a className="q-media__open" href={src} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open PDF in a new tab
          </a>
        </>
      ) : (
        <a className="q-media__doc" href={src} target="_blank" rel="noopener noreferrer">
          <FileText size={16} /> {name || 'Open the document'} <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}
