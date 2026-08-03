import { z } from 'zod';
import { SubmissionStatus, UserRole } from '#shared';
import { Submission, User } from '../models/index.js';
import { computeProgress } from '../services/progression.js';
import { ApiError } from '../utils/ApiError.js';
import { assertCanViewStudent } from '../utils/access.js';
import { ok } from '../utils/http.js';

export const studentIdParam = z.object({ studentId: z.string().length(24) });

/** The signed-in student's curriculum progression. */
export async function myProgress(req, res) {
  ok(res, await computeProgress(req.auth.userId));
}

/** Admin/trainer: a specific student's progression. */
export async function studentProgress(req, res) {
  await assertCanViewStudent(req, req.params.studentId);
  const student = await User.findById(req.params.studentId).select('name email role');
  if (!student || student.role !== UserRole.STUDENT) throw ApiError.notFound('Student not found');
  ok(res, { student: student.toJSON(), ...(await computeProgress(req.params.studentId)) });
}

/**
 * Admin/trainer: the assessments a student has actually attempted — the tests they
 * submitted or that have been graded, newest first, with score + pass/fail. Powers
 * the "Completed assessments" list on the student drill-down.
 */
export async function studentSubmissions(req, res) {
  await assertCanViewStudent(req, req.params.studentId);
  const subs = await Submission.find({
    student: req.params.studentId,
    status: { $in: [SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.GRADED] },
  })
    .sort({ submittedAt: -1, updatedAt: -1 })
    .populate({ path: 'assessment', select: 'title type passingScore module', populate: { path: 'module', select: 'name' } })
    .lean();

  const out = subs
    .filter((s) => s.assessment) // skip orphans (deleted assessment)
    .map((s) => ({
      id: String(s._id),
      assessment: s.assessment.title,
      type: s.assessment.type,
      module: s.assessment.module?.name ?? '',
      passingScore: s.assessment.passingScore ?? null,
      status: s.status,
      score: s.score ?? null,
      passed: s.passed ?? null,
      submittedAt: s.submittedAt ?? null,
    }));
  ok(res, out);
}
