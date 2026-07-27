import { useState } from 'react';
import { Database, Minus, Plus, Shuffle } from 'lucide-react';
import { Badge, Button, EmptyState, SkeletonText } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useQuestionBank } from '@/lib/questionBank';
import { useAddQuestionsFromBank } from '@/lib/assessments';
import { QUESTION_TYPE_LABEL, QUESTION_TYPE_OPTIONS, QUESTION_TYPE_SHORT } from './assessmentsUi';
import { pickEvenlyByTopic, shuffle } from './bankRandom';

/** Small −/＋ number stepper (hides the native number spinners). */
function Stepper({ value, min = 0, max, onChange, ariaLabel }) {
  const v = Number(value) || 0;
  const set = (nv) => onChange(String(Math.max(min, Math.min(max ?? Infinity, nv))));
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => set(v - 1)} disabled={v <= min} aria-label={`Decrease ${ariaLabel}`}><Minus size={13} /></button>
      <input className="stepper__input" type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} />
      <button type="button" className="stepper__btn" onClick={() => set(v + 1)} disabled={max != null && v >= max} aria-label={`Increase ${ariaLabel}`}><Plus size={13} /></button>
    </div>
  );
}

// Split `total` as evenly as possible across the given types, capped by each
// type's available count; any leftover from a capped type spills to the others.
// caps: [{ type, cap }] → returns { [type]: count }.
function splitEven(total, caps) {
  const counts = Object.fromEntries(caps.map((c) => [c.type, 0]));
  let remaining = Math.max(0, total);
  while (remaining > 0 && caps.some((c) => counts[c.type] < c.cap)) {
    for (const c of caps) {
      if (remaining <= 0) break;
      if (counts[c.type] < c.cap) { counts[c.type] += 1; remaining -= 1; }
    }
  }
  return counts;
}

/**
 * Pick questions from the module's bank to add to a test. Questions are scoped to
 * the topics the admin chose for the test (grouped by topic), and "Select randomly"
 * shares a target count evenly across those topics. Questions already in the test
 * (by source id) are filtered out.
 */
export function BankPicker({ assessment, onClose }) {
  const moduleId = assessment.module?.id ?? assessment.module;
  // Fetch the whole module bank; we scope to the test's topics client-side so we can
  // also group + split the random pick per topic.
  const { data: items, isLoading } = useQuestionBank({ module: moduleId });
  const addFromBank = useAddQuestionsFromBank();
  const [selected, setSelected] = useState(() => new Set());
  const [err, setErr] = useState('');

  // The topics this test covers (multi-select; fall back to the legacy single topic).
  const testTopics = assessment.topics?.length
    ? assessment.topics
    : (assessment.topic ? [{ topic: assessment.topic, title: assessment.topicTitle }] : []);
  const topicSet = new Set(testTopics.map((t) => String(t.topic)));

  const alreadyAdded = new Set((assessment.questions ?? []).map((q) => q.sourceId).filter(Boolean));
  const scoped = topicSet.size > 0 ? (items ?? []).filter((q) => topicSet.has(String(q.topic))) : (items ?? []);
  const available = scoped.filter((q) => !alreadyAdded.has(q.id));

  // Optional question-type filter — "All types" by default. When a type is
  // chosen, only that type is shown (and auto-picked) below.
  const [typeFilter, setTypeFilter] = useState('ALL');
  const visible = typeFilter === 'ALL' ? available : available.filter((q) => q.type === typeFilter);

  // The admin can auto-pick as many as are available (no per-type cap).
  const [target, setTarget] = useState(() => String(Math.min(10, available.length) || ''));

  // Per-type availability (only types that actually have questions), in a
  // consistent order (MCQ → Scenario → Prompt Writing → Repo Evaluation).
  const poolOf = (t) => available.filter((q) => q.type === t);
  const typeCaps = QUESTION_TYPE_OPTIONS
    .map((o) => ({ type: o.value, label: o.label, cap: poolOf(o.value).length }))
    .filter((c) => c.cap > 0);

  // When "All types" is chosen, the admin can dial how many of EACH type to pull.
  // Default = an even split of the Auto-pick total; editing a box overrides it.
  const [perType, setPerType] = useState({}); // {} → follow the even-split default
  const defaultSplit = splitEven(Number(target) || 0, typeCaps);
  const countFor = (t) => (perType[t] !== undefined ? perType[t] : String(defaultSplit[t] ?? 0));
  const perTypeTotal = typeCaps.reduce((sum, c) => sum + (Number(countFor(c.type)) || 0), 0);

  // Auto-pick total change → redistribute evenly (drop manual per-type edits).
  function changeTarget(v) { setTarget(v); setPerType({}); }
  // Editing one type's box overrides just that type; others keep their shown value.
  function setTypeCount(t, v) {
    setPerType((prev) => {
      const base = Object.keys(prev).length ? prev : Object.fromEntries(typeCaps.map((c) => [c.type, String(defaultSplit[c.type] ?? 0)]));
      return { ...base, [t]: v };
    });
  }

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // Pick `n` ids from a pool, split evenly across the test's topics when it spans more than one.
  const pickFrom = (pool, n) => (topicSet.size > 1
    ? pickEvenlyByTopic(pool, testTopics, n)
    : shuffle(pool).slice(0, n).map((q) => q.id));

  function selectRandomly() {
    setErr('');
    if (typeFilter === 'ALL') {
      // Pull the requested count of each type at random.
      const picks = [];
      for (const { type } of typeCaps) {
        const pool = poolOf(type);
        const n = Math.min(Number(countFor(type)) || 0, pool.length);
        if (n > 0) picks.push(...pickFrom(pool, n));
      }
      if (picks.length === 0) return;
      setSelected(new Set(picks));
      return;
    }
    // A single type is filtered — pick N of it.
    const n = Math.min(Number(target) || 0, visible.length);
    if (n <= 0) return;
    setSelected(new Set(pickFrom(visible, n)));
  }

  async function add() {
    setErr('');
    try {
      await addFromBank.mutateAsync({ id: assessment.id, questionIds: [...selected] });
      onClose();
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  }

  const QItem = (q) => (
    <label key={q.id} className="q-item" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} />
      <div className="q-item__body">
        <div className="q-item__prompt">{q.prompt}</div>
        <div className="q-item__meta">
          <Badge tone="neutral">{QUESTION_TYPE_LABEL[q.type]}</Badge>
          {q.topicTitle && <Badge tone="primary">{q.topicTitle}</Badge>}
          <span className="lms-muted">{q.points} pt{q.points > 1 ? 's' : ''}</span>
        </div>
      </div>
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p className="lms-muted" style={{ margin: 0 }}>
        {testTopics.length > 0
          ? <>Bank questions for <strong>{testTopics.map((t) => t.title).join(', ')}</strong>.</>
          : 'All bank questions for this module.'}
      </p>

      {isLoading && !items ? (
        <SkeletonText lines={4} />
      ) : available.length === 0 ? (
        <EmptyState
          icon={<Database size={26} />}
          title={`No more bank questions available${testTopics.length ? ' for these topics' : ''}`}
          description="Add questions in the Question Bank first."
        />
      ) : (
        <>
          {/* ── Auto-pick panel ─────────────────────────────────────────── */}
          <div className="autopick">
            <div className="autopick__head">
              <span className="autopick__title"><Shuffle size={16} /> Auto-pick</span>
              <span className="autopick__sub">Randomly select questions from the bank{topicSet.size > 1 ? `, split evenly across ${topicSet.size} topics` : ''}.</span>
            </div>

            <div className="autopick__body">
              {/* Type filter — segmented control (All + each type present). */}
              <div className="seg" role="tablist" aria-label="Question type">
                {[{ type: 'ALL', label: 'All types' }, ...typeCaps.map((c) => ({ type: c.type, label: QUESTION_TYPE_SHORT[c.type] ?? c.label }))].map((o) => (
                  <button
                    key={o.type}
                    type="button"
                    role="tab"
                    aria-selected={typeFilter === o.type}
                    className={`seg__btn${typeFilter === o.type ? ' is-active' : ''}`}
                    onClick={() => { setTypeFilter(o.type); setSelected(new Set()); setPerType({}); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {typeFilter === 'ALL' ? (
                <>
                  {typeCaps.length > 1 && (
                    <div className="autopick__evenly">
                      <span>Split</span>
                      <Stepper value={target} min={0} max={available.length} onChange={changeTarget} ariaLabel="total to distribute" />
                      <span>evenly, then fine-tune each type:</span>
                    </div>
                  )}
                  <div className="autopick__grid">
                    {typeCaps.map((c) => {
                      const val = Number(countFor(c.type)) || 0;
                      return (
                        <div key={c.type} className="tcard" data-active={val > 0} title={c.label}>
                          <div className="tcard__top">
                            <span className="tcard__code">{QUESTION_TYPE_SHORT[c.type] ?? c.label}</span>
                            <span className="tcard__cap">of {c.cap}</span>
                          </div>
                          <Stepper value={countFor(c.type)} min={0} max={c.cap} onChange={(v) => setTypeCount(c.type, v)} ariaLabel={`${c.label} count`} />
                          <div className="tcard__track"><div className="tcard__fill" style={{ width: `${c.cap ? Math.min(100, (val / c.cap) * 100) : 0}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="autopick__single">
                  <span>How many <strong>{QUESTION_TYPE_SHORT[typeFilter] ?? ''}</strong> questions?</span>
                  <Stepper value={target} min={0} max={visible.length} onChange={changeTarget} ariaLabel="how many" />
                  <span className="autopick__cap">of {visible.length}</span>
                </div>
              )}
            </div>

            <div className="autopick__foot">
              <div className="autopick__meta">
                <span className="autopick__count">
                  <strong>{typeFilter === 'ALL' ? perTypeTotal : Math.min(Number(target) || 0, visible.length)}</strong> to pick
                </span>
                {selected.size > 0 && <span className="autopick__selected">{selected.size} selected</span>}
              </div>
              <Button type="button" onClick={selectRandomly}>
                <Shuffle size={15} style={{ marginRight: 6 }} /> Select randomly
              </Button>
            </div>
          </div>

          <div className="q-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
            {testTopics.length > 0 ? (
              testTopics.map((t) => {
                const group = visible.filter((q) => String(q.topic) === String(t.topic));
                return (
                  <div key={t.topic} className="bank-group">
                    <div className="bank-group__head">
                      {t.title} <span className="lms-muted">· {group.length} question{group.length === 1 ? '' : 's'}</span>
                    </div>
                    {group.length === 0
                      ? <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2)' }}>No questions{typeFilter === 'ALL' ? '' : ` of this type`} for this topic.</p>
                      : group.map(QItem)}
                  </div>
                );
              })
            ) : visible.length === 0 ? (
              <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>No questions of this type in the bank.</p>
            ) : (
              visible.map(QItem)
            )}
          </div>
        </>
      )}

      {err && <span className="field__error">{err}</span>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={add} loading={addFromBank.isPending} disabled={selected.size === 0}>
          Add {selected.size || ''} question{selected.size === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
