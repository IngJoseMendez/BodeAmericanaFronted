import { useState, useEffect, createContext, useContext } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 left-4 md:left-auto md:right-4 z-50 space-y-2 pointer-events-none max-w-md ml-auto">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ message, type, onClose }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-success" />,
    error: <AlertCircle className="w-5 h-5 text-error" />,
    warning: <AlertTriangle className="w-5 h-5 text-warning" />,
    info: <Info className="w-5 h-5 text-secondary" />
  };

  const colors = {
    success: 'bg-success/10 border-success/30 text-success',
    error: 'bg-error/10 border-error/30 text-error',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-secondary/10 border-secondary/30 text-primary'
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-fade-in-scale ${colors[type]}`}>
      {icons[type]}
      <span className="font-medium text-sm flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/20 rounded flex-shrink-0">
        <X size={16} />
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