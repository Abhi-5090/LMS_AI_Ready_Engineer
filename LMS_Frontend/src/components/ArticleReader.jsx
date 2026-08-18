import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, List, X } from 'lucide-react';
import { Markdown } from './Markdown';
import { MdErrorBoundary } from './MdErrorBoundary';
import { tocFromMarkdown } from '@/lib/markdown';
import './articleReader.css';

/**
 * A focused reading experience for a markdown article: a persistent "Contents"
 * side-nav (headings + subheadings, indented by level) beside a comfortable
 * reading column. Clicking a heading scrolls the article to that exact heading,
 * and a scroll-spy highlights whichever heading you're currently reading. Full
 * GFM is rendered (tables, task lists, code, images); if rendering ever fails the
 * raw markdown is shown so the article is never blank, and a download button
 * always makes the original text available.
 */
export function ArticleReader({ source }) {
  const md = source || '';
  const toc = useMemo(() => tocFromMarkdown(md), [md]);
  const hasToc = toc.length > 0;
  const [activeId, setActiveId] = useState('');
  const [tocOpen, setTocOpen] = useState(false); // narrow-screen drawer
  const bodyRef = useRef(null);

  // Scroll-spy: highlight the heading currently at the top of the reading column.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !hasToc) return undefined;
    const headings = toc.map((h) => root.querySelector(`#${CSS.escape(h.id)}`)).filter(Boolean);
    if (!headings.length) return undefined;
    setActiveId(headings[0].id);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -72% 0px', threshold: 0 },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [toc, hasToc]);

  function jump(id) {
    const el = bodyRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    setTocOpen(false); // close the drawer after choosing on mobile
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
    <div className={`article-reader${hasToc ? '' : ' article-reader--solo'}`}>
      {hasToc && (
        <>
          <aside className={`article-reader__toc${tocOpen ? ' is-open' : ''}`} aria-label="Article contents">
            <div className="article-reader__toc-title">On this page</div>
            <nav className="article-reader__toc-list">
              {toc.map((h, i) => (
                <button
                  type="button"
                  key={`${h.id}-${i}`}
                  className={`article-toc__link article-toc__link--h${Math.min(h.level, 3)}${activeId === h.id ? ' is-active' : ''}`}
                  onClick={() => jump(h.id)}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          </aside>
          {tocOpen && <div className="article-reader__scrim" onClick={() => setTocOpen(false)} aria-hidden />}
        </>
      )}

      <div className="article-reader__main" ref={bodyRef}>
        <div className="article-reader__toolbar">
          {hasToc && (
            <button
              type="button"
              className="article-reader__pill article-reader__pill--toc"
              onClick={() => setTocOpen((v) => !v)}
              aria-label={tocOpen ? 'Hide contents' : 'Show contents'}
              aria-expanded={tocOpen}
            >
              {tocOpen ? <X size={16} /> : <List size={16} />}
              <span>Contents</span>
            </button>
          )}
          <button type="button" className="article-reader__pill" onClick={download} aria-label="Download markdown" title="Download .md">
            <Download size={15} />
          </button>
        </div>

        <div className="article-reader__doc">
          {md.trim() ? (
            <MdErrorBoundary fallback={<pre className="article-reader__raw">{md}</pre>}>
              <Markdown source={md} />
            </MdErrorBoundary>
          ) : (
            <p className="lms-muted">This article has no content.</p>
          )}
        </div>
      </div>
    </div>
  );
}
