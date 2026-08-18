import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import MarkdownIt from 'markdown-it';
import { ResourceType, UserRole } from '#shared';
import { Batch, Module, Resource, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { gridfsStorage, deleteByUrl } from '../services/fileStore.js';

// Server-side markdown → HTML for the standalone article view. html:false means
// raw HTML in the source is escaped (never executed); linkify turns bare URLs
// into links. GFM tables/strikethrough are supported out of the box.
const mdRenderer = new MarkdownIt({ html: false, linkify: true, typographer: true });
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const objectId = z.string().length(24);
export const moduleQuery = z.object({ module: objectId });
export const resourceIdParam = z.object({ id: objectId });

// ── Multer (in-memory → MongoDB/GridFS via fileStore) ─────────────────────────
// Allowlist learning-material types only — block executables/scripts/HTML to
// avoid stored-XSS or malware being served from our origin.
const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', // .svg excluded — it can carry executable scripts (stored XSS)
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.zip',
]);
const BLOCKED_MIME = /(text\/html|application\/x-msdownload|application\/x-sh|application\/javascript)/i;

export const uploadResourceFile = multer({
  storage: gridfsStorage('resource'),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }, // 100 MB, single file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) || BLOCKED_MIME.test(file.mimetype)) {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', `File type not allowed: ${ext || file.mimetype}`));
    }
    cb(null, true);
  },
}).single('file');

const addBodySchema = z.object({
  module: objectId,
  type: z.nativeEnum(ResourceType),
  title: z.string().min(1).max(200),
  topic: objectId.optional(),
  url: z.string().url().optional(), // required for video/link when no file is uploaded
  content: z.string().max(200000).optional(), // markdown body — required for articles
});

export const updateResourceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(200000).optional(),
});

/** Admin, or a trainer assigned to the module. Returns the module doc. */
async function loadModuleForEdit(moduleId, auth) {
  const module = await Module.findById(moduleId).select('assignedTrainers');
  if (!module) throw ApiError.badRequest('Module not found');
  if (auth.role === UserRole.TRAINER) {
    const assigned = module.assignedTrainers.some((t) => t.toString() === auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  return module;
}

/** Can the requester view this module's resources? */
async function assertCanView(moduleId, auth) {
  if (auth.role === UserRole.ADMIN) return;
  if (auth.role === UserRole.TRAINER) return; // trainers may browse the catalog
  // Student: only if the module is part of their batch.
  const me = await User.findById(auth.userId).select('batch');
  if (!me?.batch) throw ApiError.forbidden('You are not enrolled in a batch');
  const inBatch = await Batch.exists({ _id: me.batch, modules: moduleId });
  if (!inBatch) throw ApiError.forbidden('This module is not part of your curriculum');
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function listResources(req, res) {
  const moduleId = req.query.module;
  await assertCanView(moduleId, req.auth);
  let resources = await Resource.find({ module: moduleId })
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'name');

  // Students only see resources for topics their trainer has marked TAUGHT in
  // their batch (i.e. released). Trainers/admins see everything.
  if (req.auth.role === UserRole.STUDENT) {
    const me = await User.findById(req.auth.userId).select('batch');
    const batch = me?.batch ? await Batch.findById(me.batch).select('taughtTopics') : null;
    const entry = batch?.taughtTopics?.find((tt) => tt.module.toString() === moduleId);
    const taught = new Set((entry?.topics ?? []).map((t) => t.toString()));
    resources = resources.filter((r) => r.topic && taught.has(r.topic.toString()));
  }
  ok(res, resources.map((r) => r.toJSON()));
}

/** Add a resource — either an uploaded file (multipart `file`) or an external `url`. */
export async function addResource(req, res) {
  const parsed = addBodySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Validation failed', parsed.error.flatten());
  const { module, type, title, topic, url, content } = parsed.data;

  await loadModuleForEdit(module, req.auth);

  let finalUrl = '';
  let finalContent = '';
  if (type === ResourceType.ARTICLE) {
    // Articles carry markdown text directly — no file, no URL.
    if (!content || !content.trim()) throw ApiError.badRequest('An article needs some content.');
    finalContent = content;
  } else if (req.file) {
    finalUrl = req.file.url;
  } else if (url) {
    finalUrl = url;
  } else {
    throw ApiError.badRequest('Provide a file upload or a url');
  }

  const resource = await Resource.create({
    module,
    topic,
    type,
    title,
    url: finalUrl,
    content: finalContent,
    uploadedBy: req.auth.userId,
  });
  ok(res, resource.toJSON(), 201);
}

/** Edit an article's title/content (articles only — others are re-added). */
export async function updateResource(req, res) {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw ApiError.notFound('Resource not found');
  await loadModuleForEdit(resource.module, req.auth);
  if (resource.type !== ResourceType.ARTICLE) {
    throw ApiError.badRequest('Only articles can be edited. Delete and re-add other materials.');
  }
  const { title, content } = req.body;
  if (title !== undefined) resource.title = title;
  if (content !== undefined) {
    if (!content.trim()) throw ApiError.badRequest('An article needs some content.');
    resource.content = content;
  }
  await resource.save();
  ok(res, resource.toJSON());
}

export async function deleteResource(req, res) {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw ApiError.notFound('Resource not found');
  await loadModuleForEdit(resource.module, req.auth);
  await deleteByUrl(resource.url); // remove the stored file (if it was an upload)
  await resource.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

/**
 * Standalone rendered view of an ARTICLE resource — a full, styled HTML page the
 * browser opens in a new tab (like a video/link). Authed via the file token
 * (?t=) since a new-tab navigation can't send the Authorization header. This is
 * the reliable path: no in-app modal, no client-side renderer, no cache dance.
 * Non-article resources with a url are redirected to it.
 */
export async function viewResource(req, res) {
  const resource = await Resource.findById(req.params.id).populate('module', 'name');
  if (!resource) return res.status(404).type('html').send('<p>Resource not found.</p>');
  if (resource.type !== ResourceType.ARTICLE) {
    if (resource.url) return res.redirect(resource.url);
    return res.status(400).type('html').send('<p>This resource has no viewable content.</p>');
  }

  const bodyHtml = mdRenderer.render(resource.content || '');
  const title = escapeHtml(resource.title || 'Article');
  const moduleName = escapeHtml(resource.module?.name || '');

  const page = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f7f9; color: #1f2328; font: 16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 80px; }
  .meta { color: #656d76; font-size: 13px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
  h1.doc-title { font-size: 28px; margin: 0 0 24px; line-height: 1.25; }
  article { background: #fff; border: 1px solid #d0d7de; border-radius: 12px; padding: 28px 32px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  article :first-child { margin-top: 0; }
  article h1,article h2,article h3 { line-height: 1.3; margin: 1.4em 0 .5em; }
  article h1 { font-size: 1.7em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
  article h2 { font-size: 1.35em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
  article p { margin: .7em 0; }
  article a { color: #0969da; }
  article code { background: #eff1f3; padding: .15em .4em; border-radius: 6px; font-size: 85%; font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  article pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow: auto; }
  article pre code { background: none; padding: 0; }
  article blockquote { margin: .8em 0; padding: .2em 1em; color: #57606a; border-left: 4px solid #d0d7de; background: #f6f8fa; border-radius: 0 6px 6px 0; }
  article table { border-collapse: collapse; width: 100%; margin: 1em 0; display: block; overflow-x: auto; }
  article th, article td { border: 1px solid #d0d7de; padding: 7px 12px; text-align: left; }
  article th { background: #f6f8fa; font-weight: 600; }
  article tr:nth-child(even) td { background: #f9fafb; }
  article img { max-width: 100%; height: auto; border-radius: 8px; }
  article hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
  article ul, article ol { padding-left: 1.6em; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    article { background: #161b22; border-color: #30363d; box-shadow: none; }
    article h1, article h2 { border-color: #21262d; }
    article code { background: #262c36; }
    article pre, article blockquote, article th, article tr:nth-child(even) td { background: #0d1117; }
    article th, article td, article blockquote { border-color: #30363d; }
    article a { color: #4493f8; }
    .doc-title, .meta { color: inherit; }
  }
</style>
</head><body>
  <div class="wrap">
    ${moduleName ? `<div class="meta">${moduleName}</div>` : ''}
    <h1 class="doc-title">${title}</h1>
    <article>${bodyHtml}</article>
  </div>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Locked-down CSP: inline styles only, images allowed, NO scripts (sandbox
  // without allow-scripts), so untrusted article text can't execute anything.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; media-src *; style-src 'unsafe-inline'; font-src *; sandbox allow-same-origin");
  res.setHeader('Cache-Control', 'no-store');
  res.send(page);
}
