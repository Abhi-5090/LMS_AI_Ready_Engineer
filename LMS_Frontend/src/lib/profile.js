import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';
import { useAuth } from './auth';

/** Trainer scoreboard stats (classes conducted, doubts cleared, ratings). */
export function useTrainerStats(enabled = true) {
  return useQuery({
    queryKey: ['profile', 'trainer-stats'],
    queryFn: () => unwrap(api.get('/profile/trainer-stats')),
    enabled,
  });
}

/** Update the signed-in user's profile (name, phone, bio, platform links). */
export function useUpdateProfile() {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: (body) => unwrap(api.patch('/profile', body)),
    onSuccess: (user) => setUser(user),
  });
}

/** Upload a new avatar image (multipart). */
export function useUploadAvatar() {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return unwrap(api.post('/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    onSuccess: (user) => setUser(user),
  });
}

/** Upload/replace the soft-copy resume (PDF, multipart). */
export function useUploadResume() {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('resume', file);
      return unwrap(api.post('/profile/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    onSuccess: (user) => setUser(user),
  });
}
