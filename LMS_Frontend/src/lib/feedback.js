import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

/** The signed-in trainer's own class feedback (summary + comments, no leaderboard). */
export function useMyFeedback() {
  return useQuery({
    queryKey: ['feedback', 'me'],
    queryFn: () => unwrap(api.get('/feedback/me')),
  });
}
