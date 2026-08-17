import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './ui.css';

export const Input = forwardRef(function Input(
  { label, error, id, className = '', type = 'text', ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword && reveal ? 'text' : type;

  const field = isPassword ? (
    <div className="input-wrap">
      <input ref={ref} id={inputId} type={effectiveType} className={`input input--reveal ${className}`} {...rest} />
      <button
        type="button"
        className="input-reveal"
        onClick={() => setReveal((v) => !v)}
        aria-label={reveal ? 'Hide password' : 'Show password'}
        title={reveal ? 'Hide password' : 'Show password'}
      >
        {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  ) : (
    <input ref={ref} id={inputId} type={type} className={`input ${className}`} {...rest} />
  );

  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      {field}
      {error && <span className="field__error">{error}</span>}
    </div>
  );
});
