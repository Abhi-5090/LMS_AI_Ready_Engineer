import {
  LayoutDashboard,
  Compass,
  CalendarDays,
  FileText,
  ClipboardCheck,
  Megaphone,
  HelpCircle,
  Award,
  BookOpen,
  UsersRound,
  CalendarClock,
  Unlock,
  BarChart3,
  BadgeCheck,
  Database,
  UserCircle,
  GraduationCap,
  TrendingUp,
  LifeBuoy,
  Presentation,
  ClipboardList,
  MessagesSquare,
  Bell,
  Star,
} from 'lucide-react';
import { UserRole } from '@/shared';

/**
 * Role-based navigation. Entries are either a plain link `{ label, to, Icon }`
 * (always visible) or a collapsible group `{ group, Icon, items: [...] }` whose
 * header looks like a nav row and expands to reveal its links. Dashboard stays a
 * top-level link.
 */
export const NAV_BY_ROLE = {
  [UserRole.STUDENT]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { group: 'Learn', Icon: GraduationCap, items: [
      { label: 'My Curriculum', to: '/app/curriculum', Icon: Compass },
      { label: 'Class Schedule', to: '/app/schedule', Icon: CalendarDays },
      { label: 'Assessments', to: '/app/assessments', Icon: FileText },
    ] },
    { group: 'My Progress', Icon: TrendingUp, items: [
      { label: 'Attendance', to: '/app/attendance', Icon: ClipboardCheck },
      { label: 'Certificates', to: '/app/certificates', Icon: Award },
    ] },
    { group: 'Support', Icon: LifeBuoy, items: [
      { label: 'Announcements', to: '/app/announcements', Icon: Megaphone },
      { label: 'Notifications', to: '/app/notifications', Icon: Bell },
      { label: 'Doubts', to: '/app/doubts', Icon: HelpCircle },
    ] },
    { label: 'Profile', to: '/app/profile', Icon: UserCircle },
  ],
  [UserRole.TRAINER]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { group: 'Teaching', Icon: Presentation, items: [
      { label: 'My Modules', to: '/app/modules', Icon: BookOpen },
      { label: 'My Batches', to: '/app/batches', Icon: UsersRound },
      { label: 'Class Schedule', to: '/app/schedule', Icon: CalendarDays },
      { label: 'Attendance Entry', to: '/app/attendance', Icon: CalendarClock },
    ] },
    { group: 'Assessments', Icon: ClipboardList, items: [
      { label: 'Question Bank', to: '/app/question-bank', Icon: Database },
      { label: 'Assessments', to: '/app/assessments', Icon: Unlock },
    ] },
    { group: 'Students & Comms', Icon: MessagesSquare, items: [
      { label: 'Announcements', to: '/app/announcements', Icon: Megaphone },
      { label: 'Notifications', to: '/app/notifications', Icon: Bell },
      { label: 'Doubts', to: '/app/doubts', Icon: HelpCircle },
      { label: 'Approvals', to: '/app/approvals', Icon: BadgeCheck },
    ] },
    { group: 'Insights', Icon: BarChart3, items: [
      { label: 'Analytics', to: '/app/analytics', Icon: BarChart3 },
      { label: 'My Feedback', to: '/app/feedback', Icon: Star },
    ] },
    { label: 'Profile', to: '/app/profile', Icon: UserCircle },
  ],
};

export const ROLE_LABEL = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TRAINER]: 'Trainer',
};
