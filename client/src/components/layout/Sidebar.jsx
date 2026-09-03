import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Package2,
  Users,
  ShoppingCart,
  Wallet,
  FileText,
  Sparkles,
  ShoppingBag,
  Receipt,
  ChevronRight,
  Brain,
  FileSignature,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Tag,
  DollarSign,
  Percent,
  X,
  Search,
  Shield,
  Truck,
  CreditCard,
  History,
  ListChecks,
  BarChart3,
  Coins,
  TrendingUp,
  FileSpreadsheet,
  LayoutGrid
} from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { dashboardApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatNumero } from '../../lib/money';
import { contadoresVigentes, contadoresGuardados, guardarContadores } from '../../lib/contadores';

// Persiste el scroll entre remounts (cada página monta un Sidebar nuevo)
let _navScrollPos = 0;

// Los badges numéricos del menú salen de GET /dashboard/metricas, una consulta
// agregada de pacas+clientes+ventas. Como cada página monta su propio <Layout>
// (y con él un Sidebar nuevo), sin caché se repetía esa consulta en CADA clic del
// menú y los contadores desaparecían y volvían a aparecer. Guardamos el último
// resultado a nivel de módulo, con vigencia corta, y compartimos la petición en
// curso para que dos montajes seguidos no disparen dos consultas.
// La caché vive en lib/contadores.js, fuera de este archivo, para que
// AuthContext pueda vaciarla al cerrar sesión sin crear un ciclo de imports.
let _countsEnVuelo  = null;
// Referencia única para "sin contadores": así setCounts(SIN_CONTADORES) sobre un
// estado que ya es SIN_CONTADORES no provoca un render extra.
const SIN_CONTADORES = {};

// matchMedia falta en WebViews antiguos y en Safari < 14 la MediaQueryList solo
// tiene addListener/removeListener. Este código corre en CADA página, así que una
// excepción aquí dejaría la aplicación entera en la pantalla de error: se degrada
// a "escritorio" (que es como se ve el menú por defecto con lg:translate-x-0).
const CONSULTA_ESCRITORIO = '(min-width: 1024px)';

function midePantalla() {
  try {
    return window.matchMedia(CONSULTA_ESCRITORIO);
  } catch {
    return null;
  }
}

const adminNavItems = [
  { path: '/',                     icon: LayoutDashboard, label: 'Dashboard',       key: null },
  { path: '/contenedores',         icon: Package2,        label: 'Contenedores',    key: null },
  { path: '/pacas',                icon: Package,         label: 'Inventario',      key: 'pacas' },
  { path: '/cotizaciones',         icon: FileSignature,   label: 'Cotizaciones',    key: null },
  // Va pegada a Cotizaciones porque cada fila de la matriz termina siendo una
  // cotización normal: es la misma tarea, hecha para muchos clientes de una vez.
  { path: '/separacion-masiva',    icon: LayoutGrid,      label: 'Matrix', key: null },
  { path: '/despachos',            icon: Truck,           label: 'Despachos',       key: null },
  { path: '/cuentas-pagar',        icon: CreditCard,      label: 'Cuentas x Pagar', key: null },
  { path: '/cartera',              icon: Wallet,          label: 'Cartera',         key: null },
  { path: '/entregables',          icon: FileSpreadsheet, label: 'Entregables',     key: null },
  { path: '/deuda-masiva',         icon: ListChecks,      label: 'Deuda masiva',    key: null, rol: 'admin' },
  { path: '/clientes',             icon: Users,           label: 'Clientes',        key: 'clientes' },
  { path: '/tipos-paca',           icon: Tag,             label: 'Productos',        key: null },
  { path: '/precios',              icon: DollarSign,      label: 'Precios',          key: null },
  { path: '/lista-precios',        icon: Tag,             label: 'Lista de Precios', key: null },
  { path: '/precios-promocion',    icon: Percent,         label: 'Promociones',      key: null },
  { path: '/cuentas',              icon: Wallet,          label: 'Cuentas',          key: null, rol: 'admin' },
  { path: '/gastos',               icon: Coins,           label: 'Gastos',           key: null, rol: 'admin' },
  { path: '/historico',            icon: BarChart3,       label: 'Histórico',        key: null, rol: 'admin' },
  { path: '/utilidad',             icon: TrendingUp,      label: 'Utilidad',         key: null, rol: 'admin' },
  { path: '/ventas',               icon: ShoppingCart,    label: 'Ventas',          key: 'ventas' },
  { path: '/gestionar-pedidos',    icon: Receipt,         label: 'Pedidos',         key: 'pedidos' },
  { path: '/reportes',             icon: FileText,        label: 'Reportes',        key: null },
  { path: '/inteligencia-negocio', icon: Brain,           label: 'Analytics',       key: null },
  { path: '/gestion-usuarios',     icon: Shield,          label: 'Usuarios',        key: null, rol: 'admin' },
  { path: '/auditoria',            icon: History,         label: 'Auditoría',       key: null, rol: 'admin' },
];

const clienteNavItems = [
  { path: '/',            icon: ShoppingBag, label: 'Mi Cuenta',   key: null },
  { path: '/catalogo',    icon: Package,     label: 'Catálogo',    key: null },
  { path: '/mis-pedidos', icon: Receipt,     label: 'Mis Pedidos', key: null },
  { path: '/mi-cartera',  icon: Wallet,      label: 'Mi Cartera',  key: null },
];

export function Sidebar({ isOpen, onToggle, collapsed, onToggleCollapse }) {
  const { usuario, tieneRol } = useAuth();
  const { theme, toggleTheme }  = useTheme();
  const location = useLocation();

  const isAdmin = tieneRol('admin');
  const isVendedor = tieneRol('admin') || tieneRol('vendedor');

  const [searchQuery, setSearchQuery] = useState('');
  // Arrancamos con la caché para que los badges no parpadeen al cambiar de página.
  // Solo si quien mira es admin: la caché vive a nivel de módulo y logout() navega
  // a /login sin recargar, así que sembrarla a ciegas le enseñaba al siguiente
  // usuario (un vendedor, que también ve Inventario/Clientes/Ventas) los totales
  // de la sesión del admin anterior.
  const [counts, setCounts]           = useState(() => (isAdmin && contadoresGuardados()) || SIN_CONTADORES);
  const [hoveredItem, setHoveredItem] = useState(null);
  const sidebarRef = useRef(null);
  const navRef     = useRef(null);

  // Filter admin items - usuarios only for admin role
  const filteredAdminItems = adminNavItems.filter(item => {
    if (!item.rol) return isVendedor;
    return item.rol === 'admin' && isAdmin;
  });
  
  const navItems = isVendedor ? filteredAdminItems : clienteNavItems;

  const filteredItems = searchQuery.trim()
    ? navItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : navItems;

  // Al montar, restaurar la posición guardada (el Sidebar remonta en cada página)
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = _navScrollPos;
  }, []);

  // El drawer solo existe por debajo de 1024px. Antes se consultaba
  // window.innerWidth dentro del efecto, que no se entera de un cambio de tamaño
  // ni de girar el móvil, así que el bloqueo de scroll se quedaba pegado.
  const [esEscritorio, setEsEscritorio] = useState(() => midePantalla()?.matches ?? true);

  useEffect(() => {
    const mq = midePantalla();
    if (!mq) return;
    const alCambiar = e => setEsEscritorio(e.matches);
    setEsEscritorio(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', alCambiar);
      return () => mq.removeEventListener('change', alCambiar);
    }
    mq.addListener(alCambiar);            // Safari < 14
    return () => mq.removeListener(alCambiar);
  }, []);

  // Con el drawer cerrado el aside sigue renderizado (solo desplazado con
  // -translate-x-full), así que hay que sacarlo del árbol de accesibilidad Y del
  // orden de tabulación. En escritorio NO: allí el menú se ve siempre por
  // lg:translate-x-0 aunque isOpen sea false, y marcarlo oculto dejaba los 24
  // enlaces de la aplicación invisibles para los lectores de pantalla.
  // Se marca con aria-hidden + inert: aria-hidden por sí solo no saca los enlaces
  // del orden de tabulación (es justo la violación axe "aria-hidden-focus").
  const drawerOculto = !esEscritorio && !isOpen;

  // onToggle llega como función nueva en cada render del Layout; guardarla en un
  // ref evita que el efecto del foco se desmonte y se remonte constantemente
  // (devolvía el foco al primer enlace en cada repintado de la página).
  const onToggleRef = useRef(onToggle);
  useEffect(() => { onToggleRef.current = onToggle; });

  // Bloqueo del scroll del fondo: solo escribimos cuando de verdad abrimos el
  // drawer y al cerrar devolvemos el valor que había. Antes la rama `else` y el
  // cleanup ponían '' incondicionalmente en CADA montaje del Sidebar (uno por
  // navegación), lo que liberaba el scroll de fondo de un Modal abierto —
  // Modal.jsx lleva su propia pila y solo libera cuando no queda ninguno.
  useEffect(() => {
    if (!isOpen || esEscritorio) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      // Si mientras el drawer estaba abierto se abrió un modal (Modal.jsx pone
      // su propio overflow:hidden y lleva una pila), restaurar `anterior` aquí
      // liberaría el scroll del fondo por debajo de ese modal. En ese caso no
      // tocamos nada: será el modal quien lo restaure cuando su pila se vacíe.
      if (document.querySelector('[aria-modal="true"]')) return;
      document.body.style.overflow = anterior;
    };
  }, [isOpen, esEscritorio]);

  // Teclado del drawer móvil: al abrirlo el foco entra en el menú, Tab da vueltas
  // dentro de él, Escape lo cierra y al cerrarse el foco vuelve al botón que lo
  // abrió. Sin esto el teclado seguía navegando la página tapada por el overlay.
  useEffect(() => {
    if (!isOpen || esEscritorio) return;

    // Recalculamos en cada pulsación: el menú se filtra al escribir en su buscador
    const enfocables = () => Array.from(
      sidebarRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled])'
      ) || []
    ).filter(el => el.offsetParent !== null); // descarta lo oculto por CSS

    const previo = document.activeElement;
    enfocables()[0]?.focus();

    const alPulsarTecla = (e) => {
      // Si hay un diálogo modal encima (Modal, ConfirmDialog o el buscador
      // rápido) el teclado es suyo y nos apartamos por completo: ni Escape ni
      // el ciclo de Tab. Este listener va en `document`, y CommandPalette y
      // ConfirmDialog escuchan en `window`, así que cortar la propagación con
      // stopPropagation() les impedía cerrarse con Escape; y el trampa-foco de
      // Modal.jsx (también en `document`) se peleaba con el de aquí por el Tab.
      if (document.querySelector('[aria-modal="true"]')) return;

      if (e.key === 'Escape') {
        onToggleRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const lista = enfocables();
      if (!lista.length) return;
      const primero = lista[0];
      const ultimo  = lista[lista.length - 1];

      if (!sidebarRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alPulsarTecla);
    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      // Solo devolvemos el foco si el elemento sigue existiendo: al navegar, el
      // Layout entero se desmonta y su botón hamburguesa ya no está en el DOM.
      if (previo instanceof HTMLElement && document.contains(previo)) previo.focus();
    };
  }, [isOpen, esEscritorio]);

  useEffect(() => {
    // Al cambiar de sesión (admin → vendedor sin recargar) hay que vaciar los
    // badges: si no, los del admin anterior se quedan pintados.
    if (!isAdmin) {
      setCounts(SIN_CONTADORES);
      return;
    }

    // Caché fresca: no volvemos a preguntar, solo rellenamos este Sidebar
    const vigentes = contadoresVigentes();
    if (vigentes) {
      setCounts(vigentes);
      return;
    }

    let vivo = true;
    if (!_countsEnVuelo) {
      _countsEnVuelo = dashboardApi.getMetricas()
        .then(data => guardarContadores({
          pacas:    data.pacas?.total         || 0,
          clientes: data.clientes?.total      || 0,
          ventas:   data.ventas?.total_ventas || 0,
        }))
        .finally(() => { _countsEnVuelo = null; });
    }

    _countsEnVuelo
      .then(datos => { if (vivo) setCounts(datos); })
      .catch(err => console.error('Error cargando los contadores del menú:', err));

    return () => { vivo = false; };
  }, [isAdmin]);

  // Misma fuente de verdad que el CSS (lg:), en vez de window.innerWidth
  const handleNavClick = () => {
    if (!esEscritorio) onToggle?.();
  };

  return (
    <>
      {/* ── OVERLAY (mobile only) ─────────────────── */}
      {/* Debe ser oscuro y bloquear clics, pero no tener sidebar traslúcido */}
      <div
        className={`
          lg:hidden fixed inset-0 z-40
          bg-black/70
          transition-opacity duration-300
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onToggle}
        aria-hidden="true"
      />

      {/* ── SIDEBAR ──────────────────────────────── */}
      <aside
        ref={sidebarRef}
        id="main-sidebar"
        role="navigation"
        aria-label="Menú principal"
        aria-hidden={drawerOculto || undefined}
        inert={drawerOculto ? '' : undefined}
        className={`
          fixed lg:sticky top-0 left-0 h-screen
          bg-surface flex flex-col text-primary
          border-r border-border
          transition-transform duration-300 ease-out
          shadow-2xl lg:shadow-none
          z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'w-[72px]' : 'w-[85vw] max-w-[300px] lg:w-72'}
        `}
      >
        {/* ── HEADER ──────────────────────────────── */}
        <div className="flex-shrink-0 p-4 border-b border-border">
          {/* Mobile: logo + title + X close button */}
          <div className="lg:hidden relative flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-md shadow-secondary/20">
                <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface animate-pulse" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-display font-bold text-primary tracking-tight leading-none">Comercio</h1>
              <p className="text-[10px] text-muted font-heading tracking-[0.2em] uppercase mt-0.5">Global Logístico</p>
            </div>

            <button
              onClick={onToggle}
              className="flex-shrink-0 p-2 rounded-xl text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200 active:scale-95"
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          </div>

          {/* Desktop: collapsed or expanded layout */}
          <div className="hidden lg:block">
            {collapsed ? (
              <div className="relative flex flex-col items-center gap-2">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-md shadow-secondary/20">
                    <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface animate-pulse" aria-hidden="true" />
                </div>
                <button
                  onClick={onToggleCollapse}
                  className="flex p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200"
                  aria-label="Expandir sidebar"
                  title="Expandir"
                >
                  <PanelLeftOpen size={16} />
                </button>
              </div>
            ) : (
              <div className="relative flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-md shadow-secondary/20">
                    <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface animate-pulse" aria-hidden="true" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-xl font-display font-bold text-primary tracking-tight leading-none">Comercio</h1>
                  <p className="text-[10px] text-muted font-heading tracking-[0.2em] uppercase mt-0.5">Global Logístico</p>
                </div>

                <button
                  onClick={onToggleCollapse}
                  className="ml-auto flex p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200"
                  aria-label="Colapsar sidebar"
                  title="Colapsar"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── SEARCH (oculto en mini) ─────────────── */}
        {!collapsed && (
          <div className="px-3 py-3 flex-shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Buscar en el menú"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-primary/5 border border-transparent text-primary placeholder-muted font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30 focus:bg-surface"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {/* ── NAVIGATION ──────────────────────────── */}
        <nav
          ref={navRef}
          onScroll={() => { _navScrollPos = navRef.current?.scrollTop || 0; }}
          className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1"
          aria-label="Navegación principal"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {!collapsed && (
            <p className="px-3 py-2 text-[10px] font-heading font-semibold text-muted uppercase tracking-wider">
              Menú
            </p>
          )}

          <div className="space-y-1 pb-2">
            {filteredItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              const badge    = item.key ? counts[item.key] : null;

              return (
                <div key={item.path} className="relative group/item">
                  <Link
                    to={item.path}
                    onClick={handleNavClick}
                    onMouseEnter={() => setHoveredItem(index)}
                    onMouseLeave={() => setHoveredItem(null)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`
                      relative flex items-center gap-3 rounded-xl cursor-pointer
                      transition-all duration-200 overflow-hidden
                      ${collapsed ? 'justify-center p-3 mx-1' : 'px-3 py-3 lg:py-2.5'}
                      ${isActive
                        ? 'bg-secondary/10 text-primary font-semibold'
                        : 'text-muted hover:text-primary hover:bg-primary/5 active:bg-primary/10 font-medium'
                      }
                    `}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-secondary rounded-r-full" aria-hidden="true" />
                    )}

                    {/* Icon */}
                    <div className={`
                      p-1.5 rounded-lg transition-colors duration-200 flex-shrink-0
                      ${isActive
                        ? 'text-secondary'
                        : 'text-muted group-hover/item:text-primary'}
                    `}>
                      <item.icon size={18} aria-hidden="true" />
                    </div>

                    {/* Label + badge */}
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-sm truncate">{item.label}</span>
                        {badge != null && (
                          <span className={`
                            px-2 py-0.5 text-[11px] font-bold rounded-full tabular-nums flex-shrink-0
                            ${isActive
                              ? 'bg-secondary text-on-primary'
                              : 'bg-primary/10 text-muted group-hover/item:bg-primary/20 group-hover/item:text-primary'}
                          `}>
                            {formatNumero(badge)}
                          </span>
                        )}
                        {hoveredItem === index && !isActive && (
                          <ChevronRight
                            size={14}
                            className="text-muted flex-shrink-0 transition-transform group-hover/item:translate-x-0.5"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    )}
                  </Link>

                  {/* Tooltip in mini-sidebar (desktop only) */}
                  {/* Con el menú en modo mini el enlace es solo un icono: sin
                      group-focus-within quien navega con el teclado no llegaba a
                      ver nunca a dónde lleva la opción enfocada. */}
                  {collapsed && (
                    <div className="
                      absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50
                      px-2.5 py-1.5 rounded-xl bg-surface border border-border
                      text-primary text-xs font-medium whitespace-nowrap
                      opacity-0 pointer-events-none
                      group-hover/item:opacity-100 group-focus-within/item:opacity-100
                      transition-opacity duration-150
                      shadow-xl
                    ">
                      {item.label}
                      {badge != null && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-secondary/20 text-secondary tabular-nums">
                          {formatNumero(badge)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredItems.length === 0 && !collapsed && (
              <div className="py-8 text-center">
                <p className="text-xs text-muted">Sin resultados</p>
              </div>
            )}
          </div>
        </nav>

        {/* ── FOOTER ──────────────────────────────── */}
        <div className="relative flex-shrink-0 p-3 border-t border-border">
          {/* Dark / Light mode toggle */}
          <button
            onClick={toggleTheme}
            className={`
              w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-primary/5 transition-colors mb-2 active:scale-95 text-muted hover:text-primary
              ${collapsed ? 'justify-center' : ''}
            `}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark'
              ? <Sun  size={18} className="text-yellow-400 flex-shrink-0" />
              : <Moon size={18} className="text-blue-500 flex-shrink-0" />
            }
            {!collapsed && (
              <span className="text-xs font-medium">
                {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </span>
            )}
          </button>

          {/* User info */}
          <div className={`flex items-center gap-2.5 p-2 rounded-xl hover:bg-primary/5 transition-colors cursor-default ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
              {usuario?.nombre?.slice(0, 2)?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-primary truncate">{usuario?.nombre || 'Usuario'}</p>
                  <p className="text-[10px] text-muted capitalize">{usuario?.rol || 'Cliente'}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" aria-hidden="true" />
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}