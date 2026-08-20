import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CatalogProvider } from './context/CatalogContext';
import { ToastProvider, ConfirmProvider, PreviewProvider } from './components/common';
import { ErrorBoundary } from './components/common/ErrorBoundary';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pacas = lazy(() => import('./pages/Pacas'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Ventas = lazy(() => import('./pages/Ventas'));
const Cartera = lazy(() => import('./pages/Cartera'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Login = lazy(() => import('./pages/Login'));
const Registro = lazy(() => import('./pages/Registro'));
const Catalogo = lazy(() => import('./pages/Catalogo'));
const MisPedidos = lazy(() => import('./pages/MisPedidos'));
const CarteraCliente = lazy(() => import('./pages/CarteraCliente'));
const GestionarPedidos = lazy(() => import('./pages/GestionarPedidos'));
const ClienteDashboard = lazy(() => import('./pages/ClienteDashboard'));
const InteligenciaDeNegocio = lazy(() => import('./pages/InteligenciaDeNegocio'));
const Cotizaciones = lazy(() => import('./pages/Cotizaciones'));
const TiposPaca = lazy(() => import('./pages/TiposPaca'));
const GestionUsuarios = lazy(() => import('./pages/GestionUsuarios'));
const Contenedores = lazy(() => import('./pages/Contenedores'));
const CuentasPagar = lazy(() => import('./pages/CuentasPagar'));
const Despachos = lazy(() => import('./pages/Despachos'));
const Precios = lazy(() => import('./pages/Precios'));
const PreciosPromocion = lazy(() => import('./pages/PreciosPromocion'));
const ListaPrecios = lazy(() => import('./pages/ListaPrecios'));
const Cuentas = lazy(() => import('./pages/Cuentas'));
const Auditoria = lazy(() => import('./pages/Auditoria'));
const DeudaMasiva = lazy(() => import('./pages/DeudaMasiva'));
const Historico = lazy(() => import('./pages/Historico'));
const Gastos = lazy(() => import('./pages/Gastos'));
const Utilidad = lazy(() => import('./pages/Utilidad'));
const Entregables = lazy(() => import('./pages/Entregables'));
const SeparacionMasiva = lazy(() => import('./pages/SeparacionMasiva'));

// Pantalla de espera mientras se descarga el código de la página solicitada.
function CargandoPagina() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div
        className="animate-spin rounded-full h-10 w-10 border-4 border-secondary border-t-transparent"
        role="status"
        aria-label="Cargando página"
      />
    </div>
  );
}

// El menú lateral ya oculta las pantallas de solo-admin, pero ocultarlas no es
// protegerlas: un vendedor podía abrirlas escribiendo la URL a mano y llegar, por
// ejemplo, a Usuarios para crearse una cuenta de administrador. Esto es defensa en
// profundidad del lado del cliente; la comprobación de rol del backend sigue siendo
// la que manda.
function SoloAdmin({ children }) {
  const { tieneRol } = useAuth();
  return tieneRol('admin') ? children : <Navigate to="/" replace />;
}

function RutasAdmin() {
  const { tieneRol } = useAuth();

  if (!tieneRol('admin') && !tieneRol('vendedor')) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CatalogProvider>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pacas" element={<Pacas />} />
        <Route path="/contenedores" element={<Contenedores />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/cartera" element={<Cartera />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/gestionar-pedidos" element={<GestionarPedidos />} />
        <Route path="/inteligencia-negocio" element={<InteligenciaDeNegocio />} />
        <Route path="/cotizaciones" element={<Cotizaciones />} />
        {/* Separar y cotizar son la misma acción: un vendedor aparta mercancía
            todos los días, así que NO va envuelta en <SoloAdmin>. */}
        <Route path="/separacion-masiva" element={<SeparacionMasiva />} />
        <Route path="/despachos" element={<Despachos />} />
        <Route path="/cuentas-pagar" element={<CuentasPagar />} />
        <Route path="/tipos-paca" element={<TiposPaca />} />
        <Route path="/precios" element={<Precios />} />
        <Route path="/precios-promocion" element={<PreciosPromocion />} />
        <Route path="/lista-precios" element={<ListaPrecios />} />
        <Route path="/cuentas" element={<SoloAdmin><Cuentas /></SoloAdmin>} />
        <Route path="/gestion-usuarios" element={<SoloAdmin><GestionUsuarios /></SoloAdmin>} />
        <Route path="/auditoria" element={<SoloAdmin><Auditoria /></SoloAdmin>} />
        <Route path="/deuda-masiva" element={<SoloAdmin><DeudaMasiva /></SoloAdmin>} />
        <Route path="/historico" element={<SoloAdmin><Historico /></SoloAdmin>} />
        <Route path="/gastos" element={<SoloAdmin><Gastos /></SoloAdmin>} />
        <Route path="/utilidad" element={<SoloAdmin><Utilidad /></SoloAdmin>} />
        <Route path="/entregables" element={<Entregables />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CatalogProvider>
  );
}

function RutasCliente() {
  const { tieneRol } = useAuth();
  
  if (!tieneRol('cliente')) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <Routes>
      <Route path="/" element={<ClienteDashboard />} />
      <Route path="/catalogo" element={<Catalogo />} />
      <Route path="/mis-pedidos" element={<MisPedidos />} />
      <Route path="/mi-cartera" element={<CarteraCliente />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RutasDinamicas() {
  const { usuario, loading, tieneRol } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-secondary border-t-transparent"></div>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return tieneRol('admin') || tieneRol('vendedor') ? <RutasAdmin /> : <RutasCliente />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <PreviewProvider>
                <Suspense fallback={<CargandoPagina />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/registro" element={<Registro />} />
                    <Route path="/*" element={<RutasDinamicas />} />
                  </Routes>
                </Suspense>
              </PreviewProvider>
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}