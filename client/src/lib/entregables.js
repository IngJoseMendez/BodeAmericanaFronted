import ExcelJS from 'exceljs';
import { hoy } from './fecha.js';

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

const COLS_BODEGA = ['CLASIFICACION', 'CATEGORIA', 'REFERENCIA', 'CALIDAD', 'CAN', 'NOMBRE', 'CIUDAD', 'DIRECCION', 'CELULAR', 'TRANSP.'];
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
      [g.clasificacion, g.categoria, g.referencia, g.calidad, g.cantidad,
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
      [g.clasificacion, g.categoria, g.referencia, g.calidad, g.cantidad,
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
  fila = cabecera(ws, fila, ['CLASIFICACION', 'CATEGORIA', 'REFERENCIA', 'CALIDAD', 'FISICO', 'SEPARADA', 'DISP']);

  let fisico = 0, sep = 0, disp = 0;
  for (const f of filas) {
    const r = ws.getRow(fila);
    [f.clasificacion, f.categoria, f.referencia, f.calidad,
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

  // Clave de cruce entre inventario y separadas. Deliberadamente NO incluye
  // familia ni categoría: aunque las dos fuentes ya las devuelven, quedan vacías
  // en las pacas creadas antes de asignarle familia a la categoría, y una clave
  // con un campo nulo no cruza. Con estos tres campos la matriz siempre cuadra;
  // la familia se muestra en su columna, tomada de la fila de inventario.
  const clave = (r) => [norm(r.clasificacion), norm(r.referencia), norm(r.calidad)]
    .join('||').toLowerCase();

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

  const FIJAS = ['FAMILIA', 'CLASIFICACION', 'CATEGORIA', 'REFERENCIA', 'CALIDAD', 'FISICO', 'SEPARADA', 'DISP'];
  const nCols = FIJAS.length + cols.length;

  [16, 18, 16, 24, 14, 10, 11, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  cols.forEach((_, i) => { ws.getColumn(FIJAS.length + i + 1).width = 16; });

  let fila = titulo(ws, `INVENTARIO Y SEPARADAS POR CLIENTE — ${hoyStr()}`, nCols);
  fila = cabecera(ws, fila, [...FIJAS, ...cols]);
  const filaCab = fila - 1;

  // Las columnas de cliente se distinguen con otro color para que se lea dónde
  // termina el inventario y empiezan los clientes.
  cols.forEach((_, i) => {
    const c = ws.getRow(filaCab).getCell(FIJAS.length + i + 1);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 45 };
  });
  ws.getRow(filaCab).height = 64;

  const totales = { fisico: 0, sep: 0, disp: 0, porCliente: cols.map(() => 0) };

  for (const f of filas) {
    const r = ws.getRow(fila);
    const base = [
      f.familia || '', f.clasificacion || '', f.categoria || '', f.referencia || '', f.calidad || '',
      int(f.fisico), int(f.separadas), int(f.disponibles),
    ];
    base.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v ?? '';
      c.font = { size: 10, bold: i >= 5 };
      c.alignment = { horizontal: i >= 5 ? 'center' : 'left' };
    });

    const m = porProducto.get(clave(f)) || new Map();
    cols.forEach((cli, i) => {
      const cant = m.get(cli) || 0;
      const c = r.getCell(FIJAS.length + i + 1);
      c.value = cant || '';
      c.alignment = { horizontal: 'center' };
      if (cant) {
        c.font = { size: 10, bold: true, color: { argb: 'd97706' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fdf3e6' } };
      }
      totales.porCliente[i] += cant;
    });

    totales.fisico += int(f.fisico);
    totales.sep += int(f.separadas);
    totales.disp += int(f.disponibles);
    fila++;
  }

  const t = ws.getRow(fila);
  ws.mergeCells(fila, 1, fila, 5);
  t.getCell(1).value = 'TOTAL';
  t.getCell(6).value = totales.fisico;
  t.getCell(7).value = totales.sep;
  t.getCell(8).value = totales.disp;
  cols.forEach((_, i) => { t.getCell(FIJAS.length + i + 1).value = totales.porCliente[i] || ''; });
  for (let i = 1; i <= nCols; i++) {
    t.getCell(i).font = { bold: true, size: 11, color: { argb: WHITE } };
    t.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    t.getCell(i).alignment = { horizontal: i === 1 ? 'right' : 'center' };
  }
  t.height = 22;

  // Se congelan las columnas de inventario para poder desplazarse entre clientes
  // sin perder de vista de qué producto se está hablando.
  ws.views = [{ state: 'frozen', xSplit: FIJAS.length, ySplit: filaCab }];
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

  let fila = cabecera(ws, 2, ['DISP', 'CLASIFICACION', 'CATEGORIA', 'REFERENCIA', 'CALIDAD', 'PRECIO', 'PROMO']);

  for (const f of filas) {
    const r = ws.getRow(fila);
    r.getCell(1).value = int(f.disponibles);
    r.getCell(2).value = f.clasificacion || '';
    r.getCell(3).value = f.categoria || '';
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
  fila = cabecera(ws, fila, ['CLASIFICACION', 'CATEGORIA', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'DISP', 'COSTO TOTAL', 'PRECIO TOTAL']);

  let ct = 0, pt = 0, disp = 0;
  for (const f of filas) {
    const d = int(f.disponibles);
    const costo = num(f.costo_unitario);
    const precio = num(f.precio_unitario);
    const r = ws.getRow(fila);
    [f.clasificacion, f.categoria, f.referencia, f.calidad, costo, precio, d, costo * d, precio * d]
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
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}_${hoy()}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function nuevoLibro() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercio Global Logístico';
  wb.created = new Date();
  return wb;
}
