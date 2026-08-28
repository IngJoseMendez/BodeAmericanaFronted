import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { X } from 'lucide-react';

// Pila global de modales abiertos: solo el modal de la cima maneja Escape y
// el lock de scroll del body. Esto evita que abrir un modal interno cierre
// también el modal padre al pulsar Escape.
const modalStack = [];

// `onSolicitarCierre` (opcional) intercepta los TRES caminos por los que se
// cierra un modal —Escape, la X y el clic en el fondo—: si se pasa, el modal no
// se cierra solo, sino que avisa a la pantalla y es ella quien decide. Sirve
// para un formulario a medio llenar, donde cerrar sin más pierde el trabajo.
//
// No se resolvió interceptando `onClose` porque para entonces la animación de
// salida ya ha corrido y `visible` ya es false: al decidir NO cerrar, el modal
// se quedaba en pantalla pero con el manejador de Escape apagado. La pantalla
// cierra poniendo `isOpen` en false, que es el camino de siempre.
export function Modal({ isOpen, onClose, title, children, size = 'md', onSolicitarCierre }) {
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = Symbol('modal');
  }
  // Id único por modal. Con la cadena fija 'modal-title' dos modales apilados
  // (p. ej. "Nuevo contenedor" + "Plantillas guardadas") dejaban dos elementos
  // con el mismo id en el DOM y el lector de pantalla anunciaba siempre el
  // título del modal exterior.
  const titleId = useId();

  // Guardar el elemento que abrió el modal para restaurar el foco al cerrar.
  // La rama `else` es indispensable: cuando la página cierra el modal por código
  // (setModalOpen(false) tras guardar) `isOpen` pasa a false pero nadie bajaría
  // `visible`, así que el modal se quedaba en pantalla y el usuario volvía a
  // pulsar Guardar, duplicando abonos y ventas.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setVisible(true);
      setAnimatingOut(false);
      return;
    }

    setAnimatingOut(true);
    const teniaFoco = modalRef.current?.contains(document.activeElement);
    const t = setTimeout(() => {
      setVisible(false);
      setAnimatingOut(false);
      // Solo devolvemos el foco si seguía dentro del modal; si la página ya lo
      // movió a otro sitio, respetamos esa decisión.
      if (teniaFoco && typeof previousFocusRef.current?.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }, 200); // tiempo de la animación de salida
    return () => clearTimeout(t);
  }, [isOpen]);

  // Focus trap — mover el foco al modal cuando abre
  useEffect(() => {
    if (visible && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  }, [visible]);

  // Las dos devoluciones de llamada se guardan en refs porque las pantallas las
  // pasan como funciones nuevas en cada render (`onClose={() => …}`). Usadas
  // directamente como dependencias, el efecto de abajo se desmontaba y volvía a
  // montarse EN CADA TECLA del formulario: quitaba y volvía a poner la escucha
  // de teclado, y sacaba y metía este modal de la pila —soltando y volviendo a
  // bloquear el scroll del body por el camino—.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSolicitarCierreRef = useRef(onSolicitarCierre);
  onSolicitarCierreRef.current = onSolicitarCierre;

  const handleClose = useCallback(() => {
    setAnimatingOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimatingOut(false);
      onCloseRef.current?.();
      // Restaurar foco al elemento que abrió el modal
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }, 200); // tiempo de la animación de salida
  }, []);

  // El cierre que pide el USUARIO. Si la pantalla quiere decidir (formulario a
  // medio llenar), se le pasa la pelota y no se cierra nada aquí.
  const solicitarCierre = useCallback(() => {
    if (onSolicitarCierreRef.current) { onSolicitarCierreRef.current(); return; }
    handleClose();
  }, [handleClose]);

  // Cerrar con Escape + focus trap para Tab
  useEffect(() => {
    if (!visible) return;

    const myId = instanceIdRef.current;
    modalStack.push(myId);

    const handleKeyDown = (e) => {
      // Solo el modal de la cima de la pila maneja Escape y Tab.
      if (modalStack[modalStack.length - 1] !== myId) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        solicitarCierre();
        return;
      }

      // Focus trap con Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = modalStack.indexOf(myId);
      if (idx !== -1) modalStack.splice(idx, 1);
      // Solo libera el scroll del body cuando no queda ningún modal abierto.
      if (modalStack.length === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [visible, solicitarCierre]);

  if (!visible && !isOpen) return null;

  const sizes = {
    sm:   'max-w-md',
    md:   'max-w-lg',
    lg:   'max-w-2xl',
    xl:   'max-w-4xl',
    full: 'max-w-[92vw]',
  };
  const contentHeights = {
    sm:   'max-h-[72vh]',
    md:   'max-h-[74vh]',
    lg:   'max-h-[78vh]',
    xl:   'max-h-[80vh]',
    full: 'max-h-[84vh]',
  };

  // z-index escalonado: cada modal nuevo se renderiza por encima del anterior.
  const stackIndex = Math.max(0, modalStack.indexOf(instanceIdRef.current));
  const zIndex = 50 + stackIndex * 10;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Ventana emergente'}
    >
      {/* Backdrop con animación */}
      <div
        className={`absolute inset-0 bg-primary/40 backdrop-blur-sm ${
          animatingOut ? 'animate-overlay-out' : 'animate-overlay-in'
        }`}
        onClick={solicitarCierre}
        aria-hidden="true"
      />

      {/* Panel del modal */}
      <div
        ref={modalRef}
        className={`
          relative bg-surface rounded-2xl shadow-xl w-full
          ${sizes[size]}
          ${animatingOut ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2
            id={titleId}
            className="font-display text-xl text-primary"
          >
            {title}
          </h2>
          <button
            ref={triggerRef}
            onClick={solicitarCierre}
            className="p-2 rounded-xl text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200"
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className={`p-6 overflow-y-auto ${contentHeights[size] ?? 'max-h-[74vh]'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}