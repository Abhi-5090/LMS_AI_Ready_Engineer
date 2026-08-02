import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, BookOpen, Building2, ClipboardList, FileText, GraduationCap, LogIn, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrganizations, useOverview } from '@/lib/organizations';
import '../modules/modules.css';

export function SuperAdminDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setOrgView = useAuth((s) => s.setOrgView);
  const { data: o, isLoading, isError, error, refetch } = useOverview();
  const { data: orgs } = useOrganizations();

  function enter(org) {
    setOrgView({ id: org.id, name: org.name });
    qc.clear();
    navigate('/app', { replace: true });
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Super Admin Dashboard" subtitle="Everything across all organizations." />
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      </>
    );
  }

  const sorted = [...(orgs ?? [])].sort((a, b) => (b.counts?.students ?? 0) - (a.counts?.students ?? 0));
  const chart = sorted.slice(0, 8).map((x) => ({ label: x.code, value: x.counts?.students ?? 0 }));
  const growth = (o?.growth ?? []).map((g) => ({ label: g.label, value: g.students }));

  return (
    <>
      <PageHeader title="Super Admin Dashboard" subtitle="Everything across all organizations at a glance." />

      {isLoading && !o ? (
        <SkeletonCards count={8} height="6.5rem" />
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Organizations" value={o.organizations} accent icon={<Building2 size={18} />} />
            <Stat label="Admins" value={o.admins} icon={<ShieldCheck size={18} />} />
            <Stat label="Trainers" value={o.trainers} icon={<UserCog size={18} />} />
            <Stat label="Students" value={o.students} icon={<GraduationCap size={18} />} />
            <Stat label="Batches" value={o.batches} icon={<UsersRound size={18} />} />
            <Stat label="Modules" value={o.modules} icon={<BookOpen size={18} />} />
            <Stat label="Assessments" value={o.assessments} icon={<FileText size={18} />} />
            <Stat label="Submissions" value={o.submissions} icon={<ClipboardList size={18} />} />
          </div>

          <div className="dash-grid-3" style={{ marginTop: 'var(--space-6)' }}>
            <Card>
              <CardHeader title="Organization Status" subtitle={`${o.activeOrgs} active · ${o.suspendedOrgs} suspended`} />
              <DonutChart
                data={[
                  { label: 'Active', value: o.activeOrgs, color: 'var(--color-success)' },
                  { label: 'Suspended', value: o.suspendedOrgs, color: 'var(--color-warning)' },
                ]}
                centerValue={o.organizations}
                centerLabel="Organizations"
                emptyText="No organizations yet."
              />
            </Card>
            <Card>
              <CardHeader title="Students per Organization" subtitle="Top organizations by size" />
              {chart.length === 0 ? (
                <EmptyState icon={<BarChart3 size={26} />} title="No organizations yet" description="Create your first organization to see analytics." />
              ) : (
                <BarChart data={chart} multicolor emptyText="No students yet." />
              )}
            </Card>
            <Card>
              <CardHeader title="New Students / Month" subtitle="Platform growth, last 6 months" />
              <TrendChart data={growth} emptyText="No growth data yet." />
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
            <Card>
              <div className="panel-head">
                <CardHeader title="Organizations" subtitle="Enter one to manage it, or open the full list." />
                <Button variant="outline" onClick={() => navigate('/app/organizations')}>All organizations</Button>
              </div>
              {(orgs ?? []).length === 0 ? (
                <EmptyState icon={<Building2 size={26} />} title="No organizations yet" />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Organization</th><th>Status</th><th>Admins</th><th>Trainers</th><th>Students</th><th>Batches</th><th /></tr>
                    </thead>
                    <tbody>
                      {sorted.map((x) => (
                        <tr key={x.id}>
                          <td>{x.name}<div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{x.code}</div></td>
                          <td><Badge tone={x.status === 'active' ? 'success' : 'warning'}>{x.status === 'active' ? 'Active' : 'Suspended'}</Badge></td>
                          <td>{x.counts?.admins ?? 0}</td>
                          <td>{x.counts?.trainers ?? 0}</td>
                          <td>{x.counts?.students ?? 0}</td>
                          <td>{x.counts?.batches ?? 0}</td>
                          <td>
                            <div className="list-actions">
                              <Button size="sm" onClick={() => enter(x)}><LogIn size={13} style={{ marginRight: 4 }} /> Enter</Button>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/app/organizations/${x.id}`)}>Manage</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
