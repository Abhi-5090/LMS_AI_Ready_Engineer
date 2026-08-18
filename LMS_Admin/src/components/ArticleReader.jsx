import { useMemo, useRef, useState } from 'react';
import { Download, List, X } from 'lucide-react';
import { Markdown } from './Markdown';
import { MdErrorBoundary } from './MdErrorBoundary';
import { tocFromMarkdown } from '@/lib/markdown';
import './articleReader.css';

/**
 * Reads a markdown article with a toggleable "Contents" navigation. Full GFM is
 * rendered (tables, task lists, etc.); if rendering ever fails, the raw markdown
 * is shown instead so the article is never blank. A download button always makes
 * the original text available.
 */
export function ArticleReader({ source }) {
  const md = source || '';
  const toc = useMemo(() => tocFromMarkdown(md), [md]);
  const [showToc, setShowToc] = useState(false);
  const bodyRef = useRef(null);

  function jump(id) {
    const el = bodyRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth < 720) setShowToc(false); // collapse the overlay on mobile
  }

  function download() {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'article.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="article-reader">
      <div className="article-reader__actions">
        {toc.length > 0 && (
          <button
            type="button"
            className="article-reader__toggle"
            onClick={() => setShowToc((v) => !v)}
            aria-label={showToc ? 'Hide contents' : 'Show contents'}
            aria-expanded={showToc}
            title="Contents"
          >
            {showToc ? <X size={18} /> : <List size={18} />}
          </button>
        )}
        <button type="button" className="article-reader__toggle" onClick={download} aria-label="Download markdown" title="Download .md">
          <Download size={17} />
        </button>
      </div>

      {showToc && toc.length > 0 && (
        <nav className="article-reader__toc" aria-label="Article contents">
          <div className="article-reader__toc-title">Contents</div>
          {toc.map((h, i) => (
            <button
              type="button"
              key={`${h.id}-${i}`}
              className={`article-toc__link article-toc__link--h${Math.min(h.level, 3)}`}
              onClick={() => jump(h.id)}
            >
              {h.text}
            </button>
          ))}
        </nav>
      )}

      <div className="article-reader__body" ref={bodyRef}>
        {md.trim() ? (
          <MdErrorBoundary fallback={<pre className="article-reader__raw">{md}</pre>}>
            <Markdown source={md} />
          </MdErrorBoundary>
        ) : (
          <p className="lms-muted">This article has no content.</p>
        )}
      </div>
    </div>
  );
}
