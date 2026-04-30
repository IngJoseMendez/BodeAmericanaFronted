import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Guardar el elemento que abrió el modal para restaurar el foco al cerrar
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setVisible(true);
      setAnimatingOut(false);
    }
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

  const handleClose = useCallback(() => {
    setAnimatingOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimatingOut(false);
      onClose();
      // Restaurar foco al elemento que abrió el modal
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }, 200); // tiempo de la animación de salida
  }, [onClose]);

  // Cerrar con Escape + focus trap para Tab
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
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
      document.body.style.overflow = '';
    };
  }, [visible, handleClose]);

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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop con animación */}
      <div
        className={`absolute inset-0 bg-primary/40 backdrop-blur-sm ${
          animatingOut ? 'animate-overlay-out' : 'animate-overlay-in'
        }`}
        onClick={handleClose}
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
            id="modal-title"
            className="font-display text-xl text-primary"
          >
            {title}
          </h2>
          <button
            ref={triggerRef}
            onClick={handleClose}
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