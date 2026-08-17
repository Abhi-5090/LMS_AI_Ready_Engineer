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

/** Re-run AI grading for a submission (recovers a stuck/wrong AI grade). */
export function useRegradeSubmission(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submissionId) => unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/regrade`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: assessmentKeys.submissions(id) }),
  });
}

/** Manually set a submission's score, overriding AI grading. */
export function useManualGrade(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, score, feedback }) =>
      unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/grade`, { score, feedback })),
    onSuccess: () => qc.invalidateQueries({ queryKey: assessmentKeys.submissions(id) }),
  });
}

/** Reopen a student's test for another attempt. */
export function useGrantReattempt(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submissionId) => unwrap(api.post(`/assessments/${id}/submissions/${submissionId}/reattempt`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: assessmentKeys.submissions(id) }),
  });
}
