import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const resourceKeys = {
  forModule: (moduleId) => ['resources', moduleId],
};

export function useResources(moduleId) {
  return useQuery({
    queryKey: resourceKeys.forModule(moduleId),
    queryFn: () => unwrap(api.get('/resources', { params: { module: moduleId } })),
    enabled: Boolean(moduleId),
  });
}

export function useAddResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ module, type, title, topic, url, file, content }) => {
      const fd = new FormData();
      fd.append('module', module);
      fd.append('type', type);
      fd.append('title', title);
      if (topic) fd.append('topic', topic);
      if (url) fd.append('url', url);
      if (file) fd.append('file', file);
      if (content != null) fd.append('content', content); // markdown for articles
      // Force multipart so axios keeps the FormData intact (file + fields) and the
      // browser attaches the boundary. Setting this to undefined does NOT strip the
      // instance's default application/json, so axios serialises the FormData to JSON
      // and drops the upload — this matches every other upload hook in the app.
      return unwrap(api.post('/resources', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: resourceKeys.forModule(vars.module) }),
  });
}

/** Edit an article's title/content. */
export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title, content }) => unwrap(api.patch(`/resources/${id}`, { title, content })),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: resourceKeys.forModule(vars.module) }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => unwrap(api.delete(`/resources/${id}`)),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: resourceKeys.forModule(vars.module) }),
  });
}
