import { useLanguage } from '../i18n';
import { tr } from '../i18n/index';
import { Search, X } from 'lucide-react';
import { getCountries, getCountryCallingCode, type Country } from 'react-phone-number-input';
import { useMemo, useState } from 'react';

function flag(country: string) {
  return country.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}



type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export function CountryPhoneInput({ value, onChange, label = tr('Número de teléfono') }: Props) {
  const language = useLanguage();
  const displayNames = useMemo(() => new Intl.DisplayNames([language], { type: 'region' }), [language]);
  const [country, setCountry] = useState<Country>('MX');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const callingCode = getCountryCallingCode(country);
  const localValue = value.startsWith(`+${callingCode}`) ? value.slice(callingCode.length + 1) : value.replace(/^\+\d{1,4}/, '');

  const countries = useMemo(() => getCountries().map((code) => ({
    code,
    name: displayNames.of(code) || code,
    callingCode: getCountryCallingCode(code),
  })).filter((item) => `${item.name} ${item.callingCode}`.toLowerCase().includes(search.toLowerCase())), [search, displayNames]);

  const selectCountry = (next: Country) => {
    setCountry(next);
    onChange(`+${getCountryCallingCode(next)}${localValue.replace(/\D/g, '')}`);
    setSheetOpen(false);
    setSearch('');
  };

  return (
    <>
      <label className="field">
        <span className="field__label">{tr(label)}</span>
        <span className="phone-control">
          <button className="country-button" type="button" onClick={() => setSheetOpen(true)} aria-label={tr("Elegir código de país")}>
            <span>{flag(country)}</span>
            <strong>+{callingCode}</strong>
          </button>
          <input
            inputMode="tel"
            autoComplete="tel"
            placeholder="55 1234 5678"
            value={localValue}
            onChange={(event) => onChange(`+${callingCode}${event.target.value.replace(/\D/g, '')}`)}
          />
        </span>
      </label>

      {sheetOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <section className="country-sheet" role="dialog" aria-modal="true" aria-label={tr("Seleccionar país")} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title-row">
              <h2>{tr("Selecciona tu país")}</h2>
              <button className="icon-button" onClick={() => setSheetOpen(false)} aria-label={tr("Cerrar")}><X size={20} /></button>
            </div>
            <div className="search-box"><Search size={18} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Buscar país o código")} /></div>
            <div className="country-list">
              {countries.map((item) => (
                <button key={item.code} type="button" onClick={() => selectCountry(item.code)}>
                  <span className="country-flag">{flag(item.code)}</span>
                  <span className="country-name">{item.name}</span>
                  <span className="country-code">+{item.callingCode}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
