import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { UserRole } from '@/shared';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageSpinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage';
import { OrganizationDetailPage } from '@/pages/organizations/OrganizationDetailPage';
import { SuperAdminDashboard } from '@/pages/organizations/SuperAdminDashboard';
import { SyllabusRequestsPage } from '@/pages/organizations/SyllabusRequestsPage';
import { SyllabusRequestsOrgPage } from '@/pages/organizations/SyllabusRequestsOrgPage';
import { ProgramBrochurePage } from '@/pages/program/ProgramBrochurePage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { StudentDetailPage } from '@/pages/students/StudentDetailPage';
import { NotFound } from '@/pages/NotFound';
import { AdminDashboard } from '@/pages/dashboards/AdminDashboard';
import { ModulesPage } from '@/pages/modules/ModulesPage';
import { ModuleDetailPage } from '@/pages/modules/ModuleDetailPage';
import { BatchesPage } from '@/pages/batches/BatchesPage';
import { BatchDetailPage } from '@/pages/batches/BatchDetailPage';
import { AttendancePage } from '@/pages/attendance/AttendancePage';
import { AssessmentsPage } from '@/pages/assessments/AssessmentsPage';
import { AssessmentEditor } from '@/pages/assessments/AssessmentEditor';
import { AuditPage } from '@/pages/audit/AuditPage';
// Lazy — pulls in the heavy xlsx parser only when the page is opened.
const QuestionBankPage = lazy(() => import('@/pages/questionBank/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage })));
import { CertificatesPage } from '@/pages/certificates/CertificatesPage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage';
import { FeedbackPage } from '@/pages/feedback/FeedbackPage';
import { AnnouncementsPage } from '@/pages/announcements/AnnouncementsPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

/** ADMIN portal — admins manage their org; the super admin manages organizations
 *  and can "enter" any org to act as its admin. */
export default function App() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const orgView = useAuth((s) => s.orgView);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <FullPageSpinner />;

  // Super admin who hasn't drilled into an org → organization-management app only.
  const superManaging = user?.role === UserRole.SUPER_ADMIN && !orgView;
  if (superManaging) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="organizations/:id" element={<OrganizationDetailPage />} />
          {/* Master curriculum — these edit the reserved template org (X-Org-Id set by the API layer). */}
          <Route path="modules" element={<ModulesPage />} />
          <Route path="modules/:id" element={<ModuleDetailPage />} />
          <Route path="question-bank" element={<Suspense fallback={<FullPageSpinner />}><QuestionBankPage /></Suspense>} />
          <Route path="syllabus-requests" element={<SyllabusRequestsPage />} />
          <Route path="syllabus-requests/:orgId" element={<SyllabusRequestsOrgPage />} />
          <Route path="program" element={<ProgramBrochurePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="modules" element={<ModulesPage />} />
        <Route path="modules/:id" element={<ModuleDetailPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="batches/:id" element={<BatchDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="assessments/:id" element={<AssessmentEditor />} />
        <Route path="question-bank" element={<Suspense fallback={<FullPageSpinner />}><QuestionBankPage /></Suspense>} />
        <Route path="certificates" element={<CertificatesPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Unknown /app/* path (e.g. a super-admin-only route after exiting an org) → dashboard, not a 404. */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
