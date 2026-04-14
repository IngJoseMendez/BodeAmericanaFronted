import { NavLink, useLocation, Link } from 'react-router-dom';
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
  ChevronRight
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { dashboardApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const adminNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/pacas', icon: Package, label: 'Inventario', key: 'pacas' },
  { path: '/clientes', icon: Users, label: 'Clientes', key: 'clientes' },
  { path: '/ventas', icon: ShoppingCart, label: 'Ventas', key: 'ventas' },
  { path: '/gestionar-pedidos', icon: Receipt, label: 'Pedidos' },
  { path: '/cartera', icon: Wallet, label: 'Cartera' },
  { path: '/reportes', icon: FileText, label: 'Reportes' },
];

const clienteNavItems = [
  { path: '/', icon: ShoppingBag, label: 'Mi Cuenta' },
  { path: '/catalogo', icon: Package, label: 'Catálogo' },
  { path: '/mis-pedidos', icon: Receipt, label: 'Mis Pedidos' },
  { path: '/mi-cartera', icon: Wallet, label: 'Mi Cartera' },
];

export function Sidebar({ isOpen, onToggle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const sidebarRef = useRef(null);
  const { usuario, tieneRol } = useAuth();
  const location = useLocation();

  const isAdmin = tieneRol('admin') || tieneRol('vendedor');
  const navItems = isAdmin ? adminNavItems : clienteNavItems;

  useEffect(() => {
    if (isAdmin) {
      loadCounts();
    }
  }, [isAdmin]);

  const loadCounts = async () => {
    try {
      const data = await dashboardApi.getMetricas();
      setCounts({
        pacas: data.pacas?.total || 0,
        clientes: data.clientes?.total || 0,
        ventas: data.ventas?.total_ventas || 0,
      });
    } catch (err) {
      console.error('Error loading counts:', err);
    }
  };

  return (
    <>
      <aside
        ref={sidebarRef}
        className={`
          sticky top-0 h-screen
          w-72 min-h-screen bg-primary flex flex-col
          transform transition-transform duration-300 ease-out z-40
        `}
        onMouseEnter={() => setIsHoveringSidebar(true)}
        onMouseLeave={() => setIsHoveringSidebar(false)}
      >
        {/* Header con gradiente decorativo */}
        <div className="relative p-6 border-b border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-secondary/20 via-transparent to-accent/10"></div>
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-secondary/10 rounded-full blur-2xl"></div>
          <div className="relative flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg shadow-secondary/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-primary animate-pulse"></div>
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-white tracking-tight">Bodega</h1>
              <p className="text-[10px] text-white/50 font-heading tracking-[0.2em] uppercase">Americana</p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative px-4 py-3">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-accent/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="relative w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 font-medium focus:outline-none focus:bg-white/10 focus:border-secondary/50 transition-all text-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Navigation con scroll independientes */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          <p className="px-4 py-2 text-[10px] font-heading font-semibold text-white/30 uppercase tracking-wider">Menú</p>
          <div className="space-y-1">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onMouseEnter={() => setHoveredItem(index)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`
                    relative flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer
                    transition-all duration-200 group overflow-hidden
                    ${isActive 
                      ? 'bg-gradient-to-r from-secondary/30 to-transparent text-white shadow-lg shadow-secondary/20' 
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                    }
                  `}
                >
                  {/* Indicador activo */}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary rounded-r-full"></div>
                  )}
                  
                  <div className="flex items-center gap-3 relative z-10">
                    <div className={`
                      p-2 rounded-lg transition-all duration-200
                      ${isActive ? 'bg-secondary/20 text-secondary' : 'text-white/60 group-hover:text-white group-hover:bg-white/10'}
                    `}>
                      <item.icon size={18} />
                    </div>
                    <span className="font-medium text-sm">{item.label}</span>
                  </div>
                  
                  {item.key && counts[item.key] !== undefined && (
                    <div className="relative z-10">
                      <span className={`
                        px-2 py-0.5 text-[11px] font-bold rounded-full transition-all duration-200
                        ${isActive 
                          ? 'bg-secondary text-primary' 
                          : 'bg-white/10 text-white/60 group-hover:bg-white/20 group-hover:text-white'
                        }
                      `}>
                        {counts[item.key]}
                      </span>
                    </div>
                  )}
                  
                  {/* Hover effect */}
                  {hoveredItem === index && !isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent"></div>
                  )}
                  
                  <ChevronRight 
                    size={14} 
                    className={`
                      absolute right-2 opacity-0 transition-all duration-200
                      ${hoveredItem === index ? 'opacity-100 translate-x-[-4px]' : ''}
                    `} 
                  />
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="relative p-4 border-t border-white/10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-white font-bold text-sm shadow-lg">
              {usuario?.nombre?.slice(0, 2)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{usuario?.nombre || 'Usuario'}</p>
              <p className="text-[10px] text-white/40 capitalize">{usuario?.rol || 'Cliente'}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
              <span className="text-[10px] text-white/40">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-primary/50 backdrop-blur-sm z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}