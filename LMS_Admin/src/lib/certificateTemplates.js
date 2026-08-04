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

// Every placement/style field the template stores for the name + certificate id.
export const CERT_STYLE_FIELDS = [
  'nameXPercent', 'nameYPercent', 'fontScale', 'nameFont', 'nameBold', 'nameItalic', 'nameAlign',
  'idEnabled', 'idXPercent', 'idYPercent', 'idFontScale', 'idFont', 'idBold', 'idItalic', 'idAlign',
];

/** Admin: upload/replace the template and/or its name+id placement config. */
export function usePutCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, file, ...style }) => {
      const fd = new FormData();
      if (file) fd.append('file', file);
      for (const k of CERT_STYLE_FIELDS) {
        if (style[k] != null) fd.append(k, String(style[k]));
      }
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

/** Admin: issue the module certificate to everyone who passed its final test. */
export function useIssueModuleCertificates() {
  return useMutation({
    mutationFn: (moduleId) => unwrap(api.post(`/certificates/templates/${moduleId}/issue`)),
  });
}

/** Build the preview query params from a name + a style object. */
function previewParams(name, opts = {}) {
  const params = { name };
  for (const k of CERT_STYLE_FIELDS) if (opts[k] != null) params[k] = opts[k];
  return params;
}

/** Fetch the preview PDF as an object URL (for embedding inline in the editor). */
export async function fetchCertPreviewUrl(moduleId, name = 'Student Name', opts = {}) {
  const res = await api.get(`/certificates/templates/${moduleId}/preview`, {
    params: previewParams(name, opts),
    responseType: 'blob',
  });
  return URL.createObjectURL(res.data);
}

/** Render the template preview PDF (auth-carried) and open it in a new tab. */
export async function openCertPreview(moduleId, name = 'Student Name', opts = {}) {
  const url = await fetchCertPreviewUrl(moduleId, name, opts);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
