import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const certificateKeys = {
  me: ['certificates', 'me'],
  all: ['certificates', 'all'],
  verify: (id) => ['certificates', 'verify', id],
};

/** Student's own certificates (server issues any newly-earned ones first). */
export function useMyCertificates({ enabled = true } = {}) {
  return useQuery({
    queryKey: certificateKeys.me,
    queryFn: () => unwrap(api.get('/certificates/me')),
    enabled,
  });
}

/** Admin: issued certificates — server-side paginated ({ items, total }). */
export function useAllCertificates(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return useQuery({
    queryKey: [...certificateKeys.all, clean],
    queryFn: () => unwrap(api.get('/certificates', { params: clean })),
  });
}

/** Fetch ALL certificates matching a filter, page by page — for Excel export. */
export async function fetchAllCertificates({ batch, search } = {}) {
  const pageSize = 200;
  const out = [];
  for (let page = 1; page <= 100; page += 1) { // hard stop at 20k rows
    const clean = Object.fromEntries(Object.entries({ page, pageSize, batch, search }).filter(([, v]) => v !== '' && v != null));
    const res = await unwrap(api.get('/certificates', { params: clean }));
    out.push(...res.items);
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out;
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
