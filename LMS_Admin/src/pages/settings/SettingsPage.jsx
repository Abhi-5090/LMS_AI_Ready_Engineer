import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ThemeName } from '@/shared';
import { Badge, Button, Card, CardHeader, ErrorState, Input, Select, SkeletonText } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { useSettings, useTestAiConnection, useTestEmail, useUpdateSettings, useUploadSebConfig } from '@/lib/settings';
import { useTheme } from '@/theme/ThemeProvider';
import './settings.css';

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

      <div className="settings-grid">
      <Card>
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

      <EmailCard />
      <ProviderGradingCard settings={data} provider="claude" />
      <ProviderGradingCard settings={data} provider="openai" />
      <SafeExamBrowserCard settings={data} />
      <LiveKitCard settings={data} />
      </div>
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
    <Card>
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
    <Card>
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

function LiveKitCard({ settings }) {
  const configured = settings.livekitConfigured;
  return (
    <Card>
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
/** One provider's write-only key form (no header/status — the card supplies those). */
function ProviderKeyField({ keyLabel, envName, placeholder, locked, configured, field, update }) {
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

  if (locked) {
    return (
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        Set via the <code>{envName}</code> environment variable — managed outside this UI.
      </p>
    );
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <Input
        label={`${keyLabel} API key`}
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
  );
}

const AI_PROVIDERS = {
  claude: {
    title: 'AI Grading — Claude',
    subtitle: 'Anthropic Claude grades prompt-writing, scenario & coding answers.',
    keyLabel: 'Claude',
    envName: 'ANTHROPIC_API_KEY',
    placeholder: 'sk-ant-…',
    field: 'aiApiKey',
    activeKey: 'anthropic',
  },
  openai: {
    title: 'AI Grading — OpenAI (ChatGPT)',
    subtitle: 'Prefer ChatGPT models? An OpenAI key grades the same submissions.',
    keyLabel: 'OpenAI',
    envName: 'OPENAI_API_KEY',
    placeholder: 'sk-…',
    field: 'openaiApiKey',
    activeKey: 'openai',
  },
};

/** One AI-grading provider card. Either key alone enables grading; if both are set,
 *  Claude is the active one (shown by the "Active" badge). */
function ProviderGradingCard({ settings, provider }) {
  const cfg = AI_PROVIDERS[provider];
  const update = useUpdateSettings();
  const test = useTestAiConnection();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const configured = provider === 'claude' ? settings.anthropicConfigured : settings.openaiConfigured;
  const locked = provider === 'claude' ? settings.aiKeyLocked : settings.openaiKeyLocked;
  const active = settings.aiProvider === cfg.activeKey;

  async function runTest() {
    setMsg(''); setErr('');
    try {
      const r = await test.mutateAsync();
      const label = r.provider === 'openai' ? 'OpenAI' : 'Claude';
      setMsg(`Active provider connected: ${label} (${r.model}).`);
    } catch (e2) { setErr(apiErrorMessage(e2)); }
  }

  return (
    <Card>
      <CardHeader title={cfg.title} subtitle={cfg.subtitle} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        {configured ? <Badge tone="success">Configured</Badge> : <Badge tone="neutral">Not set</Badge>}
        {active && <Badge tone="primary">Active</Badge>}
      </div>

      <ProviderKeyField
        keyLabel={cfg.keyLabel}
        envName={cfg.envName}
        placeholder={cfg.placeholder}
        locked={locked}
        configured={configured}
        field={cfg.field}
        update={update}
      />

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outline" size="sm" onClick={runTest} loading={test.isPending} disabled={!settings.aiConfigured}>
          Test connection
        </Button>
        {msg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>{msg}</span>}
        {err && <span className="field__error">{err}</span>}
      </div>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-3)', marginBottom: 0 }}>
        Keys are stored server-side, write-only, and never shown again. If both providers are set, Claude is used.
      </p>
    </Card>
  );
}
