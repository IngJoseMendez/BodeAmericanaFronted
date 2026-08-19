import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Package2, Users, ShoppingCart, Wallet,
  FileText, Brain, FileSignature, Receipt, Truck, CreditCard,
  FileSpreadsheet, ListChecks, Tag, DollarSign, Percent, Coins,
  BarChart3, TrendingUp, Shield, History,
  ShoppingBag, Search, ArrowRight, Command
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Esta lista tiene que ser un espejo de las rutas de App.jsx. Antes ofrecía
// '/lotes', que no está registrada: el comodín de App.jsx la capturaba y dejaba
// a la usuaria en el Dashboard sin explicación. Y sólo listaba 10 de las 24
// pantallas, así que el buscador que anuncia la cabecera con "⌘K" no servía
// para llegar a la mitad de la aplicación.
// `soloAdmin` replica los <SoloAdmin> de App.jsx: a un vendedor no le sirve de
// nada que le ofrezcamos una pantalla que le va a rebotar al Dashboard.
const adminRoutes = [
  { path: '/',                     icon: LayoutDashboard, label: 'Dashboard',        desc: 'Vista general del negocio' },
  { path: '/contenedores',         icon: Package2,        label: 'Contenedores',     desc: 'Importaciones y costo por paca' },
  { path: '/pacas',                icon: Package,         label: 'Inventario',       desc: 'Gestión de pacas y stock' },
  { path: '/cotizaciones',         icon: FileSignature,   label: 'Cotizaciones',     desc: 'Generar y revisar cotizaciones' },
  { path: '/despachos',            icon: Truck,           label: 'Despachos',        desc: 'Salidas de mercancía y remisiones' },
  { path: '/cuentas-pagar',        icon: CreditCard,      label: 'Cuentas x Pagar',  desc: 'Facturas y pagos a proveedores' },
  { path: '/cartera',              icon: Wallet,          label: 'Cartera',          desc: 'Cuentas por cobrar y abonos' },
  { path: '/entregables',          icon: FileSpreadsheet, label: 'Entregables',      desc: 'Archivos de Excel para entregar' },
  { path: '/deuda-masiva',         icon: ListChecks,      label: 'Deuda masiva',     desc: 'Cargar saldos de varios clientes', soloAdmin: true },
  { path: '/clientes',             icon: Users,           label: 'Clientes',         desc: 'Directorio de clientes' },
  { path: '/tipos-paca',           icon: Tag,             label: 'Productos',        desc: 'Tipos, referencias y calidades' },
  { path: '/precios',              icon: DollarSign,      label: 'Precios',          desc: 'Precios por referencia' },
  { path: '/lista-precios',        icon: Tag,             label: 'Lista de Precios', desc: 'Lista completa para compartir' },
  { path: '/precios-promocion',    icon: Percent,         label: 'Promociones',      desc: 'Precios promocionales' },
  { path: '/cuentas',              icon: Wallet,          label: 'Cuentas',          desc: 'Cuentas y movimientos de dinero', soloAdmin: true },
  { path: '/gastos',               icon: Coins,           label: 'Gastos',           desc: 'Registro de gastos', soloAdmin: true },
  { path: '/historico',            icon: BarChart3,       label: 'Histórico',        desc: 'Años anteriores y reportes', soloAdmin: true },
  { path: '/utilidad',             icon: TrendingUp,      label: 'Utilidad',         desc: 'Ganancia por periodo', soloAdmin: true },
  { path: '/ventas',               icon: ShoppingCart,    label: 'Ventas',           desc: 'Registro de ventas' },
  { path: '/gestionar-pedidos',    icon: Receipt,         label: 'Pedidos',          desc: 'Gestionar pedidos pendientes' },
  { path: '/reportes',             icon: FileText,        label: 'Reportes',         desc: 'Informes y estadísticas' },
  { path: '/inteligencia-negocio', icon: Brain,           label: 'Analytics',        desc: 'Inteligencia de negocio' },
  { path: '/gestion-usuarios',     icon: Shield,          label: 'Usuarios',         desc: 'Altas, roles y contraseñas', soloAdmin: true },
  { path: '/auditoria',            icon: History,         label: 'Auditoría',        desc: 'Historial de cambios del sistema', soloAdmin: true },
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
  const previousFocusRef = useRef(null);
  const listId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const { tieneRol } = useAuth();

  const esAdmin = tieneRol('admin');
  const esStaff = esAdmin || tieneRol('vendedor');
  const routes = useMemo(
    () => (esStaff ? adminRoutes.filter(r => !r.soloAdmin || esAdmin) : clienteRoutes),
    [esStaff, esAdmin]
  );

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
    // Guardamos quién abrió el buscador (normalmente el botón ⌘K de la cabecera)
    // para devolverle el foco al cerrar; si no, el foco se perdía en el <body>.
    previousFocusRef.current = document.activeElement;
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
      const previo = previousFocusRef.current;
      if (previo && document.contains(previo) && typeof previo.focus === 'function') {
        previo.focus();
      }
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
      // Trampa de foco: los resultados llevan tabIndex=-1 (la selección se
      // anuncia con aria-activedescendant), así que el único elemento
      // focalizable es el buscador. Sin esto, con Tab se salía por detrás del
      // fondo y se acababa pulsando botones de la página tapada.
      if (e.key === 'Tab') {
        e.preventDefault();
        inputRef.current?.focus();
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
    >
      <div
        className={`w-full max-w-xl
          ${closing ? 'animate-cmd-exit' : 'animate-cmd-enter'}
          bg-surface rounded-2xl shadow-2xl border border-border/60 overflow-hidden`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Buscador de páginas"
      >
        {/* Barra de búsqueda */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search size={18} className="text-muted flex-shrink-0" />
          {/* El foco del teclado no se mueve nunca del buscador: la fila elegida
              con las flechas se le anuncia al lector de pantalla con
              aria-activedescendant. Antes sólo cambiaba de color y quien no ve
              la pantalla no se enteraba de qué iba a abrir con Enter. */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar página..."
            className="flex-1 bg-transparent text-primary placeholder-muted text-sm font-medium outline-none"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label="Buscar página"
            /* Sin resultados el <div role="listbox"> no se renderiza: dejar
               aria-expanded="true" y un aria-controls apuntando a un id que no
               está en el DOM es una referencia rota — el lector de pantalla
               anuncia una lista desplegada que no existe. */
            aria-expanded={filtered.length > 0}
            aria-controls={filtered.length > 0 ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? `${listId}-opt-${selectedIndex}` : undefined}
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 border border-border/60 text-[10px] font-mono text-muted">
            ESC
          </kbd>
        </div>

        {/* Recuento hablado: sin esto no había forma de saber que la búsqueda
            no encontró nada. */}
        <p role="status" className="sr-only">
          {filtered.length === 0
            ? 'Sin resultados'
            : `${filtered.length} página${filtered.length === 1 ? '' : 's'} encontrada${filtered.length === 1 ? '' : 's'}`}
        </p>

        {/* Lista de resultados */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted">
            <Search size={28} strokeWidth={1.5} className="opacity-40" />
            <p className="text-sm">Sin resultados para <span className="font-semibold">"{query}"</span></p>
          </div>
        ) : (
          <div
            ref={listRef}
            id={listId}
            className="max-h-72 overflow-y-auto py-2"
            role="listbox"
            aria-label="Resultados de búsqueda"
          >
            {filtered.map((route, i) => {
              const isActive = location.pathname === route.path;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={route.path}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  type="button"
                  tabIndex={-1}
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
                    ${isSelected ? 'bg-secondary/20 text-secondary' : 'bg-primary/10 text-muted'}
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
            })}
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-primary/5">
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-primary/10 border border-border/50 font-mono">↑↓</kbd>
              <span>navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-primary/10 border border-border/50 font-mono">↵</kbd>
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
