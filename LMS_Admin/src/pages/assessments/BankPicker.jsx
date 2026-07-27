import { useState } from 'react';
import { Database, Minus, Plus, Shuffle } from 'lucide-react';
import { Badge, Button, EmptyState, Select, SkeletonText } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useQuestionBank } from '@/lib/questionBank';
import { useAddQuestionsFromBank } from '@/lib/assessments';
import { QUESTION_TYPE_LABEL, QUESTION_TYPE_OPTIONS } from './assessmentsUi';
import { pickEvenlyByTopic, shuffle } from './bankRandom';

/** Small −/＋ number stepper (hides the native number spinners). */
function Stepper({ value, min = 0, max, onChange, ariaLabel }) {
  const v = Number(value) || 0;
  const set = (nv) => onChange(String(Math.max(min, Math.min(max ?? Infinity, nv))));
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => set(v - 1)} disabled={v <= min} aria-label={`Decrease ${ariaLabel}`}><Minus size={14} /></button>
      <input className="stepper__input" type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} />
      <button type="button" className="stepper__btn" onClick={() => set(v + 1)} disabled={max != null && v >= max} aria-label={`Increase ${ariaLabel}`}><Plus size={14} /></button>
    </div>
  );
}

/**
 * Pick questions from the module's bank to add to a test. Questions are scoped to
 * the topics the admin chose for the test (grouped by topic). "Select randomly"
 * pulls N from the chosen type (or all types), split evenly across those topics.
 * Questions already in the test (by source id) are filtered out.
 */
export function BankPicker({ assessment, onClose }) {
  const moduleId = assessment.module?.id ?? assessment.module;
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

  // Type filter — "All types" plus each type that actually has questions.
  const [typeFilter, setTypeFilter] = useState('ALL');
  const visible = typeFilter === 'ALL' ? available : available.filter((q) => q.type === typeFilter);
  const typeOptions = [
    { value: 'ALL', label: 'All types' },
    ...QUESTION_TYPE_OPTIONS.filter((o) => available.some((q) => q.type === o.value)),
  ];

  // How many to auto-pick.
  const [target, setTarget] = useState(() => String(Math.min(10, available.length) || ''));

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selectRandomly() {
    setErr('');
    const n = Math.min(Number(target) || 0, visible.length);
    if (n <= 0) return;
    // Split evenly across the test's topics when it spans more than one.
    const picks = topicSet.size > 1
      ? pickEvenlyByTopic(visible, testTopics, n)
      : shuffle(visible).slice(0, n).map((q) => q.id);
    setSelected(new Set(picks));
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
          {/* Auto-pick: label · type select · number · action — all in one row. */}
          <div className="autopick">
            <span className="autopick__label"><Shuffle size={16} /> Auto-pick</span>
            <Select
              className="autopick__select"
              options={typeOptions}
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setSelected(new Set()); }}
            />
            <div className="autopick__right">
              <Stepper value={target} min={0} max={visible.length} onChange={setTarget} ariaLabel="number of questions" />
              <Button type="button" onClick={selectRandomly}>
                <Shuffle size={15} style={{ marginRight: 6 }} /> Select randomly
              </Button>
              {selected.size > 0 && <span className="autopick__selected">{selected.size} selected</span>}
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
                      ? <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2)' }}>No questions{typeFilter === 'ALL' ? '' : ' of this type'} for this topic.</p>
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
