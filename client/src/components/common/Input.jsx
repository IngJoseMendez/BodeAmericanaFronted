import { useState, useEffect, useRef } from 'react';

export function CurrencyInput({ label, value, onChange, error, className = '', placeholder = '0', prefix = '$' }) {
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString('es-MX'));
      } else {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    const input = e.target.value;
    const clean = input.replace(/[^0-9]/g, '');
    const num = parseInt(clean) || 0;
    
    setDisplayValue(num.toLocaleString('es-MX'));
    
    if (onChange) {
      onChange({ target: { value: num.toString() } });
    }
  };

  const handleBlur = () => {
    if (displayValue) {
      const num = parseFloat(displayValue.replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString('es-MX'));
      }
    }
  };

  const handleFocus = () => {
    const clean = String(value || '').replace(/[^0-9]/g, '');
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
  const inputRef = useRef(null);

  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString('es-MX'));
      } else {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    const input = e.target.value;
    const clean = input.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean) || 0;
    
    setDisplayValue(num.toLocaleString('es-MX'));
    
    if (onChange) {
      onChange({ target: { value: num.toString() } });
    }
  };

  const handleBlur = () => {
    if (displayValue) {
      const num = parseFloat(displayValue.replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString('es-MX'));
      }
    }
  };

  const handleFocus = () => {
    const clean = String(value || '').replace(/[^0-9.]/g, '');
    setDisplayValue(clean);
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