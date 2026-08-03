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
} from 'lucide-react';
import { UserRole } from '@/shared';

/**
 * Role-based navigation. Entries are either a plain link `{ label, to, Icon }`
 * (always visible) or a collapsible group `{ group, items: [...] }`. Dashboard
 * stays a top-level link; the rest are grouped so the sidebar stays scannable.
 */
export const NAV_BY_ROLE = {
  [UserRole.STUDENT]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { group: 'Learn', items: [
      { label: 'My Curriculum', to: '/app/curriculum', Icon: Compass },
      { label: 'Class Schedule', to: '/app/schedule', Icon: CalendarDays },
      { label: 'Assessments', to: '/app/assessments', Icon: FileText },
    ] },
    { group: 'My Progress', items: [
      { label: 'Attendance', to: '/app/attendance', Icon: ClipboardCheck },
      { label: 'Certificates', to: '/app/certificates', Icon: Award },
    ] },
    { group: 'Support', items: [
      { label: 'Announcements', to: '/app/announcements', Icon: Megaphone },
      { label: 'Doubts', to: '/app/doubts', Icon: HelpCircle },
    ] },
    { label: 'Profile', to: '/app/profile', Icon: UserCircle },
  ],
  [UserRole.TRAINER]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { group: 'Teaching', items: [
      { label: 'My Modules', to: '/app/modules', Icon: BookOpen },
      { label: 'My Batches', to: '/app/batches', Icon: UsersRound },
      { label: 'Class Schedule', to: '/app/schedule', Icon: CalendarDays },
      { label: 'Attendance Entry', to: '/app/attendance', Icon: CalendarClock },
    ] },
    { group: 'Assessments', items: [
      { label: 'Question Bank', to: '/app/question-bank', Icon: Database },
      { label: 'Assessments', to: '/app/assessments', Icon: Unlock },
    ] },
    { group: 'Students & Comms', items: [
      { label: 'Announcements', to: '/app/announcements', Icon: Megaphone },
      { label: 'Doubts', to: '/app/doubts', Icon: HelpCircle },
      { label: 'Approvals', to: '/app/approvals', Icon: BadgeCheck },
    ] },
    { group: 'Insights', items: [
      { label: 'Analytics', to: '/app/analytics', Icon: BarChart3 },
    ] },
    { label: 'Profile', to: '/app/profile', Icon: UserCircle },
  ],
};

export const ROLE_LABEL = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.TRAINER]: 'Trainer',
};
