import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Star } from 'lucide-react';
import { DoubtStatus, UserRole } from '@/shared';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Select, SkeletonCards, Skeleton, Textarea } from '@/components/ui';
import { PageHeader, Stat } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  markDoubtRead,
  newMessageCount,
  useCloseDoubt,
  useCreateDoubt,
  useDoubt,
  useDoubts,
  useMyDoubtStats,
  useRateDoubt,
  useReplyDoubt,
} from '@/lib/doubts';
import { useModules } from '@/lib/modules';
import { formatDate } from '@/lib/format';
import '../modules/modules.css';

/** Clickable (or read-only) 5-star rating. */
function StarRating({ value = 0, onChange, size = 26, readOnly = false }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4 }} role={readOnly ? 'img' : 'radiogroup'} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{ background: 'none', border: 'none', padding: 0, lineHeight: 0, cursor: readOnly ? 'default' : 'pointer', color: n <= value ? 'var(--color-rating-star)' : 'var(--color-border)' }}
        >
          <Star size={size} fill={n <= value ? 'var(--color-rating-star)' : 'none'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

const STATUS_TONE = { open: 'warning', answered: 'success', closed: 'neutral' };
const titleCase = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

export function DoubtsPage() {
  const role = useAuth((s) => s.user?.role);
  const userId = useAuth((s) => s.user?.id);
  const isStudent = role === UserRole.STUDENT;

  const [statusFilter, setStatusFilter] = useState('');
  const { data: doubts, isLoading, isError, error, refetch } = useDoubts({ status: statusFilter });
  const { data: modules } = useModules();
  const { data: stats } = useMyDoubtStats(!isStudent);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', module: '' });
  const [err, setErr] = useState('');
  const create = useCreateDoubt();

  const [openId, setOpenId] = useState(null);

  async function submitCreate(e) {
    e.preventDefault();
    setErr('');
    if (!form.module) return setErr('Select the module your doubt is about.');
    try {
      const created = await create.mutateAsync({
        title: form.title,
        body: form.body,
        module: form.module,
      });
      setCreating(false);
      setForm({ title: '', body: '', module: '' });
      setOpenId(created.id);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <>
      <PageHeader
        title={isStudent ? 'My Doubts' : 'Student Doubts'}
        subtitle={isStudent ? 'Ask your trainers questions and track answers.' : 'Answer questions from your students.'}
      />

      {!isStudent && stats && (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
          <Stat label="Doubts Answered" value={stats.answered ?? 0} />
          <Stat label="Resolved" value={stats.resolved ?? 0} />
          <Stat
            label="Average Rating"
            accent
            value={stats.ratingCount ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{stats.averageRating}<Star size={20} fill="var(--color-rating-star)" strokeWidth={0} /></span> : '—'}
          />
          <Stat label="Ratings Received" value={stats.ratingCount ?? 0} />
        </div>
      )}

      <div className="toolbar">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: DoubtStatus.OPEN, label: 'Open' },
            { value: DoubtStatus.ANSWERED, label: 'Answered' },
            { value: DoubtStatus.CLOSED, label: 'Closed' },
          ]}
        />
        {isStudent && <Button onClick={() => setCreating(true)}>+ Ask a Doubt</Button>}
      </div>

      {isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading && !doubts ? (
        <SkeletonCards count={4} height="4.5rem" />
      ) : !doubts || doubts.length === 0 ? (
        isStudent ? (
          <EmptyState
            icon={<MessageCircleQuestion size={26} />}
            title="No doubts yet"
            description="No doubts yet. Ask your first question."
            action={<Button onClick={() => setCreating(true)}>Ask a question</Button>}
          />
        ) : (
          <EmptyState
            icon={<MessageCircleQuestion size={26} />}
            title="No student doubts"
            description="No student doubts in your modules/batches yet."
          />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {doubts.map((d) => {
            const unread = newMessageCount(d, userId);
            return (
              <Card
                key={d.id}
                hover
                onClick={() => { markDoubtRead(d.id); setOpenId(d.id); }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{d.title}</div>
                  <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {!isStudent && `${d.student?.name} · `}
                    {d.module?.name ?? 'General'} · {d.messages?.length ?? 0} message(s) · updated {formatDate(d.updatedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 'none' }}>
                  {d.status === DoubtStatus.CLOSED && (d.rating ? (
                    <span title={`Rated ${d.rating}/5`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-rating-star)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)' }}>
                      <Star size={15} fill="var(--color-rating-star)" strokeWidth={0} /> {d.rating}
                    </span>
                  ) : (
                    <span className="lms-muted" title="Not rated" style={{ fontSize: 'var(--font-size-sm)' }}>—</span>
                  ))}
                  {unread > 0 && (
                    <span className="doubt-unread" title={`${unread} new message${unread === 1 ? '' : 's'}`} aria-label={`${unread} new messages`}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                  <Badge tone={STATUS_TONE[d.status]}>{titleCase(d.status)}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ask modal */}
      <Modal
        open={creating}
        title="Ask a Doubt"
        onClose={() => setCreating(false)}
        closeOnOverlayClick={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button form="ask-form" type="submit" loading={create.isPending}>Post</Button>
          </>
        }
      >
        <form id="ask-form" onSubmit={submitCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short summary of your question" required />
          <Select
            label="Module"
            value={form.module}
            onChange={(e) => setForm({ ...form, module: e.target.value })}
            options={[{ value: '', label: 'Select a module…' }, ...(modules ?? []).map((m) => ({ value: m.id, label: m.name }))]}
            required
          />
          <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: '-8px' }}>
            You can have one open doubt per module at a time.
          </p>
          <Textarea label="Your question" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required style={{ minHeight: '7rem' }} />
          {err && <span className="field__error">{err}</span>}
        </form>
      </Modal>

      <DoubtThread id={openId} role={role} onClose={() => setOpenId(null)} />
    </>
  );
}

function DoubtThread({ id, role, onClose }) {
  const { data: doubt, isLoading } = useDoubt(id);
  const messagesRef = useRef(null);

  // While the thread is open, keep it marked read (incl. replies that arrive
  // live) and scroll to the most recent message.
  useEffect(() => {
    if (!doubt?.id) return;
    markDoubtRead(doubt.id);
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [doubt]);
  const reply = useReplyDoubt();
  const close = useCloseDoubt();
  const rate = useRateDoubt();
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const isStudent = role === UserRole.STUDENT;
  const isClosed = doubt?.status === DoubtStatus.CLOSED;
  // A student can still rate an unrated doubt at any time — even after it auto-closed.
  const canRateLater = isStudent && isClosed && doubt?.rating == null;
  const saving = close.isPending || rate.isPending;

  // Reset the rating panel whenever a different thread opens.
  useEffect(() => { setRateOpen(false); setRating(0); }, [id]);

  // Resolve (answered → closed, rating optional) OR rate an already-closed doubt.
  async function submitResolve(ratingValue) {
    try {
      if (isClosed) {
        if (!ratingValue) return; // rating a closed doubt requires a star
        await rate.mutateAsync({ id, rating: ratingValue });
      } else {
        await close.mutateAsync({ id, rating: ratingValue }); // ratingValue may be undefined
      }
      setRateOpen(false);
    } catch { /* toast handled globally */ }
  }

  async function send(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    try {
      await reply.mutateAsync({ id, body: body.trim() });
      setBody('');
    } catch { /* toast handled globally */ }
  }

  // Enter sends; Shift+Enter inserts a newline.
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <Modal
      open={Boolean(id)}
      title={doubt?.title ?? 'Doubt'}
      onClose={() => { setBody(''); onClose(); }}
      footer={
        !doubt ? null : rateOpen ? (
          <>
            <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
            {!isClosed && (
              <Button variant="ghost" loading={saving} onClick={() => submitResolve(undefined)}>Close without rating</Button>
            )}
            <Button disabled={!rating} loading={saving} onClick={() => submitResolve(rating)}>
              {isClosed ? 'Submit rating' : 'Resolve with rating'}
            </Button>
          </>
        ) : isClosed ? (
          canRateLater ? (
            <Button variant="outline" onClick={() => setRateOpen(true)}><Star size={15} style={{ marginRight: 6 }} /> Rate this doubt</Button>
          ) : null
        ) : (
          <>
            {isStudent && (
              <Button variant="outline" onClick={() => setRateOpen(true)}>Resolve</Button>
            )}
            <Button form="reply-form" type="submit" loading={reply.isPending}>Send reply</Button>
          </>
        )
      }
    >
      {isLoading || !doubt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Skeleton width="40%" height="1.25rem" />
          <Skeleton height="4rem" radius="var(--radius-lg)" />
          <Skeleton height="4rem" radius="var(--radius-lg)" />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Badge tone={STATUS_TONE[doubt.status]}>{titleCase(doubt.status)}</Badge>{' '}
            {doubt.module && <Badge tone="neutral">{doubt.module.name}</Badge>}
          </div>
          <div ref={messagesRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '40vh', overflow: 'auto', marginBottom: 'var(--space-4)' }}>
            {doubt.messages.map((m) => {
              const mine = m.authorRole === role;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    // Theme-adaptive via color-mix — readable in light & dark, green & orange.
                    background: mine
                      ? 'color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))'
                      : 'var(--color-background)',
                    border: `1px solid ${mine ? 'color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 2 }}>
                    {m.author?.name ?? 'User'} · {titleCase(m.authorRole)}{mine ? ' (you)' : ''} · {formatDate(m.createdAt)}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              );
            })}
          </div>
          {rateOpen ? (
            <div style={{ textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
              <p style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)' }}>
                Rate {doubt.answeredBy?.name ?? 'your trainer'}
              </p>
              <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
                {isClosed ? 'You can rate this resolved doubt at any time.' : 'Optionally rate your trainer — or close it without a rating.'}
              </p>
              <StarRating value={rating} onChange={setRating} size={32} />
            </div>
          ) : doubt.status === DoubtStatus.CLOSED ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
              <p className="lms-muted" style={{ marginBottom: 'var(--space-2)' }}>
                This doubt is resolved and closed.
              </p>
              {doubt.rating ? (
                <>
                  <StarRating value={doubt.rating} readOnly size={24} />
                  <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>
                    You rated {doubt.answeredBy?.name ?? 'your trainer'} {doubt.rating}/5
                  </p>
                </>
              ) : (
                <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                  Not rated{isStudent ? ' — you can still rate it using the button below.' : '.'}
                </p>
              )}
            </div>
          ) : (
            <form id="reply-form" onSubmit={send}>
              <Textarea
                placeholder="Write a reply…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
