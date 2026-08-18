import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { requestOtp, verifyOtp, setPassword as setPasswordApi } from '@/lib/account';
import { useEntrance } from '@/lib/anim';
import './login.css';

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const toast = useToast();
  const cardRef = useEntrance({ y: 28, scale: 0.97, duration: 0.65 });
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password recovery (email OTP → set new password).
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'password'
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  function toReset() {
    setMode('reset'); setStep('email'); setError(''); setInfo('');
    setOtp(''); setResetToken(''); setNewPw(''); setConfirmPw('');
  }
  function toLogin() { setMode('login'); setError(''); setInfo(''); }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp(e) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      await requestOtp(email);
      setInfo('If that email has an account, a one-time code is on its way.');
      setStep('otp');
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }
  async function checkOtp(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await verifyOtp(email, otp.trim());
      setResetToken(res.resetToken);
      setStep('password');
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }
  async function savePw(e) {
    e.preventDefault();
    setError('');
    if (newPw.length < 8) return setError('Password must be at least 8 characters.');
    if (newPw !== confirmPw) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await setPasswordApi(resetToken, newPw);
      toast.success('Password updated — please sign in.');
      setPassword('');
      toLogin();
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
    return undefined;
  }

  return (
    <div className="login">
      <div className="login__theme">
        <ThemeSwitcher />
      </div>

      <div className="login__brand-panel">
        <span className="login__logo">AI</span>
        <h1 className="login__brand-title">AI Ready Engineer</h1>
        <p className="login__brand-tagline">
          Administrator Console — manage users, batches, curriculum, scheduling, assessments,
          certificates, and platform settings.
        </p>
      </div>

      <div className="login__form-panel">
        <Card className="login__card" ref={cardRef}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', color: 'var(--color-primary)' }}>
            <ShieldCheck size={20} strokeWidth={2.2} />
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>Admin access</span>
          </div>

          {mode === 'login' ? (
            <>
              <h2 style={{ marginBottom: 4 }}>Admin sign in</h2>
              <p className="lms-muted" style={{ marginBottom: 'var(--space-6)' }}>
                This portal is restricted to administrators.
              </p>
              <form onSubmit={onSubmit} className="login__form">
                <Input label="Email" name="email" type="email" autoComplete="email" placeholder="admin@institution.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label="Password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                {error && <div className="field__error">{error}</div>}
                <Button type="submit" block loading={loading}>Sign in</Button>
              </form>
              <button type="button" className="login__link" onClick={toReset}>Forgot password?</button>
              <p className="lms-muted login__hint">Students and trainers use the main application.</p>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: 4 }}>Reset password</h2>
              <p className="lms-muted" style={{ marginBottom: 'var(--space-6)' }}>
                {step === 'email' && 'Enter your admin email and we’ll send a one-time code.'}
                {step === 'otp' && 'Enter the code we emailed you.'}
                {step === 'password' && 'Choose a new password.'}
              </p>

              {step === 'email' && (
                <form onSubmit={sendOtp} className="login__form">
                  <Input label="Email" name="email" type="email" autoComplete="email" placeholder="admin@institution.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  {error && <div className="field__error">{error}</div>}
                  <Button type="submit" block loading={busy}>Send code</Button>
                </form>
              )}
              {step === 'otp' && (
                <form onSubmit={checkOtp} className="login__form">
                  {info && <p className="lms-muted" style={{ marginTop: 0 }}>{info}</p>}
                  <Input label="One-time code" name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} required />
                  {error && <div className="field__error">{error}</div>}
                  <Button type="submit" block loading={busy}>Verify code</Button>
                  <button type="button" className="login__link" onClick={sendOtp} disabled={busy}>Resend code</button>
                </form>
              )}
              {step === 'password' && (
                <form onSubmit={savePw} className="login__form">
                  <Input label="New password" name="new-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
                  <Input label="Confirm password" name="confirm-password" type="password" autoComplete="new-password" placeholder="Re-enter password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
                  {error && <div className="field__error">{error}</div>}
                  <Button type="submit" block loading={busy}>Set password</Button>
                </form>
              )}

              <button type="button" className="login__link" onClick={toLogin}>← Back to sign in</button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
