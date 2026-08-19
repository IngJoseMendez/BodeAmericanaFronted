import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { LogOut, Menu, ChevronRight, Command } from 'lucide-react';
import { Button } from '../common';
import { CommandPalette } from '../common/CommandPalette';
import { useAuth } from '../../context/AuthContext';

// Mapa de rutas a nombres legibles. Sirve para dos cosas: el breadcrumb y el
// título de la barra superior cuando la pantalla no pasa `title`. Faltaban aquí
// media docena de rutas reales (Despachos, Gastos, Histórico…), así que en esas
// pantallas la barra quedaba sin título y sin ruta de navegación.
const ROUTE_NAMES = {
  '/':                     'Dashboard',
  '/pacas':                'Inventario',
  '/contenedores':         'Contenedores',
  '/clientes':             'Clientes',
  '/ventas':               'Ventas',
  '/gestionar-pedidos':    'Pedidos',
  '/cotizaciones':         'Cotizaciones',
  '/despachos':            'Despachos',
  '/cuentas-pagar':        'Cuentas por Pagar',
  '/cartera':              'Cartera',
  '/entregables':          'Entregables',
  '/deuda-masiva':         'Deuda masiva',
  '/reportes':             'Reportes',
  '/inteligencia-negocio': 'Analytics',
  '/catalogo':             'Catálogo',
  '/mis-pedidos':          'Mis Pedidos',
  '/mi-cartera':           'Mi Cartera',
  '/tipos-paca':           'Productos',
  '/precios':              'Precios Preestablecidos',
  '/lista-precios':        'Lista de Precios',
  '/precios-promocion':    'Precios de Promoción',
  '/cuentas':              'Cuentas',
  '/gastos':               'Gastos',
  '/historico':            'Histórico',
  '/utilidad':             'Utilidad',
  '/gestion-usuarios':     'Usuarios',
  '/auditoria':            'Auditoría',
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
  // Con el almacenamiento del sitio bloqueado, tocar localStorage lanza
  // SecurityError; al ocurrir dentro del inicializador de useState reventaba el
  // render de todas las pantallas. Sin preferencia guardada, sidebar expandido.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', sidebarCollapsed);
    } catch {
      // almacenamiento bloqueado: el sidebar funciona, solo no recuerda el estado
    }
  }, [sidebarCollapsed]);
  const location = useLocation();
  const { logout } = useAuth();

  // Varias pantallas no pasan `title` y dibujan su propio h1 dentro del
  // contenido; la barra superior quedaba con un <h1> vacío. Caemos al nombre de
  // la ruta para que la cabecera nunca quede anónima.
  const tituloBarra = title || ROUTE_NAMES[location.pathname] || '';
  // …pero ese respaldo va solo para el lector de pantalla: Gastos, Histórico,
  // Deuda masiva, Lista de Precios y Promociones ya pintan su propio <h1> dentro
  // del contenido, y mostrarlo también arriba dejaba el mismo título dos veces
  // en pantalla. Con `title` explícito sí se ve, como siempre.
  const tituloSoloParaLectores = !title && !!tituloBarra;

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex min-h-screen bg-cream bg-pattern">
      {/* El menú lateral pone dos docenas de enlaces por delante del contenido:
          con teclado había que tabularlos todos en CADA página. El main de abajo
          ya tenía el id y el tabIndex preparados como destino; faltaba el enlace. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-secondary focus:text-on-primary focus:font-semibold focus:shadow-xl"
      >
        Saltar al contenido
      </a>

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col w-full min-w-0">
        {/* ── HEADER ──────────────────────────────── */}
        <header
          className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3"
          role="banner"
        >
          <div className="flex items-center justify-between gap-4">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`
                lg:hidden p-2.5 rounded-xl transition-all duration-200 active:scale-95
                ${sidebarOpen
                  ? 'bg-secondary/20 text-secondary ring-2 ring-secondary/30'
                  : 'bg-surface shadow-md hover:shadow-lg text-primary'}
              `}
              aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={sidebarOpen}
              aria-controls="main-sidebar"
            >
              <Menu size={20} aria-hidden="true" />
            </button>

            {/* Title + breadcrumbs */}
            <div className="flex-1 min-w-0">
              {tituloBarra && (
                <h1
                  className={
                    tituloSoloParaLectores
                      ? 'sr-only'
                      : 'font-display text-xl sm:text-2xl text-primary truncate leading-tight'
                  }
                >
                  {tituloBarra}
                </h1>
              )}
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