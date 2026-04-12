import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  Wallet, 
  FileText,
  Sparkles
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { dashboardApi } from '../../services/api';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/pacas', icon: Package, label: 'Inventario', key: 'pacas' },
  { path: '/clientes', icon: Users, label: 'Clientes', key: 'clientes' },
  { path: '/ventas', icon: ShoppingCart, label: 'Ventas', key: 'ventas' },
  { path: '/cartera', icon: Wallet, label: 'Cartera' },
  { path: '/reportes', icon: FileText, label: 'Reportes' },
];

export function Sidebar({ isOpen, onToggle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState({});

  useEffect(() => {
    loadCounts();
  }, []);

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
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-72 bg-primary flex flex-col h-screen
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-primary"></div>
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-white tracking-tight">Bodega</h1>
              <p className="text-[10px] text-white/50 font-heading tracking-[0.2em] uppercase">Americana</p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar en el sistema..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 font-medium focus:outline-none focus:bg-white/10 focus:border-secondary/50 transition-all"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <p className="px-4 py-2 text-[10px] font-heading font-semibold text-white/30 uppercase tracking-wider">Menu</p>
          {navItems.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => window.innerWidth < 1024 && onToggle()}
              className={({ isActive }) => `
                flex items-center justify-between px-4 py-3 rounded-xl
                transition-all duration-200 group
                ${isActive 
                  ? 'bg-gradient-to-r from-secondary/20 to-transparent border-l-[3px] border-secondary text-white shadow-lg' 
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                }
              `}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="flex items-center gap-3">
                <item.icon size={20} className="transition-transform group-hover:scale-110" />
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              {item.key && counts[item.key] !== undefined && (
                <span className={`
                  px-2.5 py-1 text-[11px] font-bold rounded-full
                  ${navItems.findIndex(n => n.path) === index 
                    ? 'bg-secondary text-primary' 
                    : 'bg-white/10 text-white/60'
                  }
                `}>
                  {counts[item.key]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-white font-bold text-sm">
              BA
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Bodega Admin</p>
              <p className="text-[10px] text-white/40">Administrador</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
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