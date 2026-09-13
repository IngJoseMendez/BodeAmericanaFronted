import { useId } from 'react';
import { CampoMonto } from './CampoMonto';

// Todos los campos de la app salen de este archivo. Hasta ahora el <label> era un
// simple hermano del control, sin htmlFor ni id: el lector de pantalla anunciaba
// "campo de texto" sin decir de qué, y hacer clic en la etiqueta no llevaba el
// foco al campo. El id se genera con useId cuando la página no pasa uno propio.

// CurrencyInput y NumberInput ya no traen su propia maquinaria de formateo:
// los dos apoyan en CampoMonto, que es el unico sitio del sistema donde se
// decide como se ven los puntos de miles y —lo que mas cuesta— donde se queda
// el cursor al reformatear. Aqui solo queda el envoltorio: etiqueta, prefijo,
// error y las clases de la casa.
//
// Antes cada uno tenia su copia y no se parecian: CurrencyInput desformateaba
// al recibir el foco y NumberInput no formateaba mientras se escribia. Ninguno
// de los dos conservaba el cursor, asi que corregir un digito en medio de una
// cifra larga era imposible.

const cajaCampo = (error, extra = '') => `
  w-full px-4 py-3 rounded-xl border bg-surface text-primary placeholder-muted
  transition-all duration-300 ease-out
  focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
  disabled:opacity-50 disabled:cursor-not-allowed
  ${extra}
  ${error ? 'border-error focus:ring-error/30' : 'border-border'}
`;

export function CurrencyInput({ label, value, onChange, error, className = '', placeholder = '0', prefix = '$', id, ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {prefix}
          </span>
        )}
        <CampoMonto
          {...rest}
          id={inputId}
          value={value}
          onChange={onChange}
          // Pesos sin centavos: es lo que hacia esta casilla antes (solo digitos).
          decimales={0}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${cajaCampo(error, prefix ? 'pl-8' : '')} ${className}`}
        />
      </div>
      {error && <p id={errorId} className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export function NumberInput({ label, value, onChange, error, className = '', placeholder = '0', suffix = '', id, ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        <CampoMonto
          {...rest}
          id={inputId}
          value={value}
          onChange={onChange}
          decimales={2}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${cajaCampo(error, suffix ? 'pr-12' : '')} ${className}`}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">
            {suffix}
          </span>
        )}
      </div>
      {error && <p id={errorId} className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export const Input = ({ label, error, className = '', type, id, ...props }) => {
  // useId se llama siempre, antes de los returns tempranos, para no romper el
  // orden de los hooks cuando el mismo campo cambia de tipo.
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;

  if (type === 'currency') {
    return <CurrencyInput id={inputId} label={label} error={error} className={className} {...props} />;
  }
  if (type === 'number') {
    return <NumberInput id={inputId} label={label} error={error} className={className} {...props} />;
  }

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-primary">{label}</label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
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
      {error && <p id={errorId} className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
};

export function Select({ label, error, options = [], className = '', placeholder, id, ...props }) {
  const autoId = useId();
  const selectId = id || autoId;
  const errorId = `${selectId}-error`;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-primary">{label}</label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
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
      {error && <p id={errorId} className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', id, ...props }) {
  const autoId = useId();
  const areaId = id || autoId;
  const errorId = `${areaId}-error`;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={areaId} className="block text-sm font-medium text-primary">{label}</label>
      )}
      <textarea
        id={areaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
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
      {error && <p id={errorId} className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}