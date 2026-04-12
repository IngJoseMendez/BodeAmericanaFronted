import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      verificarToken();
    } else {
      setLoading(false);
    }
  }, [token]);

  const verificarToken = async () => {
    try {
      const data = await authApi.verificar();
      setUsuario(data.usuario);
    } catch (err) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const data = await authApi.login({ username, password });
    setToken(data.token);
    setUsuario(data.usuario);
    localStorage.setItem('token', data.token);
    return data;
  };

  const logout = () => {
    setToken(null);
    setUsuario(null);
    localStorage.removeItem('token');
  };

  const tieneRol = (roles) => {
    if (!usuario) return false;
    if (Array.isArray(roles)) {
      return roles.includes(usuario.rol);
    }
    return usuario.rol === roles;
  };

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout, tieneRol, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}