import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { tiposPacaApi } from '../services/api';

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [tipos,      setTipos]      = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades,  setCalidades]  = useState([]);
  const [temporadas, setTemporadas] = useState([]);
  const [familias,   setFamilias]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // allSettled y no all: con Promise.all, si UNA de las cuatro peticiones falla
  // (p. ej. /tipos-paca/temporadas), se descartaban también las tres que sí
  // respondieron y el catálogo entero quedaba vacío. Eso dejaba los selectores
  // de Referencia, Calidad y Clasificación sin opciones —sin ningún mensaje—
  // en Promociones, Precios, Pacas, Contenedores y Cotizaciones.
  const reload = useCallback(async () => {
    setLoading(true);
    const [t, c, q, s, fam] = await Promise.allSettled([
      tiposPacaApi.getTipos(),
      tiposPacaApi.getCategorias(),
      tiposPacaApi.getCalidades(),
      tiposPacaApi.getTemporadas(),
      tiposPacaApi.getFamilias(),
    ]);

    const lista = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
    setTipos(lista(t));
    setCategorias(lista(c));
    setCalidades(lista(q));
    setTemporadas(lista(s));
    setFamilias(lista(fam));

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
    // Los nombres heredados no dicen lo que contienen y ya provocaron un bug: se
    // exponen también con el nombre del negocio, que es como los llama la gente.
    //   tipos      → CLASIFICACIONES (dama, niño, hombre)
    //   categorias → REFERENCIAS     (cada referencia lleva temporada_nombre,
    //                                 que es su categoría a efectos de precio)
    //   temporadas → CATEGORÍAS      (las que se usan en la tabla de Precios)
    // Los cuatro nombres viejos se conservan porque hay pantallas que ya los usan.
    <CatalogContext.Provider value={{
      tipos, categorias, calidades, temporadas, familias, loading, error, reload,
      clasificaciones: tipos,
      referencias: categorias,
      categoriasPrecio: temporadas,
    }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be inside <CatalogProvider>');
  return ctx;
}
