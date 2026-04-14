import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/common';
import Dashboard from './pages/Dashboard';
import Pacas from './pages/Pacas';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import Cartera from './pages/Cartera';
import Reportes from './pages/Reportes';
import Login from './pages/Login';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/pacas" element={<Pacas />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/ventas" element={<Ventas />} />
            <Route path="/cartera" element={<Cartera />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}