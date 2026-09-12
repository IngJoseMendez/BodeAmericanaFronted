import ExcelJS from 'exceljs';
import { hoy, aFecha } from './fecha.js';
import { descargarExcel } from './descargar.js';

// Hojas replicadas del Excel que ya usa la operación ("Comercio Global
// Logistico.xlsx"). Los encabezados y su orden se respetan tal cual para que
// bodega y clientes reciban exactamente el documento que conocen.

const INK = '0f172a';
const WHITE = 'ffffff';
const LIGHT = 'f1f5f9';
const ACCENT = '6366f1';

export const num = (v) => parseFloat(v) || 0;
const norm = (v) => String(v ?? '').trim();
export const int = (v) => parseInt(v) || 0;

/**
 * El costo que se enseña en una hoja PARTIDA POR LÍNEA (referencia + calidad).
 *
 * `costo_unitario` NO sirve ahí, y es un error fácil de cometer porque el nombre
 * promete justo lo contrario: al finalizar un contenedor, TODAS sus pacas nacen
 * con el mismo `costo_base` —el costo total del contenedor dividido entre las
 * unidades propias, una sola cuenta para todo el contenedor (contenedores.js:151
 * y el INSERT de :977)—. Por eso la columna salía con la misma cifra en las
 * veinte filas: no era un fallo de la hoja, era el dato.
 *
 * El número que SÍ cambia de línea a línea es `precio_minimo`, que se captura
 * por combinación al finalizar: mercancía de ESE producto ponderada entre
 * proveedores, más servicios por unidad, más la utilidad fijada. Es lo mínimo a
 * cobrar por esa línea sin perder, la misma cuenta que la hoja PRECIOSINTERNOS.
 *
 * NO SE CAE A `costo_unitario` CUANDO NO HAY MÍNIMO, y aquí sí se caía. El
 * argumento era que para una paca vieja sin mínimo guardado el promedio del
 * contenedor es lo único que hay y es mejor que un cero. Es al revés: ese
 * respaldo es precisamente lo que ponía el costo del contenedor debajo de un
 * rótulo que dice COSTO cuando significa mínimo, sin avisar y en todas las
 * filas a la vez. Una casilla vacía se ve y se pregunta; un número que no es
 * el que dice ser se usa para poner precio.
 *
 * Si sale vacía: esas pacas se crearon antes de que se guardara el mínimo.
 * `npm run rellenar-precio-minimo` en el servidor lo calcula y lo rellena.
 *
 * Vive aquí, y no copiada en cada hoja, porque este proyecto ya tuvo el bug de
 * dos fórmulas de dinero que se separaron sin que nada fallara.
 */
export const costoDeLinea = (f) => num(f?.precio_minimo);
const hoyStr = () => new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Encabezado de tabla con el estilo de la casa. */
function cabecera(ws, fila, cols) {
  const r = ws.getRow(fila);
  r.height = 22;
  cols.forEach((h, i) => {
    const c = r.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  return fila + 1;
}

function zebra(ws, fila, nCols) {
  const par = fila % 2 === 0;
  for (let i = 1; i <= nCols; i++) {
    ws.getRow(fila).getCell(i).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: par ? LIGHT : WHITE },
    };
  }
}

function titulo(ws, texto, nCols, fila = 1) {
  ws.mergeCells(fila, 1, fila, nCols);
  const c = ws.getCell(fila, 1);
  c.value = texto;
  c.font = { size: 13, bold: true, color: { argb: WHITE } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(fila).height = 26;
  return fila + 1;
}

/** Bloque de contadores VIENEN / SALEN / QUEDAN, como en la hoja original. */
function contadores(ws, fila, pares, colInicio = 8) {
  pares.forEach(([k, v], i) => {
    const r = fila + i;
    const cl = ws.getCell(r, colInicio);
    cl.value = k;
    cl.font = { bold: true, size: 10 };
    cl.alignment = { horizontal: 'right' };
    const cv = ws.getCell(r, colInicio + 1);
    cv.value = v;
    cv.font = { bold: true, size: 11, color: { argb: ACCENT } };
    cv.alignment = { horizontal: 'center' };
  });
}

// ── BODEGA ────────────────────────────────────────────────────────

const COLS_BODEGA = ['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'CAN', 'NOMBRE', 'CIUDAD', 'DIRECCION', 'CELULAR', 'TRANSP.'];
const ANCHOS_BODEGA = [18, 16, 24, 14, 7, 26, 16, 32, 14, 12];

/**
 * DESPACHO(BODEGA) — una fila por referencia/calidad de cada despacho,
 * con los datos de entrega del cliente repetidos, tal como en el original.
 */
export function hojaDespachoBodega(wb, despachos, { totales } = {}) {
  const ws = wb.addWorksheet('DESPACHO(BODEGA)');
  ANCHOS_BODEGA.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.getCell('A1').value = 'FECHA';
  ws.getCell('B1').value = hoyStr();
  ws.getCell('A1').font = { bold: true, size: 10 };
  ws.getCell('A2').value = 'DESPACHAR';
  ws.getCell('A2').font = { bold: true, size: 12, color: { argb: ACCENT } };

  // Los cinco contadores ocupan las filas 1 a 5, así que la tabla empieza en la
  // 7. Antes arrancaba en la 4 y SEPARADAS y DISPONIBLES quedaban pisados por
  // la cabecera de columnas.
  if (totales) {
    contadores(ws, 1, [
      ['VIENEN', totales.vienen], ['SALEN', totales.salen], ['QUEDAN', totales.quedan],
      ['SEPARADAS', totales.separadas], ['DISPONIBLES', totales.disponibles],
    ]);
  }

  let fila = cabecera(ws, totales ? 7 : 4, COLS_BODEGA);
  let totalUnidades = 0;

  for (const d of despachos) {
    for (const g of d.grupos) {
      const r = ws.getRow(fila);
      r.height = 18;
      [g.categoria, g.clasificacion, g.referencia, g.calidad, g.cantidad,
       d.nombre, d.ciudad, d.direccion, d.celular, d.transporte].forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v ?? '';
        c.font = { size: 10 };
        c.alignment = { horizontal: i === 4 ? 'center' : 'left', vertical: 'middle' };
      });
      zebra(ws, fila, COLS_BODEGA.length);
      totalUnidades += int(g.cantidad);
      fila++;
    }
  }

  const t = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 4);
  t.getCell(1).value = 'TOTAL A DESPACHAR';
  t.getCell(5).value = totalUnidades;
  [1, 2, 3, 4, 5].forEach(i => {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    t.getCell(i).alignment = { horizontal: i === 5 ? 'center' : 'right' };
  });
  t.height = 22;
  return ws;
}

/** SEPARADAS(BODEGA) — mismas columnas, agrupado por cliente. */
export function hojaSeparadasBodega(wb, clientes) {
  const ws = wb.addWorksheet('SEPARADAS(BODEGA)');
  ANCHOS_BODEGA.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.getCell('A1').value = 'FECHA';
  ws.getCell('B1').value = hoyStr();
  ws.getCell('A1').font = { bold: true, size: 10 };

  const total = clientes.reduce((s, c) => s + c.grupos.reduce((s2, g) => s2 + int(g.cantidad), 0), 0);
  ws.getCell('A2').value = 'SEPARADAS POR CLIENTE';
  ws.getCell('A2').font = { bold: true, size: 12, color: { argb: ACCENT } };
  ws.getCell('E2').value = 'TOTAL';
  ws.getCell('E2').font = { bold: true, size: 10 };
  ws.getCell('F2').value = total;
  ws.getCell('F2').font = { bold: true, size: 12, color: { argb: ACCENT } };

  let fila = cabecera(ws, 3, COLS_BODEGA);

  for (const c of clientes) {
    for (const g of c.grupos) {
      const r = ws.getRow(fila);
      r.height = 18;
      [g.categoria, g.clasificacion, g.referencia, g.calidad, g.cantidad,
       c.nombre, c.ciudad, c.direccion, c.celular, c.transporte].forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v ?? '';
        cell.font = { size: 10 };
        cell.alignment = { horizontal: i === 4 ? 'center' : 'left', vertical: 'middle' };
      });
      zebra(ws, fila, COLS_BODEGA.length);
      fila++;
    }

    // Subtotal del cliente: es lo que la bodega tiene que apartarle en total.
    const subtotal = c.grupos.reduce((s, g) => s + int(g.cantidad), 0);
    const sr = ws.getRow(fila);
    sr.height = 20;
    ws.mergeCells(fila, 1, fila, 4);
    sr.getCell(1).value = `Total ${c.nombre}`;
    sr.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    sr.getCell(5).value = subtotal;
    sr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let i = 1; i <= COLS_BODEGA.length; i++) {
      sr.getCell(i).font = { bold: true, size: 10, color: { argb: ACCENT } };
      sr.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'eef0fe' } };
    }
    fila++;
  }

  const t = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 4);
  t.getCell(1).value = 'TOTAL SEPARADAS';
  t.getCell(5).value = total;
  [1, 2, 3, 4, 5].forEach(i => {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    t.getCell(i).alignment = { horizontal: i === 5 ? 'center' : 'right' };
  });
  return ws;
}

/** INVENTARIO(BODEGA) — sin costos ni precios. */
export function hojaInventarioBodega(wb, filas) {
  const ws = wb.addWorksheet('INVENTARIO(BODEGA)');
  [18, 16, 24, 14, 10, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let fila = titulo(ws, `INVENTARIO TOTAL Y DISPONIBLE — ${hoyStr()}`, 7);
  // SEPARADA va entre FÍSICO y DISP: es la resta que explica la diferencia.
  fila = cabecera(ws, fila, ['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'FISICO', 'SEPARADA', 'DISP']);

  let fisico = 0, sep = 0, disp = 0;
  for (const f of filas) {
    const r = ws.getRow(fila);
    [f.categoria, f.clasificacion, f.referencia, f.calidad,
     int(f.fisico), int(f.separadas), int(f.disponibles)].forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v ?? '';
      c.font = { size: 10, bold: i >= 4, color: { argb: i === 5 && int(f.separadas) > 0 ? 'd97706' : INK } };
      c.alignment = { horizontal: i >= 4 ? 'center' : 'left' };
    });
    zebra(ws, fila, 7);
    fisico += int(f.fisico); sep += int(f.separadas); disp += int(f.disponibles);
    fila++;
  }

  const t = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 4);
  t.getCell(1).value = 'TOTAL';
  t.getCell(5).value = fisico;
  t.getCell(6).value = sep;
  t.getCell(7).value = disp;
  [1, 2, 3, 4, 5, 6, 7].forEach(i => {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    t.getCell(i).alignment = { horizontal: i >= 5 ? 'center' : 'right' };
  });
  return ws;
}

/**
 * MATRIZ — el inventario completo y, a partir de la última columna de
 * inventario, una columna por cliente con lo que tiene separado de esa
 * referencia. Permite ver de un vistazo quién tiene apartado qué.
 *
 * @param filas       inventario agrupado (referencia/calidad con físico, sep, disp)
 * @param separadas   filas de pacas comprometidas, con cliente_nombre
 */
export function hojaMatrizClientes(wb, filas, separadas) {
  const ws = wb.addWorksheet('MATRIZ');

  // Estructura tomada TAL CUAL de la plantilla que usa la operación
  // ("ejemplo matriz.xlsx", hoja MATRIZ):
  //
  //   fila 1  INVENTARIO ..... MATRIZ ..... FECHA
  //   fila 3  sub-rótulos PROMO / ORIGINAL sobre las dos columnas de precio,
  //           y los totales de INVENTARIO, FISICO, DESPACHOS, SEP, DISP y de
  //           cada cliente
  //   fila 4  encabezados
  //   fila 5+ una fila por producto; a la derecha, una columna por cliente con
  //           lo que tiene apartado
  //
  // La plantilla NO lleva familia, clasificación ni categoría: identifica el
  // producto por REFERENCIA + CALIDAD, que es la pareja con la que se separa y
  // se cotiza en todo el sistema.

  // Cruce entre el inventario y las pacas separadas. Sólo referencia + calidad,
  // que es lo que ambas fuentes traen siempre lleno: con un campo nulo de más
  // (familia, categoría) la clave no cruzaría y la matriz saldría vacía.
  const clave = (r) => [norm(r.referencia), norm(r.calidad)].join('||').toLowerCase();

  const porProducto = new Map();
  const clientes = new Set();
  for (const s of separadas) {
    if (s.estado === 'despachada') continue;
    const cliente = norm(s.cliente_nombre) || 'Sin cliente';
    clientes.add(cliente);
    const k = clave(s);
    if (!porProducto.has(k)) porProducto.set(k, new Map());
    const m = porProducto.get(k);
    m.set(cliente, (m.get(cliente) || 0) + 1);
  }
  const cols = [...clientes].sort((a, b) => a.localeCompare(b, 'es'));

  // El rótulo se queda en 'COSTO' porque es el de SU plantilla de Excel y hay una
  // prueba que lo fija (tests/matriz-plantilla.test.mjs). Lo que cambia es el dato
  // de debajo: ahora es el mínimo de ESA línea y no el prorrateo del contenedor,
  // que salía idéntico en todas las filas. Ojo si algún día se renombra: ese
  // número lleva servicios y utilidad dentro, no es el costo de mercancía pelado.
  const FIJAS = ['COD', 'PROVE', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'PRECIO',
                 'INVENTARIO', 'FISICO', 'DESPACHOS', 'SEP', 'DISP'];
  const N = FIJAS.length;
  const nCols = N + cols.length;

  [16, 20, 26, 14, 13, 13, 13, 12, 10, 12, 9, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  cols.forEach((_, i) => { ws.getColumn(N + i + 1).width = 14; });

  // ── Cabecera de tres filas, como en la plantilla ───────────────
  ws.getCell('A1').value = 'INVENTARIO';
  ws.getCell('A1').font = { bold: true, size: 12, color: { argb: INK } };
  ws.getCell('C1').value = 'MATRIZ';
  ws.getCell('C1').font = { bold: true, size: 13, color: { argb: ACCENT } };
  ws.getCell('D1').value = 'FECHA';
  ws.getCell('D1').font = { bold: true, size: 10 };
  ws.getCell('E1').value = hoyStr();
  ws.getRow(1).height = 20;

  // Los dos precios comparten el rótulo "PRECIO" en la fila de encabezados y se
  // distinguen por el sub-rótulo de arriba, igual que en el original.
  ws.getCell(3, 6).value = 'PROMO';
  ws.getCell(3, 7).value = 'ORIGINAL';
  [6, 7].forEach((c) => {
    const cell = ws.getCell(3, c);
    cell.font = { bold: true, size: 9, color: { argb: ACCENT } };
    cell.alignment = { horizontal: 'center' };
  });

  const filaCab = cabecera(ws, 4, [...FIJAS, ...cols]) - 1;

  // Las columnas de cliente van en otro color y en diagonal: así se ve de un
  // golpe dónde termina el inventario y dónde empiezan los clientes, que con
  // veinte columnas es lo único que hace la hoja legible.
  cols.forEach((_, i) => {
    const c = ws.getRow(filaCab).getCell(N + i + 1);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 45 };
  });
  ws.getRow(filaCab).height = 64;

  let fila = filaCab + 1;
  const tot = { inventario: 0, fisico: 0, despachos: 0, sep: 0, disp: 0, porCliente: cols.map(() => 0) };

  for (const f of filas) {
    const r = ws.getRow(fila);
    const promo = Boolean(f.tiene_promocion);
    const precio = num(f.precio_unitario);

    // Sólo una de las dos columnas de precio se llena por fila: si el grupo
    // tiene promoción vigente, el precio que se está aplicando es el de promo;
    // si no, es el original. Dejar la otra en blanco es lo que permite ver de
    // un vistazo qué está rebajado.
    const base = [
      f.contenedor || '', f.proveedor_nombre || '', f.referencia || '', f.calidad || '',
      costoDeLinea(f) || '',
      promo ? precio : '',
      promo ? '' : precio,
      int(f.cantidad), int(f.fisico), int(f.despachadas), int(f.separadas), int(f.disponibles),
    ];
    base.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v === '' ? '' : v;
      c.font = { size: 10, bold: i >= 7 };
      c.alignment = { horizontal: i >= 4 ? 'center' : 'left' };
      if (i >= 4 && i <= 6 && v !== '') c.numFmt = '#,##0';
    });

    const m = porProducto.get(clave(f)) || new Map();
    cols.forEach((cli, i) => {
      const cant = m.get(cli) || 0;
      const c = r.getCell(N + i + 1);
      c.value = cant || '';
      c.alignment = { horizontal: 'center' };
      if (cant) {
        c.font = { size: 10, bold: true, color: { argb: ACCENT } };
        tot.porCliente[i] += cant;
      }
    });

    zebra(ws, fila, nCols);
    tot.inventario += int(f.cantidad);
    tot.fisico     += int(f.fisico);
    tot.despachos  += int(f.despachadas);
    tot.sep        += int(f.separadas);
    tot.disp       += int(f.disponibles);
    fila++;
  }

  // ── Totales en la fila 3, encima de su columna ─────────────────
  const totalEn = (col, valor) => {
    const c = ws.getCell(3, col);
    c.value = valor;
    c.font = { bold: true, size: 11, color: { argb: INK } };
    c.alignment = { horizontal: 'center' };
    c.numFmt = '#,##0';
  };
  totalEn(8,  tot.inventario);
  totalEn(9,  tot.fisico);
  totalEn(10, tot.despachos);
  totalEn(11, tot.sep);
  totalEn(12, tot.disp);
  cols.forEach((_, i) => {
    const c = ws.getCell(3, N + i + 1);
    c.value = tot.porCliente[i] || '';
    c.font = { bold: true, size: 11, color: { argb: ACCENT } };
    c.alignment = { horizontal: 'center' };
  });

  // La cabecera se congela: con cien productos y veinte clientes, desplazarse
  // sin ver los encabezados vuelve la hoja inservible.
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: filaCab }];

  return ws;
}

// ── FALTANTES ─────────────────────────────────────────────────────

// Lo que quedó faltando después de repartir, cliente por cliente. Esta hoja
// existe por una razón muy concreta: la dueña llama a los clientes con un papel
// al lado. La pantalla /faltantes le sirve para consultar y para dar de baja lo
// que ya entregó, pero cuando se sienta a llamar necesita el nombre, la ciudad,
// la cifra y la antigüedad en una hoja que pueda ordenar, filtrar e imprimir
// como filtra todas las suyas.
//
// Va en el grupo de BODEGA y NO en el de internos, y la diferencia no es de
// gusto: aquí van precios de VENTA —los que el cliente ya conoce porque pidió a
// ese precio— y no hay ni un costo ni un margen. Un entregable con costos no
// puede salir de la oficina; éste sí, y de hecho tiene que salir.
//
// Las tres columnas de cantidad se leen en fila y dicen tres cosas distintas:
//   PIDIO   = todo lo que se le llegó a anotar como faltante de ese producto.
//             Crece si en un reparto posterior se le vuelve a quedar debiendo lo
//             mismo, porque el libro consolida UNA sola fila por cliente +
//             referencia + calidad en vez de acumular fila tras fila.
//   RECIBIO = lo que ya se le entregó después y se abonó contra ese faltante.
//   FALTA   = lo que todavía se le queda debiendo hoy. Es la columna del papel.
// OJO: PIDIO − RECIBIO no siempre da FALTA, porque una parte puede haberse dado
// por cerrada sin entregarla (anulada, con su motivo). Cuando eso ocurre la hoja
// lo dice al pie en lugar de callarlo: una resta que no cuadra y que nadie
// explica es exactamente cómo se pierde la confianza en un informe entero.
// CELULAR va pegado a CLIENTE y CIUDAD, no al final de la hoja, y eso no es
// maquetación: esas tres columnas son el bloque «a quién llamo y desde dónde le
// hablo», y se leen juntas de un vistazo antes de marcar. Colgada al final
// habría que recorrer trece columnas con el dedo en cada llamada, que es justo
// el trabajo que esta hoja existe para ahorrar. Es además el orden que pide el
// diseño (CLIENTE, CIUDAD, CELULAR, REFERENCIA, …) y el mismo bloque
// NOMBRE/CIUDAD/DIRECCION/CELULAR que ya usan DESPACHO(BODEGA) y
// SEPARADAS(BODEGA), así que la operación no tiene que aprender un orden nuevo.
const COLS_FALTANTES = ['CLIENTE', 'CIUDAD', 'CELULAR', 'REFERENCIA', 'CALIDAD', 'PIDIO', 'RECIBIO',
                        'FALTA', 'PRECIO', 'VALOR', 'DESDE', 'DIAS', 'REPARTOS'];
// El 14 de CELULAR es el mismo ancho que la columna CELULAR de ANCHOS_BODEGA:
// entra un número colombiano de diez dígitos sin que Excel lo corte.
const ANCHOS_FALTANTES = [26, 16, 14, 24, 14, 8, 9, 8, 14, 16, 12, 7, 10];

// Posición de cada columna, en base 0 (el índice del forEach que pinta la fila);
// ExcelJS numera las celdas desde 1, de ahí el +1 en cada getCell.
//
// Esto NO es adorno y hay que dejarlo escrito para que nadie lo revierta: los
// números de columna estaban a mano (getCell(7), i === 9, mergeCells(…, 6)) y al
// meter CELULAR entre CIUDAD y REFERENCIA todas las columnas de la derecha se
// corrieron un puesto. Con los números a mano el subtotal de FALTA habría caído
// sobre RECIBIO, el formato de moneda sobre la cifra equivocada y el de fecha
// sobre el precio. Nada de eso lanza: la hoja sale, cuadra consigo misma y
// miente, y quien la lea por teléfono le dice a un cliente una cifra que no es.
// Derivándolas del arreglo de cabeceras, añadir o mover una columna vuelve a
// colocarlo todo solo.
const IX = Object.fromEntries(COLS_FALTANTES.map((c, i) => [c, i]));

// Ámbar de la casa: es el color del faltante en toda la aplicación (el token
// --color-warning). Aquí se escribe a mano porque el Excel no conoce los tokens,
// pero es el mismo que ya usan la promoción de la lista de precios y la columna
// SEPARADA del inventario, así que la hoja y la pantalla no se contradicen.
const AMBAR = 'd97706';
const GRIS = '94a3b8';

/**
 * FALTANTES(BODEGA) — una fila por faltante, agrupada por cliente y, dentro de
 * cada cliente, de lo más viejo a lo más nuevo.
 *
 * @param wb         libro de nuevoLibro()
 * @param faltantes  el ARREGLO que viene dentro de la respuesta de
 *                   GET /api/matriz/faltantes (o sea `respuesta.faltantes`, no
 *                   la respuesta entera: ese endpoint devuelve un objeto a
 *                   propósito para que un fallo no se confunda con un cero).
 */
export function hojaFaltantes(wb, faltantes) {
  const ws = wb.addWorksheet('FALTANTES(BODEGA)');
  ANCHOS_FALTANTES.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const N = COLS_FALTANTES.length;

  // Si llega cualquier cosa que no sea un arreglo se trata como hoja vacía en
  // vez de reventar. Un error aquí no se lleva por delante esta hoja sola: se
  // lleva el libro entero, y con él las tres hojas de bodega que sí estaban
  // bien. Quién decide si la consulta era fiable es quien llama —Entregables.jsx
  // no genera esta hoja si GET /matriz/faltantes falló—, así que un arreglo
  // vacío que llega hasta aquí significa de verdad que no se le queda debiendo
  // nada a nadie, y eso sí se puede escribir.
  const esArreglo = Array.isArray(faltantes);
  const filas = esArreglo ? [...faltantes] : [];

  let fila = titulo(ws, `LO QUE QUEDÓ FALTANDO — ${hoyStr()}`, N);

  // Este renglón no es decoración. El precio de un faltante es el de CUANDO se
  // pidió y no se actualiza nunca —fue una decisión de producto explícita—, así
  // que el VALOR de esta hoja no es lo que costaría reponerlo hoy. Sin la
  // advertencia, alguien compara este total contra la lista de precios vigente,
  // ve que no cuadra y decide que la hoja está mal.
  ws.mergeCells(fila, 1, fila, N);
  ws.getCell(fila, 1).value =
    'PRECIO y VALOR van al precio de cuando se pidió, no al de hoy. FALTA es lo que todavía se le queda debiendo.';
  ws.getCell(fila, 1).font = { size: 10, italic: true, color: { argb: '64748b' } };
  ws.getCell(fila, 1).alignment = { horizontal: 'center' };
  fila++;

  const filaCab = fila;
  fila = cabecera(ws, fila, COLS_FALTANTES);

  // Orden: por cliente y, dentro del cliente, lo más viejo primero. Es el orden
  // en el que se llama por teléfono —se abre por el cliente y se empieza por lo
  // que lleva más tiempo esperando— y es el mismo criterio de antigüedad de la
  // pantalla de seguimiento, para que las dos cuenten la misma historia.
  // El desempate por cliente_id existe porque dos clientes pueden llamarse
  // exactamente igual: sin él sus filas se intercalarían y acabarían sumadas en
  // el mismo pie, que es un error que nadie detectaría leyendo la hoja.
  const tiempo = (f) => { const d = aFecha(f.created_at); return d ? d.getTime() : 0; };
  filas.sort((a, b) =>
    norm(a.cliente_nombre).localeCompare(norm(b.cliente_nombre), 'es')
    || int(a.cliente_id) - int(b.cliente_id)
    || tiempo(a) - tiempo(b)
    || int(a.id) - int(b.id));

  let grupo = null;          // { clave, nombre } del cliente que se está pintando
  let subUds = 0, subValor = 0;
  let totUds = 0, totValor = 0, totAnuladas = 0, totCerradas = 0;

  // Pie de cliente: «Total MARIA · 7 · $12.100.000». Es la línea que se lee en
  // voz alta al llamar, y la que dice si vale la pena mover un despacho por ese
  // cliente o esperar al siguiente contenedor.
  const pieCliente = () => {
    if (!grupo) return;
    const r = ws.getRow(fila);
    r.height = 20;
    // Se fusiona todo lo que hay a la IZQUIERDA de FALTA, sea cual sea el número
    // de columnas: así el subtotal siempre cae debajo de su propia cabecera.
    ws.mergeCells(fila, 1, fila, IX.FALTA);
    r.getCell(1).value = `Total ${grupo.nombre}`;
    r.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    r.getCell(IX.FALTA + 1).value = subUds;
    r.getCell(IX.FALTA + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(IX.VALOR + 1).value = subValor;
    r.getCell(IX.VALOR + 1).numFmt = '$#,##0';
    r.getCell(IX.VALOR + 1).alignment = { horizontal: 'right', vertical: 'middle' };
    for (let i = 1; i <= N; i++) {
      r.getCell(i).font = { bold: true, size: 10, color: { argb: ACCENT } };
      r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'eef0fe' } };
    }
    fila++;
    subUds = 0; subValor = 0;
  };

  for (const f of filas) {
    const clave = `${int(f.cliente_id)}|${norm(f.cliente_nombre).toLowerCase()}`;
    if (!grupo || grupo.clave !== clave) {
      pieCliente();
      grupo = { clave, nombre: norm(f.cliente_nombre) || 'Sin cliente' };
    }

    const pidio = int(f.cantidad_original);
    const recibio = int(f.cantidad_saldada);
    const anulada = int(f.cantidad_anulada);
    const falta = int(f.cantidad_abierta);
    const precio = num(f.precio_unitario_origen);
    const valor = falta * precio;
    const espera = int(f.veces_aplazado);
    // El endpoint devuelve la ciudad como `cliente_ciudad`, que es como sale del
    // JOIN con clientes. Se acepta también `ciudad` por si algún día la
    // respuesta se aplana: la hoja no puede quedarse sin la columna con la que
    // se decide a quién se le despacha junto con quién.
    const ciudad = norm(f.cliente_ciudad ?? f.ciudad);
    // El celular llega como `cliente_telefono`, el nombre exacto con el que
    // GET /api/matriz/faltantes lo saca del JOIN con clientes (igual que
    // `cliente_ciudad`), y se acepta `telefono` a secas por si la respuesta se
    // aplana algún día. Va como TEXTO y no como número a propósito: un celular
    // convertido a número pierde el cero de delante de los fijos con indicativo
    // y, en cuanto pasa de doce dígitos, Excel lo pinta en notación científica.
    // Un teléfono mal escrito en la hoja con la que se llama no es un detalle
    // estético: es la llamada que no se hace.
    const celular = norm(f.cliente_telefono ?? f.telefono);
    // Por defecto se piden sólo los abiertos, pero la hoja tiene que aguantar
    // que le pasen el libro entero con el filtro en "todos" sin mentir: lo ya
    // completado o anulado se pinta en gris y se explica al pie.
    const abierto = String(f.estado || 'abierto').trim().toLowerCase() === 'abierto';
    // DESDE va como fecha de verdad y no como texto, para que se pueda ordenar y
    // filtrar por ella en el propio Excel. Se construye con aFecha() y no con
    // `new Date(...)` a secas por lo de siempre en este proyecto: una fecha de
    // solo día se interpretaría como medianoche UTC y retrocedería un día al
    // pintarla. Comprobado que la celda cae en el mismo día que el DIAS que
    // calcula el servidor, que es lo que importa: si la hoja dijera «11/08» al
    // lado de «29 días» contados desde el 12, la usuaria le daría una fecha
    // equivocada al cliente por teléfono.
    const desde = aFecha(f.created_at);

    const r = ws.getRow(fila);
    r.height = 18;
    // El orden de este arreglo tiene que ser el de COLS_FALTANTES, celda a celda.
    [grupo.nombre, ciudad, celular, norm(f.referencia), norm(f.calidad),
     pidio, recibio, falta, precio, valor,
     desde || '', int(f.dias_abierto), espera].forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v ?? '';
      c.font = { size: 10, italic: !abierto, color: { argb: abierto ? INK : GRIS } };
      c.alignment = {
        horizontal: i <= IX.CALIDAD ? 'left' : (i === IX.PRECIO || i === IX.VALOR ? 'right' : 'center'),
        vertical: 'middle',
      };
      if (i === IX.PRECIO || i === IX.VALOR) c.numFmt = '$#,##0';
      if (i === IX.DESDE) c.numFmt = 'dd/mm/yyyy';
    });

    // FALTA en ámbar y en negrita: es la única columna que se busca con el dedo
    // al barrer la hoja, y pintarla igual que el resto obliga a leer las trece.
    // En rojo no: quedar faltando no es un fallo, es el hecho que se está
    // registrando, y el rojo de esta aplicación significa «esto salió mal».
    if (abierto && falta > 0) r.getCell(IX.FALTA + 1).font = { size: 10, bold: true, color: { argb: AMBAR } };
    // Tres repartos o más esperando es la escalada que la pantalla marca con un
    // triángulo. Aquí no hay iconos, así que la cifra de REPARTOS se pinta en
    // ámbar: es lo que convierte «se le debe algo» en «hay que llamarle ya».
    if (abierto && espera >= 3) r.getCell(IX.REPARTOS + 1).font = { size: 10, bold: true, color: { argb: AMBAR } };

    zebra(ws, fila, N);
    fila++;

    subUds += falta; subValor += valor;
    totUds += falta; totValor += valor;
    totAnuladas += anulada;
    if (!abierto) totCerradas++;
  }
  pieCliente();

  // Total general. Va con el mismo bloque oscuro que cierra todas las demás
  // hojas del libro, para que se lea como el mismo documento.
  const t = ws.getRow(fila);
  t.height = 22;
  ws.mergeCells(fila, 1, fila, IX.FALTA);
  t.getCell(1).value = 'TOTAL FALTANDO';
  t.getCell(IX.FALTA + 1).value = totUds;
  t.getCell(IX.VALOR + 1).value = totValor;
  t.getCell(IX.VALOR + 1).numFmt = '$#,##0';
  for (let i = 1; i <= N; i++) {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    // Aquí `i` es base 1 (lo pide getCell), de ahí el +1 sobre el índice de IX.
    t.getCell(i).alignment = { horizontal: i === IX.FALTA + 1 ? 'center' : 'right', vertical: 'middle' };
  }
  fila += 2;

  const nota = (texto, color) => {
    ws.mergeCells(fila, 1, fila, N);
    ws.getCell(fila, 1).value = texto;
    ws.getCell(fila, 1).font = { size: 10, italic: true, color: { argb: color } };
    fila++;
  };

  if (esArreglo && filas.length === 0) {
    // Este cero SÍ se puede escribir: la hoja sólo se genera cuando la consulta
    // respondió de verdad, y un arreglo vacío es un dato bueno. La frase va en
    // palabras y no en un total en blanco porque una hoja vacía sin explicación
    // se lee como «esto no cargó».
    nota('No se le está quedando debiendo mercancía a nadie.', '16a34a');
  }
  if (!esArreglo) {
    // La única forma de llegar aquí es que alguien pase la RESPUESTA entera de
    // GET /matriz/faltantes en vez del arreglo de dentro. Es un error muy fácil
    // de cometer —el endpoint devuelve un objeto a propósito— y si esta hoja se
    // callara imprimiría la frase verde de arriba: un papel firmado diciendo que
    // no se le debe nada a nadie, construido sobre un dato que nunca se leyó.
    // Antes que eso, la hoja se acusa a sí misma.
    nota('NO SE PUDO LEER LO QUE QUEDÓ FALTANDO. Esta hoja está vacía porque no llegaron los datos, NO porque no se le quede debiendo nada a nadie.', 'ef4444');
  }
  if (totAnuladas > 0) {
    nota(`Se dieron por cerradas ${totAnuladas} paca(s) sin entregarlas. Por eso hay filas donde PIDIO menos RECIBIO no da FALTA.`, AMBAR);
  }
  if (totCerradas > 0) {
    nota(`Hay ${totCerradas} fila(s) en gris: ya están completadas o anuladas y de ésas no se le queda debiendo nada.`, GRIS);
  }

  // La cabecera se congela. Con cuarenta faltantes repartidos entre quince
  // clientes, bajar y perder de vista cuál columna es FALTA y cuál RECIBIO es la
  // forma más fácil de prometerle a alguien lo que ya se le entregó.
  //
  // Y con CELULAR la hoja pasó de doce columnas a trece, así que ahora se congela
  // también en horizontal, igual que la MATRIZ: xSplit deja fijo el bloque
  // CLIENTE · CIUDAD · CELULAR mientras se corre a la derecha hasta DIAS y
  // REPARTOS. Sin eso, el dato con el que se marca el teléfono se sale de la
  // pantalla justo al mirar la antigüedad, que es la pareja de columnas que se
  // consultan a la vez para decidir a quién se llama primero.
  ws.views = [{ state: 'frozen', xSplit: IX.CELULAR + 1, ySplit: filaCab }];

  return ws;
}

// ── CLIENTES ──────────────────────────────────────────────────────

/** LISTADEPRECIOS(CLIENTES) — lo que se manda por WhatsApp. */
export function hojaListaPreciosClientes(wb, filas, tasa = 0) {
  const ws = wb.addWorksheet('LISTADEPRECIOS(CLIENTES)');
  // Con tasa se agregan las dos columnas en dólares, que es como negocian
  // algunos clientes; sin tasa la hoja queda igual que antes.
  const enUSD = num(tasa) > 0;
  const nCols = enUSD ? 6 : 4;
  const anchos = enUSD ? [26, 16, 16, 16, 16, 16] : [26, 16, 16, 16];
  anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let fila = titulo(ws, `LISTA DE PRECIOS — ${hoyStr()}`, nCols);

  if (enUSD) {
    ws.mergeCells(fila, 1, fila, nCols);
    ws.getCell(fila, 1).value = `Tasa aplicada: 1 US$ = ${num(tasa).toLocaleString('es-CO')} COP`;
    ws.getCell(fila, 1).font = { size: 10, italic: true, color: { argb: '64748b' } };
    ws.getCell(fila, 1).alignment = { horizontal: 'center' };
    fila++;
  }

  fila = cabecera(ws, fila, enUSD
    ? ['REFERENCIA', 'CALIDAD', 'PRECIO COP', 'PROMO COP', 'PRECIO US$', 'PROMO US$']
    : ['REFERENCIA', 'CALIDAD', 'PRECIO', 'PROMO']);

  for (const f of filas) {
    const r = ws.getRow(fila);
    const precio = num(f.precio);
    const promo = f.precio_promocion != null ? num(f.precio_promocion) : null;

    r.getCell(1).value = f.referencia || '';
    r.getCell(2).value = f.calidad || '';
    r.getCell(3).value = precio;
    r.getCell(3).numFmt = '$#,##0';
    r.getCell(4).value = promo != null ? promo : '';
    if (promo != null) {
      r.getCell(4).numFmt = '$#,##0';
      r.getCell(4).font = { bold: true, color: { argb: 'd97706' } };
    }

    if (enUSD) {
      r.getCell(5).value = precio / num(tasa);
      r.getCell(5).numFmt = '#,##0.00';
      r.getCell(6).value = promo != null ? promo / num(tasa) : '';
      if (promo != null) {
        r.getCell(6).numFmt = '#,##0.00';
        r.getCell(6).font = { bold: true, color: { argb: 'd97706' } };
      }
    }

    for (let i = 3; i <= nCols; i++) r.getCell(i).alignment = { horizontal: 'right' };
    zebra(ws, fila, nCols);
    fila++;
  }
  return ws;
}

/**
 * COTIZACION(CLIENTES) — una hoja por cotización, con el mismo bloque de
 * totales, fletes, abonos y saldo del Excel original.
 */
export function hojaCotizacionCliente(wb, cot, nombreHoja) {
  const ws = wb.addWorksheet(nombreHoja || 'COTIZACION(CLIENTES)');
  [26, 16, 16, 12, 18, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const tasa = num(cot.tasa_usd) || num(cot.tasa) || 0;

  ws.getCell('A1').value = cot.cliente_nombre || '';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('B1').value = cot.created_at ? new Date(cot.created_at) : new Date();
  ws.getCell('B1').numFmt = 'dd/mm/yyyy';
  ws.getCell('E1').value = 'TASA';
  ws.getCell('E1').font = { bold: true, size: 10 };
  ws.getCell('F1').value = tasa || '';

  // Destino acordado en la cotización (puede no ser el mismo cliente).
  const destino = [cot.destinatario, cot.ciudad_entrega, cot.direccion_entrega, cot.celular]
    .map(norm).filter(Boolean);
  let filaInicio = 3;
  if (destino.length || norm(cot.tipo_transporte)) {
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value =
      'ENVIAR A: ' + (destino.join(' · ') || '—') +
      (norm(cot.tipo_transporte) ? `  ·  Transporte: ${cot.tipo_transporte}` : '');
    ws.getCell('A2').font = { size: 10, bold: true, color: { argb: ACCENT } };
    filaInicio = 4;
  }

  let fila = cabecera(ws, filaInicio, ['REFERENCIA', 'CALIDAD', 'PRECIO', 'CANTIDAD', 'TOTAL', 'US$']);

  let subtotal = 0;
  for (const d of (cot.detalles || [])) {
    const cant = int(d.cantidad);
    const precio = num(d.precio_unitario);
    const tot = num(d.subtotal) || cant * precio;
    const r = ws.getRow(fila);
    r.getCell(1).value = d.referencia || d.tipo || '';
    r.getCell(2).value = d.calidad || '';
    r.getCell(3).value = precio;
    r.getCell(4).value = cant;
    r.getCell(5).value = tot;
    r.getCell(6).value = tasa > 0 ? tot / tasa : '';
    [3, 5].forEach(i => { r.getCell(i).numFmt = '$#,##0'; });
    r.getCell(6).numFmt = '#,##0.00';
    [3, 4, 5, 6].forEach(i => { r.getCell(i).alignment = { horizontal: 'right' }; });
    r.getCell(4).alignment = { horizontal: 'center' };
    zebra(ws, fila, 6);
    subtotal += tot;
    fila++;
  }

  const fletes = num(cot.transporte);
  const descuento = num(cot.descuento);
  const total = num(cot.total) || (subtotal - descuento + fletes);

  const linea = (label, valor, destacada = false) => {
    const r = ws.getRow(fila);
    ws.mergeCells(fila, 1, fila, 4);
    r.getCell(1).value = label;
    r.getCell(1).alignment = { horizontal: 'right' };
    r.getCell(1).font = { bold: true, size: destacada ? 12 : 10 };
    r.getCell(5).value = valor;
    r.getCell(5).numFmt = '$#,##0';
    r.getCell(5).font = { bold: true, size: destacada ? 12 : 10 };
    r.getCell(5).alignment = { horizontal: 'right' };
    r.getCell(6).value = tasa > 0 ? valor / tasa : '';
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(6).alignment = { horizontal: 'right' };
    if (destacada) {
      for (let i = 1; i <= 6; i++) {
        r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      }
    }
    fila++;
  };

  linea('TOTAL', subtotal);
  if (descuento > 0) linea('DESCUENTO', -descuento);
  linea('FLETES', fletes);
  linea('TOTAL', total, true);

  fila++;
  ws.getCell(fila, 1).value = 'ABONOS';
  ws.getCell(fila, 1).font = { bold: true, size: 11, color: { argb: ACCENT } };
  fila++;

  let abonado = 0;
  const abonos = cot.abonos || [];
  if (abonos.length === 0) {
    ws.getCell(fila, 1).value = 'FECHA';
    ws.getCell(fila, 2).value = 'MEDIO';
    ws.getCell(fila, 6).value = 0;
    fila++;
  } else {
    for (const a of abonos) {
      const r = ws.getRow(fila);
      r.getCell(1).value = a.fecha ? new Date(a.fecha) : '';
      r.getCell(1).numFmt = 'dd/mm/yyyy';
      r.getCell(2).value = a.metodo_pago || '';
      r.getCell(6).value = num(a.monto);
      r.getCell(6).numFmt = '$#,##0';
      r.getCell(6).alignment = { horizontal: 'right' };
      abonado += num(a.monto);
      fila++;
    }
  }

  const r = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 5);
  r.getCell(1).value = 'SALDO PENDIENTE';
  r.getCell(1).alignment = { horizontal: 'right' };
  r.getCell(6).value = total - abonado;
  r.getCell(6).numFmt = '$#,##0';
  r.getCell(6).alignment = { horizontal: 'right' };
  for (let i = 1; i <= 6; i++) {
    r.getCell(i).font = { bold: true, size: 12, color: { argb: WHITE } };
    r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  }
  r.height = 24;
  return ws;
}

/**
 * CARTERA(CLIENTES) — una línea por producto comprado, con el medio de pago
 * y el saldo corriente. Es el estado de cuenta que se le manda al cliente.
 */
export function hojaCarteraCliente(wb, data, nombreHoja) {
  const ws = wb.addWorksheet(nombreHoja || 'CARTERA(CLIENTES)');
  [24, 14, 14, 8, 16, 14, 16, 16, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let fila = titulo(ws, `${data.cliente?.nombre || 'Cliente'} — Estado de cuenta ${hoyStr()}`, 10);
  fila = cabecera(ws, fila, ['REFERENCIA', 'CALIDAD', 'PRECIO', 'CANT', 'TOTAL', 'TIPO DE PAGO', 'BANCO', 'CUENTA', 'ABONO', 'SALDO']);

  for (const m of (data.movimientos || [])) {
    const esVenta = m.tipo === 'VENTA';
    if (esVenta && (m.detalles || []).length) {
      for (const d of m.detalles) {
        const r = ws.getRow(fila);
        r.getCell(1).value = d.referencia || '';
        r.getCell(2).value = d.calidad || '';
        r.getCell(3).value = num(d.precio_unitario);
        r.getCell(4).value = int(d.cantidad);
        r.getCell(5).value = num(d.subtotal);
        r.getCell(6).value = m.metodo_pago || '';
        [3, 5].forEach(i => { r.getCell(i).numFmt = '$#,##0'; });
        r.getCell(4).alignment = { horizontal: 'center' };
        [3, 5].forEach(i => { r.getCell(i).alignment = { horizontal: 'right' }; });
        zebra(ws, fila, 10);
        fila++;
      }
      // Saldo tras la venta
      ws.getCell(fila - 1, 10).value = num(m.saldo);
      ws.getCell(fila - 1, 10).numFmt = '$#,##0';
      ws.getCell(fila - 1, 10).font = { bold: true };
      ws.getCell(fila - 1, 10).alignment = { horizontal: 'right' };
    } else {
      const r = ws.getRow(fila);
      r.getCell(1).value = m.tipo === 'ABONO' ? 'ABONO' : (m.descripcion || m.tipo);
      r.getCell(6).value = m.metodo_pago || '';
      r.getCell(7).value = m.banco || '';
      r.getCell(8).value = m.referencia || '';
      r.getCell(9).value = num(m.monto);
      r.getCell(9).numFmt = '$#,##0';
      r.getCell(9).font = { bold: true, color: { argb: '16a34a' } };
      r.getCell(10).value = num(m.saldo);
      r.getCell(10).numFmt = '$#,##0';
      r.getCell(10).font = { bold: true };
      [9, 10].forEach(i => { r.getCell(i).alignment = { horizontal: 'right' }; });
      zebra(ws, fila, 10);
      fila++;
    }
  }

  const r = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 9);
  r.getCell(1).value = 'SALDO PENDIENTE';
  r.getCell(1).alignment = { horizontal: 'right' };
  r.getCell(10).value = num(data.saldo_pendiente);
  r.getCell(10).numFmt = '$#,##0';
  r.getCell(10).alignment = { horizontal: 'right' };
  for (let i = 1; i <= 10; i++) {
    r.getCell(i).font = { bold: true, size: 12, color: { argb: WHITE } };
    r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  }
  r.height = 24;
  return ws;
}

// ── INTERNOS ──────────────────────────────────────────────────────

/** CARTERA(INTERNA) — quién debe cuánto, para revisión propia. */
export function hojaCarteraInterna(wb, filas) {
  const ws = wb.addWorksheet('CARTERA(INTERNA)');
  [34, 18, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let fila = titulo(ws, `CARTERA — ${hoyStr()}`, 4);
  fila = cabecera(ws, fila, ['CLIENTE', 'VENDIDO', 'ABONADO', 'CARTERA']);

  let tv = 0, ta = 0, ts = 0;
  for (const c of filas) {
    const vend = num(c.total_vendido), ab = num(c.total_abonado), sal = num(c.saldo_pendiente);
    const r = ws.getRow(fila);
    r.getCell(1).value = c.nombre || '';
    r.getCell(2).value = vend;
    r.getCell(3).value = ab;
    r.getCell(4).value = sal;
    [2, 3, 4].forEach(i => {
      r.getCell(i).numFmt = '$#,##0';
      r.getCell(i).alignment = { horizontal: 'right' };
    });
    r.getCell(4).font = { bold: true, color: { argb: sal > 0 ? 'dc2626' : '16a34a' } };
    zebra(ws, fila, 4);
    tv += vend; ta += ab; ts += sal;
    fila++;
  }

  const r = ws.getRow(fila);
  r.getCell(1).value = 'TOTAL';
  [tv, ta, ts].forEach((v, i) => { r.getCell(i + 2).value = v; r.getCell(i + 2).numFmt = '$#,##0'; });
  for (let i = 1; i <= 4; i++) {
    r.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    r.getCell(i).alignment = { horizontal: i === 1 ? 'left' : 'right' };
  }
  return ws;
}

/** LISTADISPONIBLES(INTERNA) — la lista de precios con su clasificación. */
export function hojaListaDisponiblesInterna(wb, filas) {
  const ws = wb.addWorksheet('LISTADISPONIBLES(INTERNA)');
  [10, 18, 16, 24, 14, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const totalDisp = filas.reduce((s, f) => s + int(f.disponibles), 0);
  ws.getCell('A1').value = 'TOTAL DISP';
  ws.getCell('A1').font = { bold: true, size: 10 };
  ws.getCell('B1').value = totalDisp;
  ws.getCell('B1').font = { bold: true, size: 12, color: { argb: ACCENT } };

  let fila = cabecera(ws, 2, ['DISP', 'CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'PRECIO', 'PROMO']);

  for (const f of filas) {
    const r = ws.getRow(fila);
    r.getCell(1).value = int(f.disponibles);
    r.getCell(2).value = f.categoria || '';
    r.getCell(3).value = f.clasificacion || '';
    r.getCell(4).value = f.referencia || '';
    r.getCell(5).value = f.calidad || '';
    r.getCell(6).value = num(f.precio);
    r.getCell(7).value = f.precio_promocion != null ? num(f.precio_promocion) : '';
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(1).font = { bold: true };
    [6, 7].forEach(i => { r.getCell(i).numFmt = '$#,##0'; r.getCell(i).alignment = { horizontal: 'right' }; });
    zebra(ws, fila, 7);
    fila++;
  }
  return ws;
}

/** INVENTARIO(INTERNO) — con costo, precio y sus totales. */
export function hojaInventarioInterno(wb, filas) {
  const ws = wb.addWorksheet('INVENTARIO(INTERNO)');
  [18, 16, 24, 14, 14, 14, 8, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let fila = titulo(ws, `INVENTARIO TOTAL Y DISPONIBLE — ${hoyStr()}`, 9);
  // Mismo rótulo que la hoja MATRIZ, y el mismo dato debajo: el mínimo por línea.
  fila = cabecera(ws, fila, ['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'DISP', 'COSTO TOTAL', 'PRECIO TOTAL']);

  let ct = 0, pt = 0, disp = 0;
  for (const f of filas) {
    const d = int(f.disponibles);
    const costo = costoDeLinea(f);
    const precio = num(f.precio_unitario);
    const r = ws.getRow(fila);
    [f.categoria, f.clasificacion, f.referencia, f.calidad, costo || '', precio, d, costo * d || '', precio * d]
      .forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v ?? '';
        if ([4, 5, 7, 8].includes(i)) { c.numFmt = '$#,##0'; c.alignment = { horizontal: 'right' }; }
        if (i === 6) { c.alignment = { horizontal: 'center' }; c.font = { bold: true }; }
      });
    zebra(ws, fila, 9);
    ct += costo * d; pt += precio * d; disp += d;
    fila++;
  }

  const r = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 6);
  r.getCell(1).value = 'TOTAL';
  r.getCell(7).value = disp;
  r.getCell(8).value = ct;
  r.getCell(9).value = pt;
  [8, 9].forEach(i => { r.getCell(i).numFmt = '$#,##0'; });
  for (let i = 1; i <= 9; i++) {
    r.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    r.getCell(i).alignment = { horizontal: i === 1 ? 'right' : i === 7 ? 'center' : 'right' };
  }
  return ws;
}

/**
 * PRECIOSINTERNOS — cómo se arma el precio de venta a partir del costo del
 * contenedor más los gastos y la utilidad que se le fijaron por unidad.
 */
export function hojaPreciosInternos(wb, cont, nombreHoja) {
  const ws = wb.addWorksheet(nombreHoja || 'PRECIOSINTERNOS');
  [22, 14, 22, 14, 12, 16, 16, 16, 16, 18, 16, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const tasa = num(cont.tasa_conversion) || 1;
  const utilU = num(cont.utilidad_unitaria);
  const gastosU = num(cont.gastos_unitarios);

  ws.getCell('A1').value = 'FECHA';
  ws.getCell('B1').value = hoyStr();
  [['Utilidad Unitaria', utilU], ['Gastos Unitarios', gastosU], ['Valor Dolar', tasa]]
    .forEach(([k, v], i) => {
      ws.getCell(i + 1, 3).value = k;
      ws.getCell(i + 1, 3).font = { bold: true, size: 10 };
      ws.getCell(i + 1, 4).value = v;
      ws.getCell(i + 1, 4).numFmt = i === 2 ? '#,##0.00' : '$#,##0';
      ws.getCell(i + 1, 4).font = { bold: true, color: { argb: ACCENT } };
    });

  let fila = titulo(ws, `CONTENEDOR ${cont.numero || ''}`, 13, 5);
  fila = cabecera(ws, fila, [
    'PROVEEDOR', 'CLASE', 'REFERENCIA', 'CALIDAD', 'CANTIDAD',
    'Costo Unitario US$', 'Costo Total US$', 'Costo Unitario CO$', 'Costo Total CO$',
    'Total Otros Gastos CO$', 'Utilidad Total CO$', 'Precio de Venta Unitario CO$', 'Precio de Venta Total CO$',
  ]);

  for (const prov of (cont.proveedores_mercancia || [])) {
    const esUSD = (prov.moneda || 'USD') === 'USD';
    for (const d of (prov.detalles || [])) {
      const cant = int(d.cantidad_final ?? d.cantidad);
      const cuOrig = num(d.costo_unitario);
      const cuUSD = esUSD ? cuOrig : (tasa ? cuOrig / tasa : 0);
      const cuCOP = esUSD ? cuOrig * tasa : cuOrig;
      // Precio de venta = costo + gastos + utilidad, por unidad.
      const pvU = cuCOP + gastosU + utilU;
      const r = ws.getRow(fila);
      [prov.proveedor_nombre, d.clasificacion, d.referencia, d.calidad, cant,
       cuUSD, cuUSD * cant, cuCOP, cuCOP * cant,
       gastosU * cant, utilU * cant, pvU, pvU * cant].forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v ?? '';
        if (i >= 5) { c.numFmt = i === 5 || i === 6 ? '#,##0.00' : '$#,##0'; c.alignment = { horizontal: 'right' }; }
        if (i === 4) c.alignment = { horizontal: 'center' };
        c.font = { size: 10, bold: i === 11 };
      });
      zebra(ws, fila, 13);
      fila++;
    }
  }
  return ws;
}

/** UTILIDADCONT — la utilidad del contenedor y su reparto. */
export function hojaUtilidadContenedor(wb, cont, nombreHoja, inversionistas = []) {
  const ws = wb.addWorksheet(nombreHoja || 'UTILIDADCONT');
  [30, 20, 18, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const pacas = int(cont.total_pacas_recibidas) || int(cont.total_pacas);
  const utilU = num(cont.utilidad_unitaria);
  const tasa = num(cont.tasa_conversion) || 1;
  const inversion = num(cont.costo_total);

  let fila = titulo(ws, `CONTENEDOR ${cont.numero || ''} — ${hoyStr()}`, 5);

  const filas = [
    ['PACAS', pacas, ''],
    ['UTILIDAD/PACA', utilU, '$#,##0'],
    ['UTILIDAD/CONTENEDOR', utilU * pacas, '$#,##0'],
    ['TASA', tasa, '#,##0.00'],
    ['TOTAL INVERSIÓN', inversion, '$#,##0'],
  ];
  for (const [k, v, fmtc] of filas) {
    const r = ws.getRow(fila);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true, size: 11 };
    r.getCell(2).value = v;
    if (fmtc) r.getCell(2).numFmt = fmtc;
    r.getCell(2).font = { bold: true, size: 12, color: { argb: k.startsWith('UTILIDAD') ? '16a34a' : INK } };
    r.getCell(2).alignment = { horizontal: 'right' };
    if (k === 'UTILIDAD/CONTENEDOR') {
      [1, 2].forEach(i => { r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; });
    }
    r.height = 20;
    fila++;
  }

  // Reparto entre inversionistas. El porcentaje y la utilidad NO se guardan en
  // ninguna tabla: se derivan del aporte contra la inversión total, igual que en
  // el módulo de Utilidad, para que las dos vistas no puedan discrepar.
  const utilidadTotal = utilU * pacas;

  fila++;
  ws.getCell(fila, 1).value = 'Reparto entre inversionistas';
  ws.getCell(fila, 1).font = { bold: true, size: 11, color: { argb: ACCENT } };
  fila++;
  fila = cabecera(ws, fila, ['INVERSIONISTA', 'APORTE CO$', 'PORCENTAJE', 'UTILIDAD CO$', 'UTILIDAD US$']);

  if (!inversionistas.length) {
    ws.getCell(fila, 1).value = 'Sin inversionistas registrados en este contenedor';
    ws.getCell(fila, 1).font = { italic: true, size: 10, color: { argb: '94a3b8' } };
    return ws;
  }

  const acum = { cop: 0, pct: 0, utilCop: 0, utilUsd: 0 };

  for (const inv of inversionistas) {
    const cop = num(inv.aporte_cop);
    const pct = inversion > 0 ? (cop / inversion) * 100 : 0;
    const utilCop = utilidadTotal * (pct / 100);
    const utilUsd = tasa > 0 ? utilCop / tasa : 0;

    const r = ws.getRow(fila);
    r.height = 18;
    r.getCell(1).value = inv.inversionista_nombre || inv.nombre || '—';
    r.getCell(2).value = cop;
    r.getCell(3).value = pct / 100;
    r.getCell(4).value = utilCop;
    r.getCell(5).value = utilUsd;
    r.getCell(2).numFmt = '$#,##0';
    r.getCell(3).numFmt = '0.00%';
    r.getCell(4).numFmt = '$#,##0';
    r.getCell(5).numFmt = 'US$ #,##0.00';
    for (let i = 1; i <= 5; i++) {
      r.getCell(i).font = { size: 10 };
      r.getCell(i).alignment = { horizontal: i === 1 ? 'left' : 'right', vertical: 'middle' };
    }
    zebra(ws, fila, 5);

    acum.cop += cop; acum.pct += pct; acum.utilCop += utilCop; acum.utilUsd += utilUsd;
    fila++;
  }

  // La fila de totales delata de un vistazo si falta capital por asignar: si el
  // porcentaje no llega a 100, hay inversión del contenedor sin inversionista.
  const t = ws.getRow(fila);
  t.height = 20;
  t.getCell(1).value = 'TOTAL';
  t.getCell(2).value = acum.cop;
  t.getCell(3).value = acum.pct / 100;
  t.getCell(4).value = acum.utilCop;
  t.getCell(5).value = acum.utilUsd;
  t.getCell(2).numFmt = '$#,##0';
  t.getCell(3).numFmt = '0.00%';
  t.getCell(4).numFmt = '$#,##0';
  t.getCell(5).numFmt = 'US$ #,##0.00';
  for (let i = 1; i <= 5; i++) {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    t.getCell(i).alignment = { horizontal: i === 1 ? 'left' : 'right', vertical: 'middle' };
  }
  fila++;

  if (acum.pct < 99.5) {
    ws.getCell(fila, 1).value = `Falta por asignar el ${(100 - acum.pct).toFixed(2)}% de la inversión`;
    ws.getCell(fila, 1).font = { italic: true, size: 10, color: { argb: 'd97706' } };
  }

  return ws;
}

/** Descarga un workbook con el nombre indicado. */
export async function descargar(wb, nombre) {
  const buffer = await wb.xlsx.writeBuffer();
  descargarExcel(buffer, `${nombre}_${hoy()}.xlsx`);
}

export function nuevoLibro() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercio Global Logístico';
  wb.created = new Date();
  return wb;
}
