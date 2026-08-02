import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const announcementKeys = { all: ['announcements'] };

export function useAnnouncements({ enabled = true } = {}) {
  return useQuery({
    queryKey: announcementKeys.all,
    queryFn: () => unwrap(api.get('/announcements')),
    enabled,
    refetchInterval: 60_000, // keep the bell roughly fresh
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => unwrap(api.post('/announcements', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementKeys.all }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => unwrap(api.delete(`/announcements/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementKeys.all }),
  });
}

const SEEN_KEY = 'lms.announcementsSeenAt';
export function getAnnouncementsSeenAt() {
  return Number(localStorage.getItem(SEEN_KEY) || 0);
}
export function markAnnouncementsSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()));
}
