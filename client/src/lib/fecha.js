// Fechas sin desfase de zona horaria.
//
// Dos errores convivían en el proyecto y los dos corren la fecha un día:
//
// 1) `new Date().toISOString().split('T')[0]` como "hoy". toISOString convierte
//    a UTC, así que en Colombia (UTC-5) después de las 19:00 devuelve MAÑANA.
//    Un gasto registrado a las 8 de la noche quedaba con la fecha del día
//    siguiente.
//
// 2) `new Date('2026-08-11').toLocaleDateString()` sobre una fecha de solo día.
//    El navegador la interpreta como medianoche UTC y al pasarla a hora local
//    retrocede, mostrando el 10. Por eso las llegadas de contenedor aparecían
//    un día antes y las promociones se activaban y vencían corridas.

/** Fecha de HOY en formato YYYY-MM-DD, según el reloj local. */
export function hoy() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Convierte a Date algo que viene del servidor sin corrimiento.
 * Las fechas de solo día se anclan al mediodía: así ningún huso las mueve
 * de día, ni hacia atrás ni hacia adelante.
 */
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor) ? null : valor;
  const s = String(valor);
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(soloDia ? s + 'T12:00:00' : s);
  return isNaN(d) ? null : d;
}

/** "11 ago 2026". Devuelve el guion largo si no hay fecha. */
export function formatFecha(valor, opciones) {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', ...opciones,
  });
}

/** "11/08/2026" */
export function formatFechaCorta(valor) {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** YYYY-MM-DD para inputs type="date", sin corrimiento. */
export function aInputDate(valor) {
  const d = aFecha(valor);
  if (!d) return '';
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Primer día del mes en curso, YYYY-MM-DD. */
export function primerDiaDelMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Compara solo la parte de día: útil para vigencias de promociones. */
export function entreFechas(valor, desde, hasta) {
  const d = aFecha(valor);
  if (!d) return false;
  const ini = aFecha(desde);
  const fin = aFecha(hasta);
  if (ini && d < ini) return false;
  if (fin && d > fin) return false;
  return true;
}
