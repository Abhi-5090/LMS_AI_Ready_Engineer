import { useNavigate } from 'react-router-dom';
import { FolderOpen, Library } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useModules } from '@/lib/modules';
import { levelTone, titleCase } from '@/pages/modules/moduleUi';
import './resources.css';

/** Landing page for the Resources section: a card per module the user can access.
 *  Clicking a card opens that module's resources (grouped by topic). */
export function ResourcesHomePage() {
  const navigate = useNavigate();
  const { data: modules, isLoading, isError, error, refetch } = useModules();

  return (
    <>
      <PageHeader title="Resources" subtitle="Learning materials — videos, articles and links — organised by module and topic." />
      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !modules ? (
        <SkeletonCards count={6} height="9rem" />
      ) : (modules ?? []).length === 0 ? (
        <EmptyState icon={<Library size={26} />} title="No modules yet" description="Modules and their resources will appear here." />
      ) : (
        <div className="res-home-grid">
          {modules.map((m) => {
            const topics = m.topics?.length ?? 0;
            return (
              <Card key={m.id} hover className="res-home-card" onClick={() => navigate(`/app/resources/${m.code}`)}>
                <div className="res-home-card__icon"><FolderOpen size={22} /></div>
                <div className="res-home-card__name">{m.name}</div>
                <div className="res-home-card__meta">
                  <Badge tone="neutral">{m.code}</Badge>
                  <Badge tone={levelTone(m.level)}>{titleCase(m.level)}</Badge>
                </div>
                <div className="res-home-card__cta">{topics} topic{topics === 1 ? '' : 's'} · View resources →</div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
