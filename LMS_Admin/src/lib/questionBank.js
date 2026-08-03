import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const bankKeys = {
  all: ['question-bank'],
  list: (filters) => ['question-bank', 'list', filters ?? {}],
};

/** All bank questions for a module (filter client-side by topic). */
export function useQuestionBank(filters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return useQuery({
    queryKey: bankKeys.list(params),
    queryFn: () => unwrap(api.get('/question-bank', { params })),
    enabled: Boolean(params.module),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: bankKeys.all });
}

/** Upload a prompt-writing stimulus (image / PDF / document) → { url, type, name }. */
export function useUploadQuestionMedia() {
  return useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return unwrap(api.post('/question-bank/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
  });
}

export function useAddBankQuestion() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body) => unwrap(api.post('/question-bank', body)), onSuccess: invalidate });
}
export function useBulkAddBankQuestions() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body) => unwrap(api.post('/question-bank/bulk', body)), onSuccess: invalidate });
}
export function useUpdateBankQuestion() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...body }) => unwrap(api.patch(`/question-bank/${id}`, body)), onSuccess: invalidate });
}
export function useDeleteBankQuestion() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id) => unwrap(api.delete(`/question-bank/${id}`)), onSuccess: invalidate });
}
/** Delete several bank questions at once (selected duplicates). */
export function useDeleteBankQuestions() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (ids) => unwrap(api.post('/question-bank/bulk-delete', { ids })), onSuccess: invalidate });
}
/** Super admin (drilled into an org): copy master-bank questions into this org. */
export function useImportFromMaster() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body) => unwrap(api.post('/question-bank/import-from-template', body)), onSuccess: invalidate });
}

/** Upload batches (cards) for a module — one per Excel upload / master import. */
export function useUploadBatches(moduleId) {
  return useQuery({
    queryKey: ['question-bank', 'uploads', moduleId],
    queryFn: () => unwrap(api.get('/question-bank/uploads', { params: { module: moduleId } })),
    enabled: Boolean(moduleId),
  });
}

/** Delete an entire upload batch. */
export function useDeleteUploadBatch() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (batchId) => unwrap(api.delete(`/question-bank/uploads/${batchId}`)), onSuccess: invalidate });
}

/** Read-only report of duplicate questions already in a module's bank. */
export function useDuplicates(moduleId, enabled = true) {
  return useQuery({
    queryKey: ['question-bank', 'duplicates', moduleId],
    queryFn: () => unwrap(api.get('/question-bank/duplicates', { params: { module: moduleId } })),
    enabled: Boolean(moduleId && enabled),
  });
}
