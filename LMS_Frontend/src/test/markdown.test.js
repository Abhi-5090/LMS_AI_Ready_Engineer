// @vitest-environment node
// Pure-function test (no DOM) — run in node to avoid the jsdom worker's
// html-encoding-sniffer ESM-require issue.
import { describe, it, expect } from 'vitest';
import { tocFromMarkdown } from '@/lib/markdown';

// Rendering is handled by react-markdown + remark-gfm (see components/Markdown.jsx);
// here we only cover the contents-outline helper, whose ids must match the
// rehype-slug ids on the rendered headings (both use github-slugger).
describe('tocFromMarkdown', () => {
  it('extracts the heading outline with levels and ids', () => {
    const md = '# Intro\nsome text\n## Setup\n### Details\n## Wrap up';
    expect(tocFromMarkdown(md)).toEqual([
      { level: 1, text: 'Intro', id: 'intro' },
      { level: 2, text: 'Setup', id: 'setup' },
      { level: 3, text: 'Details', id: 'details' },
      { level: 2, text: 'Wrap up', id: 'wrap-up' },
    ]);
  });

  it('de-duplicates repeated headings (github-slugger style)', () => {
    expect(tocFromMarkdown('## Notes\n## Notes').map((h) => h.id)).toEqual(['notes', 'notes-1']);
  });

  it('ignores headings inside code fences and strips inline markdown from the text', () => {
    const md = '# Real **bold** heading\n```\n# not a heading\n```';
    expect(tocFromMarkdown(md)).toEqual([{ level: 1, text: 'Real bold heading', id: 'real-bold-heading' }]);
  });

  it('handles empty input', () => {
    expect(tocFromMarkdown('')).toEqual([]);
    expect(tocFromMarkdown(null)).toEqual([]);
    expect(tocFromMarkdown(undefined)).toEqual([]);
  });
});
