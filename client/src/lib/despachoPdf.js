// ── EL PAPEL QUE SE LLEVA A LA BODEGA ─────────────────────────────
//
// Esto se imprime, se dobla y se recorre la bodega con él en la mano. Un Excel
// es la herramienta equivocada para eso: las columnas pelean, pagina donde
// quiere, y el que había salía con DOCE columnas a cuerpo 7 repitiendo ciudad,
// dirección, celular, tipo, transportadora y fletes en CADA renglón del mismo
// cliente. Marta con doce líneas llevaba su dirección escrita doce veces, y la
// referencia —lo único que hay que leer para ir a buscar— en letra de seis
// puntos.
//
// EL PAPEL SE PARTE EN DOS PORQUE SON DOS TRABAJOS DISTINTOS:
//
//   1. RECOGER. Ordenado por referencia, con los clientes mezclados a
//      propósito: así la bodega se recorre UNA vez. Cinco columnas, letra
//      grande, y una casilla para marcar lo que ya se sacó. Un papel de
//      recogida sin casilla es un papel que se anota en el margen.
//
//   2. EMPACAR Y ROTULAR. Los datos de entrega, UNA vez por cliente y no una
//      vez por línea. Es el mismo dato; repetirlo doce veces no lo hace más
//      cierto, sólo deja sin espacio a lo que sí cambia.
//
// Y una cosa que el Excel sí lleva y este papel NO: el COSTO. Un papel de
// bodega con costos es justo lo que la separación entre «bodega» e «internos»
// existe para evitar, y para recoger mercancía no sirve de nada. El valor por
// cliente sí va, en el bloque de empacar, porque es lo que se cobra contra
// entrega.
//
// LAS TRES SECCIONES SE EXPORTAN porque el papel se baja de DOS sitios: suelto
// desde Despachos, y dentro del cuaderno de bodega desde Entregables. Con el
// bloque escrito dos veces, el día que se arregle un ancho en uno el otro se
// queda como estaba y nadie se entera hasta compararlos encima de la mesa.

// Importe NOMBRADO y no el default: en Node el default de jspdf es el namespace
// del módulo y no la clase, así que con el default este archivo no se puede
// comprobar fuera del navegador.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const INK = [15, 23, 42];
const ACCENT = [99, 102, 241];
const AMBAR = [217, 119, 6];
const AMBAR_OSCURO = [146, 64, 14];
const GRIS = [100, 116, 139];
const LINEA = [203, 213, 225];

const int = (v) => parseInt(v, 10) || 0;
const pesos = (v) => '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');
const txt = (v) => String(v ?? '').trim();

const unidadesDe = (lista) => (lista || []).reduce(
  (n, d) => n + (d.grupos || []).reduce((m, g) => m + int(g.cantidad), 0), 0);

/** Las tres cosas del transporte en una línea, que es como se leen. */
const comoSeEnvia = (d) => [d.tipo_transporte || d.transporte, d.transportadora, d.fletes]
  .map(txt).filter(Boolean).join(' · ') || '—';

/**
 * La casilla de marcar: un cuadrito vacío, DIBUJADO y no escrito, para que se
 * pueda marcar con lápiz sin que el papel parezca ya rellenado.
 */
const dibujarCasilla = (doc) => (datos) => {
  if (datos.section !== 'body' || datos.column.index !== 0) return;
  const { x, y, height } = datos.cell;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.8);
  doc.rect(x + 6, y + (height - 10) / 2, 10, 10);
};

/**
 * EL BLOQUE DE RECOGER: ordenado por referencia y con los clientes mezclados a
 * propósito, para recorrer la bodega UNA vez. Letra grande y filas altas,
 * porque esto se lee de pie con el papel en una mano.
 *
 * @returns la Y donde terminó la tabla
 */
export function seccionRecoger(doc, despachos = [], { y = 72, margen = 36 } = {}) {
  const filas = [];
  for (const d of despachos) {
    for (const g of (d.grupos || [])) {
      filas.push({
        referencia: txt(g.referencia),
        calidad: txt(g.calidad),
        cantidad: int(g.cantidad),
        cliente: txt(d.nombre),
      });
    }
  }
  // Por referencia: es el orden en el que se camina la bodega, no el orden en
  // el que se entrega. El nombre viaja en cada renglón para saber de quién es.
  filas.sort((a, b) =>
    a.referencia.localeCompare(b.referencia, 'es', { sensitivity: 'base' })
    || a.calidad.localeCompare(b.calidad, 'es', { sensitivity: 'base' })
    || a.cliente.localeCompare(b.cliente, 'es', { sensitivity: 'base' }));

  const salen = unidadesDe(despachos);

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen, top: y },
    head: [['', 'REFERENCIA', 'CALIDAD', 'CAN', 'PARA QUIÉN']],
    body: filas.length
      ? filas.map((f) => ['', f.referencia, f.calidad || '—', f.cantidad, f.cliente])
      : [['', 'No hay nada que despachar.', '', '', '']],
    foot: [['', 'TOTAL A RECOGER', '', salen, '']],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 5, lineColor: LINEA, textColor: INK },
    headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 9, halign: 'left' },
    footStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 180, fontStyle: 'bold' },
      2: { cellWidth: 80 },
      3: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 'auto', textColor: GRIS },
    },
    didDrawCell: dibujarCasilla(doc),
    // Tres hojas de referencias sin cabecera son tres hojas en las que hay que
    // acordarse del orden de las columnas.
    showHead: 'everyPage',
  });

  return doc.lastAutoTable.finalY;
}

/**
 * EL BLOQUE DE EMPACAR: los datos de entrega, UNA vez por cliente. Aquí va el
 * valor —lo que se cobra contra entrega— y nunca el costo.
 *
 * @returns la Y donde terminó la tabla
 */
export function seccionEmpacar(doc, despachos = [], { y, margen = 36 } = {}) {
  if (!despachos.length) return y || 0;

  const arriba = (y ?? (doc.lastAutoTable?.finalY || 60)) + 26;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INK);
  doc.text('PARA EMPACAR Y ROTULAR', margen, arriba);
  doc.setFont(undefined, 'normal');

  autoTable(doc, {
    startY: arriba + 8,
    margin: { left: margen, right: margen },
    head: [['CLIENTE', 'UDS', 'VALOR', 'CIUDAD', 'DIRECCIÓN', 'CELULAR', 'CÓMO SE ENVÍA']],
    body: despachos.map((d) => {
      const uds = (d.grupos || []).reduce((n, g) => n + int(g.cantidad), 0);
      const valor = (d.grupos || []).reduce(
        (n, g) => n + int(g.cantidad) * (Number(g.precio) || 0), 0);
      return [
        txt(d.nombre),
        uds,
        // Vacío y no un cero cuando ninguna línea trae precio: un cero aquí se
        // lee como «no se le cobra nada».
        valor > 0 ? pesos(valor) : '',
        txt(d.ciudad) || '—',
        txt(d.direccion) || '—',
        txt(d.celular) || '—',
        comoSeEnvia(d),
      ];
    }),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4, lineColor: LINEA, textColor: INK },
    headStyles: { fillColor: GRIS, textColor: 255, fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 100, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 62, halign: 'right' },
      3: { cellWidth: 62 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 60 },
      6: { cellWidth: 92, fontSize: 7 },
    },
    showHead: 'everyPage',
  });

  return doc.lastAutoTable.finalY;
}

/**
 * EL BLOQUE DE SEPARAR: lo contrario del de recoger. No sale hoy, se aparta y se
 * marca con el nombre encima, así que va por cliente y no por referencia. En su
 * propia hoja, para que no se confunda con lo que sí sale.
 */
export function seccionSeparar(doc, separadas = [], { margen = 36, hojaNueva = true } = {}) {
  if (!separadas.length) return;
  const ancho = doc.internal.pageSize.getWidth();
  const apartadas = unidadesDe(separadas);

  if (hojaNueva) doc.addPage();
  doc.setFillColor(...AMBAR);
  doc.rect(0, 0, ancho, 44, 'F');
  doc.setTextColor(255);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('SEPARAR — no sale hoy', margen, 22);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`${separadas.length} cliente(s)   ·   ${apartadas} unidad(es)`, margen, 36);
  doc.setTextColor(0);

  const cuerpo = [];
  for (const c of separadas) {
    let primera = true;
    for (const g of (c.grupos || [])) {
      cuerpo.push(['', primera ? txt(c.nombre) : '', txt(g.referencia), txt(g.calidad) || '—', int(g.cantidad)]);
      primera = false;
    }
  }

  autoTable(doc, {
    startY: 60,
    margin: { left: margen, right: margen },
    head: [['', 'CLIENTE', 'REFERENCIA', 'CALIDAD', 'CAN']],
    body: cuerpo,
    foot: [['', 'TOTAL A SEPARAR', '', '', apartadas]],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 5, lineColor: LINEA, textColor: INK },
    headStyles: { fillColor: AMBAR, textColor: 255, fontSize: 9 },
    footStyles: { fillColor: AMBAR_OSCURO, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 140, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 80 },
      4: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
    },
    didDrawCell: dibujarCasilla(doc),
    showHead: 'everyPage',
  });
}

/**
 * Arma el papel completo y lo DEVUELVE, sin entregarlo al navegador.
 *
 * Separado de `exportarPDFDespacho` porque son dos cosas distintas: `doc.save()`
 * en jsPDF es una propiedad de la instancia y sólo tiene sentido en un
 * navegador. Con el documento en la mano se puede previsualizar o adjuntar sin
 * volver a armarlo, y se puede comprobar fuera del navegador.
 *
 * @param despachos [{ nombre, ciudad, direccion, celular, tipo_transporte,
 *                     transportadora, fletes,
 *                     grupos: [{ referencia, calidad, cantidad, precio }] }]
 * @param separadas lo mismo, para lo que se aparta y no sale hoy
 * @param meta      { fecha, titulo }
 */
export function construirPDFDespacho(despachos = [], separadas = [], meta = {}) {
  // Vertical: el bloque de recoger tiene cinco columnas, y así caben muchas más
  // filas por hoja, que es lo que importa cuando son ciento veinte unidades.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const MARGEN = 36;
  const fecha = meta.fecha || new Date().toISOString().slice(0, 10);
  const titulo = txt(meta.titulo) || 'DESPACHO';
  const salen = unidadesDe(despachos);

  doc.setFillColor(...INK);
  doc.rect(0, 0, ancho, 56, 'F');
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(titulo, MARGEN, 26);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`${fecha}   ·   ${despachos.length} cliente(s)   ·   ${salen} unidad(es)`, MARGEN, 43);
  doc.setTextColor(0);

  const yRecoger = seccionRecoger(doc, despachos, { y: 72, margen: MARGEN });
  seccionEmpacar(doc, despachos, { y: yRecoger, margen: MARGEN });
  seccionSeparar(doc, separadas, { margen: MARGEN });

  // El pie, en todas las hojas: un papel de bodega acaba suelto encima de una
  // mesa con otros tres, y sin fecha no se sabe cuál es el de hoy.
  const hojas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(`${titulo} · ${fecha}`, MARGEN, alto - 18);
    doc.text(`Hoja ${i} de ${hojas}`, ancho - MARGEN, alto - 18, { align: 'right' });
  }

  return doc;
}

/** Lo mismo, y además lo descarga. */
export function exportarPDFDespacho(despachos = [], separadas = [], meta = {}, archivo = 'Despacho') {
  const fecha = meta.fecha || new Date().toISOString().slice(0, 10);
  construirPDFDespacho(despachos, separadas, meta).save(`${archivo}_${fecha}.pdf`);
}
