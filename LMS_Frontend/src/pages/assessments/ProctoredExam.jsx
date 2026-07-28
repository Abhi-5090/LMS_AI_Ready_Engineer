import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Camera, Clock, Copy, Download, Expand, ListChecks, Lock, Maximize, ShieldCheck } from 'lucide-react';
import { QuestionType } from '@/shared';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useProctorShot, useRecordWarning, useSaveProgress, useStartAttempt, useSubmitAssessment } from '@/lib/assessments';
import { assessmentLabel, groupQuestionsByType, isGithubRepoUrl, QUESTION_TYPE_HINT, QUESTION_TYPE_LABEL } from './assessmentsUi';
import { RepoInput } from './TakeAssessment';
import './exam.css';
const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const fmtTime = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen?.(); } catch { /* user may decline */ }
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
async function requestCamera() {
  return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
}
function stopStream(stream) {
  stream?.getTracks?.().forEach((t) => t.stop());
}

// Returns a human label if the key event is a blocked/cheating shortcut, else null.
function blockedComboLabel(e) {
  const k = (e.key || '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const modName = e.metaKey ? 'Cmd' : 'Ctrl';
  if (e.key === 'F12') return 'F12';
  if (e.key === 'F5') return 'F5';
  if (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) return `${modName}+Shift+${k.toUpperCase()}`; // devtools
  if (mod && ['c', 'v', 'x', 'a', 'p', 's', 'u', 'f', 't', 'n', 'w', 'r', 'g'].includes(k)) return `${modName}+${k.toUpperCase()}`;
  if (e.altKey && k !== 'alt' && k.length === 1) return `Alt+${k.toUpperCase()}`;
  return null;
}

/** Decides between the pre-start intro and the live exam (handles resume). */
export function ProctoredFlow({ a }) {
  const resuming = a.attempt?.status === 'in_progress';
  const [exam, setExam] = useState(
    resuming ? { questions: a.questions, endsAt: a.attempt.endsAt, serverNow: a.serverNow, stream: null } : null,
  );
  return exam ? (
    <TimedExam assessment={a} questions={exam.questions} endsAt={exam.endsAt} serverNow={exam.serverNow} initialStream={exam.stream} />
  ) : (
    <ExamIntro a={a} onStarted={setExam} />
  );
}

function ExamIntro({ a, onStarted }) {
  const start = useStartAttempt();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const opensAt = a.availableFrom ? new Date(a.availableFrom).getTime() : null;
  const closesAt = a.deadline ? new Date(a.deadline).getTime() : null;
  const notYet = opensAt && now < opensAt;
  const closed = closesAt && now > closesAt;

  async function begin() {
    setErr('');
    setBusy(true);
    // Camera is mandatory — proctoring snapshots prove the genuine student took it.
    let stream;
    try {
      stream = await requestCamera();
    } catch {
      setBusy(false);
      setErr('Camera access is required to take this proctored test. Enable your webcam and try again.');
      return;
    }
    await enterFullscreen();
    try {
      const res = await start.mutateAsync(a.id);
      onStarted({ questions: res.questions, endsAt: res.endsAt, serverNow: res.serverNow, stream });
    } catch (e) {
      stopStream(stream);
      exitFullscreen();
      setBusy(false);
      setErr(apiErrorMessage(e));
    }
  }

  return (
    <div className="exam-intro-screen">
      <Card className="exam-intro-card">
        <Link to="/app/assessments" className="lms-muted exam-intro-card__back">← All assessments</Link>
        <CardHeader
          title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={22} style={{ color: 'var(--color-primary)' }} /> {assessmentLabel(a)}</span>}
          subtitle={`Proctored test · ${a.module?.name} · pass ≥ ${a.passingScore}%`}
        />

        <div className="exam-intro__meta">
          <div className="exam-meta-tile"><div className="exam-meta-tile__label">Questions</div><div className="exam-meta-tile__value">{a.questionCount ?? a.questions?.length ?? '—'}</div></div>
          <div className="exam-meta-tile"><div className="exam-meta-tile__label">Time limit</div><div className="exam-meta-tile__value">{a.durationMinutes} min</div></div>
          <div className="exam-meta-tile"><div className="exam-meta-tile__label">Window opens</div><div className="exam-meta-tile__value" style={{ fontSize: 'var(--font-size-sm)' }}>{fmtTime(a.availableFrom)}</div></div>
          <div className="exam-meta-tile"><div className="exam-meta-tile__label">Window closes</div><div className="exam-meta-tile__value" style={{ fontSize: 'var(--font-size-sm)' }}>{fmtTime(a.deadline)}</div></div>
        </div>

        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          You get <strong>{a.durationMinutes} minutes</strong> once you start, but the test must finish before the window
          closes — if you start late, your time is capped to the window end.
        </p>

        <ul className="exam-intro__rules">
          <li><Camera size={15} /> Your <strong>webcam must be on</strong> — a few snapshots are taken during the test to verify it's you.</li>
          <li><Maximize size={15} /> The test runs in full screen and must stay there the whole time.</li>
          <li><Copy size={15} /> Copy, cut, paste, right-click and shortcuts like Ctrl+C / Ctrl+V / Ctrl+P / F12 are <strong>disabled</strong>.</li>
          <li><AlertTriangle size={15} /> Switching tabs, minimising, leaving full screen, or attempting a blocked shortcut shows a <strong>warning</strong> — every warning is <strong>counted and your trainer can see it</strong>.</li>
          {Number(a.violationLimit) > 0 && (
            <li><AlertTriangle size={15} /> After <strong>{a.violationLimit} violation{Number(a.violationLimit) === 1 ? '' : 's'}</strong>, the test is <strong>submitted automatically</strong> and you can't continue.</li>
          )}
          <li><Clock size={15} /> Only <strong>Finish test</strong> ends the exam; when time runs out it submits automatically with your current answers.</li>
        </ul>

        {err && <span className="field__error" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>{err}</span>}

        {notYet ? (
          <Badge tone="warning">Opens {fmtTime(a.availableFrom)}</Badge>
        ) : closed ? (
          <Badge tone="error">The test window has closed</Badge>
        ) : a.requireSeb && !a.sebOk ? (
          <SebLaunch a={a} />
        ) : (
          <>
            {a.requireSeb && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Badge tone="success"><Lock size={13} /> Safe Exam Browser detected</Badge>
              </div>
            )}
            <Button onClick={begin} loading={busy || start.isPending}>
              <Expand size={16} /> Allow camera & start in full screen
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

/** Shown when an exam requires Safe Exam Browser but isn't being taken in it. */
function SebLaunch({ a }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-weight-semibold)' }}>
        <Lock size={16} style={{ color: 'var(--color-primary)' }} /> Safe Exam Browser required
      </div>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>
        This exam must be taken inside <strong>Safe Exam Browser (SEB)</strong>, which locks down your computer for the
        test. Open the exam configuration below in SEB to begin — taking it in a normal browser is not allowed.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
        {a.sebConfigUrl ? (
          <a href={a.sebConfigUrl} target="_blank" rel="noreferrer">
            <Button><Download size={16} /> Launch in Safe Exam Browser</Button>
          </a>
        ) : (
          <Badge tone="warning">Your administrator hasn't set up the SEB launch file yet.</Badge>
        )}
        <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noreferrer">
          <Button variant="outline"><Download size={16} /> Install Safe Exam Browser</Button>
        </a>
      </div>
    </div>
  );
}

function TimedExam({ assessment, questions, endsAt, serverNow, initialStream }) {
  const submitMut = useSubmitAssessment();
  const saveMut = useSaveProgress();
  const warnMut = useRecordWarning();
  const shotMut = useProctorShot();
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [warnToast, setWarnToast] = useState('');
  const [outOfFs, setOutOfFs] = useState(false); // shown when the student leaves full screen

  // Clock-skew-corrected timing.
  const skewRef = useRef(Date.now() - new Date(serverNow).getTime());
  const endMsRef = useRef(new Date(endsAt).getTime());
  const submittedRef = useRef(false);
  const armedRef = useRef(false);
  const streamRef = useRef(initialStream ?? null);
  const videoRef = useRef(null);
  const stopTimerRef = useRef(null);
  const scheduledRef = useRef(false);
  const lastWarnRef = useRef(0); // throttle so a held key doesn't flood the count
  const warningsRef = useRef(0); // synchronous mirror of the warning count (for the auto-submit check)
  const toastTimerRef = useRef(null);
  // Mutations are held in refs so the lifecycle effects can use stable, run-ONCE
  // deps. (The 1s countdown re-renders constantly — without this the camera effect
  // would re-run every tick and its cleanup would kill the webcam after ~1s.)
  const submitMutRef = useRef(submitMut); submitMutRef.current = submitMut;
  const saveMutRef = useRef(saveMut); saveMutRef.current = saveMut;
  const warnMutRef = useRef(warnMut); warnMutRef.current = warnMut;
  const shotMutRef = useRef(shotMut); shotMutRef.current = shotMut;
  const answersRef = useRef(answers); answersRef.current = answers;

  const releaseStream = useCallback(() => { stopStream(streamRef.current); streamRef.current = null; }, []);

  const buildPayload = useCallback(
    () =>
      questions
        .map((q) => {
          const ans = answersRef.current[q.id];
          if (!ans) return null;
          return q.type === QuestionType.MCQ
            ? (ans.selectedOption === undefined ? null : { question: q.id, selectedOption: ans.selectedOption })
            : (ans.text?.trim() ? { question: q.id, text: ans.text } : null);
        })
        .filter(Boolean),
    [questions],
  );

  // Capture the current webcam frame and upload it (best-effort). Returns a promise.
  const uploadShot = useCallback(() => new Promise((resolve) => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return resolve(false);
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    try { canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height); } catch { return resolve(false); }
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve(false);
      try { await shotMutRef.current.mutateAsync({ id: assessment.id, blob }); } catch { /* best-effort */ }
      resolve(true);
    }, 'image/jpeg', 0.7);
  }), [assessment.id]);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try { await submitMutRef.current.mutateAsync({ id: assessment.id, answers: buildPayload() }); } catch { /* result view reflects state */ }
    releaseStream();
    exitFullscreen();
  }, [assessment.id, buildPayload, releaseStream]);
  const doSubmitRef = useRef(doSubmit); doSubmitRef.current = doSubmit;

  // Admin-set violation cap: after this many warnings the exam auto-submits. 0 = off.
  const violationLimit = Number(assessment.violationLimit) || 0;

  // Record a proctoring warning (blocked shortcut or leaving the exam). Shows a
  // toast, bumps the counter, logs it server-side, and (for "leave" events) grabs
  // a webcam snapshot as evidence. The exam is NEVER auto-ended — only Finish ends it.
  const warn = useCallback((reason, { snapshot = false } = {}) => {
    if (submittedRef.current) return;
    const now = Date.now();
    if (now - lastWarnRef.current < 600) return; // throttle floods (held keys / rapid events)
    lastWarnRef.current = now;
    // Count synchronously via a ref — a value read back from a setState updater is
    // NOT observable in the same tick, so the auto-submit check must not depend on it.
    const next = warningsRef.current + 1;
    warningsRef.current = next;
    setWarnings(next);
    warnMutRef.current.mutate({ id: assessment.id, reason });
    if (snapshot) uploadShot();
    // Auto-submit once the admin-set violation limit is hit.
    if (violationLimit > 0 && next >= violationLimit) {
      setWarnToast('Violation limit reached — your test is being submitted.');
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setTimeout(() => doSubmitRef.current(), 400); // let the toast paint first
    } else {
      setWarnToast(reason);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setWarnToast(''), 2600);
    }
  }, [assessment.id, uploadShot, violationLimit]);

  // Countdown — ticks every second; auto-submits at zero.
  useEffect(() => {
    const tick = () => {
      const left = endMsRef.current - (Date.now() - skewRef.current);
      setRemaining(left);
      if (left <= 0) doSubmit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [doSubmit]);

  // Autosave every 15s (best-effort).
  useEffect(() => {
    const t = setInterval(() => {
      if (!submittedRef.current) saveMutRef.current.mutate({ id: assessment.id, answers: buildPayload() });
    }, 15000);
    return () => clearInterval(t);
  }, [assessment.id, buildPayload]);

  // Camera stays ON for the entire session. Runs ONCE (stable deps). Re-acquires if
  // the stream died, and stops it only on REAL teardown — the stop is deferred so
  // React 18 StrictMode's mount→unmount→mount can't kill the webcam after a second.
  useEffect(() => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    let active = true;
    (async () => {
      const live = streamRef.current?.getTracks?.().some((t) => t.readyState === 'live');
      if (!live) { try { streamRef.current = await requestCamera(); } catch { /* best-effort */ } }
      if (!active) return;
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play?.().catch(() => {});
      }
      if (!scheduledRef.current) {
        scheduledRef.current = true;
        // ~3 snapshots spread across the attempt (first shortly after start).
        const total = Math.max(10_000, endMsRef.current - (Date.now() - skewRef.current));
        [2500, Math.round(total * 0.45), Math.round(total * 0.8)].forEach((d) => {
          setTimeout(() => { if (!submittedRef.current) uploadShot(); }, Math.max(1500, d));
        });
      }
      setTimeout(() => { armedRef.current = true; }, 1000);
    })();
    return () => {
      active = false;
      stopTimerRef.current = setTimeout(() => releaseStream(), 600);
    };
  }, [uploadShot, releaseStream]);

  // Proctoring: block cheating shortcuts and warn (+ count) on every violation.
  // Nothing auto-ends the exam — only the Finish button submits it.
  useEffect(() => {
    enterFullscreen(); // ensure we're in full screen on entry

    const onFs = () => {
      if (!armedRef.current) return;
      if (!document.fullscreenElement) {
        warn('You left full screen', { snapshot: true }); // one violation per exit
        setOutOfFs(true); // block the exam until they return to full screen
      } else {
        setOutOfFs(false);
      }
    };
    const onVis = () => { if (armedRef.current && document.hidden) warn('You switched tab or minimised the window', { snapshot: true }); };
    const onBlur = () => { if (armedRef.current) warn('You moved to another window', { snapshot: true }); };

    // Hard-block known cheating shortcuts; each attempt is a counted warning.
    const onKeyDown = (e) => {
      const label = blockedComboLabel(e);
      if (!label) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) warn(`${label} is disabled during the exam`);
    };
    // Enforce no copy / cut / paste / right-click (keyboard combos are already
    // counted by onKeyDown, so just prevent the default here).
    const block = (e) => { e.preventDefault(); return false; };

    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown, true); // capture phase
    ['copy', 'cut', 'paste', 'contextmenu'].forEach((ev) => document.addEventListener(ev, block));
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown, true);
      ['copy', 'cut', 'paste', 'contextmenu'].forEach((ev) => document.removeEventListener(ev, block));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [warn]);

  function setAnswer(qid, patch) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  }
  const answeredCount = questions.filter((q) => {
    const ans = answers[q.id];
    return ans && (ans.selectedOption !== undefined || ans.text?.trim());
  }).length;

  const lowTime = remaining <= 60_000;
  const midTime = remaining <= 5 * 60_000;

  // Group questions by type (continuous numbering) for the navigator; flatten to
  // one ordered list for one-question-at-a-time navigation.
  const { groups } = useMemo(() => groupQuestionsByType(questions), [questions]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]); // [{ q, number }]
  const [current, setCurrent] = useState(0);
  const [visited, setVisited] = useState(() => new Set());
  const isAnswered = (q) => { const ans = answers[q.id]; return Boolean(ans && (ans.selectedOption !== undefined || ans.text?.trim())); };
  const go = (i) => setCurrent(Math.max(0, Math.min(ordered.length - 1, i)));
  // Mark the question on screen as "seen" — a seen-but-unanswered one shows for review.
  useEffect(() => {
    const item = ordered[current];
    if (item) setVisited((v) => (v.has(item.q.id) ? v : new Set(v).add(item.q.id)));
  }, [current, ordered]);
  const cur = ordered[current];

  return (
    <div className="exam-shell">
      <div className="exam-bar">
        <span className="exam-bar__title">{assessmentLabel(assessment)}</span>
        <Badge tone="neutral">{answeredCount}/{questions.length} answered</Badge>
        <Badge tone="primary"><ShieldCheck size={13} /> Proctored</Badge>
        {warnings > 0 && <Badge tone="warning"><AlertTriangle size={13} /> {warnings}{violationLimit > 0 ? `/${violationLimit}` : ''} warning{warnings === 1 ? '' : 's'}</Badge>}
        <span className="exam-bar__spacer" />
        <span className={`exam-timer${lowTime ? ' exam-timer--danger' : midTime ? ' exam-timer--warn' : ''}`}>
          <Clock size={18} /> {fmtClock(remaining)}
        </span>
        <Button size="sm" loading={submitMut.isPending} onClick={doSubmit}>Submit</Button>
      </div>

      <div className="exam-body">
        <aside className="exam-palette">
          <div className="exam-palette__head">
            <ListChecks size={18} /> Questions
          </div>
          {/* Grouped by type; green = answered, blue = seen but not answered (review). */}
          {groups.map((g) => (
            <div key={g.type} className="exam-pal-group">
              <div className="exam-pal-group__label">{g.label}</div>
              <div className="exam-palette__grid">
                {g.items.map(({ q, number }) => {
                  const answered = isAnswered(q);
                  const seen = visited.has(q.id);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`exam-pal-btn${answered ? ' is-answered' : seen ? ' is-review' : ''}${number - 1 === current ? ' is-current' : ''}`}
                      onClick={() => go(number - 1)}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="exam-legend">
            <span><i className="exam-legend__dot exam-legend__dot--answered" /> Answered</span>
            <span><i className="exam-legend__dot exam-legend__dot--review" /> To review</span>
          </div>
        </aside>

        <main className="exam-questions">
          {cur && (
            <div className="exam-q-single">
              <div className="exam-q__section">{QUESTION_TYPE_LABEL[cur.q.type]} · Question {cur.number} of {ordered.length}</div>
              <div className="exam-q__prompt">{cur.number}. {cur.q.prompt}</div>
              {cur.q.type === QuestionType.MCQ ? (
                cur.q.options?.map((opt, oi) => (
                  <label key={oi} className={`exam-opt${answers[cur.q.id]?.selectedOption === oi ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name={cur.q.id}
                      checked={answers[cur.q.id]?.selectedOption === oi}
                      onChange={() => setAnswer(cur.q.id, { selectedOption: oi })}
                    />
                    {opt}
                  </label>
                ))
              ) : cur.q.type === QuestionType.CODING ? (
                <RepoInput value={answers[cur.q.id]?.text ?? ''} onChange={(v) => setAnswer(cur.q.id, { text: v })} />
              ) : (
                <textarea
                  className="input"
                  style={{ minHeight: '9rem', width: '100%' }}
                  placeholder={QUESTION_TYPE_HINT[cur.q.type] || 'Type your answer…'}
                  value={answers[cur.q.id]?.text ?? ''}
                  onChange={(e) => setAnswer(cur.q.id, { text: e.target.value })}
                />
              )}
            </div>
          )}
          <div className="exam-nav">
            <Button variant="outline" disabled={current === 0} onClick={() => go(current - 1)}>Previous</Button>
            <span className="exam-nav__spacer" />
            {current < ordered.length - 1 ? (
              <Button onClick={() => go(current + 1)}>Next</Button>
            ) : (
              <Button loading={submitMut.isPending} onClick={doSubmit}>Submit test</Button>
            )}
          </div>
        </main>
      </div>

      <div className="exam-cam">
        <video ref={videoRef} muted autoPlay playsInline />
        <span className="exam-cam__rec"><span className="exam-cam__dot" /> REC</span>
      </div>

      {warnToast && (
        <div className="exam-toast" role="alert">
          <AlertTriangle size={18} /> <span>{warnToast}. This is recorded (warning {warnings}).</span>
        </div>
      )}

      {outOfFs && !submittedRef.current && (
        <div className="exam-warn" role="alertdialog" aria-modal="true">
          <div className="exam-warn__card">
            <Maximize size={30} className="exam-warn__icon" />
            <h3 style={{ margin: '0 0 var(--space-2)' }}>You left full screen</h3>
            <p className="lms-muted" style={{ marginBottom: 'var(--space-4)' }}>
              This exam must stay in full screen — leaving is recorded as a violation
              {violationLimit > 0 ? ` (${warnings}/${violationLimit})` : ` (${warnings} so far)`}. Return to continue.
            </p>
            <Button onClick={() => enterFullscreen()}><Expand size={16} style={{ marginRight: 6 }} /> Return to full screen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
