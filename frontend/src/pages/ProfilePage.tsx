import { getLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, LogOut, MessageCircle, MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { LanguageSelector } from '../components/LanguageSelector';
import { PasswordField } from '../components/PasswordField';
import { ApiError, authApi } from '../lib/api';
import { clearSession, loadSession } from '../lib/session';
import type { AccountProfile, AccountSession } from '../lib/types';

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return tr('Dispositivo desconocido');
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Navegador';
  return `${tr(mobile ? 'Móvil' : 'Escritorio')} · ${tr(browser)}`;
}

function dateTime(value: string | null) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(getLanguage() === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

export function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const currentSessionId = loadSession()?.sessionId;

  const load = async () => {
    setError('');
    try {
      const [p, s] = await Promise.all([authApi.profile(), authApi.sessions()]);
      setProfile(p); setSessions(s);
    } catch { setError('No pudimos cargar la seguridad de tu cuenta.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const otherSessions = useMemo(() => sessions.filter((s) => !s.current && s.id !== currentSessionId), [sessions, currentSessionId]);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setMessage(''); setError('');
    if (newPassword !== confirmPassword) { setError('Las contraseñas nuevas no coinciden.'); return; }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage('Contraseña actualizada. Las sesiones anteriores fueron revocadas.');
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña.'); }
    finally { setSavingPassword(false); }
  };

  const revoke = async (id: string) => {
    setMessage(''); setError('');
    try { await authApi.revokeSession(id); setSessions((items) => items.filter((s) => s.id !== id)); setMessage('Sesión cerrada correctamente.'); }
    catch { setError('No se pudo cerrar esa sesión.'); }
  };

  const revokeOthers = async () => {
    setMessage(''); setError('');
    try { await authApi.revokeOtherSessions(); setSessions((items) => items.filter((s) => s.current || s.id === currentSessionId)); setMessage('Las demás sesiones fueron cerradas.'); }
    catch { setError('No se pudieron cerrar las demás sesiones.'); }
  };

  const logout = async () => { await authApi.logout(); clearSession(); navigate('/login', { replace: true }); };

  return <AppLayout title={tr("Perfil y seguridad")} subtitle={tr("TU CUENTA")}>
    {loading ? <div className="profile-loading"><LoaderCircle className="spin" size={24}/><span>{tr("Cargando seguridad…")}</span></div> : <>
      {error && <div className="form-message form-message--error">{tr(error)}</div>}
      {message && <div className="form-message form-message--success">{tr(message)}</div>}

      <section className="profile-card profile-language"><strong>{tr("Idioma")}</strong><LanguageSelector/></section>
      <section className="profile-card profile-card--identity">
        <div className="profile-identity__icon"><ShieldCheck size={25}/></div>
        <div><span className="eyebrow">{tr("CUENTA VERIFICADA")}</span><h2>{profile?.phoneE164 ?? '—'}</h2><p>{tr("AERVON protege el acceso con teléfono, contraseña y vinculación de Telegram.")}</p></div>
      </section>

      <section className="security-grid">
        <div className="security-status"><Smartphone size={18}/><div><span>{tr("Teléfono")}</span><strong><CheckCircle2 size={13}/>{' '}{tr("Verificado")}</strong><small>{dateTime(profile?.phoneVerifiedAt ?? null)}</small></div></div>
        <div className="security-status"><MessageCircle size={18}/><div><span>Telegram</span><strong><CheckCircle2 size={13}/>{' '}{tr("Vinculado")}</strong><small>{profile?.telegram.username ? `@${profile.telegram.username}` : tr('Cuenta verificada')}</small></div></div>
      </section>

      <section className="profile-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("SEGURIDAD")}</span><h2>{tr("Cambiar contraseña")}</h2></div><KeyRound size={20}/></div>
        <form className="security-form" onSubmit={changePassword}>
          <PasswordField label={tr("Contraseña actual")} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          <PasswordField label={tr("Nueva contraseña")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
          <PasswordField label={tr("Confirmar nueva contraseña")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
          <p className="security-hint">{tr("Mínimo 10 caracteres, incluyendo letras y números.")}</p>
          <button className="primary-button" disabled={savingPassword}>{savingPassword ? <LoaderCircle className="spin" size={17}/> : <KeyRound size={17}/>}{' '}{tr("Actualizar contraseña")}</button>
        </form>
      </section>

      <section className="profile-card">
        <div className="section-heading"><div><span className="eyebrow">{tr("DISPOSITIVOS")}</span><h2>{tr("Sesiones activas")}</h2></div><button className="mini-action" onClick={() => void load()} aria-label={tr("Actualizar")}><RefreshCw size={16}/></button></div>
        <div className="session-list">
          {sessions.map((session) => <div className="session-row" key={session.id}>
            <div className="session-icon"><MonitorSmartphone size={18}/></div>
            <div className="session-main"><strong>{deviceLabel(session.userAgent)} {session.current || session.id === currentSessionId ? <span>{tr("ACTUAL")}</span> : null}</strong><small>{tr("Actividad:")}{' '}{dateTime(session.lastUsedAt)}</small><small>{tr("Expira:")}{' '}{dateTime(session.expiresAt)}</small></div>
            {!session.current && session.id !== currentSessionId && <button className="session-revoke" onClick={() => void revoke(session.id)} aria-label={tr("Cerrar sesión")}><Trash2 size={16}/></button>}
          </div>)}
        </div>
        {otherSessions.length > 0 && <button className="secondary-button" onClick={() => void revokeOthers()}><LogOut size={16}/>{' '}{tr("Cerrar las demás sesiones")}</button>}
      </section>

      <section className="profile-card profile-card--note">
        <ShieldCheck size={19}/><div><strong>{tr("Acciones sensibles")}</strong><p>{tr("Los cambios de seguridad y futuros cambios de datos sensibles se validarán en backend. Telegram queda vinculado como canal verificado de la cuenta.")}</p></div>
      </section>

      <button className="danger-button" onClick={() => void logout()}><LogOut size={17}/>{' '}{tr("Cerrar sesión")}</button>
    </>}
  </AppLayout>;
}
