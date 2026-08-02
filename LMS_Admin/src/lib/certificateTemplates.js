import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

/** Admin: the module's certificate template metadata (or null). */
export function useCertTemplate(moduleId) {
  return useQuery({
    queryKey: ['cert-template', moduleId],
    queryFn: () => unwrap(api.get(`/certificates/templates/${moduleId}`)),
    enabled: Boolean(moduleId),
  });
}

/** Admin: upload/replace the template and/or its name-placement config. */
export function usePutCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, file, nameYPercent, fontScale }) => {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (nameYPercent != null) fd.append('nameYPercent', String(nameYPercent));
      if (fontScale != null) fd.append('fontScale', String(fontScale));
      return unwrap(api.put(`/certificates/templates/${moduleId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['cert-template', v.moduleId] }),
  });
}

export function useDeleteCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId) => unwrap(api.delete(`/certificates/templates/${moduleId}`)),
    onSuccess: (_d, moduleId) => qc.invalidateQueries({ queryKey: ['cert-template', moduleId] }),
  });
}

/** Render the template preview PDF (auth-carried) and open it in a new tab. */
export async function openCertPreview(moduleId, name = 'Student Name') {
  const res = await api.get(`/certificates/templates/${moduleId}/preview`, { params: { name }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
