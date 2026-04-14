import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, removing: false }]);
    
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 z-[9999] space-y-2 pointer-events-none md:max-w-sm ml-auto">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className="pointer-events-auto"
          >
            <ToastItem 
              {...toast} 
              onClose={() => removeToast(toast.id)} 
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, type, removing, onClose }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />,
    info: <Info className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
  };

  const colors = {
    success: 'bg-white dark:bg-success/20 border-success/40 text-success shadow-success/20',
    error: 'bg-white dark:bg-error/20 border-error/40 text-error shadow-error/20',
    warning: 'bg-white dark:bg-warning/20 border-warning/40 text-warning shadow-warning/20',
    info: 'bg-white dark:bg-secondary/20 border-secondary/40 text-primary shadow-secondary/20'
  };

  const bgColors = {
    success: 'bg-success/10',
    error: 'bg-error/10',
    warning: 'bg-warning/10',
    info: 'bg-secondary/10'
  };

  return (
    <div 
      className={`
        flex items-start md:items-center gap-3 px-4 py-3 md:py-3.5
        rounded-2xl md:rounded-xl 
        border-2 md:border shadow-xl md:shadow-lg
        ${colors[type]}
        ${removing ? 'animate-toast-exit' : 'animate-toast-enter'}
        transition-all duration-300 ease-out
        touch-manipulation
      `}
      role="alert"
      aria-live="polite"
    >
      <div className={`p-1.5 md:p-1 rounded-full ${bgColors[type]} flex-shrink-0`}>
        {icons[type]}
      </div>
      <p className="text-sm md:text-[15px] font-medium flex-1 leading-snug break-words overflow-wrap-anywhere min-w-0">
        {message}
      </p>
      <button 
        onClick={onClose} 
        className="p-2 md:p-1.5 hover:bg-black/5 md:hover:bg-black/10 rounded-full flex-shrink-0 transition-colors active:scale-95 touch-manipulation -m-1 md:m-0"
        aria-label="Cerrar notificación"
      >
        <X size={18} className="md:w-4 md:h-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}