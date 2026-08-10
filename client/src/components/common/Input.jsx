import { useState, useEffect, useRef } from 'react';
import { parseMonto, formatNumero } from '../../lib/money';

export function CurrencyInput({ label, value, onChange, error, className = '', placeholder = '0', prefix = '$' }) {
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      setDisplayValue(formatNumero(parseMonto(value)));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    // Pesos sin centavos: solo dígitos. Se reformatea en cada tecla porque al no
    // haber separador decimal no hay nada que se pueda romper a medio escribir.
    const clean = e.target.value.replace(/[^0-9]/g, '');
    const num = parseInt(clean, 10) || 0;

    setDisplayValue(formatNumero(num));

    if (onChange) {
      onChange({ target: { value: num.toString() } });
    }
  };

  const handleBlur = () => {
    if (displayValue) setDisplayValue(formatNumero(parseMonto(displayValue)));
  };

  const handleFocus = () => {
    const clean = String(value ?? '').replace(/[^0-9]/g, '');
    setDisplayValue(clean);
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={`
            w-full px-4 py-3 rounded-xl border bg-surface text-primary placeholder-muted
            transition-all duration-300 ease-out
            focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
            disabled:opacity-50 disabled:cursor-not-allowed
            ${prefix ? 'pl-8' : ''}
            ${error ? 'border-error focus:ring-error/30' : 'border-border'}
            ${className}
          `}
        />
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export function NumberInput({ label, value, onChange, error, className = '', placeholder = '0', suffix = '' }) {
  const [displayValue, setDisplayValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  // Mientras el campo tiene el foco manda el texto que escribe la persona; si
  // reformateáramos en cada tecla, el separador decimal a medio escribir se
  // borraría y sería imposible teclear "12,5" (quedaba 125).
  useEffect(() => {
    if (focused) return;
    if (value !== undefined && value !== null && value !== '') {
      setDisplayValue(formatNumero(parseMonto(value), { maxDecimales: 2 }));
    } else {
      setDisplayValue('');
    }
  }, [value, focused]);

  const handleChange = (e) => {
    const texto = e.target.value.replace(/[^0-9.,-]/g, '');
    setDisplayValue(texto);

    if (onChange) {
      onChange({ target: { value: String(parseMonto(texto)) } });
    }
  };

  const handleBlur = () => {
    setFocused(false);
    if (!String(displayValue).trim()) {
      setDisplayValue('');
      return;
    }
    setDisplayValue(formatNumero(parseMonto(displayValue), { maxDecimales: 2 }));
  };

  const handleFocus = () => {
    setFocused(true);
    const n = parseMonto(value);
    setDisplayValue(n ? String(n).replace('.', ',') : '');
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={`
            w-full px-4 py-3 rounded-xl border bg-surface text-primary placeholder-muted
            transition-all duration-300 ease-out
            focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
            disabled:opacity-50 disabled:cursor-not-allowed
            ${suffix ? 'pr-12' : ''}
            ${error ? 'border-error focus:ring-error/30' : 'border-border'}
            ${className}
          `}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export const Input = ({ label, error, className = '', type, ...props }) => {
  if (type === 'currency') {
    return <CurrencyInput label={label} error={error} className={className} {...props} />;
  }
  if (type === 'number') {
    return <NumberInput label={label} error={error} className={className} {...props} />;
  }
  
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-primary">{label}</label>
      )}
      <input
        className={`
          w-full px-4 py-3 rounded-xl border bg-surface text-primary placeholder-muted
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-error focus:ring-error/30' : 'border-border'}
          ${className}
        `}
        type={type || 'text'}
        {...props}
      />
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
};

export function Select({ label, error, options = [], className = '', placeholder, ...props }) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        <select
          className={`
            w-full px-4 py-3 rounded-xl border bg-surface text-primary appearance-none
            transition-all duration-300 ease-out
            focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-error focus:ring-error/30' : 'border-border'}
            ${className}
          `}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-primary">{label}</label>
      )}
      <textarea
        className={`
          w-full px-4 py-3 rounded-xl border bg-surface text-primary placeholder-muted
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
          disabled:opacity-50 disabled:cursor-not-allowed resize-none
          ${error ? 'border-error focus:ring-error/30' : 'border-border'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}