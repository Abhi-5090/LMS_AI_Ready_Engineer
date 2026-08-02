import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const certificateKeys = {
  me: ['certificates', 'me'],
  all: ['certificates', 'all'],
  verify: (id) => ['certificates', 'verify', id],
};

/** Fetch the rendered certificate PDF (template + name) and open it in a new tab. */
export async function openCertificatePdf(certificateId) {
  const res = await api.get(`/certificates/${certificateId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Student's own certificates (server issues any newly-earned ones first). */
export function useMyCertificates({ enabled = true } = {}) {
  return useQuery({
    queryKey: certificateKeys.me,
    queryFn: () => unwrap(api.get('/certificates/me')),
    enabled,
  });
}

/** Admin: all issued certificates. */
export function useAllCertificates({ enabled = true } = {}) {
  return useQuery({
    queryKey: certificateKeys.all,
    queryFn: () => unwrap(api.get('/certificates')),
    enabled,
  });
}

/** Admin/trainer: a specific student's certificates. */
export function useStudentCertificates(studentId) {
  return useQuery({
    queryKey: ['certificates', 'student', studentId],
    queryFn: () => unwrap(api.get(`/certificates/student/${studentId}`)),
    enabled: Boolean(studentId),
  });
}

/** PUBLIC verification — works without authentication. */
export function useVerifyCertificate(certificateId) {
  return useQuery({
    queryKey: certificateKeys.verify(certificateId),
    queryFn: () => unwrap(api.get(`/certificates/verify/${certificateId}`)),
    enabled: Boolean(certificateId),
    retry: false,
  });
}
