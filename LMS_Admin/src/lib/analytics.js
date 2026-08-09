import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const analyticsKeys = {
  admin: ['analytics', 'admin'],
  trainer: ['analytics', 'trainer'],
};

export function useAdminAnalytics({ enabled = true } = {}) {
  return useQuery({
    queryKey: analyticsKeys.admin,
    queryFn: () => unwrap(api.get('/analytics/admin')),
    enabled,
  });
}

export function useTrainerAnalytics({ enabled = true } = {}) {
  return useQuery({
    queryKey: analyticsKeys.trainer,
    queryFn: () => unwrap(api.get('/analytics/trainer')),
    enabled,
  });
}

/** Per-batch analytics (attendance, module progress, assessments, at-risk). */
export function useBatchAnalytics(batchId) {
  return useQuery({
    queryKey: ['analytics', 'batch', batchId],
    queryFn: () => unwrap(api.get(`/analytics/batch/${batchId}`)),
    enabled: Boolean(batchId),
  });
}
