import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { authApi, recordarToken } from '../services/api';
import { olvidarContadores } from '../lib/contadores';

const AuthContext = createContext(null);

// Con el almacenamiento del sitio bloqueado (Chrome con "bloquear todas las
// cookies", modos restringidos), el simple acceso a localStorage lanza
// SecurityError. Al ocurrir dentro del render del provider dejaba la aplicación
// en pantalla en blanco: mejor quedarse sin sesión guardada que sin aplicación.
const leerToken = () => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};

const guardarToken = (valor) => {
  // El respaldo en memoria va SIEMPRE, no sólo cuando localStorage falla: es lo
  // que lee api.js para firmar las peticiones si el navegador bloquea el
  // almacenamiento.
  recordarToken(valor);
  try {
    if (valor) {
      localStorage.setItem('token', valor);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la pestaña, pero la app vive.
  }
};

// Lo único que justifica cerrar la sesión es que el servidor conteste que el
// token ya no vale (401: api.js lanza 'Sesión expirada' / 'Tu sesión ya no es
// válida…'). Antes se cerraba ante CUALQUIER excepción, y api.js lanza también
// cuando no hubo respuesta ('No hay conexión con el servidor.', 'El servidor no
// respondió a tiempo…') y cuando el servidor devuelve 500/502/503 —un backend
// reiniciándose—: un parpadeo de wifi durante un F5 echaba a la usuaria de la
// aplicación y le hacía volver a escribir la contraseña. Se invierte la regla:
// se conserva la sesión salvo que el servidor diga expresamente que caducó.
const esSesionInvalida = (err) =>
  /sesión (expirada|ya no es válida)|token (inválido|invalido|expirado|no proporcionado)/i.test(
    err?.message || ''
  );

const REINTENTOS = 2;

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sinConexion, setSinConexion] = useState(false);
  // El mensaje que lanzó api.js, ya en español y pensado para la usuaria
  // ("El servidor no está respondiendo…"), para no dar siempre el mismo aviso
  // genérico cuando el problema no es el internet de la bodega.
  const [motivoSinConexion, setMotivoSinConexion] = useState('');
  const [token, setToken] = useState(leerToken);
  const reintentoRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    // login() acaba de dejar el usuario en memoria: como este efecto depende de
    // `token`, sin esta salida se disparaba una segunda verificación idéntica
    // justo después de entrar.
    if (usuario) {
      setLoading(false);
      return;
    }
    verificarToken(0);
  }, [token, usuario]);

  // Si el provider se desmonta con un reintento pendiente, el temporizador
  // seguiría vivo intentando escribir en un componente que ya no existe.
  useEffect(() => () => clearTimeout(reintentoRef.current), []);

  const verificarToken = async (intento) => {
    try {
      const data = await authApi.verificar();
      setUsuario(data.usuario);
      setSinConexion(false);
      setMotivoSinConexion('');
      setLoading(false);
    } catch (err) {
      // El servidor respondió que el token caducó: ahí sí toca cerrar sesión.
      if (esSesionInvalida(err)) {
        logout();
        setLoading(false);
        return;
      }
      // Todo lo demás es pasajero (red caída, tiempo agotado, servidor
      // reiniciándose). Los cortes típicos duran uno o dos segundos: se
      // reintenta antes de darse por vencido.
      if (intento < REINTENTOS) {
        reintentoRef.current = setTimeout(() => verificarToken(intento + 1), 1500 * (intento + 1));
        return; // seguimos "cargando": ni se borra el token ni se cierra sesión
      }
      // Se conserva el token a propósito: en cuanto vuelva el servicio, la
      // sesión sigue siendo válida y no hay que volver a escribir nada.
      setMotivoSinConexion(err?.message || '');
      setSinConexion(true);
      setLoading(false);
    }
  };

  const reintentarConexion = () => {
    clearTimeout(reintentoRef.current);
    setSinConexion(false);
    setMotivoSinConexion('');
    setLoading(true);
    verificarToken(0);
  };

  // Deja la sesión montada a partir de una respuesta que ya trae token y usuario
  // (login y registro devuelven lo mismo). Se expone para que la pantalla de
  // registro no tenga que escribir en localStorage por su cuenta ni recargar el
  // navegador: con el almacenamiento bloqueado esa recarga se llevaba por delante
  // la sesión recién creada y la cuenta nueva acababa en /login.
  const establecerSesion = (data) => {
    const nuevoToken = data.accessToken || data.token;
    guardarToken(nuevoToken);
    setToken(nuevoToken);
    setUsuario(data.usuario);
    setSinConexion(false);
    setMotivoSinConexion('');
    return data;
  };

  const login = async (username, password) => {
    const data = await authApi.login({ username, password });
    return establecerSesion(data);
  };

  const logout = () => {
    clearTimeout(reintentoRef.current);
    setToken(null);
    setUsuario(null);
    setSinConexion(false);
    setMotivoSinConexion('');
    guardarToken(null);
    // Los contadores del menú se cachean a nivel de módulo: si no se vacían,
    // el siguiente usuario que entre dentro del minuto vería los del anterior.
    olvidarContadores();
    navigate('/login', { replace: true });
  };

  const tieneRol = (roles) => {
    if (!usuario) return false;
    if (Array.isArray(roles)) {
      return roles.includes(usuario.rol);
    }
    return usuario.rol === roles;
  };

  // Sin esta pantalla, un fallo de red persistente dejaba `usuario` en null y
  // App.jsx mandaba a /login como si la sesión hubiera caducado. Aquí se explica
  // lo que pasa de verdad y se puede reintentar sin perder la sesión.
  if (token && !usuario && sinConexion) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div
          role="status"
          className="w-full max-w-sm text-center space-y-4 bg-surface border border-border rounded-2xl p-8 shadow-card"
        >
          <WifiOff className="w-10 h-10 mx-auto text-muted" aria-hidden="true" />
          <h1 className="font-display text-xl text-primary">No pudimos comprobar tu sesión</h1>
          <p className="text-sm text-muted">
            {motivoSinConexion || 'No hay conexión con el servidor.'}
          </p>
          <p className="text-sm text-muted">
            Revisa tu conexión a internet e inténtalo otra vez; tu sesión sigue guardada y no
            hace falta volver a escribir la contraseña.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={reintentarConexion}
              className="w-full py-3 rounded-xl bg-secondary text-on-primary font-semibold hover:opacity-90 transition-opacity"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full py-2 text-sm text-muted hover:text-primary transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout, establecerSesion, tieneRol, token, sinConexion }}>
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
