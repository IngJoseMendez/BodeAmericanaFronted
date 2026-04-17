import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { AlertTriangle, Trash2, X, CheckCircle } from 'lucide-react';

/* ─────────────────────────────────────────────────────────
   Context
───────────────────────────────────────────────────────── */
const ConfirmContext = createContext(null);

/* ─────────────────────────────────────────────────────────
   Provider  ── wrap your app (or Layout) with this
───────────────────────────────────────────────────────── */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog(typeof options === 'string' ? { message: options } : options);
    });
  }, []);

  const handleConfirm = () => {
    resolverRef.current?.(true);
    setDialog(null);
  };

  const handleCancel = () => {
    resolverRef.current?.(false);
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <ConfirmDialogUI
          {...dialog}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/* ─────────────────────────────────────────────────────────
   Hook  ── useConfirm()
───────────────────────────────────────────────────────── */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be inside <ConfirmProvider>');
  return ctx;
}

/* ─────────────────────────────────────────────────────────
   Dialog UI
───────────────────────────────────────────────────────── */
function ConfirmDialogUI({
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',   // 'danger' | 'warning' | 'info'
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  // Auto-focus confirm button & keyboard shortcuts
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const variantMap = {
    danger: {
      icon: <Trash2 size={22} />,
      iconBg: 'bg-error/10 text-error',
      btn: 'bg-error hover:bg-error/90 text-on-primary',
      defaultTitle: '¿Eliminar?',
    },
    warning: {
      icon: <AlertTriangle size={22} />,
      iconBg: 'bg-warning/10 text-warning',
      btn: 'bg-warning hover:bg-warning/90 text-on-surface',
      defaultTitle: '¿Estás seguro?',
    },
    info: {
      icon: <CheckCircle size={22} />,
      iconBg: 'bg-secondary/10 text-secondary',
      btn: 'bg-secondary hover:bg-secondary/90 text-on-surface',
      defaultTitle: 'Confirmar acción',
    },
  };

  const v = variantMap[variant] ?? variantMap.danger;
  const resolvedTitle = title ?? v.defaultTitle;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 cmd-backdrop"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl animate-fade-in-up"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        aria-describedby="cd-msg"
      >
        {/* Close X */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors"
          aria-label="Cancelar"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl ${v.iconBg}`}>
              {v.icon}
            </div>
            <h2 id="cd-title" className="font-display text-xl text-primary font-semibold">
              {resolvedTitle}
            </h2>
          </div>

          {/* Message */}
          {message && (
            <p id="cd-msg" className="text-sm text-muted leading-relaxed mb-6">
              {message}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-primary hover:bg-surface transition-colors"
            >
              {cancelText}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm active:scale-95 ${v.btn}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
