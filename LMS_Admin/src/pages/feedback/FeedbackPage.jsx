import { useState } from 'react';
import { MessageSquare, Star, TrendingDown, Users } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Select, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { BarChart } from '@/components/charts/BarChart';
import { apiErrorMessage } from '@/lib/api';
import { useFeedbackOverview } from '@/lib/feedback';
import { formatDate } from '@/lib/format';
import './feedback.css';

/** Read-only five-star display for an average/overall value. */
function StarValue({ value, size = 14 }) {
  const rounded = Math.round(value);
  return (
    <span className="fb-stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rounded ? 'var(--color-rating-star)' : 'none'}
          color={n <= rounded ? 'var(--color-rating-star)' : 'var(--color-border)'}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

function overallTone(v) {
  if (v >= 4) return 'success';
  if (v >= 3) return 'warning';
  return 'error';
}

export function FeedbackPage() {
  const [trainerId, setTrainerId] = useState('');
  const { data, isLoading, isError, error, refetch } = useFeedbackOverview(trainerId);

  const trainerOptions = [
    { value: '', label: 'All trainers' },
    ...(data?.trainers ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.ratings})` })),
  ];

  return (
    <>
      <PageHeader title="Trainer Feedback" subtitle="How students rate the classes each trainer delivers." />
      <div className="toolbar">
        <span />
        <div className="toolbar__right" style={{ minWidth: '18rem' }}>
          <Select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} options={trainerOptions} aria-label="Select trainer" />
        </div>
      </div>

      {isError && !data ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <SkeletonCards count={4} height="7rem" />
      ) : data.summary.ratings === 0 ? (
        <EmptyState
          icon={<MessageSquare size={26} />}
          title="No class feedback yet"
          description={data.scope === 'trainer' ? 'This trainer has not been rated yet.' : 'Students rate classes after attending — ratings will appear here.'}
        />
      ) : (
        <FeedbackBody data={data} />
      )}
    </>
  );
}

function FeedbackBody({ data }) {
  const { scope, summary, trainers, comments } = data;
  const belowPct = summary.ratings ? Math.round((summary.belowFive / summary.ratings) * 100) : 0;

  return (
    <>
      <div className="stat-grid">
        <Stat label="Ratings" value={summary.ratings} accent icon={<MessageSquare size={20} />} />
        <Stat label="Avg overall" value={`${summary.avgOverall} / 5`} icon={<Star size={20} />} />
        <Stat label="Below 5" value={`${summary.belowFive} · ${belowPct}%`} icon={<TrendingDown size={20} />} />
        <Stat label={scope === 'all' ? 'Trainers rated' : 'Improvement areas'} value={scope === 'all' ? trainers.length : summary.keywords.filter((k) => k.count > 0).length} icon={<Users size={20} />} />
      </div>

      <div className="dash-grid-2" style={{ margin: 'var(--space-6) 0' }}>
        <Card>
          <CardHeader title="Overall rating distribution" subtitle="How many ratings at each star level" />
          <BarChart
            column
            multicolor
            emptyText="No ratings."
            data={summary.distribution.map((count, i) => ({ label: `${i + 1}★`, value: count }))}
          />
        </Card>
        <Card>
          <CardHeader title="Parameter averages" subtitle="Average score per parameter (out of 5)" />
          <BarChart
            max={5}
            emptyText="No parameter scores."
            data={summary.parameters.map((p) => ({ label: p.label, value: p.avg }))}
          />
        </Card>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Improvement areas" subtitle="Keywords students picked when the overall rating was below 5" />
        {summary.keywords.every((k) => k.count === 0) ? (
          <p className="lms-muted">No improvement keywords selected — great sign.</p>
        ) : (
          <BarChart multicolor data={summary.keywords.map((k) => ({ label: k.label, value: k.count }))} />
        )}
      </Card>

      {scope === 'all' && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader title="Trainers" subtitle="Ranked by average overall rating" />
          <div className="table-wrap" style={{ maxHeight: '26rem', overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Trainer</th><th>Ratings</th><th>Avg overall</th><th>Below 5</th></tr></thead>
              <tbody>
                {trainers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.ratings}</td>
                    <td>
                      <span className="fb-avg">
                        <StarValue value={t.avgOverall} />
                        <Badge tone={overallTone(t.avgOverall)}>{t.avgOverall}</Badge>
                      </span>
                    </td>
                    <td>{t.belowFive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Recent feedback" subtitle="Written comments and improvement flags from students" />
        {comments.length === 0 ? (
          <p className="lms-muted">No written feedback yet.</p>
        ) : (
          <div className="fb-comments">
            {comments.map((c) => (
              <div key={c.id} className="fb-comment">
                <div className="fb-comment__head">
                  <div>
                    <span className="fb-comment__trainer">{c.trainer}</span>
                    <span className="fb-comment__meta"> · {c.classTitle} · {formatDate(c.date)}</span>
                  </div>
                  <span className="fb-avg">
                    <StarValue value={c.rating} />
                    <Badge tone={overallTone(c.rating)}>{c.rating}</Badge>
                  </span>
                </div>
                {c.keywords.length > 0 && (
                  <div className="fb-comment__chips">
                    {c.keywords.map((k) => <span key={k} className="fb-chip">{k}</span>)}
                  </div>
                )}
                {c.comment && <p className="fb-comment__text">“{c.comment}”</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
