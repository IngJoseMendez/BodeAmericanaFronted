// Las cuentas de un contenedor: cuánto vale hoy cada proveedor y cada servicio,
// y cuánto de eso entra al costo de las unidades propias.
//
// POR QUÉ VIVEN AQUÍ Y NO EN LA PANTALLA
// Estas fórmulas existen DOS veces: una en el servidor (src/routes/contenedores.js,
// funciones costoBaseProveedor / costoBaseServicio / calcularCostos) y otra aquí.
// El servidor decide lo que se GUARDA —costo_total, costo_unitario, y de ahí el
// costo_base de cada paca al finalizar— y la pantalla decide lo que se VE.
// Cuando las dos copias dejaron de coincidir, la pantalla enseñó durante meses
// un total que no era el que quedaba guardado, sin que nada lo delatara.
//
// Sacándolas del componente se pueden probar sin navegador, que es lo que hace
// tests/contenedor-costos.test.mjs: ahí está escrito, caso por caso, qué tiene
// que devolver cada una para que las dos copias sigan diciendo lo mismo.

// ── El estado en palabras ─────────────────────────────────────────
export const ESTADO_LABEL = {
  estimacion: 'Estimación',
  borrador:   'Borrador',
  revision:   'En revisión',
  finalizado: 'Finalizado',
};
export const etiquetaEstado = (e) => ESTADO_LABEL[e] || e || '—';

// ── ¿Este proveedor tiene datos estimados guardados? ──────────────
export const hayEstimadoProveedor = (p = {}) =>
  (parseInt(p.cantidad_estimada) || 0) > 0 ||
  (parseFloat(p.valor_unidad_estimado) || 0) > 0 ||
  (parseFloat(p.factura_estimada) || 0) > 0;

// ── ¿Este contenedor nació de una estimación? ─────────────────────
//
// La respuesta la da `origen`, que se fija al crear y ya no cambia: una
// estimación convertida a borrador y luego finalizada SIGUE siendo un contenedor
// que empezó siendo una creencia, y eso es lo que permite enseñar la comparación
// "estimado vs. lo que llegó" meses después.
//
// Los dos términos siguientes son solo para contenedores guardados antes de que
// existiera la columna, mientras el servidor no haya rellenado el histórico: se
// cae a la pista de siempre —que algún proveedor conserve datos estimados—, que
// es exactamente lo que hacía la pantalla antes.
export const vieneDeEstimacion = (c = {}) => {
  if (c.origen) return c.origen === 'estimacion';
  if (c.estado === 'estimacion') return true;
  return (c.proveedores_mercancia || []).some(hayEstimadoProveedor);
};

// ── ¿El costo de este servicio es solo nuestro? ───────────────────
//
// Un servicio COMPARTIDO (flete, nacionalización) se cobra por el contenedor
// entero y se reparte entre todas sus unidades, sean nuestras o no. Uno PROPIO
// —el transporte de nuestra mercancía desde el puerto, nuestro bodegaje— se
// carga entero a nuestras unidades.
//
// La comprobación no es `!!sv.propio` porque el dato viaja por JSON y vuelve de
// la API como booleano, pero puede llegar como la cadena "false", que en
// JavaScript es verdadera. Misma función que `esServicioPropio` del backend.
export const esServicioPropio = (sv = {}) => {
  const v = sv.propio;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return v === true;
};

// ── Lo que cuesta HOY un servicio, en su propia moneda ────────────
//
// El costo REAL manda: si el proveedor ya facturó, esa es la cifra. Mientras no
// haya factura vale lo estimado, y se acepta escrito de las tres formas que ha
// tenido esta pantalla: cantidad × valor por unidad, el valor suelto (que es lo
// que escribe hoy la casilla única de "Costo estimado") o la factura estimada de
// los registros viejos.
//
// Sin el último término, una estimación antigua guardada solo con "Factura
// estimada" entraba al total valiendo CERO mientras la pantalla enseñaba su
// importe. El backend cuenta hoy exactamente igual, incluido ese término.
export const costoServicioEfectivo = (sv = {}) => {
  const real = parseFloat(sv.costo) || 0;
  if (real > 0) return real;
  const cantidad = parseInt(sv.cantidad_estimada) || 0;
  const valor    = parseFloat(sv.valor_unidad_estimado) || 0;
  return (cantidad * valor) || valor || (parseFloat(sv.factura_estimada) || 0);
};

// ── Lo que cuesta HOY un proveedor, en su propia moneda ───────────
//
// Manda lo REAL: las líneas de distribución ya capturadas. Mientras no haya
// ninguna vale lo estimado (cantidad × valor por unidad), y si tampoco hay eso
// —estimaciones viejas donde se tecleaba la factura y el valor por unidad salía
// de dividir—, la factura estimada suelta.
export const costoProveedorEfectivo = (p = {}) => {
  const real = (p.detalles || []).reduce(
    (s, d) => s + (parseInt(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0), 0
  );
  if (real > 0) return real;
  return ((parseInt(p.cantidad_estimada) || 0) * (parseFloat(p.valor_unidad_estimado) || 0))
    || (parseFloat(p.factura_estimada) || 0);
};

/**
 * La parte del costo de un servicio que asumen las unidades propias.
 *
 * Un contenedor puede venir COMPARTIDO: entran 500 unidades pero solo 300 son
 * nuestras. El flete o la nacionalización se facturan por el contenedor entero,
 * así que se dividen entre las 500 y solo entran 300/500 al costo.
 *
 * Salvo que el servicio sea PROPIO: el transporte de nuestra mercancía desde el
 * puerto es nuestro entero. Repartirlo entre las unidades de otro dejaba el
 * costo unitario más barato de lo que es, y de ese número sale el costo_base de
 * CADA paca al finalizar.
 *
 * @param {number} costoCOP        costo del servicio ya convertido a pesos
 * @param {object} opciones        { propio, base, propias }
 *   - propio  true = no se reparte
 *   - base    unidades del contenedor físico completo (0 = no se sabe)
 *   - propias unidades nuestras
 */
export function costoServicioAsignado(costoCOP, { propio = false, base = 0, propias = 0 } = {}) {
  const costo = parseFloat(costoCOP) || 0;
  if (propio) return costo;
  const b = parseInt(base) || 0;
  const p = parseInt(propias) || 0;
  return b > 0 ? (costo / b) * p : costo;
}
