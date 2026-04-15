import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { LogOut, Menu, ChevronRight, Command } from 'lucide-react';
import { Button } from '../common';
import { CommandPalette } from '../common/CommandPalette';

// Mapa de rutas a nombres legibles para breadcrumbs
const ROUTE_NAMES = {
  '/':                     'Dashboard',
  '/pacas':                'Inventario',
  '/lotes':                'Lotes',
  '/clientes':             'Clientes',
  '/ventas':               'Ventas',
  '/gestionar-pedidos':    'Pedidos',
  '/cotizaciones':         'Cotizaciones',
  '/cartera':              'Cartera',
  '/reportes':             'Reportes',
  '/inteligencia-negocio': 'Analytics',
  '/catalogo':             'Catálogo',
  '/mis-pedidos':          'Mis Pedidos',
  '/mi-cartera':           'Mi Cartera',
};

function Breadcrumbs({ location }) {
  // Solo mostrar breadcrumbs si no estamos en la raíz
  if (location.pathname === '/') return null;

  const name = ROUTE_NAMES[location.pathname];
  if (!name) return null;

  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 mt-0.5">
      <span className="text-xs text-muted">Inicio</span>
      <ChevronRight size={12} className="text-muted/50 flex-shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium text-secondary">{name}</span>
    </nav>
  );
}

export function Layout({ children, title, subtitle, actions }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-cream bg-pattern">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col w-full min-w-0">
        {/* ── HEADER ──────────────────────────────── */}
        <header
          className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border/50 px-4 sm:px-6 py-3"
          role="banner"
        >
          <div className="flex items-center justify-between gap-4">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-xl bg-surface shadow-md hover:shadow-lg transition-all text-primary"
              aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={sidebarOpen}
              aria-controls="main-sidebar"
            >
              <Menu size={20} aria-hidden="true" />
            </button>

            {/* Title + breadcrumbs */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl sm:text-2xl text-primary truncate leading-tight">
                {title}
              </h1>
              {subtitle
                ? <p className="text-xs text-muted mt-0.5 hidden sm:block">{subtitle}</p>
                : <Breadcrumbs location={location} />
              }
            </div>

            {/* Actions area */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {actions}

              {/* Cmd+K hint button */}
              <button
                onClick={() => {
                  // Disparar el evento de teclado para abrir el Command Palette
                  window.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'k', ctrlKey: true, bubbles: true
                  }));
                }}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-border/60 text-muted hover:text-primary hover:border-secondary/40 transition-all text-xs font-medium"
                aria-label="Abrir buscador rápido (Ctrl+K)"
                title="Buscador rápido"
              >
                <Command size={13} aria-hidden="true" />
                <span>K</span>
              </button>

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                icon={LogOut}
                className="text-muted hover:text-accent"
                aria-label="Cerrar sesión"
              >
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT ────────────────────────── */}
        <main
          id="main-content"
          className="flex-1 p-4 sm:p-6 lg:p-8"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      {/* Command Palette — global */}
      <CommandPalette />
    </div>
  );
}