import { MessageSquare, Star, TrendingDown } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, ErrorState, SkeletonCards } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { BarChart } from '@/components/charts/BarChart';
import { apiErrorMessage } from '@/lib/api';
import { useMyFeedback } from '@/lib/feedback';
import { formatDate } from '@/lib/format';
import './my-feedback.css';

/** Read-only five-star display for an average/overall value. */
function StarValue({ value, size = 14 }) {
  const rounded = Math.round(value);
  return (
    <span className="mfb-stars" aria-label={`${value} out of 5`}>
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

function tone(v) {
  if (v >= 4) return 'success';
  if (v >= 3) return 'warning';
  return 'error';
}

export function MyFeedbackPage() {
  const { data, isLoading, isError, error, refetch } = useMyFeedback();

  return (
    <>
      <PageHeader title="My Feedback" subtitle="How your students rate the classes you deliver." />

      {isError && !data ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !data ? (
        <SkeletonCards count={4} height="7rem" />
      ) : data.summary.ratings === 0 ? (
        <EmptyState
          icon={<MessageSquare size={26} />}
          title="No feedback yet"
          description="Once students rate your classes, their feedback will appear here."
        />
      ) : (
        <Body data={data} />
      )}
    </>
  );
}

function Body({ data }) {
  const { summary, comments } = data;
  const belowPct = summary.ratings ? Math.round((summary.belowFive / summary.ratings) * 100) : 0;

  return (
    <>
      <div className="stat-grid">
        <Stat label="Ratings" value={summary.ratings} accent icon={<MessageSquare size={20} />} />
        <Stat label="Avg overall" value={`${summary.avgOverall} / 5`} icon={<Star size={20} />} />
        <Stat label="Below 5" value={`${summary.belowFive} · ${belowPct}%`} icon={<TrendingDown size={20} />} />
        <Stat label="Improvement flags" value={summary.keywords.filter((k) => k.count > 0).length} icon={<TrendingDown size={20} />} />
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
          <CardHeader title="Parameter averages" subtitle="Your average score per parameter (out of 5)" />
          <BarChart max={5} emptyText="No parameter scores." data={summary.parameters.map((p) => ({ label: p.label, value: p.avg }))} />
        </Card>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Improvement areas" subtitle="Keywords students picked when they rated a class below 5" />
        {summary.keywords.every((k) => k.count === 0) ? (
          <p className="lms-muted">No improvement keywords selected — great sign.</p>
        ) : (
          <BarChart multicolor data={summary.keywords.map((k) => ({ label: k.label, value: k.count }))} />
        )}
      </Card>

      <Card>
        <CardHeader title="What students said" subtitle="Written comments and improvement flags" />
        {comments.length === 0 ? (
          <p className="lms-muted">No written feedback yet.</p>
        ) : (
          <div className="mfb-comments">
            {comments.map((c) => (
              <div key={c.id} className="mfb-comment">
                <div className="mfb-comment__head">
                  <span className="mfb-comment__meta">{c.classTitle} · {formatDate(c.date)}</span>
                  <span className="mfb-avg">
                    <StarValue value={c.rating} />
                    <Badge tone={tone(c.rating)}>{c.rating}</Badge>
                  </span>
                </div>
                {c.keywords.length > 0 && (
                  <div className="mfb-comment__chips">
                    {c.keywords.map((k) => <span key={k} className="mfb-chip">{k}</span>)}
                  </div>
                )}
                {c.comment && <p className="mfb-comment__text">“{c.comment}”</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
