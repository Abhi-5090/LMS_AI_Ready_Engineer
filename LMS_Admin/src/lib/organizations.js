import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const orgKeys = {
  all: ['organizations'],
  overview: ['organizations', 'overview'],
  detail: (id) => ['organizations', id],
  admins: (id) => ['organizations', id, 'admins'],
};

export function useOrganizations() {
  return useQuery({ queryKey: orgKeys.all, queryFn: () => unwrap(api.get('/organizations')) });
}

/** Global counts across all orgs (super-admin dashboard). */
export function useOverview() {
  return useQuery({ queryKey: orgKeys.overview, queryFn: () => unwrap(api.get('/organizations/overview')) });
}

/** Question-bank counts per module split by type (super-admin dashboard). */
export function useQuestionStats() {
  return useQuery({ queryKey: ['organizations', 'question-stats'], queryFn: () => unwrap(api.get('/organizations/question-stats')) });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => unwrap(api.delete(`/organizations/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgKeys.all });
      qc.invalidateQueries({ queryKey: orgKeys.overview });
    },
  });
}

export function useOrganization(id) {
  return useQuery({
    queryKey: orgKeys.detail(id),
    queryFn: () => unwrap(api.get(`/organizations/${id}`)),
    enabled: Boolean(id),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => unwrap(api.post('/organizations', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.all }),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => unwrap(api.patch(`/organizations/${id}`, body)),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: orgKeys.all });
      qc.invalidateQueries({ queryKey: orgKeys.detail(vars.id) });
    },
  });
}

export function useOrgAdmins(id) {
  return useQuery({
    queryKey: orgKeys.admins(id),
    queryFn: () => unwrap(api.get(`/organizations/${id}/admins`)),
    enabled: Boolean(id),
  });
}

export function useCreateOrgAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => unwrap(api.post(`/organizations/${id}/admins`, body)),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: orgKeys.admins(vars.id) });
      qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}
