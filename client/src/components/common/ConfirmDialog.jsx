import { useState, useCallback, useRef, useEffect, useId, createContext, useContext } from 'react';
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
  const seqRef = useRef(0);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      // Si ya había una confirmación en pantalla su promesa quedaba colgada para
      // siempre y el `await confirm(...)` de esa página no volvía nunca. La
      // damos por cancelada antes de sustituir el resolvedor.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      // __seq sirve de `key`: React 18 puede fusionar el cierre de un diálogo y
      // la apertura del siguiente en un solo render. Sin key se reutilizaría la
      // misma instancia, el efecto de montaje (deps []) no volvería a correr y
      // el segundo diálogo saldría sin foco en "Confirmar".
      seqRef.current += 1;
      setDialog({
        ...(typeof options === 'string' ? { message: options } : options),
        __seq: seqRef.current,
      });
    });
  }, []);

  const handleConfirm = () => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(true);
    setDialog(null);
  };

  const handleCancel = () => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(false);
    setDialog(null);
  };

  // Tercera salida, opcional. Hay decisiones que no son sí/no: al cerrar un
  // formulario a medio llenar hay TRES respuestas —guardar y salir, salir
  // perdiendo lo escrito, o seguir aquí— y meterlas en dos botones obliga a
  // elegir cuál de las dos cosas que sí quiere hacer se esconde detrás de
  // "cancelar". Solo aparece si se pide `alternaText`; sin ella, este diálogo se
  // comporta exactamente como siempre y sigue resolviendo true/false.
  const handleAlterna = () => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.('alterna');
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <ConfirmDialogUI
          key={dialog.__seq}
          {...dialog}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onAlterna={handleAlterna}
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
  // Tercer botón, opcional: la otra cosa que el usuario sí quiere hacer.
  // Resuelve la cadena 'alterna'.
  alternaText,
  variant = 'danger',   // 'danger' | 'warning' | 'info' | 'success'
  onConfirm,
  onCancel,
  onAlterna,
}) {
  const confirmRef = useRef(null);
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const msgId = useId();

  // onCancel se recrea en cada render del provider; guardarlo en una ref permite
  // dejar el efecto con dependencias vacías. Si dependiera de onCancel, cualquier
  // repintado del árbol volvería a robar el foco al botón de confirmar.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Foco inicial en "Confirmar", Escape cancela, Tab no puede salirse del diálogo
  // (antes se escapaba al fondo y se podía pulsar cualquier botón de la página
  // mientras el diálogo de borrado seguía abierto) y al cerrar el foco vuelve al
  // elemento que lo abrió.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    confirmRef.current?.focus();

    const onKey = (e) => {
      // stopPropagation, y en fase de CAPTURA (ver el addEventListener de abajo):
      // este diálogo se abre a menudo ENCIMA de un modal, y el modal escucha
      // Escape y Tab en `document` durante el burbujeo. Sin cortar el evento
      // aquí, pulsar Escape con el diálogo abierto llegaba también al modal de
      // atrás: en el formulario de contenedores eso volvía a lanzar el aviso de
      // "tienes cambios sin guardar" en bucle, en vez de descartarlo.
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancelRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      // El foco es de este diálogo mientras esté abierto; que el modal de atrás
      // no intente atraparlo también.
      e.stopPropagation();

      const focusables = cardRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!cardRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const previo = previousFocusRef.current;
      // Puede que el elemento ya no exista (se borró la fila que lo contenía).
      if (previo && document.contains(previo) && typeof previo.focus === 'function') {
        previo.focus();
      }
    };
  }, []);

  const variantMap = {
    danger: {
      icon: <Trash2 size={22} />,
      iconBg: 'bg-error/10 text-error',
      // error-fuerte y no error: blanco sobre #ef4444 se queda en 3,76:1 y
      // este es el botón que confirma casi todos los borrados.
      btn: 'bg-error-fuerte hover:bg-error text-on-primary',
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
      // text-on-primary y no text-on-surface: sobre el índigo del botón el texto
      // debe ser el claro, no el mismo tono oscuro del fondo de las tarjetas.
      btn: 'bg-secondary hover:bg-secondary/90 text-on-primary',
      defaultTitle: 'Confirmar acción',
    },
    // Para acciones que NO destruyen nada (registrar, exportar, generar). Sin
    // esta variante caían en 'danger' y la usuaria veía botón rojo e icono de
    // papelera para confirmar, por ejemplo, "Registrar deuda masiva".
    success: {
      icon: <CheckCircle size={22} />,
      iconBg: 'bg-success/10 text-success',
      btn: 'bg-success hover:bg-success/90 text-on-surface',
      defaultTitle: '¿Confirmar?',
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
        ref={cardRef}
        /* Con tres botones el ancho de una tarjeta pequeña no alcanza y los
           rótulos se parten en dos líneas cada uno. */
        className={`relative w-full ${alternaText ? 'max-w-md' : 'max-w-sm'} rounded-2xl shadow-2xl animate-fade-in-up`}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? msgId : undefined}
      >
        {/* Close X */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors"
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
            <h2 id={titleId} className="font-display text-xl text-primary font-semibold">
              {resolvedTitle}
            </h2>
          </div>

          {/* Message */}
          {message && (
            // whitespace-pre-line: varios mensajes separan el dato del aviso con
            // una línea en blanco, y sin esto los dos párrafos se pegaban en uno.
            <p id={msgId} className="text-sm text-muted leading-relaxed mb-6 whitespace-pre-line">
              {message}
            </p>
          )}

          {/* Actions */}
          {/* flex-wrap: con tres botones en un móvil estrecho, sin esto el
              último se sale de la tarjeta. */}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {cancelText}
            </button>
            {alternaText && (
              <button
                onClick={onAlterna}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-error/40 text-error hover:bg-error/10 transition-colors active:scale-95"
              >
                {alternaText}
              </button>
            )}
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
