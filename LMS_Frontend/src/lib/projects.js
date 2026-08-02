import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

const KEY = ['projects'];

/** Student: their own projects (any status). */
export function useMyProjects() {
  return useQuery({ queryKey: KEY, queryFn: () => unwrap(api.get('/projects')) });
}

/** Approved custom tech tags (merged with the predefined TECH_STACK on the client). */
export function useTechTags() {
  return useQuery({ queryKey: ['tech-tags'], queryFn: () => unwrap(api.get('/tech-tags')) });
}

/** Trainer/admin: custom tech tags awaiting approval. */
export function usePendingTechTags(enabled = true) {
  return useQuery({ queryKey: ['tech-tags', 'pending'], queryFn: () => unwrap(api.get('/tech-tags/pending')), enabled });
}

export function useReviewTechTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }) => unwrap(api.post(`/tech-tags/${id}/review`, { decision })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tech-tags'] }),
  });
}

/** Student: submit a new project (FormData with title, description, repoUrl, images[]). */
export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) =>
      unwrap(api.post('/projects', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => unwrap(api.delete(`/projects/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Trainer/admin: projects awaiting (and recently) reviewed. */
export function useProjectReviews(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'review'],
    queryFn: () => unwrap(api.get('/projects/review')),
    enabled,
  });
}

export function useReviewProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }) =>
      unwrap(api.patch(`/projects/${id}/review`, { decision, note })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }), // prefix-invalidates the review list too
  });
}
