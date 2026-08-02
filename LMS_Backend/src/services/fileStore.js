import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { UPLOADS_URL_PREFIX } from '../config/storage.js';
import { env } from '../config/env.js';

/**
 * File storage with two interchangeable backends behind one URL scheme
 * (`/api/uploads/<filename>`):
 *
 *  - **GridFS (default):** files live in MongoDB and stream through Node with
 *    HTTP Range support. Simple, zero extra infra; fine at small scale.
 *  - **S3/CDN (when S3_BUCKET is set):** uploads stream straight to object
 *    storage and the serve route 302-redirects to a short-lived presigned (or
 *    CDN) URL — so media bytes never flow through Node/Mongo. This is the path
 *    for serving video to thousands of concurrent users. GridFS remains the
 *    fallback for any pre-existing files.
 */
const BUCKET = 'uploads';

// ── S3 backend (optional) ─────────────────────────────────────────────────────
export function s3Enabled() {
  return Boolean(env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
}

let s3Client = null;
async function getS3() {
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: env.s3.region,
    ...(env.s3.endpoint ? { endpoint: env.s3.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  return s3Client;
}

/** GridFSBucket on the live mongoose connection. Constructed per call (cheap) so
 *  it always targets the current connection (important for tests that reconnect). */
export function getBucket() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error('Database not connected — cannot access file storage');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

/** Save a Buffer under `filename`, returning { filename, url }. */
export function saveBuffer(buffer, { filename, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, {
      contentType: contentType || 'application/octet-stream',
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve({ filename, url: `${UPLOADS_URL_PREFIX}/${filename}` }));
    stream.end(buffer);
  });
}

/** A collision-proof, non-guessable stored filename (crypto, not Math.random). */
function genName(prefix, originalname) {
  const ext = path.extname(originalname || '');
  return `${prefix}-${Date.now()}-${crypto.randomBytes(9).toString('hex')}${ext}`;
}

/**
 * Store a multer in-memory file under a generated, collision-proof name.
 * @param {{buffer:Buffer, originalname?:string, mimetype?:string}} file
 * @param {string} prefix e.g. 'avatar' | 'resource' | 'project' | 'cert' | 'proctor' | 'seb'
 */
export async function storeUpload(file, prefix = 'file') {
  return saveBuffer(file.buffer, { filename: genName(prefix, file.originalname), contentType: file.mimetype });
}

/**
 * Multer storage engine for uploads. Streams to S3 when configured, else GridFS
 * — never buffering the whole file in memory. On success `req.file` gets
 * `{ filename, url, size }`. (Name kept for the controllers that import it.)
 * @param {string} prefix file-category prefix for the stored name
 */
export function gridfsStorage(prefix = 'file') {
  if (s3Enabled()) return s3Storage(prefix);
  return {
    _handleFile(_req, file, cb) {
      const filename = genName(prefix, file.originalname);
      let upload;
      try {
        upload = getBucket().openUploadStream(filename, { contentType: file.mimetype || 'application/octet-stream' });
      } catch (err) {
        return cb(err);
      }
      file.stream.on('error', (err) => { upload.destroy(err); cb(err); });
      upload.on('error', cb);
      upload.on('finish', () => cb(null, { filename, url: `${UPLOADS_URL_PREFIX}/${filename}`, size: upload.length }));
      file.stream.pipe(upload);
    },
    _removeFile(_req, file, cb) {
      // Called by multer to roll back (e.g. when a later limit is exceeded).
      deleteByName(file.filename).then(() => cb(null)).catch(cb);
    },
  };
}

/** S3 multer storage engine — streams the upload to object storage. */
function s3Storage(prefix = 'file') {
  return {
    async _handleFile(_req, file, cb) {
      const filename = genName(prefix, file.originalname);
      try {
        const { Upload } = await import('@aws-sdk/lib-storage');
        await new Upload({
          client: await getS3(),
          params: { Bucket: env.s3.bucket, Key: filename, Body: file.stream, ContentType: file.mimetype || 'application/octet-stream' },
        }).done();
        cb(null, { filename, url: `${UPLOADS_URL_PREFIX}/${filename}`, size: 0 });
      } catch (err) {
        cb(err);
      }
    },
    _removeFile(_req, file, cb) {
      deleteByName(file.filename).then(() => cb(null)).catch(cb);
    },
  };
}

/** Look up a stored file's metadata doc by name (or null). */
export async function findFile(filename) {
  return getBucket().find({ filename }).limit(1).next();
}

/** Read a GridFS-stored file (by name or `/api/uploads/<name>` URL) into a Buffer. */
export async function readFileBuffer(urlOrName) {
  const filename = typeof urlOrName === 'string' && urlOrName.startsWith(UPLOADS_URL_PREFIX)
    ? path.basename(urlOrName)
    : urlOrName;
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = getBucket().openDownloadStreamByName(filename);
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Delete every stored version of `filename` (S3 + GridFS). Best-effort. */
export async function deleteByName(filename) {
  if (s3Enabled()) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await (await getS3()).send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: filename }));
    } catch { /* may be a GridFS-only legacy file */ }
  }
  try {
    const bucket = getBucket();
    const files = await bucket.find({ filename }).toArray();
    await Promise.all(files.map((f) => bucket.delete(f._id).catch(() => {})));
  } catch { /* non-fatal */ }
}

/** Delete a stored file given its public `/api/uploads/<name>` URL (best-effort). */
export async function deleteByUrl(url) {
  if (typeof url === 'string' && url.startsWith(UPLOADS_URL_PREFIX)) {
    await deleteByName(path.basename(url)).catch(() => {});
  }
}

/** If the file lives in S3, 302-redirect to a short-lived presigned (or CDN)
 *  URL so the bytes are served by S3/CloudFront, not Node. Returns true if it
 *  handled the response; false if the object isn't in S3 (→ GridFS fallback). */
async function serveFromS3(filename, res) {
  try {
    const s3 = await getS3();
    const { HeadObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: filename })); // 404s if absent
    let url;
    if (env.s3.publicBaseUrl) {
      url = `${env.s3.publicBaseUrl.replace(/\/$/, '')}/${filename}`; // CDN in front of the bucket
    } else {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.s3.bucket, Key: filename }), { expiresIn: 600 });
    }
    res.redirect(302, url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Express handler: serve a stored file. With S3 configured, redirects to a
 * presigned/CDN URL (bytes bypass Node). Otherwise streams from GridFS with
 * Range support (206) and the upload hardening headers.
 */
export async function serveUpload(req, res) {
  const { filename } = req.params;

  if (s3Enabled() && (await serveFromS3(filename, res))) return;

  const file = await findFile(filename);
  if (!file) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox allow-same-origin",
  );
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const total = file.length;
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      // GridFS download-stream end offset is exclusive.
      const stream = getBucket().openDownloadStreamByName(filename, { start, end: end + 1 });
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
  }

  res.setHeader('Content-Length', total);
  const stream = getBucket().openDownloadStreamByName(filename);
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
}
