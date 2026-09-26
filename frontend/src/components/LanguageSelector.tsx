import { useState } from 'react';
import { getLanguage, setLanguage, tr, useLanguage, type Language } from '../i18n';
import { authApi } from '../lib/api';
import { loadSession } from '../lib/session';

/** User preference is stored locally before registration and in MongoDB when signed in. */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const language = useLanguage();
  const [error, setError] = useState(false);
  async function change(next: Language) {
    if (next === getLanguage()) return;
    const previous = getLanguage();
    setLanguage(next);
    setError(false);
    if (!loadSession()?.accessToken) return;
    try { await authApi.updateLanguage(next); }
    catch { setLanguage(previous); setError(true); }
  }
  return <div className="language-switch-wrapper">
    <div role="group" aria-label={tr('Idioma')} className={`language-switch ${compact ? 'language-switch--compact' : ''}`}>
      <button type="button" aria-pressed={language === 'en'} onClick={() => void change('en')}>EN</button>
      <button type="button" aria-pressed={language === 'es'} onClick={() => void change('es')}>ES</button>
    </div>
    {error && <small className="language-error" role="alert">{tr('No se pudo guardar el idioma.')}</small>}
  </div>;
}
