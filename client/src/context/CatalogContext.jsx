import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { tiposPacaApi } from '../services/api';

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [tipos,      setTipos]      = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades,  setCalidades]  = useState([]);
  const [temporadas, setTemporadas] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // allSettled y no all: con Promise.all, si UNA de las cuatro peticiones falla
  // (p. ej. /tipos-paca/temporadas), se descartaban también las tres que sí
  // respondieron y el catálogo entero quedaba vacío. Eso dejaba los selectores
  // de Referencia, Calidad y Clasificación sin opciones —sin ningún mensaje—
  // en Promociones, Precios, Pacas, Contenedores y Cotizaciones.
  const reload = useCallback(async () => {
    setLoading(true);
    const [t, c, q, s] = await Promise.allSettled([
      tiposPacaApi.getTipos(),
      tiposPacaApi.getCategorias(),
      tiposPacaApi.getCalidades(),
      tiposPacaApi.getTemporadas(),
    ]);

    const lista = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
    setTipos(lista(t));
    setCategorias(lista(c));
    setCalidades(lista(q));
    setTemporadas(lista(s));

    const fallidos = [
      [t, 'clasificaciones'], [c, 'referencias'],
      [q, 'calidades'], [s, 'categorías'],
    ].filter(([r]) => r.status === 'rejected').map(([, n]) => n);

    if (fallidos.length) {
      const msg = `No se pudieron cargar: ${fallidos.join(', ')}.`;
      setError(msg);
      console.error('[CatalogContext]', msg, fallidos);
    } else {
      setError(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <CatalogContext.Provider value={{ tipos, categorias, calidades, temporadas, loading, error, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be inside <CatalogProvider>');
  return ctx;
}
