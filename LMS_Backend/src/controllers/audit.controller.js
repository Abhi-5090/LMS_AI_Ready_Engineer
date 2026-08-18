import { z } from 'zod';
import { AuditLog } from '../models/index.js';
import { ok } from '../utils/http.js';

export const listAuditQuery = z.object({
  action: z.string().max(80).optional(),
  from: z.string().max(40).optional(), // YYYY-MM-DD (inclusive)
  to: z.string().max(40).optional(), // YYYY-MM-DD (inclusive, to end of day)
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Admin: audit-log entries — server-side paginated, filterable by action + date range. */
export async function listAudit(req, res) {
  const { action, from, to, page, pageSize } = req.query;
  const filter = {};
  if (action) filter.action = action;

  const range = {};
  const fromDate = from ? new Date(from) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) range.$gte = fromDate;
  const toDate = to ? new Date(to) : null;
  if (toDate && !Number.isNaN(toDate.getTime())) { toDate.setHours(23, 59, 59, 999); range.$lte = toDate; }
  if (Object.keys(range).length) filter.createdAt = range;

  const total = await AuditLog.countDocuments(filter);
  const entries = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .populate('actor', 'name email role');
  ok(res, { items: entries.map((e) => e.toJSON()), total, page, pageSize });
}
