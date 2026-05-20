import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { tiposPacaApi } from '../services/api';

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [tipos,      setTipos]      = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades,  setCalidades]  = useState([]);
  const [temporadas, setTemporadas] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const reload = useCallback(async () => {
    try {
      const [t, c, q, s] = await Promise.all([
        tiposPacaApi.getTipos(),
        tiposPacaApi.getCategorias(),
        tiposPacaApi.getCalidades(),
        tiposPacaApi.getTemporadas(),
      ]);
      setTipos(t);
      setCategorias(c);
      setCalidades(q);
      setTemporadas(s);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <CatalogContext.Provider value={{ tipos, categorias, calidades, temporadas, loading, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be inside <CatalogProvider>');
  return ctx;
}
