import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

/** Admin: audit-log entries — paginated, filterable by action + date range.
 *  Returns { items, total, page, pageSize }. */
export function useAuditLog({ action = '', from = '', to = '', page = 1, pageSize = 50 } = {}) {
  const params = Object.fromEntries(
    Object.entries({ action, from, to, page, pageSize }).filter(([, v]) => v !== '' && v != null),
  );
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => unwrap(api.get('/audit', { params })),
  });
}
