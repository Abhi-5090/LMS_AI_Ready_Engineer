import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import './markdown.css';

/**
 * Full GitHub-Flavored Markdown → React. Safe by default: react-markdown does
 * NOT render raw HTML (no rehype-raw) and sanitises link/image URLs, so article
 * content can't inject scripts. rehype-slug adds ids to headings so the article
 * reader's contents-nav can jump to them. Links open in a new tab.
 */
export function Markdown({ source, className = '' }) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          // eslint-disable-next-line no-unused-vars
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {source || ''}
      </ReactMarkdown>
    </div>
  );
}
