/**
 * Article markdown helpers. Rendering is done by `react-markdown` + `remark-gfm`
 * (see components/Markdown.jsx) — full GitHub-Flavored Markdown: headings, bold/
 * italic/strikethrough, links & autolinks, images, inline & fenced code, bullet/
 * numbered/task lists, blockquotes, tables, and dividers. Raw HTML is NOT rendered
 * (safe by default) and link URLs are sanitised by react-markdown.
 *
 * This module only provides the "Contents" outline (heading ids match the ones
 * rehype-slug emits, via the same github-slugger) and the author cheat-sheet.
 */
import GithubSlugger from 'github-slugger';

/** Strip inline markdown markers to plain text (for the contents list + slugging). */
function plainText(s) {
  return String(s)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

/**
 * Extract the heading outline for a "Contents" navigation. Returns
 * [{ level, text, id }] in document order. Ids are produced with github-slugger,
 * exactly matching the ids rehype-slug adds to the rendered headings, so a click
 * can jump to them. Headings inside fenced code blocks are ignored.
 */
export function tocFromMarkdown(md) {
  if (!md) return [];
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const slugger = new GithubSlugger();
  const toc = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const text = plainText(h[2]);
      toc.push({ level: h[1].length, text, id: slugger.slug(text) });
    }
  }
  return toc;
}

/** The formatting cheat-sheet shown to authors (syntax → what it does). */
export const MARKDOWN_HELP = [
  { syntax: '# Heading', does: 'Large heading' },
  { syntax: '**bold text**', does: 'Bold text' },
  { syntax: '*italic text*', does: 'Italic text' },
  { syntax: '~~strikethrough~~', does: 'Struck-through text' },
  { syntax: '- item', does: 'Bullet list' },
  { syntax: '1. item', does: 'Numbered list' },
  { syntax: '- [ ] task', does: 'Checklist' },
  { syntax: '> quote', does: 'Quote block' },
  { syntax: '`code`', does: 'Inline code' },
  { syntax: '```\\ncode\\n```', does: 'Code block' },
  { syntax: '| a | b |', does: 'Table' },
  { syntax: '![alt](image-url)', does: 'Image' },
  { syntax: '[text](https://link)', does: 'Link' },
  { syntax: '---', does: 'Divider line' },
];
