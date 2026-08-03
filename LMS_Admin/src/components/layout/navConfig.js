import {
  LayoutDashboard,
  Users,
  BookOpen,
  UsersRound,
  ClipboardCheck,
  FileText,
  Megaphone,
  Award,
  BadgeCheck,
  BarChart3,
  Settings,
  Database,
  ScrollText,
  Building2,
  Inbox,
  Library,
  Activity,
  SlidersHorizontal,
} from 'lucide-react';
import { UserRole } from '@/shared';

/**
 * Admin portal navigation. Entries are either a plain link `{ label, to, Icon }`
 * or a collapsible group `{ group, items: [...] }`. The admin menu is long, so it
 * is grouped; the super admin's short menu stays flat.
 */
export const NAV_BY_ROLE = {
  // Super admin managing tenants (not drilled into an org). The Master Curriculum &
  // Question Bank here edit the MASTER TEMPLATE that seeds every new org. Kept flat.
  [UserRole.SUPER_ADMIN]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { label: 'Organizations', to: '/app/organizations', Icon: Building2 },
    { label: 'Master Curriculum', to: '/app/modules', Icon: BookOpen },
    { label: 'Question Bank', to: '/app/question-bank', Icon: Database },
    { label: 'Syllabus Requests', to: '/app/syllabus-requests', Icon: Inbox },
    { label: 'Settings', to: '/app/settings', Icon: Settings },
  ],
  [UserRole.ADMIN]: [
    { label: 'Dashboard', to: '/app', Icon: LayoutDashboard },
    { group: 'People', Icon: Users, items: [
      { label: 'Users', to: '/app/users', Icon: Users },
      { label: 'Batches', to: '/app/batches', Icon: UsersRound },
      { label: 'Approvals', to: '/app/approvals', Icon: BadgeCheck },
    ] },
    { group: 'Curriculum', Icon: Library, items: [
      { label: 'Modules', to: '/app/modules', Icon: BookOpen },
      { label: 'Question Bank', to: '/app/question-bank', Icon: Database },
      { label: 'Assessments', to: '/app/assessments', Icon: FileText },
      { label: 'Certificates', to: '/app/certificates', Icon: Award },
    ] },
    { group: 'Operations', Icon: Activity, items: [
      { label: 'Attendance', to: '/app/attendance', Icon: ClipboardCheck },
      { label: 'Announcements', to: '/app/announcements', Icon: Megaphone },
    ] },
    { group: 'System & Insights', Icon: SlidersHorizontal, items: [
      { label: 'Analytics', to: '/app/analytics', Icon: BarChart3 },
      { label: 'Audit Log', to: '/app/audit', Icon: ScrollText },
      { label: 'Settings', to: '/app/settings', Icon: Settings },
    ] },
  ],
};

export const ROLE_LABEL = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrator',
};
