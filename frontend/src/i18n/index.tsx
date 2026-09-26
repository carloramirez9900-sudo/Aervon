import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import english from './en.json';
import backendSpanish from './es-extra.json';

export type Language = 'en' | 'es';
const KEY = 'aervon.language';
const translations: Record<string, string> = english;

function validLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'es';
}

function preferredLanguage(): Language {
  try { const stored = localStorage.getItem(KEY); return validLanguage(stored) ? stored : 'en'; }
  catch { return 'en'; }
}
let currentLanguage: Language = preferredLanguage();
const subscribers = new Set<() => void>();

export function getLanguage(): Language { return currentLanguage; }
export function setLanguage(language: Language): void {
  if (!validLanguage(language)) return;
  currentLanguage = language;
  try { localStorage.setItem(KEY, language); } catch { /* storage unavailable */ }
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  subscribers.forEach(callback => callback());
}

/** Source strings are the Spanish originals; English is the default display locale. */
export function tr(original: string): string {
  return currentLanguage === 'es' ? (backendSpanish as Record<string, string>)[original] ?? original : translations[original] ?? original;
}

const LocaleContext = createContext<Language>('en');
export function I18nProvider({ children }: PropsWithChildren) {
  const [language, update] = useState<Language>(currentLanguage);
  useEffect(() => {
    const callback = () => update(currentLanguage);
    subscribers.add(callback);
    document.documentElement.lang = currentLanguage;
    return () => { subscribers.delete(callback); };
  }, []);
  return <LocaleContext.Provider value={language}>{children}</LocaleContext.Provider>;
}
export function useLanguage(): Language { return useContext(LocaleContext); }
