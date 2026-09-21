import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CatalogProvider } from './context/CatalogContext';
import { ToastProvider, ConfirmProvider, PreviewProvider } from './components/common';
import { ErrorBoundary } from './components/common/ErrorBoundary';
// Cada pantalla se descarga aparte; `paginaDiferida` es lo que evita que un
// despliegue deje muerta la pestaña que ya estaba abierta. Ver cargaDiferida.js.
import { paginaDiferida } from './lib/cargaDiferida';
const Dashboard = paginaDiferida(() => import('./pages/Dashboard'));
const Pacas = paginaDiferida(() => import('./pages/Pacas'));
const Clientes = paginaDiferida(() => import('./pages/Clientes'));
const Ventas = paginaDiferida(() => import('./pages/Ventas'));
const Cartera = paginaDiferida(() => import('./pages/Cartera'));
const Reportes = paginaDiferida(() => import('./pages/Reportes'));
const Login = paginaDiferida(() => import('./pages/Login'));
const Registro = paginaDiferida(() => import('./pages/Registro'));
const Catalogo = paginaDiferida(() => import('./pages/Catalogo'));
const MisPedidos = paginaDiferida(() => import('./pages/MisPedidos'));
const CarteraCliente = paginaDiferida(() => import('./pages/CarteraCliente'));
const GestionarPedidos = paginaDiferida(() => import('./pages/GestionarPedidos'));
const ClienteDashboard = paginaDiferida(() => import('./pages/ClienteDashboard'));
const InteligenciaDeNegocio = paginaDiferida(() => import('./pages/InteligenciaDeNegocio'));
const Cotizaciones = paginaDiferida(() => import('./pages/Cotizaciones'));
const TiposPaca = paginaDiferida(() => import('./pages/TiposPaca'));
const GestionUsuarios = paginaDiferida(() => import('./pages/GestionUsuarios'));
const Contenedores = paginaDiferida(() => import('./pages/Contenedores'));
const CuentasPagar = paginaDiferida(() => import('./pages/CuentasPagar'));
const Despachos = paginaDiferida(() => import('./pages/Despachos'));
const Precios = paginaDiferida(() => import('./pages/Precios'));
const PreciosPromocion = paginaDiferida(() => import('./pages/PreciosPromocion'));
const ListaPrecios = paginaDiferida(() => import('./pages/ListaPrecios'));
const Cuentas = paginaDiferida(() => import('./pages/Cuentas'));
const Auditoria = paginaDiferida(() => import('./pages/Auditoria'));
const DeudaMasiva = paginaDiferida(() => import('./pages/DeudaMasiva'));
const Historico = paginaDiferida(() => import('./pages/Historico'));
const Gastos = paginaDiferida(() => import('./pages/Gastos'));
const Utilidad = paginaDiferida(() => import('./pages/Utilidad'));
const Entregables = paginaDiferida(() => import('./pages/Entregables'));
const SeparacionMasiva = paginaDiferida(() => import('./pages/SeparacionMasiva'));
const Faltantes = paginaDiferida(() => import('./pages/Faltantes'));

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
        {/* La Matriz y los Faltantes son la misma tarea en dos momentos: la
            Matriz es la sesión de trabajo del día de reparto, y esta pantalla es
            lo que quedó faltando de ese reparto cuando el cliente llama a
            preguntar tres días después. Por eso va aquí pegada y no como una
            tercera pestaña dentro de la Matriz: obligar a abrir la pantalla de
            captura —que es una sesión que se vacía al terminar— solo para
            contestar el teléfono emborrona el concepto de dos fases.
            Y va SIN <SoloAdmin> a propósito, exactamente igual que la Matriz:
            quien reparte y quien atiende al cliente que reclama es la vendedora,
            no la dueña. Anular un faltante sí es solo de admin, pero eso lo
            decide el servidor en PATCH /matriz/faltantes/:id/anular, que es donde
            la decisión no se puede saltar escribiendo una URL a mano. */}
        <Route path="/faltantes" element={<Faltantes />} />
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