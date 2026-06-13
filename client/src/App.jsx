import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CatalogProvider } from './context/CatalogContext';
import { ToastProvider, ConfirmProvider, PreviewProvider } from './components/common';
import Dashboard from './pages/Dashboard';
import Pacas from './pages/Pacas';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import Cartera from './pages/Cartera';
import Reportes from './pages/Reportes';
import Login from './pages/Login';
import Registro from './pages/Registro';
import Catalogo from './pages/Catalogo';
import MisPedidos from './pages/MisPedidos';
import CarteraCliente from './pages/CarteraCliente';
import GestionarPedidos from './pages/GestionarPedidos';
import ClienteDashboard from './pages/ClienteDashboard';
import InteligenciaDeNegocio from './pages/InteligenciaDeNegocio';
import Cotizaciones from './pages/Cotizaciones';
import TiposPaca from './pages/TiposPaca';
import GestionUsuarios from './pages/GestionUsuarios';
import Contenedores from './pages/Contenedores';
import CuentasPagar from './pages/CuentasPagar';
import Despachos from './pages/Despachos';
import Precios from './pages/Precios';
import PreciosPromocion from './pages/PreciosPromocion';
import ListaPrecios from './pages/ListaPrecios';
import Cuentas from './pages/Cuentas';
import Auditoria from './pages/Auditoria';
import DeudaMasiva from './pages/DeudaMasiva';
import Historico from './pages/Historico';
import Gastos from './pages/Gastos';

function AdminLayout() {
  return (
    <>
      <Route path="/" element={<Dashboard />} />
      <Route path="/pacas" element={<Pacas />} />
      <Route path="/clientes" element={<Clientes />} />
      <Route path="/ventas" element={<Ventas />} />
      <Route path="/cartera" element={<Cartera />} />
      <Route path="/reportes" element={<Reportes />} />
      <Route path="/gestionar-pedidos" element={<GestionarPedidos />} />
    </>
  );
}

function ClienteLayout() {
  return (
    <>
      <Route path="/" element={<Catalogo />} />
      <Route path="/catalogo" element={<Catalogo />} />
      <Route path="/mis-pedidos" element={<MisPedidos />} />
      <Route path="/mi-cartera" element={<CarteraCliente />} />
    </>
  );
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
        <Route path="/despachos" element={<Despachos />} />
        <Route path="/cuentas-pagar" element={<CuentasPagar />} />
        <Route path="/tipos-paca" element={<TiposPaca />} />
        <Route path="/precios" element={<Precios />} />
        <Route path="/precios-promocion" element={<PreciosPromocion />} />
        <Route path="/lista-precios" element={<ListaPrecios />} />
        <Route path="/cuentas" element={<Cuentas />} />
        <Route path="/gestion-usuarios" element={<GestionUsuarios />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/deuda-masiva" element={<DeudaMasiva />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/gastos" element={<Gastos />} />
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
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <PreviewProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/registro" element={<Registro />} />
                  <Route path="/*" element={<RutasDinamicas />} />
                </Routes>
              </PreviewProvider>
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}