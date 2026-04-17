import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
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
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { dashboardApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const adminNavItems = [
  { path: '/',                     icon: LayoutDashboard, label: 'Dashboard',     key: null },
  { path: '/pacas',                icon: Package,         label: 'Inventario',    key: 'pacas' },
  { path: '/lotes',                icon: Layers,          label: 'Lotes',         key: null },
  { path: '/tipos-paca',           icon: Tag,             label: 'Tipos de Paca', key: null },
  { path: '/clientes',             icon: Users,           label: 'Clientes',      key: 'clientes' },
  { path: '/ventas',               icon: ShoppingCart,    label: 'Ventas',        key: 'ventas' },
  { path: '/gestionar-pedidos',    icon: Receipt,         label: 'Pedidos',       key: 'pedidos' },
  { path: '/cotizaciones',         icon: FileSignature,   label: 'Cotizaciones',  key: null },
  { path: '/cartera',              icon: Wallet,          label: 'Cartera',       key: null },
  { path: '/reportes',             icon: FileText,        label: 'Reportes',      key: null },
  { path: '/inteligencia-negocio', icon: Brain,           label: 'Analytics',     key: null },
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

  const isAdmin  = tieneRol('admin') || tieneRol('vendedor');
  const navItems = isAdmin ? adminNavItems : clienteNavItems;

  const filteredItems = searchQuery.trim()
    ? navItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : navItems;

  /* lock body scroll when mobile sidebar is open */
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

  /* close sidebar when navigating on mobile */
  const handleNavClick = () => {
    if (window.innerWidth < 1024) onToggle?.();
  };

  return (
    <>
      {/* ── OVERLAY (mobile only) ─────────────────── */}
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
        style={{ backgroundColor: '#0f0f1a' }}
        className={`
          fixed lg:sticky top-0 left-0 h-screen
          flex flex-col text-white
          border-r border-white/10
          transition-transform duration-300 ease-out
          shadow-2xl lg:shadow-none
          z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'w-[72px]' : 'w-[85vw] max-w-[300px] lg:w-72'}
        `}
      >
        {/* ── HEADER ──────────────────────────────── */}
        <div className="flex-shrink-0 p-4 border-b border-white/10">

          {/* Mobile: logo + title + X close button */}
          <div className="lg:hidden relative flex items-center gap-3">
            {/* Logo */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg shadow-secondary/30">
                <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-[#0f0f1a] animate-pulse" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-display font-bold text-white tracking-tight leading-none">Bodega</h1>
              <p className="text-[10px] text-white/50 font-heading tracking-[0.2em] uppercase mt-0.5">Americana</p>
            </div>

            {/* X close button — mobile only */}
            <button
              onClick={onToggle}
              className="flex-shrink-0 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200 active:scale-95"
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
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg shadow-secondary/30">
                    <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-[#0f0f1a] animate-pulse" aria-hidden="true" />
                </div>
                <button
                  onClick={onToggleCollapse}
                  className="flex p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
                  aria-label="Expandir sidebar"
                  title="Expandir"
                >
                  <PanelLeftOpen size={16} />
                </button>
              </div>
            ) : (
              <div className="relative flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg shadow-secondary/30">
                    <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-[#0f0f1a] animate-pulse" aria-hidden="true" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-xl font-display font-bold text-white tracking-tight leading-none">Bodega</h1>
                  <p className="text-[10px] text-white/50 font-heading tracking-[0.2em] uppercase mt-0.5">Americana</p>
                </div>

                <button
                  onClick={onToggleCollapse}
                  className="ml-auto flex p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
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
          <div className="px-3 py-2 flex-shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Buscar en el menú"
                className="w-full pl-3 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30"
              />
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
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
            <p className="px-3 py-2 text-[10px] font-heading font-semibold text-white/30 uppercase tracking-wider">
              Menú
            </p>
          )}

          <div className="space-y-0.5 pb-2">
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
                        ? 'bg-gradient-to-r from-secondary/30 to-transparent text-white shadow-lg shadow-secondary/20'
                        : 'text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15'
                      }
                    `}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-secondary rounded-r-full" aria-hidden="true" />
                    )}

                    {/* Icon */}
                    <div className={`
                      p-1.5 rounded-lg transition-all duration-200 flex-shrink-0
                      ${isActive
                        ? 'bg-secondary/25 text-secondary'
                        : 'text-white/70 group-hover/item:text-white group-hover/item:bg-white/15'}
                    `}>
                      <item.icon size={18} aria-hidden="true" />
                    </div>

                    {/* Label + badge */}
                    {!collapsed && (
                      <>
                        <span className="flex-1 font-medium text-sm truncate">{item.label}</span>
                        {badge != null && (
                          <span className={`
                            px-2 py-0.5 text-[11px] font-bold rounded-full tabular-nums flex-shrink-0
                            ${isActive
                              ? 'bg-secondary text-primary'
                              : 'bg-white/10 text-white/60 group-hover/item:bg-white/20 group-hover/item:text-white'}
                          `}>
                            {badge}
                          </span>
                        )}
                        {hoveredItem === index && !isActive && (
                          <ChevronRight
                            size={13}
                            className="text-white/40 flex-shrink-0 transition-transform group-hover/item:translate-x-0.5"
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
                      px-2.5 py-1.5 rounded-xl bg-[#0f0f1a] border border-white/10
                      text-white text-xs font-medium whitespace-nowrap
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
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#0f0f1a]" aria-hidden="true" />
                    </div>
                  )}
                </div>
              );
            })}

            {filteredItems.length === 0 && !collapsed && (
              <div className="py-8 text-center">
                <p className="text-xs text-white/30">Sin resultados</p>
              </div>
            )}
          </div>
        </nav>

        {/* ── FOOTER ──────────────────────────────── */}
        <div className="relative flex-shrink-0 p-3 border-t border-white/10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden="true" />

          {/* Dark / Light mode toggle */}
          <button
            onClick={toggleTheme}
            className={`
              w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/10 transition-colors mb-2 active:scale-95
              ${collapsed ? 'justify-center' : ''}
            `}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark'
              ? <Sun  size={17} className="text-yellow-400 flex-shrink-0" />
              : <Moon size={17} className="text-blue-300 flex-shrink-0" />
            }
            {!collapsed && (
              <span className="text-xs text-white/50 font-medium">
                {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </span>
            )}
          </button>

          {/* User info */}
          <div className={`flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-white font-bold text-xs shadow-lg flex-shrink-0">
              {usuario?.nombre?.slice(0, 2)?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{usuario?.nombre || 'Usuario'}</p>
                  <p className="text-[10px] text-white/40 capitalize">{usuario?.rol || 'Cliente'}</p>
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