import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { FEEDBACK_KEYWORDS, FEEDBACK_LOW_THRESHOLD, FEEDBACK_PARAMETERS } from '@/shared';
import { Button, Modal, Textarea } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useRateClass } from '@/lib/classRatings';
import './class-rating.css';

function Stars({ value, onChange, size = 26 }) {
  return (
    <div className="rating-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="rating-stars__btn"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{ color: n <= value ? 'var(--color-rating-star)' : 'var(--color-border)' }}
        >
          <Star size={size} fill={n <= value ? 'var(--color-rating-star)' : 'none'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

/**
 * Rate a class. The student scores the trainer on each parameter plus an
 * overall rating; when the overall is below 5 an improvement section (keyword
 * chips + a comment) appears so they can say what to improve. Mandatory before
 * joining the next class.
 */
export function ClassRatingModal({ pending, onClose, onRated }) {
  const rate = useRateClass();
  const [params, setParams] = useState({});
  const [overall, setOverall] = useState(0);
  const [keywords, setKeywords] = useState([]);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setParams({});
    setOverall(0);
    setKeywords([]);
    setComment('');
    setErr('');
  }, [pending?.id]);

  const isLow = overall > 0 && overall < FEEDBACK_LOW_THRESHOLD;
  const allParamsRated = useMemo(
    () => FEEDBACK_PARAMETERS.every((p) => params[p.key] > 0),
    [params],
  );

  if (!pending) return null;

  function setParam(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function toggleKeyword(kw) {
    setKeywords((prev) => (prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]));
  }

  async function submit() {
    setErr('');
    if (!allParamsRated) return setErr('Please rate the trainer on every parameter.');
    if (!overall) return setErr('Please give an overall rating.');
    if (isLow && keywords.length === 0 && comment.trim().length < 3) {
      return setErr('Tell us what could improve — pick a keyword or add a short comment.');
    }
    try {
      await rate.mutateAsync({
        id: pending.id,
        rating: overall,
        parameters: params,
        keywords: isLow ? keywords : [],
        comment: comment.trim() || undefined,
      });
      onRated?.();
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
    return undefined;
  }

  return (
    <Modal
      open
      title="Rate your previous class"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Later</Button>
          <Button loading={rate.isPending} onClick={submit}>Submit feedback</Button>
        </>
      }
    >
      <p className="lms-muted" style={{ marginTop: 0 }}>
        You attended <strong>{pending.title}</strong>
        {pending.trainer?.name ? <> with <strong>{pending.trainer.name}</strong></> : null}. Rate it to
        continue to your next class.
      </p>

      <div className="rating-params">
        {FEEDBACK_PARAMETERS.map((p) => (
          <div key={p.key} className="rating-row">
            <span className="rating-row__label">{p.label}</span>
            <Stars value={params[p.key] ?? 0} onChange={(v) => setParam(p.key, v)} size={22} />
          </div>
        ))}
      </div>

      <div className="rating-overall">
        <span className="rating-overall__label">Overall performance</span>
        <Stars value={overall} onChange={setOverall} size={30} />
      </div>

      {isLow && (
        <div className="rating-improve">
          <span className="rating-improve__title">What could this trainer improve?</span>
          <div className="rating-chips">
            {FEEDBACK_KEYWORDS.map((kw) => {
              const active = keywords.includes(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  className={`rating-chip${active ? ' rating-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleKeyword(kw)}
                >
                  {kw}
                </button>
              );
            })}
          </div>
          <Textarea
            label="Additional feedback (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What specifically could be better?"
            style={{ minHeight: '5rem' }}
          />
        </div>
      )}

      {err && <span className="field__error" style={{ display: 'block', marginTop: 'var(--space-3)' }}>{err}</span>}
    </Modal>
  );
}
