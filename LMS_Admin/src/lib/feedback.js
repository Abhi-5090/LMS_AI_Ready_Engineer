import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

/**
 * Trainer class-feedback overview. `trainerId` scopes the summary + comments to
 * one trainer; '' / 'all' gives the institution view. The trainer leaderboard
 * (for the dropdown) comes back either way.
 */
export function useFeedbackOverview(trainerId) {
  const scope = trainerId || 'all';
  return useQuery({
    queryKey: ['feedback', 'overview', scope],
    queryFn: () => unwrap(api.get('/feedback', { params: { trainer: scope } })),
  });
}
