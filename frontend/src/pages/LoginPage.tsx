import { tr } from '../i18n/index';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { getLanguage, setLanguage } from '../i18n';
import { CountryPhoneInput } from '../components/CountryPhoneInput';
import { PasswordField } from '../components/PasswordField';
import { authApi, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';

export function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+52');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const session = await authApi.login(phone, password);
      saveSession(session);
      setLanguage(session.user.preferredLanguage ?? getLanguage());
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally { setLoading(false); }
  };

  return <AuthShell>
    <div className="auth-copy"><span className="eyebrow">{tr("ACCESO SEGURO")}</span><h1>{tr("Bienvenido de vuelta")}</h1><p>{tr("Accede a tu capital, ciclo activo y operaciones unificadas desde un solo lugar.")}</p></div>
    <form className="auth-form" onSubmit={submit}>
      <CountryPhoneInput value={phone} onChange={setPhone} />
      <PasswordField label={tr("Contraseña")} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <div className="form-error" role="alert">{tr(error)}</div>}
      <button className="primary-button" disabled={loading || phone.length < 7 || !password}>{loading ? tr("Accediendo…") : <>{tr("Entrar a AERVON")}{' '}<ArrowRight size={18}/></>}</button>
    </form>
    <p className="auth-switch">{tr("¿Aún no tienes cuenta?")}{' '}<Link to="/register">{tr("Crear cuenta")}</Link></p>
  </AuthShell>;
}
