import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { UserRole } from '@/shared';
import { useAuth } from './auth';
import { getAnnouncementsSeenAt, markAnnouncementsSeen, useAnnouncements } from './announcements';
import { getDoubtsSeenAt, markDoubtsSeen, useDoubts } from './doubts';
import { useCertReviews } from './externalCertificates';
import { useProjectReviews, usePendingTechTags } from './projects';
import { useAssessments } from './assessments';

/**
 * Unread counts for sidebar nav items, keyed by route. "Unread" = items that
 * arrived/changed since the user last visited that tab (tracked in localStorage).
 * Visiting the tab clears its count.
 *
 * @returns {Record<string, number>} e.g. { '/app/announcements': 2, '/app/doubts': 1 }
 */
export function useNavBadges() {
  const location = useLocation();
  const userId = useAuth((s) => s.user?.id);
  const role = useAuth((s) => s.user?.role);
  const { data: announcements } = useAnnouncements();
  const { data: doubts } = useDoubts();
  // Pending certificate + project approvals — only trainers review them.
  const { data: certReviews } = useCertReviews(role === UserRole.TRAINER);
  const { data: projectReviews } = useProjectReviews(role === UserRole.TRAINER);
  const { data: techTagReviews } = usePendingTechTags(role === UserRole.TRAINER);
  // Live assessments a student can take right now (unlocked + not yet submitted).
  const { data: assessments } = useAssessments();
  const [annSeen, setAnnSeen] = useState(getAnnouncementsSeenAt());
  const [doubtsSeen, setDoubtsSeen] = useState(getDoubtsSeenAt());

  // Visiting a tab marks it seen → its badge clears.
  useEffect(() => {
    if (location.pathname === '/app/announcements') {
      markAnnouncementsSeen();
      setAnnSeen(Date.now());
    } else if (location.pathname === '/app/doubts') {
      markDoubtsSeen();
      setDoubtsSeen(Date.now());
    }
  }, [location.pathname]);

  const annCount = (announcements ?? []).filter(
    (a) => new Date(a.createdAt).getTime() > annSeen,
  ).length;

  // A doubt is "new" only when its LATEST message came from someone other than
  // me — so replying to a doubt never increments the sender's own badge.
  const doubtsCount = (doubts ?? []).filter((d) => {
    if (new Date(d.updatedAt).getTime() <= doubtsSeen) return false;
    const msgs = d.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last) return false;
    const lastAuthorId = last.author?.id ?? last.author;
    return lastAuthorId !== userId;
  }).length;

  const approvalsCount =
    (certReviews ?? []).filter((c) => c.status === 'pending').length +
    (projectReviews ?? []).filter((p) => p.status === 'pending').length +
    (techTagReviews ?? []).length; // /tech-tags/pending already returns only pending

  // Students: how many assessments are live now and still need taking.
  const liveAssessments =
    role === UserRole.STUDENT
      ? (assessments ?? []).filter(
          (a) => a.availableNow && !(a.submission && a.submission.status !== 'not_started'),
        ).length
      : 0;

  return {
    '/app/announcements': annCount,
    '/app/doubts': doubtsCount,
    '/app/approvals': approvalsCount,
    '/app/assessments': liveAssessments,
  };
}
