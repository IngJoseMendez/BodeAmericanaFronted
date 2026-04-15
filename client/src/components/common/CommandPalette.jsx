import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, ShoppingCart, Wallet,
  FileText, Brain, Layers, FileSignature, Receipt,
  ShoppingBag, Search, ArrowRight, Command
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const adminRoutes = [
  { path: '/',                       icon: LayoutDashboard, label: 'Dashboard',        desc: 'Vista general del negocio' },
  { path: '/pacas',                  icon: Package,         label: 'Inventario',       desc: 'Gestión de pacas y stock' },
  { path: '/lotes',                  icon: Layers,          label: 'Lotes',            desc: 'Administración de lotes' },
  { path: '/clientes',               icon: Users,           label: 'Clientes',         desc: 'Directorio de clientes' },
  { path: '/ventas',                 icon: ShoppingCart,    label: 'Ventas',           desc: 'Registro de ventas' },
  { path: '/gestionar-pedidos',      icon: Receipt,         label: 'Pedidos',          desc: 'Gestionar pedidos pendientes' },
  { path: '/cotizaciones',           icon: FileSignature,   label: 'Cotizaciones',     desc: 'Generar y revisar cotizaciones' },
  { path: '/cartera',                icon: Wallet,          label: 'Cartera',          desc: 'Cuentas por cobrar' },
  { path: '/reportes',               icon: FileText,        label: 'Reportes',         desc: 'Informes y estadísticas' },
  { path: '/inteligencia-negocio',   icon: Brain,           label: 'Analytics',        desc: 'Inteligencia de negocio' },
];

const clienteRoutes = [
  { path: '/',            icon: ShoppingBag, label: 'Mi Cuenta',   desc: 'Resumen de tu cuenta' },
  { path: '/catalogo',    icon: Package,     label: 'Catálogo',    desc: 'Ver productos disponibles' },
  { path: '/mis-pedidos', icon: Receipt,     label: 'Mis Pedidos', desc: 'Historial de pedidos' },
  { path: '/mi-cartera',  icon: Wallet,      label: 'Mi Cartera',  desc: 'Estado de cuenta' },
];

// Fuzzy search simple: devuelve true si todos los chars del query están en orden en el texto
function fuzzyMatch(text, query) {
  if (!query) return true;
  text = text.toLowerCase();
  query = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { tieneRol } = useAuth();

  const isAdmin = tieneRol('admin') || tieneRol('vendedor');
  const routes = isAdmin ? adminRoutes : clienteRoutes;

  // Filtrar rutas con fuzzy search
  const filtered = useMemo(() => {
    return routes.filter(r =>
      fuzzyMatch(r.label, query) || fuzzyMatch(r.desc, query)
    );
  }, [routes, query]);

  // Reset selected cuando cambia el filtro
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filtered.length]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setClosing(false);
    setQuery('');
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  }, []);

  const handleNavigate = useCallback((path) => {
    handleClose();
    setTimeout(() => navigate(path), 180);
  }, [navigate, handleClose]);

  // Atajo global: Ctrl+K / Cmd+K
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) handleClose();
        else handleOpen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleOpen, handleClose]);

  // Navegación por teclado dentro del palette
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        handleNavigate(filtered[selectedIndex].path);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex, handleClose, handleNavigate]);

  // Scroll automático al ítem seleccionado
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex];
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-start justify-center pt-[12vh] px-4
        ${closing ? 'animate-overlay-out' : 'animate-overlay-in'}
        cmd-backdrop`}
      onClick={handleClose}
      aria-label="Buscador de páginas"
    >
      <div
        className={`w-full max-w-xl
          ${closing ? 'animate-cmd-exit' : 'animate-cmd-enter'}
          bg-surface rounded-2xl shadow-2xl border border-border/60 overflow-hidden`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Barra de búsqueda */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search size={18} className="text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar página..."
            className="flex-1 bg-transparent text-primary placeholder-muted text-sm font-medium outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 border border-border/60 text-[10px] font-mono text-muted">
            ESC
          </kbd>
        </div>

        {/* Lista de resultados */}
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto py-2"
          role="listbox"
          aria-label="Resultados de búsqueda"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted">
              <Search size={28} strokeWidth={1.5} className="opacity-40" />
              <p className="text-sm">Sin resultados para <span className="font-semibold">"{query}"</span></p>
            </div>
          ) : (
            filtered.map((route, i) => {
              const isActive = location.pathname === route.path;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={route.path}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleNavigate(route.path)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150
                    ${isSelected ? 'bg-secondary/10' : 'hover:bg-primary/5'}
                  `}
                >
                  {/* Icono */}
                  <div className={`
                    p-2 rounded-xl flex-shrink-0 transition-colors
                    ${isSelected ? 'bg-secondary/20 text-secondary' : 'bg-primary/8 text-muted'}
                  `}>
                    <route.icon size={16} />
                  </div>

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-primary/80'}`}>
                      {route.label}
                    </p>
                    <p className="text-xs text-muted truncate">{route.desc}</p>
                  </div>

                  {/* Badge activo o flecha */}
                  {isActive ? (
                    <span className="text-[10px] font-semibold text-secondary bg-secondary/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      Actual
                    </span>
                  ) : isSelected ? (
                    <ArrowRight size={14} className="text-secondary flex-shrink-0" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-primary/2">
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-primary/8 border border-border/50 font-mono">↑↓</kbd>
              <span>navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-primary/8 border border-border/50 font-mono">↵</kbd>
              <span>ir</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted">
            <Command size={11} />
            <span>K para abrir</span>
          </div>
        </div>
      </div>
    </div>
  );
}
