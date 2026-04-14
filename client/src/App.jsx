import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common';
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
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/pacas" element={<Pacas />} />
      <Route path="/clientes" element={<Clientes />} />
      <Route path="/ventas" element={<Ventas />} />
      <Route path="/cartera" element={<Cartera />} />
      <Route path="/reportes" element={<Reportes />} />
      <Route path="/gestionar-pedidos" element={<GestionarPedidos />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/*" element={<RutasDinamicas />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}