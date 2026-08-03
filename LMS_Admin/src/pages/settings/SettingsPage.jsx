import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ThemeName } from '@/shared';
import { Badge, Button, Card, CardHeader, ErrorState, Input, Select, SkeletonText } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useSettings, useTestAiConnection, useTestEmail, useTestZoomConnection, useUpdateSettings, useUploadSebConfig } from '@/lib/settings';
import { useTheme } from '@/theme/ThemeProvider';

export function SettingsPage() {
  const { data, isLoading, isError, error, refetch } = useSettings();
  const update = useUpdateSettings();
  const { setTheme } = useTheme();

  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data) setForm({
      passingScore: data.passingScore,
      minAttendance: data.minAttendance,
      activeTheme: data.activeTheme,
    });
  }, [data]);

  if (isError) {
    return (
      <>
        <PageHeader title="Platform Settings" subtitle="Institution-wide rules applied across the platform." />
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      </>
    );
  }

  if (isLoading || !form) {
    return (
      <>
        <PageHeader title="Platform Settings" subtitle="Institution-wide rules applied across the platform." />
        <Card style={{ maxWidth: '40rem' }}>
          <SkeletonText lines={6} />
        </Card>
      </>
    );
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    setSaved(false);
    try {
      await update.mutateAsync({
        passingScore: Number(form.passingScore),
        minAttendance: Number(form.minAttendance),
        activeTheme: form.activeTheme,
      });
      setTheme(form.activeTheme); // reflect the institutional theme immediately
      setSaved(true);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Institution-wide rules applied across the platform." />

      <Card style={{ maxWidth: '40rem' }}>
        <CardHeader title="Academic & Access Rules" />
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Input
            label="Passing score (%)"
            type="number"
            min="0"
            max="100"
            value={form.passingScore}
            onChange={(e) => setForm({ ...form, passingScore: e.target.value })}
            error={undefined}
          />
          <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: '-12px' }}>
            Minimum % to pass a final assessment and unlock the next module.
          </span>

          <Input
            label="Minimum attendance (%)"
            type="number"
            min="0"
            max="100"
            value={form.minAttendance}
            onChange={(e) => setForm({ ...form, minAttendance: e.target.value })}
          />
          <span className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: '-12px' }}>
            Required overall attendance for module completion and certification.
          </span>

          <Select
            label="Default theme"
            value={form.activeTheme}
            onChange={(e) => setForm({ ...form, activeTheme: e.target.value })}
            options={[
              { value: ThemeName.GREEN, label: 'AI Ready Green' },
              { value: ThemeName.ORANGE, label: 'AI Ready Orange' },
            ]}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button type="submit" loading={update.isPending}>Save settings</Button>
            {saved && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={15} strokeWidth={3} /> Saved</span>}
            {err && <span className="field__error">{err}</span>}
          </div>
        </form>
      </Card>

      <AiGradingCard settings={data} />
      <EmailCard />
      <ZoomCard settings={data} />
      <LiveKitCard settings={data} />
      <SafeExamBrowserCard settings={data} />
    </>
  );
}

function SafeExamBrowserCard({ settings }) {
  const update = useUpdateSettings();
  const upload = useUploadSebConfig();
  // The Config Key is write-only (never returned). Leave blank to keep the saved one.
  const [form, setForm] = useState({ sebConfigKey: '', sebConfigUrl: settings.sebConfigUrl || '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const body = { sebConfigUrl: form.sebConfigUrl.trim() };
      if (form.sebConfigKey.trim()) body.sebConfigKey = form.sebConfigKey.trim();
      await update.mutateAsync(body);
      setForm((f) => ({ ...f, sebConfigKey: '' }));
      setMsg('Saved.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }
  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const data = await upload.mutateAsync(file);
      setForm((f) => ({ ...f, sebConfigUrl: data.sebConfigUrl }));
      setMsg('.seb config uploaded.');
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Card style={{ maxWidth: '40rem', marginTop: 'var(--space-6)' }}>
      <CardHeader title="Safe Exam Browser (SEB)" subtitle="One global Config Key locks proctored exams to the SEB kiosk browser." />
      <div style={{ marginBottom: 'var(--space-3)' }}>
        {settings.sebConfigured ? <Badge tone="success">Config Key set</Badge> : <Badge tone="neutral">Not configured</Badge>}
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Input
          label="SEB Config Key"
          autoComplete="off"
          placeholder={settings.sebConfigured ? 'A key is saved — enter a new one to replace it' : 'Paste the Config Key from SEB Config Tool'}
          value={form.sebConfigKey}
          onChange={(e) => setForm({ ...form, sebConfigKey: e.target.value })}
        />
        <Input
          label="SEB config (.seb) download URL"
          autoComplete="off"
          placeholder="https://…/exam.seb  (students launch from here)"
          value={form.sebConfigUrl}
          onChange={(e) => setForm({ ...form, sebConfigUrl: e.target.value })}
        />
        <label className="field">
          <span className="field__label">…or upload a .seb file</span>
          <input type="file" accept=".seb" onChange={onUpload} disabled={upload.isPending} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button type="submit" loading={update.isPending}>Save SEB settings</Button>
          {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>{msg}</span>}
        </div>
        {err && <span className="field__error">{err}</span>}
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
          In the <strong>SEB Config Tool</strong>, set the exam Start URL to this app, copy the generated{' '}
          <strong>Config Key</strong> here, and upload the same <strong>.seb</strong> file so students can launch it.
          Then tick “Require Safe Exam Browser” on a proctored exam. SEB is desktop-only (Windows/macOS).
        </p>
      </form>
    </Card>
  );
}

/** Email delivery — send a real test email so verification-code delivery can be confirmed. */
function EmailCard() {
  const test = useTestEmail();
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function runTest(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      const r = await test.mutateAsync(to.trim() || undefined);
      setMsg(`Test email sent to ${r.to}. Check that inbox (and spam) — if it arrives, verification codes will too.`);
    } catch (e2) {
      setErr(apiErrorMessage(e2));
    }
  }

  return (
    <Card style={{ maxWidth: '40rem', marginTop: 'var(--space-6)' }}>
      <CardHeader title="Email delivery (verification codes)" subtitle="Login/onboarding 6-digit codes are emailed via SMTP. Send a test to confirm it works on this server." />
      <form onSubmit={runTest} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Input
          label="Send a test email to"
          type="email"
          placeholder="your own email (defaults to your admin address)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button type="submit" variant="outline" loading={test.isPending}>Send test email</Button>
          {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>{msg}</span>}
          {err && <span className="field__error">{err}</span>}
        </div>
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
          If this fails, verification codes won't send. Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>MAIL_FROM</code> in the backend <code>.env</code> and restart it. The error shown here is the exact SMTP reason.
        </p>
      </form>
    </Card>
  );
}

function ZoomCard({ settings }) {
  const update = useUpdateSettings();
  const test = useTestZoomConnection();
  const [form, setForm] = useState({ zoomAccountId: '', zoomClientId: '', zoomClientSecret: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const locked = settings.zoomLocked;
  const configured = settings.zoomConfigured;

  async function save(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      await update.mutateAsync(form);
      setForm({ zoomAccountId: '', zoomClientId: '', zoomClientSecret: '' });
      setMsg('Zoom credentials saved.');
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  async function runTest() {
    setMsg(''); setErr('');
    try {
      await test.mutateAsync();
      setMsg('Zoom credentials are valid.');
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  return (
    <Card style={{ maxWidth: '40rem', marginTop: 'var(--space-6)' }}>
      <CardHeader title="Zoom Integration" subtitle="Auto-create meeting links when scheduling Zoom classes (Server-to-Server OAuth)." />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        Status:{' '}
        {configured
          ? <Badge tone="success">Configured ({settings.zoomSource})</Badge>
          : <Badge tone="warning">Not configured — Zoom classes use manual links</Badge>}
      </div>

      {locked ? (
        <p className="lms-muted">Zoom credentials are set via environment variables and managed outside this UI.</p>
      ) : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input label="Account ID" autoComplete="off" placeholder={configured ? '•••• (saved)' : ''} value={form.zoomAccountId} onChange={(e) => setForm({ ...form, zoomAccountId: e.target.value })} />
          <Input label="Client ID" autoComplete="off" value={form.zoomClientId} onChange={(e) => setForm({ ...form, zoomClientId: e.target.value })} />
          <Input label="Client Secret" type="password" autoComplete="off" value={form.zoomClientSecret} onChange={(e) => setForm({ ...form, zoomClientSecret: e.target.value })} />
          <div>
            <Button type="submit" loading={update.isPending}>Save credentials</Button>
          </div>
          <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
            Create a <strong>Server-to-Server OAuth</strong> app at zoom.us with the
            <code> meeting:write</code> scope. Stored server-side, never shown again.
          </p>
        </form>
      )}

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outline" onClick={runTest} loading={test.isPending} disabled={!configured}>Test connection</Button>
        {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>{msg}</span>}
        {err && <span className="field__error">{err}</span>}
      </div>
    </Card>
  );
}

function LiveKitCard({ settings }) {
  const configured = settings.livekitConfigured;
  return (
    <Card style={{ maxWidth: '40rem', marginTop: 'var(--space-6)' }}>
      <CardHeader title="LiveKit (in-app live classes)" subtitle="Powers live classes that run inside the learner app, with no external meeting link." />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        Status:{' '}
        {configured
          ? <Badge tone="success">Configured</Badge>
          : <Badge tone="warning">Not configured — in-app live classes are unavailable</Badge>}
      </div>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        Credentials are set via server environment variables
        (<code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code>),
        not from this UI. Once configured, schedule a class with the “In-app live class” provider —
        the trainer and students start and join it from inside the learner app.
      </p>
    </Card>
  );
}

/** One provider's write-only key field (Claude or OpenAI). */
function ProviderKeyField({ label, envName, placeholder, locked, configured, field, update }) {
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      await update.mutateAsync({ [field]: key.trim() });
      setKey('');
      setMsg(key.trim() ? 'Key saved.' : 'Key cleared.');
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <strong>{label}</strong>
        {configured ? <Badge tone="success">Configured</Badge> : <Badge tone="neutral">Not set</Badge>}
      </div>
      {locked ? (
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
          Set via the <code>{envName}</code> environment variable — managed outside this UI.
        </p>
      ) : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Input
            label={`${label} API key`}
            type="password"
            autoComplete="off"
            placeholder={configured ? 'A key is saved — enter a new one to replace it' : placeholder}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button type="submit" size="sm" loading={update.isPending}>Save</Button>
            {configured && (
              <Button type="button" size="sm" variant="outline" onClick={() => { setKey(''); update.mutate({ [field]: '' }); }}>
                Clear
              </Button>
            )}
            {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)' }}>{msg}</span>}
            {err && <span className="field__error">{err}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

function AiGradingCard({ settings }) {
  const update = useUpdateSettings();
  const test = useTestAiConnection();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const configured = settings.aiConfigured;
  const providerLabel = settings.aiProvider === 'openai' ? 'OpenAI' : settings.aiProvider === 'anthropic' ? 'Claude' : null;

  async function runTest() {
    setMsg(''); setErr('');
    try {
      const r = await test.mutateAsync();
      const label = r.provider === 'openai' ? 'OpenAI' : 'Claude';
      setMsg(`Connected to ${label} (${r.model}).`);
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  return (
    <Card style={{ maxWidth: '40rem', marginTop: 'var(--space-6)' }}>
      <CardHeader title="AI Grading" subtitle="Evaluates prompt-writing, scenario & coding submissions. Provide a Claude OR an OpenAI key — either one works." />
      <div style={{ marginBottom: 'var(--space-1)' }}>
        Status:{' '}
        {configured
          ? <Badge tone="success">Active: {providerLabel} ({settings.aiKeySource})</Badge>
          : <Badge tone="warning">Not configured</Badge>}
      </div>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 0 }}>
        If both are set, Claude is used. Keys are stored server-side, write-only, and never shown again.
      </p>

      <ProviderKeyField
        label="Claude (Anthropic)"
        envName="ANTHROPIC_API_KEY"
        placeholder="sk-ant-…"
        locked={settings.aiKeyLocked}
        configured={settings.anthropicConfigured}
        field="aiApiKey"
        update={update}
      />
      <ProviderKeyField
        label="OpenAI"
        envName="OPENAI_API_KEY"
        placeholder="sk-…"
        locked={settings.openaiKeyLocked}
        configured={settings.openaiConfigured}
        field="openaiApiKey"
        update={update}
      />

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outline" onClick={runTest} loading={test.isPending} disabled={!configured}>
          Test connection
        </Button>
        {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>{msg}</span>}
        {err && <span className="field__error">{err}</span>}
      </div>
    </Card>
  );
}
