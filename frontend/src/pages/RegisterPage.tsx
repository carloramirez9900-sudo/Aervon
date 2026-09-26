import { tr } from '../i18n/index';
import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Send, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { getLanguage } from '../i18n';
import { CountryPhoneInput } from '../components/CountryPhoneInput';
import { PasswordField } from '../components/PasswordField';
import { ApiError, authApi } from '../lib/api';
import { saveSession } from '../lib/session';

type Step = 'phone' | 'telegram' | 'password';

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+52');
  const [referralCode, setReferralCode] = useState(() => (searchParams.get('ref') ?? '').toUpperCase());
  const [registrationToken, setRegistrationToken] = useState('');
  const [telegramLink, setTelegramLink] = useState('');
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== 'telegram' || !registrationToken || verified) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await authApi.registrationStatus(registrationToken);
        if (status.telegramVerified) { setVerified(true); setStep('password'); }
      } catch { /* polling continues until challenge expires */ }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [step, registrationToken, verified]);

  const start = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await authApi.startRegistration(phone, referralCode.trim());
      setRegistrationToken(result.registrationToken); setTelegramLink(result.telegramDeepLink); setStep('telegram');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el registro.'); }
    finally { setLoading(false); }
  };

  const complete = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Usa al menos 10 caracteres e incluye letras y números.');
    setLoading(true);
    try {
      const session = await authApi.completeRegistration(registrationToken, password, getLanguage());
      saveSession(session);
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo completar el registro.'); }
    finally { setLoading(false); }
  };

  return <AuthShell>
    <div className="stepper" aria-label={tr("Progreso del registro")}><span className="active"/><span className={step !== 'phone' ? 'active' : ''}/><span className={step === 'password' ? 'active' : ''}/></div>
    {step === 'phone' && <>
      <div className="auth-copy"><span className="eyebrow">{tr("CREA TU CUENTA")}</span><h1>{tr("Empieza en AERVON")}</h1><p>{tr("Regístrate con tu teléfono. La verificación se completa de forma segura mediante Telegram.")}</p></div>
      <form className="auth-form" onSubmit={start}>
        <CountryPhoneInput value={phone} onChange={setPhone} />
        <label className="field"><span className="field__label">{tr("Código de referido")}{' '}<em>{tr("opcional")}</em></span><span className="field__control"><input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder={tr("Ej. AERV1234")} /></span></label>
        {error && <div className="form-error">{tr(error)}</div>}
        <button className="primary-button" disabled={loading || phone.length < 7}>{loading ? tr("Preparando…") : tr("Continuar")}</button>
      </form>
    </>}

    {step === 'telegram' && <div className="telegram-step">
      <div className="telegram-icon"><Send size={34}/></div>
      <span className="eyebrow">{tr("VERIFICACIÓN TELEGRAM")}</span><h1>{tr("Confirma que el número es tuyo")}</h1>
      <p>{tr("Abre nuestro bot de Telegram y toca")}{' '}<strong>{tr("Compartir número")}</strong>{tr(". Nunca te pediremos códigos privados ni contraseñas de Telegram.")}</p>
      <a className="primary-button primary-button--telegram" href={telegramLink} target="_blank" rel="noreferrer">{tr("Abrir Telegram")}{' '}<ExternalLink size={18}/></a>
      <div className="verification-status"><span className="pulse-dot"/><div><strong>{tr("Esperando verificación")}</strong><small>{tr("Esta pantalla se actualizará automáticamente.")}</small></div></div>
      <button className="text-button" onClick={() => setStep('phone')}>{tr("Cambiar número")}</button>
    </div>}

    {step === 'password' && <>
      <div className="telegram-confirm"><ShieldCheck size={19}/><span>{tr("Teléfono verificado con Telegram")}</span></div>
      <div className="auth-copy"><span className="eyebrow">{tr("ÚLTIMO PASO")}</span><h1>{tr("Protege tu cuenta")}</h1><p>{tr("Crea una contraseña segura. Debe tener al menos 10 caracteres, letras y números.")}</p></div>
      <form className="auth-form" onSubmit={complete}>
        <PasswordField label={tr("Contraseña")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <PasswordField label={tr("Confirmar contraseña")} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <div className="form-error">{tr(error)}</div>}
        <button className="primary-button" disabled={loading}>{loading ? tr("Creando cuenta…") : tr("Entrar a AERVON")}</button>
      </form>
    </>}
    <p className="auth-switch">{tr("¿Ya tienes cuenta?")}{' '}<Link to="/login">{tr("Iniciar sesión")}</Link></p>
  </AuthShell>;
}
