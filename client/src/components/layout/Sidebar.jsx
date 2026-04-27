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
  Layers,
  FileSignature,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Tag,
  X,
  Search,
  Shield
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { dashboardApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const adminNavItems = [
  { path: '/',                     icon: LayoutDashboard, label: 'Dashboard',       key: null },
  { path: '/pacas',                icon: Package,         label: 'Inventario',    key: 'pacas' },
  { path: '/lotes',                icon: Layers,          label: 'Lotes',         key: null },
  { path: '/contenedores',        icon: Package2,        label: 'Contenedores',  key: null },
  { path: '/tipos-paca',           icon: Tag,             label: 'Tipos de Paca', key: null },
  { path: '/clientes',             icon: Users,           label: 'Clientes',      key: 'clientes' },
  { path: '/ventas',               icon: ShoppingCart,    label: 'Ventas',        key: 'ventas' },
  { path: '/gestionar-pedidos',    icon: Receipt,         label: 'Pedidos',       key: 'pedidos' },
  { path: '/cotizaciones',         icon: FileSignature,   label: 'Cotizaciones',  key: null },
  { path: '/cartera',              icon: Wallet,          label: 'Cartera',       key: null },
  { path: '/reportes',             icon: FileText,        label: 'Reportes',      key: null },
  { path: '/inteligencia-negocio', icon: Brain,           label: 'Analytics',     key: null },
  { path: '/gestion-usuarios',     icon: Shield,          label: 'Usuarios',      key: null, rol: 'admin' },
];

const clienteNavItems = [
  { path: '/',            icon: ShoppingBag, label: 'Mi Cuenta',   key: null },
  { path: '/catalogo',    icon: Package,     label: 'Catálogo',    key: null },
  { path: '/mis-pedidos', icon: Receipt,     label: 'Mis Pedidos', key: null },
  { path: '/mi-cartera',  icon: Wallet,      label: 'Mi Cartera',  key: null },
];

export function Sidebar({ isOpen, onToggle, collapsed, onToggleCollapse }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts]           = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);
  const sidebarRef = useRef(null);
  const { usuario, tieneRol } = useAuth();
  const { theme, toggleTheme }  = useTheme();
  const location = useLocation();

  const isAdmin = tieneRol('admin');
  const isVendedor = tieneRol('admin') || tieneRol('vendedor');
  
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

  useEffect(() => {
    if (isOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (isAdmin) loadCounts();
  }, [isAdmin]);

  const loadCounts = async () => {
    try {
      const data = await dashboardApi.getMetricas();
      setCounts({
        pacas:    data.pacas?.total    || 0,
        clientes: data.clientes?.total || 0,
        ventas:   data.ventas?.total_ventas || 0,
      });
    } catch (err) {
      console.error('Error loading counts:', err);
    }
  };

  const handleNavClick = () => {
    if (window.innerWidth < 1024) onToggle?.();
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
        aria-hidden={!isOpen && true}
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
              <h1 className="text-xl font-display font-bold text-primary tracking-tight leading-none">Bodega</h1>
              <p className="text-[10px] text-muted font-heading tracking-[0.2em] uppercase mt-0.5">Americana</p>
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
                  <h1 className="text-xl font-display font-bold text-primary tracking-tight leading-none">Bodega</h1>
                  <p className="text-[10px] text-muted font-heading tracking-[0.2em] uppercase mt-0.5">Americana</p>
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
                              ? 'bg-secondary text-primary'
                              : 'bg-primary/10 text-muted group-hover/item:bg-primary/20 group-hover/item:text-primary'}
                          `}>
                            {badge}
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
                  {collapsed && (
                    <div className="
                      absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50
                      px-2.5 py-1.5 rounded-xl bg-surface border border-border
                      text-primary text-xs font-medium whitespace-nowrap
                      opacity-0 pointer-events-none
                      group-hover/item:opacity-100
                      transition-opacity duration-150
                      shadow-xl
                    ">
                      {item.label}
                      {badge != null && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-secondary/20 text-secondary tabular-nums">
                          {badge}
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