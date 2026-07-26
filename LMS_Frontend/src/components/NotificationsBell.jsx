import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useToast } from '@/components/ui';
import { useNotifications, useMarkAllNotificationsRead } from '@/lib/notifications';
import { formatDate } from '@/lib/format';
import './notifications-bell.css';

export function NotificationsBell() {
  const { data: items } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const knownIds = useRef(null); // null until first load (so existing ones aren't toasted)

  const list = items ?? [];
  const unread = list.filter((n) => !n.read).length;

  // Toast whenever genuinely-new notifications arrive (after the first load).
  useEffect(() => {
    if (!items) return;
    const ids = items.map((n) => n.id);
    if (knownIds.current === null) { knownIds.current = new Set(ids); return; }
    const fresh = items.filter((n) => !knownIds.current.has(n.id));
    if (fresh.length === 1) toast.info(fresh[0].title);
    else if (fresh.length > 1) toast.info(`You have ${fresh.length} new notifications`);
    fresh.forEach((n) => knownIds.current.add(n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle() {
    const next = !open;
    if (next && unread > 0) markAll.mutate(); // opening marks everything read
    setOpen(next);
  }

  return (
    <div className="bell" ref={ref}>
      <button className="bell__btn" aria-label={`Notifications (${unread} new)`} onClick={toggle}>
        <Bell size={18} strokeWidth={2} />
        {unread > 0 && <span className="bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell__panel">
          <div className="bell__header">
            <span>Notifications</span>
            <span className="bell__count">{list.length}</span>
          </div>
          {list.length === 0 ? (
            <div className="bell__empty">You&apos;re all caught up — nothing new.</div>
          ) : (
            <div className="bell__list">
              {list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`bell__item${n.read ? '' : ' bell__item--unread'}`}
                  onClick={() => { setOpen(false); if (n.link) navigate(n.link); }}
                >
                  <div className="bell__title">{n.title}</div>
                  {n.body && <div className="bell__body">{n.body}</div>}
                  <div className="bell__meta">{formatDate(n.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
