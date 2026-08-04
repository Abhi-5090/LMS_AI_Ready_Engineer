import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Card, EmptyState, ErrorState, SkeletonText } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useNotifications, useMarkAllNotificationsRead } from '@/lib/notifications';
import { formatDate } from '@/lib/format';
import './notifications.css';

/** The full notification history (the bell shows only the 3 most recent). */
export function NotificationsPage() {
  const { data: items, isLoading, isError, error, refetch } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const list = items ?? [];

  // Opening the full list marks everything read (same behaviour as the bell).
  useEffect(() => {
    if (items && !markAll.isPending && items.some((n) => !n.read)) markAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <>
      <PageHeader title="Notifications" subtitle="Everything you've been notified about, newest first." />
      <Card>
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : isLoading && !items ? (
          <SkeletonText lines={6} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Bell size={26} />} title="No notifications" description="You're all caught up — nothing here yet." />
        ) : (
          <div className="notif-list">
            {list.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-item${n.read ? '' : ' notif-item--unread'}`}
                onClick={() => { if (n.link) navigate(n.link); }}
              >
                <div className="notif-item__title">{n.title}</div>
                {n.body && <div className="notif-item__body">{n.body}</div>}
                <div className="notif-item__meta">{formatDate(n.createdAt)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
