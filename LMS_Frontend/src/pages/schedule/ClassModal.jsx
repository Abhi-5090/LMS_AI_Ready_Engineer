import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useCreateClass, useCreateRecurringClasses, useUpdateClass } from '@/lib/classes';
import { PROVIDER_OPTIONS, STATUS_OPTIONS } from './scheduleUi';
import { toDateInput } from '@/lib/format';

const WEEKDAYS = [
  { v: 1, label: 'Mon' }, { v: 2, label: 'Tue' }, { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' }, { v: 5, label: 'Fri' }, { v: 6, label: 'Sat' }, { v: 0, label: 'Sun' },
];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Fresh sensible defaults for a NEW class: today's date, start = now rounded
 *  up to the next 5 minutes (local time), end = one hour after start. */
function blankForm() {
  const now = new Date();
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(now.getMinutes() / 5) * 5); // round up to next 5 min
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour
  return {
    title: '',
    module: '',
    batch: '',
    trainer: '',
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: hhmm(start),
    endTime: hhmm(end),
    mode: 'online',
    provider: 'ms_teams',
    meetingLink: '',
    autoCreateMeeting: false,
    repeat: false,
    daysOfWeek: [],
    repeatUntil: '',
  };
}

/** Create or edit a class session. mode: 'create' | 'edit'. */
export function ClassModal({ open, mode, initial, onClose, isAdmin, batches = [], modules = [], trainers = [] }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(blankForm);
  const [err, setErr] = useState('');
  const create = useCreateClass();
  const createRecurring = useCreateRecurringClasses();
  const update = useUpdateClass();
  const toast = useToast();
  const pending = create.isPending || update.isPending || createRecurring.isPending;

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (isEdit && initial) {
      setForm({
        title: initial.title,
        date: toDateInput(initial.date),
        startTime: initial.startTime,
        endTime: initial.endTime,
        mode: initial.provider === 'offline' ? 'offline' : 'online',
        provider: initial.provider === 'offline' ? 'ms_teams' : (initial.provider ?? 'ms_teams'),
        meetingLink: initial.meetingLink ?? '',
        recordingLink: initial.recordingLink ?? '',
        status: initial.status,
      });
    } else {
      setForm(blankForm());
    }
  }, [open, isEdit, initial]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const offline = form.mode === 'offline';
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: initial.id,
          title: form.title,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          provider: offline ? 'offline' : form.provider,
          meetingLink: offline ? '' : form.meetingLink,
          recordingLink: form.recordingLink,
          status: form.status,
        });
      } else {
        const body = {
          title: form.title,
          module: form.module,
          batch: form.batch,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          provider: offline ? 'offline' : form.provider,
        };
        const autoZoom = !offline && form.provider === 'zoom' && form.autoCreateMeeting && !form.meetingLink;
        if (autoZoom) body.autoCreateMeeting = true;
        else if (!offline) body.meetingLink = form.meetingLink || undefined;
        if (isAdmin) body.trainer = form.trainer;

        if (form.repeat) {
          if (form.daysOfWeek.length === 0) return setErr('Pick at least one weekday to repeat on.');
          if (!form.repeatUntil) return setErr('Choose a "repeat until" date.');
          const { date, ...rest } = body;
          const result = await createRecurring.mutateAsync({
            ...rest,
            startDate: form.date,
            endDate: form.repeatUntil,
            daysOfWeek: form.daysOfWeek,
          });
          toast.success(`${result.created} classes scheduled.`);
        } else {
          await create.mutateAsync(body);
          toast.success('Class scheduled.');
        }
      }
      onClose();
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  function toggleDay(v) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(v) ? f.daysOfWeek.filter((d) => d !== v) : [...f.daysOfWeek, v],
    }));
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Class' : 'Schedule Class'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="class-form" type="submit" loading={pending}>
            {isEdit ? 'Save' : 'Schedule'}
          </Button>
        </>
      }
    >
      <form id="class-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input label="Class title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Prompt Patterns — Live Session" required />

        {isEdit && initial ? (
          <div className="lms-secondary-text" style={{ fontSize: 'var(--font-size-sm)' }}>
            {initial.module?.name} · {initial.batch?.name} · {initial.trainer?.name}
          </div>
        ) : (
          <>
            <Select
              label="Module"
              value={form.module}
              onChange={(e) => set('module', e.target.value)}
              required
              options={[
                { value: '', label: 'Select module…' },
                ...modules.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
              ]}
            />
            <Select
              label="Batch"
              value={form.batch}
              onChange={(e) => set('batch', e.target.value)}
              required
              options={[
                { value: '', label: 'Select batch…' },
                ...batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
              ]}
            />
            {isAdmin && (
              <Select
                label="Trainer"
                value={form.trainer}
                onChange={(e) => set('trainer', e.target.value)}
                required
                options={[
                  { value: '', label: 'Select trainer…' },
                  ...trainers.map((t) => ({ value: t.id, label: `${t.name} (${t.email})` })),
                ]}
              />
            )}
          </>
        )}

        <Input label={form.repeat ? 'First class date' : 'Date'} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        {/* Session type · Start · End — one row. */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Select
            label="Session type"
            value={form.mode}
            onChange={(e) => set('mode', e.target.value)}
            options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline (in person)' }]}
            style={{ flex: '1 1 10rem' }}
          />
          <Input label="Start" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} style={{ flex: '1 1 7rem' }} required />
          <Input label="End" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} style={{ flex: '1 1 7rem' }} required />
        </div>

        {!isEdit && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
              <input type="checkbox" checked={form.repeat} onChange={(e) => set('repeat', e.target.checked)} />
              Repeat weekly
            </label>
            {form.repeat && (
              <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      className={`btn btn--sm ${form.daysOfWeek.includes(d.v) ? 'btn--primary' : 'btn--outline'}`}
                      onClick={() => toggleDay(d.v)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <Input label="Repeat until" type="date" value={form.repeatUntil} onChange={(e) => set('repeatUntil', e.target.value)} required />
                <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                  Creates one class on each selected weekday from the first date through this date.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Offline carries no meeting link; online shows the provider/link fields. */}
        {form.mode === 'offline' ? (
          <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
            🏫 In-person class — no meeting link. It still appears on the calendar and you mark attendance for it.
          </p>
        ) : (
          <>
            <Select label="Meeting provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} options={PROVIDER_OPTIONS} />
            {form.provider === 'internal' ? (
              <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
                🎥 Students and the trainer join the live class right inside the app — no external link needed.
              </p>
            ) : (
              <>
                {!isEdit && form.provider === 'zoom' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input type="checkbox" checked={form.autoCreateMeeting} onChange={(e) => set('autoCreateMeeting', e.target.checked)} />
                    Auto-create Zoom meeting link <span className="lms-muted">(requires Zoom configured in Settings)</span>
                  </label>
                )}
                {!(form.provider === 'zoom' && form.autoCreateMeeting && !isEdit) && (
                  <Input label="Meeting link" value={form.meetingLink} onChange={(e) => set('meetingLink', e.target.value)} placeholder="https://…" />
                )}
              </>
            )}
          </>
        )}

        {isEdit && (
          <>
            <Input label="Recording link" value={form.recordingLink} onChange={(e) => set('recordingLink', e.target.value)} placeholder="https://…" />
            <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)} options={STATUS_OPTIONS} />
          </>
        )}

        {err && <span className="field__error">{err}</span>}
      </form>
    </Modal>
  );
}
