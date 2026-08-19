// Caché de los contadores del menú (pacas, clientes, ventas del día).
//
// Vive fuera de React a propósito: cada pantalla monta su propio <Layout>, y con
// él un Sidebar nuevo, así que sin caché se repetía GET /dashboard/metricas en
// CADA clic del menú y los números parpadeaban.
//
// Está en su propio módulo, y no dentro de Sidebar.jsx, para que AuthContext
// pueda vaciarla al cerrar sesión sin crear una dependencia circular: Sidebar ya
// importa useAuth de AuthContext.

const VIGENCIA_MS = 60_000;

let cache = null;
let cacheAt = 0;

/** Devuelve los contadores guardados si siguen vigentes, o null. */
export function contadoresVigentes() {
  if (cache && Date.now() - cacheAt < VIGENCIA_MS) return cache;
  return null;
}

/** Devuelve lo último guardado sin mirar la vigencia (para el estado inicial). */
export function contadoresGuardados() {
  return cache;
}

export function guardarContadores(valores) {
  cache = valores;
  cacheAt = Date.now();
  return cache;
}

/**
 * Vaciar al cerrar sesión. Sin esto, otro usuario que entre dentro del minuto
 * de vigencia vería los contadores del anterior.
 */
export function olvidarContadores() {
  cache = null;
  cacheAt = 0;
}
