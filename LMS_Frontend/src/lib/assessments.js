import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const assessmentKeys = {
  all: ['assessments'],
  list: (filters) => ['assessments', 'list', filters ?? {}],
  detail: (id) => ['assessments', 'detail', id],
  submission: (id) => ['assessments', id, 'submission'],
  submissions: (id) => ['assessments', id, 'submissions'],
};

export function useAssessments(filters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return useQuery({
    queryKey: assessmentKeys.list(params),
    queryFn: () => unwrap(api.get('/assessments', { params })),
    refetchInterval: 60_000, // keep the "live assessments" sidebar count fresh
  });
}

export function useAssessment(id) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: () => unwrap(api.get(`/assessments/${id}`)),
    enabled: Boolean(id),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (assessment) => {
    qc.invalidateQueries({ queryKey: assessmentKeys.all });
    if (assessment?.id) qc.setQueryData(assessmentKeys.detail(assessment.id), assessment);
  };
}

export function useCreateAssessment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body) => unwrap(api.post('/assessments', body)), onSuccess: invalidate });
}
export function useUpdateAssessment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...body }) => unwrap(api.patch(`/assessments/${id}`, body)), onSuccess: invalidate });
}
export function useDeleteAssessment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id) => unwrap(api.delete(`/assessments/${id}`)), onSuccess: () => invalidate() });
}
export function useSetAvailability() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, unlock, availableFrom, deadline }) =>
      unwrap(api.post(`/assessments/${id}/${unlock ? 'unlock' : 'lock'}`, unlock ? { availableFrom, deadline } : {})),
    onSuccess: invalidate,
  });
}

/** Build a test by hand-picking questions from the module's bank. */
export function useAddQuestionsFromBank() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, questionIds }) => unwrap(api.post(`/assessments/${id}/questions/from-bank`, { questionIds })),
    onSuccess: invalidate,
  });
}
export function useDeleteQuestion() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, questionId }) => unwrap(api.delete(`/assessments/${id}/questions/${questionId}`)), onSuccess: invalidate });
}
export function useSetAllowedStudents() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, studentIds }) => unwrap(api.patch(`/assessments/${id}/allowed-students`, { studentIds })),
    onSuccess: invalidate,
  });
}

/** Trainer assigns a ready-made template to a batch (clones it into a live test). */
export function useAssignTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }) => unwrap(api.post(`/assessments/${id}/assign`, body)),
    onSuccess: invalidate,
  });
}

// ── Submissions ───────────────────────────────────────────────────────────────

export function useMySubmission(id) {
  return useQuery({
    queryKey: assessmentKeys.submission(id),
    queryFn: () => unwrap(api.get(`/assessments/${id}/submission`)),
    enabled: Boolean(id),
    // Poll while the AI engine is grading so the result appears automatically.
    refetchInterval: (query) => (query.state.data?.status === 'evaluating' ? 3000 : false),
  });
}

/** Begin a proctored timed attempt — returns timing + the revealed questions. */
export function useStartAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => unwrap(api.post(`/assessments/${id}/start`)),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: assessmentKeys.submission(id) }),
  });
}

/** Autosave in-progress answers (best-effort; failures are non-fatal). */
export function useSaveProgress() {
  return useMutation({
    mutationFn: ({ id, answers }) => unwrap(api.patch(`/assessments/${id}/progress`, { answers })),
  });
}

/** Upload a webcam proctoring snapshot (best-effort). */
export function useProctorShot() {
  return useMutation({
    mutationFn: ({ id, blob }) => {
      const fd = new FormData();
      fd.append('shot', blob, 'shot.jpg');
      return unwrap(api.post(`/assessments/${id}/proctor-shot`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
  });
}

/** Record a proctoring warning (blocked shortcut / left the exam). Returns the new count. */
export function useRecordWarning() {
  return useMutation({
    mutationFn: ({ id, reason }) => unwrap(api.post(`/assessments/${id}/warning`, { reason })),
  });
}

/** Proctoring kick-out — terminates the attempt with a "caught cheating" (0%) result. */
export function useDisqualifyAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => unwrap(api.post(`/assessments/${id}/disqualify`, { reason })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: assessmentKeys.submission(id) });
      qc.invalidateQueries({ queryKey: assessmentKeys.all });
    },
  });
}

export function useSubmitAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answers }) => unwrap(api.post(`/assessments/${id}/submit`, { answers })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: assessmentKeys.submission(id) });
      qc.invalidateQueries({ queryKey: assessmentKeys.all });
    },
  });
}

export function useSubmissions(id) {
  return useQuery({
    queryKey: assessmentKeys.submissions(id),
    queryFn: () => unwrap(api.get(`/assessments/${id}/submissions`)),
    enabled: Boolean(id),
  });
}

/** Consolidated results across every re-assignment of this test to its batch. */
export function useConsolidated(id) {
  return useQuery({
    queryKey: ['assessments', id, 'consolidated'],
    queryFn: () => unwrap(api.get(`/assessments/${id}/consolidated`)),
    enabled: Boolean(id),
  });
}

function useSubmissionMutation(id, build) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: build,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assessmentKeys.submissions(id) });
      qc.invalidateQueries({ queryKey: ['assessments', id, 'consolidated'] });
      qc.invalidateQueries({ queryKey: assessmentKeys.all });
    },
  });
}

/** Trainer/admin: reopen a student's test for another attempt (archives the current). */
export function useGrantReattempt(id) {
  return useSubmissionMutation(id, (submissionId) => unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/reattempt`)));
}

/** Trainer/admin: re-run AI grading for a submission. */
export function useRegradeSubmission(id) {
  return useSubmissionMutation(id, (submissionId) => unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/regrade`)));
}

/** Trainer/admin: manually set a submission's score, overriding AI grading. */
export function useManualGrade(id) {
  return useSubmissionMutation(id, ({ submissionId, score, feedback }) => unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/grade`, { score, feedback })));
}

/** Ranked batch leaderboard for an assessment. */
export function useLeaderboard(id) {
  return useQuery({
    queryKey: ['assessments', 'leaderboard', id],
    queryFn: () => unwrap(api.get(`/assessments/${id}/leaderboard`)),
    enabled: Boolean(id),
  });
}
