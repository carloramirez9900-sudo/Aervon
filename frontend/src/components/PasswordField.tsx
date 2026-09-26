import { tr } from '../i18n/index';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function PasswordField({ label, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span className="field__label">{tr(label)}</span>
      <span className="field__control">
        <LockKeyhole size={18} aria-hidden="true" />
        <input {...props} type={visible ? 'text' : 'password'} autoComplete={props.autoComplete ?? 'current-password'} />
        <button className="icon-button" type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? tr("Ocultar contraseña") : tr("Mostrar contraseña")}>
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  );
}
