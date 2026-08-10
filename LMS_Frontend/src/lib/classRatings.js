import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

const PENDING_KEY = ['class-ratings', 'pending'];

/** Classes this student attended but hasn't rated (candidates for the gate). */
export function useClassRatingsPending(enabled = true) {
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => unwrap(api.get('/classes/ratings/pending')),
    enabled,
  });
}

/** Submit feedback (overall + per-parameter + keywords/comment) for a class. */
export function useRateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating, parameters, keywords, comment }) =>
      unwrap(api.post(`/classes/${id}/rating`, { rating, parameters, keywords, comment })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-ratings'] }),
  });
}

/**
 * Eligible to rate a class only if the student attended ≥¾ of it — i.e. their
 * entry time was within the first quarter of the class window (we track entry,
 * not leave, so this is the sound proxy). The class must also be over.
 * `cls` carries { date, startTime, endTime, joinedAt } (browser-local math).
 */
export function ratingEligible(cls) {
  if (!cls?.joinedAt || !cls.startTime || !cls.endTime) return false;
  const day = new Date(cls.date).toISOString().slice(0, 10);
  const start = new Date(`${day}T${cls.startTime}:00`).getTime();
  const end = new Date(`${day}T${cls.endTime}:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  if (end >= Date.now()) return false; // class not over yet
  const joined = new Date(cls.joinedAt).getTime();
  return joined <= start + 0.25 * (end - start); // present for the last ¾
}
