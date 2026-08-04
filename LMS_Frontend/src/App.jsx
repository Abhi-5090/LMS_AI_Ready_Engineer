import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageSpinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';
import { NotFound } from '@/pages/NotFound';
import { DashboardRouter } from '@/pages/dashboards/DashboardRouter';
import { ModulesPage } from '@/pages/modules/ModulesPage';
import { ModuleDetailPage } from '@/pages/modules/ModuleDetailPage';
import { BatchesPage } from '@/pages/batches/BatchesPage';
import { BatchDetailPage } from '@/pages/batches/BatchDetailPage';
import { SchedulePage } from '@/pages/schedule/SchedulePage';
import { AttendancePage } from '@/pages/attendance/AttendancePage';
import { AssessmentsPage } from '@/pages/assessments/AssessmentsPage';
import { AssessmentDetail } from '@/pages/assessments/AssessmentDetail';
// Lazy — pulls in the heavy xlsx parser only when the page is opened.
const QuestionBankPage = lazy(() => import('@/pages/questionBank/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage })));
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { CurriculumPage } from '@/pages/curriculum/CurriculumPage';
import { CertificatesPage } from '@/pages/certificates/CertificatesPage';
import { VerifyCertificatePage } from '@/pages/certificates/VerifyCertificatePage';
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage';
import { DoubtsPage } from '@/pages/doubts/DoubtsPage';
import { AnnouncementsPage } from '@/pages/announcements/AnnouncementsPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
// Lazy — pulls in the LiveKit client only when a user actually enters a class.
const ClassRoomPage = lazy(() => import('@/pages/classroom/ClassRoomPage').then((m) => ({ default: m.ClassRoomPage })));
import { ProtectedRoute } from '@/routes/ProtectedRoute';

/** Student & Trainer application. Administrators use the separate Admin portal. */
export default function App() {
  const { status, bootstrap } = useAuth();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <FullPageSpinner />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Self-registration is disabled — org admins create all accounts. Any old
          /register link redirects to login. */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/verify/:certificateId" element={<VerifyCertificatePage />} />

      {/* Immersive, full-screen live classroom (no sidebar/topbar chrome). */}
      <Route
        path="/app/class/:id/live"
        element={
          <ProtectedRoute>
            <Suspense fallback={<FullPageSpinner />}>
              <ClassRoomPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardRouter />} />
        <Route path="curriculum" element={<CurriculumPage />} />
        <Route path="modules" element={<ModulesPage />} />
        <Route path="modules/:id" element={<ModuleDetailPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="batches/:id" element={<BatchDetailPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="doubts" element={<DoubtsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="assessments/:id" element={<AssessmentDetail />} />
        <Route path="question-bank" element={<Suspense fallback={<FullPageSpinner />}><QuestionBankPage /></Suspense>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="certificates" element={<CertificatesPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
