// ── EL BORRADOR DE LA MATRIZ, EN EL NAVEGADOR ───────────────────────────────
//
// Sale del orquestador para que ahí quede lo que de verdad orquesta: la carga,
// el estado y el paso de una fase a la otra. Aquí sólo hay funciones puras
// —leer, sanear, escribir y olvidar— sin un solo hook: los tres efectos que las
// usan (leer al abrir, escribir con retardo, escribir al cerrar) se quedan en
// `SeparacionMasiva.jsx`, que es quien tiene `filas`.
//
import { itemVacio } from './comun';

//
// Anotar la matriz de una ronda es media hora larga de tecleo. Desde la entrega
// C el trabajo se guarda además en el servidor, cliente por cliente, pero esto
// NO se quita: es la red de debajo. Si el servidor no responde —o si las rutas
// de /api/matriz todavía no están desplegadas— la Matriz tiene que seguir
// funcionando entera y sin perder una tecla. El servidor manda cuando contesta;
// el navegador guarda siempre.
//
// TODO va dentro de try/catch, y no por prudencia de manual: con el
// almacenamiento del sitio bloqueado (Chrome con "bloquear todas las cookies",
// modos restringidos) el simple hecho de LEER localStorage lanza SecurityError,
// y si eso pasa durante el render la pantalla se queda EN BLANCO.
//
// La clave lleva el id de quien entró porque el portátil de la bodega lo usan
// varias personas: sin eso, la vendedora abriría la matriz a medias de la dueña
// creyendo que es suya y le crearía sus cotizaciones.
export const CLAVE_BORRADOR = 'bodeamericana.matriz.borrador.v1';
export const claveBorrador = (usuarioId) => `${CLAVE_BORRADOR}.${usuarioId ?? 'anon'}`;

// Todo lo que se teclea en esta pantalla son cadenas (el precio con puntos de
// miles, la cantidad tal cual se escribió). Lo que vuelva del borrador que no
// sea cadena se descarta en vez de colarse: un número donde se esperaba texto
// rompe parseMonto en silencio y cotiza mal.
export const texto = (v) => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

export const entero = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const saneaItem = (it) => ({
  ...itemVacio(),
  referencia:  texto(it?.referencia),
  calidad:     texto(it?.calidad),
  cantidad:    texto(it?.cantidad),
  precio:      texto(it?.precio),
  esPromocion: Boolean(it?.esPromocion),
  avisoPrecio: typeof it?.avisoPrecio === 'string' ? it.avisoPrecio : null,
  // Lo que vino del libro de faltantes. Se sanea igual que lo demás: un
  // `cargado` que llegara como texto haría que la suma de la idempotencia
  // concatenara en vez de sumar y el botón ofrecería cargar de nuevo lo que ya
  // estaba cargado.
  cargado:      entero(it?.cargado),
  precioOrigen: entero(it?.precioOrigen) || null,
  respetaOrigen: Boolean(it?.respetaOrigen),
  faltanteId:   entero(it?.faltanteId) || null,
});

// Un borrador puede venir de una versión anterior de la pantalla, de otra
// pestaña o directamente corrupto, así que se sanea fila por fila en vez de
// confiar en él. No es paranoia: `resumen` hace fila.items.filter(...) sin
// defensa ninguna, así que un `items` que no sea arreglo tumba la pantalla en
// el primer render y deja a la usuaria sin Matriz por un dato viejo.
export const saneaFilas = (bruto) => {
  const out = {};
  if (!bruto || typeof bruto !== 'object') return out;
  for (const [clienteId, fila] of Object.entries(bruto)) {
    if (!fila || typeof fila !== 'object' || !Array.isArray(fila.items) || !fila.items.length) continue;
    out[clienteId] = {
      items: fila.items.map(saneaItem),
      descuento: texto(fila.descuento),
      tipo_descuento: fila.tipo_descuento === 'porcentaje' ? 'porcentaje' : 'valor_fijo',
      transporte_unitario: texto(fila.transporte_unitario),
      tipo_transporte: texto(fila.tipo_transporte),
    };
  }
  return out;
};

export const leerBorrador = (clave) => {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    if (!dato || typeof dato !== 'object') return null;
    return {
      filas: saneaFilas(dato.filas),
      tasa: texto(dato.tasa),
      transporte_global: texto(dato.transporte_global),
      validez_dias: texto(dato.validez_dias),
      guardado_en: typeof dato.guardado_en === 'string' ? dato.guardado_en : null,
    };
  } catch (err) {
    // JSON roto o almacenamiento bloqueado: se sigue sin borrador. Lo que no se
    // puede es dejar que la excepción suba y se lleve la pantalla por delante.
    console.warn('[Matriz] no se pudo leer el borrador', err);
    return null;
  }
};

export const escribirBorrador = (clave, foto) => {
  try {
    window.localStorage.setItem(clave, JSON.stringify(foto));
  } catch (err) {
    // Cuota llena o almacenamiento bloqueado. No se avisa en pantalla a
    // propósito: la usuaria no puede hacer nada al respecto y un aviso cada
    // segundo mientras teclea sería insufrible. Queda en la consola.
    console.warn('[Matriz] no se pudo guardar el borrador', err);
  }
};

export const olvidarBorrador = (clave) => {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
};

// Sólo cuenta como borrador lo que tiene clientes con líneas. La tasa o el
// transporte solos no son trabajo que valga la pena recuperar, y guardarlos
// haría que la pantalla ofreciera "recuperar" una matriz vacía cada mañana.
export const tieneAlgo = (foto) => Boolean(foto && foto.filas && Object.keys(foto.filas).length);

// "09/09 a las 3:12 p. m." — la hora importa tanto como el día: lo que decide
// si el borrador se retoma o se tira es si es de hace diez minutos o de la
// semana pasada.
export const selloBorrador = (iso) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}`
      + ` a las ${d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return '';
  }
};
