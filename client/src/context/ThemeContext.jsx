import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

// En un navegador con el almacenamiento del sitio bloqueado (Chrome con "Bloquear
// todas las cookies", modo privado estricto) el simple hecho de tocar
// window.localStorage lanza SecurityError. Como ThemeProvider envuelve TODA la
// aplicación, esa excepción durante el render dejaba la pantalla en blanco.
// Perder la preferencia de tema es infinitamente menos grave que perder la app.
function leerTemaGuardado() {
  try {
    const guardado = localStorage.getItem('ba-theme');
    if (guardado === 'dark' || guardado === 'light') return guardado;
  } catch {
    // almacenamiento bloqueado: caemos a la preferencia del sistema
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(leerTemaGuardado);

  // Aplicar el tema al elemento raíz
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('ba-theme', theme);
    } catch {
      // almacenamiento bloqueado: el tema funciona igual, solo no se recuerda
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
