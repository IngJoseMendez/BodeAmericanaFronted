import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink, BuscadorLista, CampoMonto } from '../components/common';
import { despachosApi, pacasApi, transportesApi, clientesApi } from '../services/api';
import { Truck, Eye, CheckCircle, X, Clock, Package, Search, AlertTriangle, Download, Printer, Users, Pencil, Check, Plus, LayoutGrid, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { hoy, formatFecha } from '../lib/fecha';
import { formatCOP, parseMonto } from '../lib/money';
// La promocion gana sobre el precio de lista, y se resuelve con el MISMO
// helper que las hojas de Excel y el inventario: tres sitios decidiendo por
// su cuenta que precio vale es como acaban cobrando cifras distintas.
import { nuevoLibro, descargar, hojaDespachoGeneral } from '../lib/entregables';
import { descargarExcel } from '../lib/descargar';
// El papel que se lleva a la bodega va en PDF y no en Excel: se imprime y se
// camina con el, no se edita. Ver lib/despachoPdf.js, que explica por que esta
// partido en «recoger» y «empacar».
import { exportarPDFDespacho } from '../lib/despachoPdf';
// El agrupado de existencias, compartido con la pantalla de Ventas.
import { agruparStock, claveStock } from '../lib/stock';
// Pegar desde una hoja de calculo, que es de donde sale la tanda de
// despachos del dia. Lo delicado —decidir si la primera fila son rotulos—
// vive en ese archivo y es el mismo que usan los contenedores.
import { leerDespachosPegados, CAMPOS_DESPACHO, normPegado } from '../lib/pegarLineas';

const formatCurrency = formatCOP;

const formatDate = formatFecha;

function EstadoBadge({ estado }) {
  const map = {
    en_proceso: 'bg-warning/15 text-warning',
    confirmado: 'bg-success/15 text-success',
    anulado:    'bg-error/15 text-error',
  };
  const labels = { en_proceso: 'En Proceso', confirmado: 'Confirmado', anulado: 'Anulado' };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[estado] || 'bg-primary/10 text-primary'}`}>
      {labels[estado] || estado}
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            {/* `text-on-primary` y no `text-white` ni un blanco literal: el círculo
                usa un token (bg-primary/70, bg-warning/70…) que se INVIERTE en modo
                oscuro. En claro esos colores son oscuros y el icono debe ir blanco;
                en oscuro son pasteles claros (--color-primary pasa a #f1f5f9) y un
                icono blanco queda en 2.0:1, prácticamente invisible. on-primary es
                justo el color de contenido sobre un fondo de color: #ffffff en claro
                y #0f172a en oscuro (≥3.8:1 en las cuatro tarjetas). Además no depende
                del override [data-theme="dark"] .text-white de index.css. */}
            <Icon className="w-5 h-5 text-on-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide truncate">{label}</p>
            <p className="text-xl font-display font-bold text-primary truncate">{value}</p>
            {sub && <p className="text-xs text-muted truncate">{sub}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// Tipos de transporte. La lista base se amplía sola con cualquier valor que ya
// se haya usado, así que se pueden agregar nuevos desde el propio despacho.
const TIPOS_TRANSPORTE_BASE = [
  { value: 'terrestre',      label: 'Terrestre' },
  { value: 'maritimo',       label: 'Marítimo' },
  { value: 'aereo',          label: 'Aéreo' },
  { value: 'recoge_cliente', label: 'Recoge el cliente' },
  { value: 'paqueteria',     label: 'Paquetería / encomienda' },
  { value: 'mensajero',      label: 'Mensajero / moto' },
  { value: 'flota',          label: 'Flota / intermunicipal' },
  { value: 'contenedor',     label: 'Contenedor' },
];

// Los tres datos de transporte que en esta operacion se deciden POR CLIENTE,
// con los valores que de verdad se usan. Son listas CERRADAS: estos tres viajan
// al Excel que lee la bodega y a la etiqueta del paquete, y un
// "interapidisimo" mal escrito una vez es una transportadora nueva para
// siempre. El tipo de despacho si se amplia sin tocar codigo, desde el catalogo
// de transportes que ella ya administra en esta misma pantalla.
const TIPOS_DESPACHO = ['domicilio', 'recogida'];
const TRANSPORTADORAS = ['envia', 'interrapidisimo', 'camion'];
const FLETES = ['contraentrega', 'contado'];

const etiquetaTransporte = (v) => {
  if (!v) return '—';
  const base = TIPOS_TRANSPORTE_BASE.find(t => t.value === v);
  if (base) return base.label;
  // Valor escrito a mano: se muestra tal cual, legible.
  return String(v).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
};

// ── Excel para la BODEGA ────────────────────────────────────────────
// No lleva precios: es la orden de alistamiento. Agrupa por referencia y
// calidad con la cantidad a sacar, y arriba los datos de entrega.
async function exportarExcelBodega(despacho) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercio Global Logístico';
  wb.created = new Date();

  const PRIMARY = '0f172a';
  const SUCCESS = '16a34a';
  const WHITE   = 'ffffff';
  const LIGHT   = 'f1f5f9';

  const ws = wb.addWorksheet('Alistamiento bodega');
  ws.properties.tabColor = { argb: SUCCESS };

  const items = despacho.items || [];

  // Título
  ws.mergeCells('A1:D1');
  const t = ws.getCell('A1');
  t.value = `ORDEN DE ALISTAMIENTO — ${despacho.numero || ''}`;
  t.font = { size: 14, bold: true, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Datos de entrega
  const datos = [
    ['Cliente',      despacho.destinatario || despacho.cliente_nombre || '—'],
    ['Ciudad',       despacho.ciudad_entrega || despacho.cliente_ciudad || '—'],
    ['Dirección',    despacho.direccion_entrega || despacho.cliente_direccion || '—'],
    ['Celular',      despacho.celular || despacho.cliente_telefono || '—'],
    ['Transporte',   etiquetaTransporte(despacho.tipo_transporte)],
    ['Fecha',        new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })],
  ];
  let row = 3;
  datos.forEach(([k, v]) => {
    ws.getCell(`A${row}`).value = k.toUpperCase();
    ws.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: '64748b' } };
    ws.mergeCells(`B${row}:D${row}`);
    ws.getCell(`B${row}`).value = v;
    ws.getCell(`B${row}`).font = { bold: true, size: 11, color: { argb: PRIMARY } };
    ws.getRow(row).height = 20;
    row++;
  });

  // Agrupado por referencia + calidad: a la bodega le importa cuántas sacar.
  row += 1;
  const grupos = new Map();
  for (const it of items) {
    const ref = it.referencia || '—';
    const cal = it.calidad || '—';
    const k = `${ref}||${cal}`;
    if (!grupos.has(k)) grupos.set(k, { referencia: ref, calidad: cal, cantidad: 0 });
    grupos.get(k).cantidad++;
  }
  const filas = [...grupos.values()].sort(
    (a, b) => a.referencia.localeCompare(b.referencia, 'es') || a.calidad.localeCompare(b.calidad, 'es')
  );

  const headers = ['#', 'Referencia', 'Calidad', 'Cantidad'];
  const hr = ws.getRow(row);
  hr.height = 26;
  headers.forEach((h, ci) => {
    const c = hr.getCell(ci + 1);
    c.value = h;
    c.font = { bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    c.alignment = { horizontal: ci === 3 ? 'center' : ci === 0 ? 'center' : 'left', vertical: 'middle', indent: ci === 1 || ci === 2 ? 1 : 0 };
  });
  row++;

  filas.forEach((f, i) => {
    const r = ws.getRow(row);
    r.height = 24;
    const bg = i % 2 === 0 ? LIGHT : WHITE;
    [i + 1, f.referencia, f.calidad, f.cantidad].forEach((val, ci) => {
      const c = r.getCell(ci + 1);
      c.value = val;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      c.alignment = { horizontal: ci === 3 || ci === 0 ? 'center' : 'left', vertical: 'middle', indent: ci === 1 || ci === 2 ? 1 : 0 };
      c.font = ci === 3
        ? { bold: true, size: 13, color: { argb: PRIMARY } }
        : { size: 11, color: { argb: PRIMARY } };
    });
    row++;
  });

  // Totalizado
  const tr = ws.getRow(row);
  tr.height = 28;
  ws.mergeCells(`A${row}:C${row}`);
  const lbl = tr.getCell(1);
  lbl.value = 'TOTAL UNIDADES A DESPACHAR';
  lbl.font = { bold: true, size: 12, color: { argb: WHITE } };
  lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUCCESS } };
  lbl.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const val = tr.getCell(4);
  val.value = items.length;
  val.font = { bold: true, size: 15, color: { argb: WHITE } };
  val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUCCESS } };
  val.alignment = { horizontal: 'center', vertical: 'middle' };

  // Espacio para firmas de quien alista y quien recibe
  row += 2;
  ws.getCell(`A${row}`).value = 'Alistado por: ____________________';
  ws.getCell(`C${row}`).value = 'Recibido por: ____________________';
  [`A${row}`, `C${row}`].forEach(ref => { ws.getCell(ref).font = { size: 10, color: { argb: '64748b' } }; });

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 14;

  const buffer = await wb.xlsx.writeBuffer();
  descargarExcel(buffer, `Bodega_${despacho.numero || 'despacho'}_${hoy()}.xlsx`);
}

async function exportarExcel(despacho) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercio Global Logístico';
  wb.created  = new Date();

  const PRIMARY   = '0f172a';
  const SECONDARY = '6366f1';
  const SUCCESS   = '16a34a';
  const WARNING   = 'f59e0b';
  const LIGHT     = 'f8fafc';
  const WHITE     = 'FFFFFF';

  const items     = despacho.items || [];
  // En el nuevo flujo, las pacas que ya salieron físicamente quedan en estado 'despachada'.
  const despachadas = items.filter(i => i.paca_estado === 'despachada');
  const pendientes  = items.filter(i => i.paca_estado !== 'despachada');
  // Desglose de la cotización: subtotal (suma de pacas) − descuento + transporte = total real.
  const subtotalPacas = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
  const descuento     = parseFloat(despacho.cot_descuento || 0);
  const transporte    = parseFloat(despacho.cot_transporte || 0);
  const subtotalCot   = despacho.cot_subtotal != null ? parseFloat(despacho.cot_subtotal) : subtotalPacas;
  // Total REAL = el de la cotización (ya con descuentos y transporte). Fallback: suma de pacas.
  const total         = despacho.cot_total != null ? parseFloat(despacho.cot_total) : subtotalPacas;

  // Resumen de inventario por tipo: total inventario − despacho = quedan.
  // Se consulta el inventario agrupado actual para reflejar lo que queda en bodega.
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const tipoKey = (c, r, q) => `${norm(c)}|${norm(r)}|${norm(q)}`;
  let invMap = {};
  try {
    const inv = await pacasApi.getInventario();
    (inv || []).forEach(row => {
      const k = tipoKey(row.clasificacion, row.referencia, row.calidad);
      const prev = invMap[k] || { fisico: 0, disponibles: 0 };
      invMap[k] = {
        fisico: prev.fisico + (parseInt(row.fisico) || 0),
        disponibles: prev.disponibles + (parseInt(row.disponibles) || 0),
      };
    });
  } catch { invMap = {}; }

  // Conteo de unidades de este despacho por tipo.
  const despachoPorTipo = {};
  despachadas.forEach(i => {
    const k = tipoKey(i.clasificacion, i.referencia, i.calidad);
    if (!despachoPorTipo[k]) despachoPorTipo[k] = { clasificacion: i.clasificacion || '—', referencia: i.referencia || '—', calidad: i.calidad || '—', cantidad: 0 };
    despachoPorTipo[k].cantidad += 1;
  });

  // ── Hoja 1: Resumen ─────────────────────────────────────────────
  const ws = wb.addWorksheet('Resumen');
  ws.properties.tabColor = { argb: PRIMARY };

  // Banner título
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value     = 'COMERCIO GLOBAL LOGÍSTICO';
  title.font      = { size: 18, bold: true, color: { argb: WHITE } };
  title.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 44;

  ws.mergeCells('A2:C2');
  const sub = ws.getCell('A2');
  sub.value     = `Comprobante de Despacho — ${despacho.numero}`;
  sub.font      = { size: 11, color: { argb: WHITE }, italic: true };
  sub.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECONDARY } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 26;

  // Separador
  ws.getRow(3).height = 8;

  // Info del despacho
  const TIPO_TRANSPORTE_LBL = {
    terrestre: 'Terrestre', maritimo: 'Marítimo', aereo: 'Aéreo',
    recoge_cliente: 'Recoge el cliente', paqueteria: 'Paquetería / encomienda',
  };
  const infoRows = [
    ['Número de Despacho', despacho.numero],
    ['Cliente', despacho.cliente_nombre],
    ['Cotización', despacho.cotizacion_numero || '—'],
    ['Fecha Despacho', formatDate(despacho.fecha)],
    ['Fecha Salida', formatDate(despacho.fecha_salida)],
    ['Estado', despacho.estado === 'confirmado' ? 'CONFIRMADO' : despacho.estado === 'en_proceso' ? 'EN PROCESO' : 'ANULADO'],
    ['Tipo de Transporte', TIPO_TRANSPORTE_LBL[despacho.tipo_transporte] || despacho.tipo_transporte || '—'],
    ['Destinatario', despacho.destinatario || despacho.cliente_nombre || '—'],
    ['Dirección de Entrega', despacho.direccion_entrega || '—'],
    ['Ciudad', despacho.ciudad_entrega || '—'],
    ['Celular', despacho.celular || '—'],
  ];

  infoRows.forEach(([campo, valor], idx) => {
    const r = ws.getRow(4 + idx);
    r.height = 22;
    const c1 = r.getCell(1);
    const c2 = r.getCell(2);
    c1.value     = campo;
    c1.font      = { bold: true, size: 10, color: { argb: PRIMARY } };
    c1.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    c1.alignment = { vertical: 'middle', indent: 1 };
    c2.value     = valor;
    c2.font      = { size: 10, color: { argb: PRIMARY } };
    c2.alignment = { vertical: 'middle', indent: 1 };
    ws.mergeCells(`B${4 + idx}:C${4 + idx}`);
  });

  // KPI boxes
  const kpiRow = 4 + infoRows.length + 1;
  ws.getRow(kpiRow - 1).height = 12;

  [[despachadas.length, 'Unidades despachadas', SUCCESS],
   [pendientes.length, 'Unidades pendientes', WARNING],
   [items.length, 'Total unidades', PRIMARY]].forEach(([val, lbl, color], ci) => {
    const col = ci + 1;
    const r1  = ws.getRow(kpiRow);
    const r2  = ws.getRow(kpiRow + 1);
    r1.height = 30;
    r2.height = 20;
    const v = r1.getCell(col);
    v.value     = val;
    v.font      = { size: 20, bold: true, color: { argb: WHITE } };
    v.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    const l = r2.getCell(col);
    l.value     = lbl;
    l.font      = { size: 9, color: { argb: WHITE } };
    l.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    l.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Desglose financiero (subtotal − descuento + transporte = total real de la cotización)
  let fr = kpiRow + 3;
  ws.getRow(fr - 1).height = 10;
  const finanRows = [['Subtotal (pacas)', subtotalCot]];
  if (descuento > 0)  finanRows.push(['Descuento', -descuento]);
  if (transporte > 0) finanRows.push(['Transporte', transporte]);
  finanRows.forEach(([lbl, val]) => {
    ws.mergeCells(`A${fr}:B${fr}`);
    const c1 = ws.getCell(`A${fr}`);
    c1.value = lbl;
    c1.font = { size: 10, color: { argb: PRIMARY } };
    c1.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    const c2 = ws.getCell(`C${fr}`);
    c2.value = val; c2.numFmt = '$#,##0';
    c2.font = { size: 10, color: { argb: val < 0 ? WARNING : PRIMARY } };
    c2.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws.getRow(fr).height = 18;
    fr++;
  });

  // Total real
  const totalRow = fr;
  ws.mergeCells(`A${totalRow}:B${totalRow}`);
  const tc1 = ws.getCell(`A${totalRow}`);
  tc1.value     = 'TOTAL DESPACHO';
  tc1.font      = { bold: true, size: 12, color: { argb: WHITE } };
  tc1.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  tc1.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  ws.getRow(totalRow).height = 28;
  const tc2 = ws.getCell(`C${totalRow}`);
  tc2.value     = total;
  tc2.numFmt    = '$#,##0';
  tc2.font      = { bold: true, size: 14, color: { argb: WHITE } };
  tc2.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  tc2.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 22;

  // ── Hoja 2: Unidades ────────────────────────────────────────────
  const wi = wb.addWorksheet('Unidades');
  wi.properties.tabColor = { argb: SECONDARY };

  // Cabecera de tabla
  // Este Excel se le manda al CLIENTE: sin UUID ni clasificación, que son datos
  // internos de bodega y solo le agregan ruido a la factura.
  const headers = ['#', 'Referencia', 'Calidad', 'Precio', 'Estado'];
  const hRow = wi.getRow(1);
  hRow.height = 28;
  headers.forEach((h, ci) => {
    const cell = hRow.getCell(ci + 1);
    cell.value     = h;
    cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    cell.alignment = { horizontal: ci >= 3 ? 'right' : 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'thin', color: { argb: SECONDARY } } };
  });

  items.forEach((item, idx) => {
    const r = wi.getRow(2 + idx);
    r.height = 20;
    const isDespachada = item.paca_estado === 'despachada';
    const bg = idx % 2 === 0 ? LIGHT : WHITE;

    const vals = [
      idx + 1,
      item.referencia || '—',
      item.calidad || '—',
      parseFloat(item.precio_unitario || 0),
      isDespachada ? 'Despachado' : 'Pendiente',
    ];
    vals.forEach((val, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value     = val;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: ci >= 3 ? 'right' : ci === 0 ? 'center' : 'left', indent: ci > 0 && ci < 3 ? 1 : 0 };
      if (ci === 3) {
        cell.numFmt = '$#,##0';
        cell.font   = { bold: true, color: { argb: SECONDARY } };
      } else if (ci === 4) {
        cell.font = { bold: true, color: { argb: isDespachada ? SUCCESS : WARNING } };
      } else {
        cell.font = { size: 9, color: { argb: PRIMARY } };
      }
    });
  });

  // Fila total
  const totRow = wi.getRow(2 + items.length);
  totRow.height = 24;
  wi.mergeCells(`A${2 + items.length}:C${2 + items.length}`);
  const totLbl = totRow.getCell(1);
  totLbl.value     = `TOTAL (${items.length} unidades)`;
  totLbl.font      = { bold: true, size: 10, color: { argb: WHITE } };
  totLbl.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  totLbl.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const totVal = totRow.getCell(4);
  totVal.value     = total;
  totVal.numFmt    = '$#,##0';
  totVal.font      = { bold: true, color: { argb: WHITE } };
  totVal.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  totVal.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  totRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };

  wi.getColumn(1).width  = 5;
  wi.getColumn(2).width  = 24;
  wi.getColumn(3).width  = 18;
  wi.getColumn(4).width  = 18;
  wi.getColumn(5).width  = 14;

  // ── Hoja 3: Resumen por Tipo (inventario − despacho = quedan) ───
  const tipos = Object.values(despachoPorTipo);
  if (tipos.length) {
    const wr = wb.addWorksheet('Resumen por Tipo');
    wr.properties.tabColor = { argb: SUCCESS };
    const rHeaders = ['Clasificación', 'Referencia', 'Calidad', 'Despachadas', 'Físico (queda)', 'Total (antes)', 'Disponibles'];
    const rh = wr.getRow(1);
    rh.height = 26;
    rHeaders.forEach((h, ci) => {
      const cell = rh.getCell(ci + 1);
      cell.value     = h;
      cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
      cell.alignment = { horizontal: ci >= 3 ? 'center' : 'left', vertical: 'middle', indent: ci < 3 ? 1 : 0 };
    });
    tipos.forEach((t, idx) => {
      const k = tipoKey(t.clasificacion, t.referencia, t.calidad);
      const fisicoActual = invMap[k]?.fisico ?? 0;          // ya descontado el despacho
      const dispActual   = invMap[k]?.disponibles ?? 0;
      const totalAntes   = fisicoActual + t.cantidad;        // inventario antes del despacho
      const r = wr.getRow(2 + idx);
      r.height = 20;
      const bg = idx % 2 === 0 ? LIGHT : WHITE;
      const vals = [t.clasificacion, t.referencia, t.calidad, t.cantidad, fisicoActual, totalAntes, dispActual];
      vals.forEach((val, ci) => {
        const cell = r.getCell(ci + 1);
        cell.value     = val;
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle', horizontal: ci >= 3 ? 'center' : 'left', indent: ci < 3 ? 1 : 0 };
        cell.font      = ci === 3
          ? { bold: true, color: { argb: SUCCESS } }
          : { size: 9, color: { argb: PRIMARY } };
      });
    });
    wr.getColumn(1).width = 20;
    wr.getColumn(2).width = 20;
    wr.getColumn(3).width = 16;
    wr.getColumn(4).width = 14;
    wr.getColumn(5).width = 16;
    wr.getColumn(6).width = 16;
    wr.getColumn(7).width = 14;
  }

  // Descarga
  const buf = await wb.xlsx.writeBuffer();
  descargarExcel(buf, `${despacho.numero}.xlsx`);
}

// La ventana de impresión se abre con document.write y es del MISMO origen que
// la aplicación: cualquier etiqueta pegada dentro del nombre de un cliente
// (un <img onerror=...>) se ejecutaría ahí con acceso al token de la sesión.
// Todo lo que escribe un usuario pasa por aquí antes de entrar al HTML.
const escaparHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Devuelve false si el navegador bloqueó la ventana emergente, para que quien
// llama pueda avisarle al usuario.
function imprimirDespacho(despacho) {
  const items = despacho.items || [];
  const subtotalPacas = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
  const descuento  = parseFloat(despacho.cot_descuento || 0);
  const transporte = parseFloat(despacho.cot_transporte || 0);
  const subtotalCot = despacho.cot_subtotal != null ? parseFloat(despacho.cot_subtotal) : subtotalPacas;
  const total = despacho.cot_total != null ? parseFloat(despacho.cot_total) : subtotalPacas;
  const filas = items.map(i => `
    <tr>
      <td>${escaparHtml(i.paca_uuid?.slice(0, 8) || '')}</td>
      <td>${escaparHtml(i.clasificacion || '')}</td>
      <td>${escaparHtml(i.referencia || '')}</td>
      <td>${escaparHtml(i.calidad || '—')}</td>
      <td style="text-align:right">${formatCurrency(i.precio_unitario)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${escaparHtml(despacho.numero)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .meta { color: #555; margin-bottom: 16px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #0f172a; color: white; padding: 6px 8px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
      td { padding: 5px 8px; border: 1px solid #ddd; }
      tfoot td { font-weight: bold; background: #f9f9f9; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>Despacho ${escaparHtml(despacho.numero)}</h1>
    <div class="meta">
      Cliente: <strong>${escaparHtml(despacho.cliente_nombre)}</strong> &nbsp;|&nbsp;
      ${despacho.cotizacion_numero ? `Cotización: ${escaparHtml(despacho.cotizacion_numero)} &nbsp;|&nbsp;` : ''}
      Fecha: ${escaparHtml(formatDate(despacho.fecha))} &nbsp;|&nbsp;
      Estado: ${escaparHtml(despacho.estado)}
    </div>
    <table>
      <thead><tr><th>UUID</th><th>Clasificación</th><th>Referencia</th><th>Calidad</th><th>Precio</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr><td colspan="4" style="text-align:right">Subtotal</td><td style="text-align:right">${formatCurrency(subtotalCot)}</td></tr>
        ${descuento > 0 ? `<tr><td colspan="4" style="text-align:right">Descuento</td><td style="text-align:right">- ${formatCurrency(descuento)}</td></tr>` : ''}
        ${transporte > 0 ? `<tr><td colspan="4" style="text-align:right">Transporte</td><td style="text-align:right">${formatCurrency(transporte)}</td></tr>` : ''}
        <tr><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right">${formatCurrency(total)}</td></tr>
      </tfoot>
    </table>
    <script>window.onload=()=>{window.print();window.close();}</script>
    </body></html>`;

  // Si el bloqueador de emergentes lo impide, window.open devuelve null: antes
  // el document.write lanzaba un TypeError que nadie capturaba y el botón
  // "PDF / Imprimir" simplemente no hacía nada.
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export default function Despachos() {
  const [despachos, setDespachos]               = useState([]);
  const [transportes, setTransportes]           = useState([]);
  const [transpOpen, setTranspOpen]             = useState(false);
  const [nuevoTransp, setNuevoTransp]           = useState('');
  // Renombrado en línea dentro del mismo modal: la lista solo dejaba agregar y
  // quitar, así que corregir una tilde obligaba a borrar y volver a crear.
  const [editTranspId, setEditTranspId]         = useState(null);
  const [editTranspNombre, setEditTranspNombre] = useState('');
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState(null);
  const [viewModalOpen, setViewModalOpen]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [seleccion, setSeleccion]               = useState({});

  // ── DESPACHO DIRECTO, SIN COTIZACION ──────────────────────────
  // Para vender tres pacas de mostrador habia que inventarse una cotizacion,
  // aprobarla y despacharla: tres pantallas para una venta de treinta segundos.
  // Esto crea la venta, el despacho y la deuda en cartera de una vez, igual que
  // el flujo por cotizacion (ver POST /despachos/directo).
  const LINEA_VACIA = { referencia: '', calidad: '', cantidad: '', precio_unitario: '', descuento_unitario: '' };
  const [directoOpen, setDirectoOpen]   = useState(false);
  const [clientes, setClientes]         = useState([]);
  const [inventario, setInventario]     = useState([]);
  const [creandoDirecto, setCreandoDirecto] = useState(false);
  // `fecha` arranca en hoy pero se puede mover atras: la mercancia salio el
  // viernes y esto se teclea el lunes. Sin ese campo habria que mentirle la
  // fecha al sistema —y con ella a la cartera— o corregirla despues a mano.
  const DIRECTO_VACIO = () => ({
    cliente_id: '', lineas: [{ ...LINEA_VACIA }], fecha: hoy(),
    destinatario: '', ciudad_entrega: '', direccion_entrega: '', celular: '',
    tipo_transporte: '', transportadora: '', fletes: '',
    abono: '', metodo_pago: '', notas: '',
  });
  const [directo, setDirecto] = useState(DIRECTO_VACIO());

  // Clientes e inventario los necesitan las DOS puertas —el despacho de uno y
  // la rejilla de varios—, asi que se cargan con la misma funcion.
  const cargarParaDespachar = async () => {
    try {
      const [cls, inv] = await Promise.all([clientesApi.getAll(), pacasApi.getInventario()]);
      setClientes(Array.isArray(cls) ? cls : (cls?.data || []));
      setInventario(Array.isArray(inv) ? inv : []);
    } catch {
      addToast('No se pudo cargar el inventario disponible', 'error');
    }
  };

  const abrirDirecto = async () => {
    setDirecto(DIRECTO_VACIO());
    setDirectoOpen(true);
    await cargarParaDespachar();
  };

  // Lo disponible, agrupado por referencia + calidad. Lo hace lib/stock.js, que
  // es el mismo agrupado que usa el formulario de Ventas: cuando cada pantalla
  // lo hacia por su cuenta, una ofrecia existencias que la otra no veia.
  const stockDirecto = useMemo(() => agruparStock(inventario), [inventario]);

  const refsDirecto = useMemo(
    () => [...new Set(stockDirecto.map((x) => x.referencia))], [stockDirecto]);
  const calidadesDe = (ref) => stockDirecto
    .filter((x) => x.referencia.toLowerCase() === String(ref || '').trim().toLowerCase())
    .map((x) => x.calidad);
  const hayDe = (ref, cal) => stockDirecto.find((x) =>
    x.referencia.toLowerCase() === String(ref || '').trim().toLowerCase() &&
    x.calidad.toLowerCase() === String(cal || '').trim().toLowerCase());

  const setLinea = (i, campo, valor) => setDirecto((d) => {
    const lineas = [...d.lineas];
    const linea = { ...lineas[i], [campo]: valor };
    // Al elegir referencia o calidad se sugiere el precio de hoy y, si solo hay
    // una calidad con existencias, se escoge sola: es el gesto que se repite en
    // cada linea y no tiene ninguna decision detras.
    if (campo === 'referencia') {
      const cals = calidadesDe(valor);
      if (cals.length === 1) linea.calidad = cals[0];
    }
    if (campo === 'referencia' || campo === 'calidad') {
      const hay = hayDe(linea.referencia, linea.calidad);
      if (hay?.precio != null && !linea.precio_unitario) linea.precio_unitario = String(hay.precio);
    }
    lineas[i] = linea;
    return { ...d, lineas };
  });

  // Lo que de verdad se le cobra: precio MENOS descuento, por unidad. Es la
  // misma cuenta que hace el servidor, y es la que acaba en la cartera.
  const netoLinea = (l) => Math.max(0, (parseMonto(l.precio_unitario) || 0) - (parseMonto(l.descuento_unitario) || 0));
  const totalDirecto = directo.lineas.reduce((sum, l) =>
    sum + (parseInt(l.cantidad) || 0) * netoLinea(l), 0);
  const descuentoDirecto = directo.lineas.reduce((sum, l) =>
    sum + (parseInt(l.cantidad) || 0) * (parseMonto(l.descuento_unitario) || 0), 0);

  // Lo que impide crear el despacho, dicho en palabras. Se calcula aqui y se
  // ensena en el formulario: un boton apagado sin decir por que es una pared.
  const problemasDirecto = () => {
    const faltas = [];
    if (!directo.cliente_id) faltas.push('Falta el cliente');
    const utiles = directo.lineas.filter((l) => l.referencia || l.cantidad || l.precio_unitario);
    if (!utiles.length) faltas.push('Falta al menos una linea');
    utiles.forEach((l, i) => {
      const n = i + 1;
      const cant = parseInt(l.cantidad) || 0;
      if (!l.referencia) faltas.push(`Linea ${n}: falta la referencia`);
      if (cant <= 0) faltas.push(`Linea ${n}: falta la cantidad`);
      if (!(parseMonto(l.precio_unitario) > 0)) faltas.push(`Linea ${n}: falta el precio`);
      // Un descuento mayor que el precio dejaria la linea en negativo y el
      // cliente acabaria con plata a favor por una paca que se llevo. El
      // servidor tambien lo rechaza; aqui se dice antes de enviar.
      const dcto = parseMonto(l.descuento_unitario) || 0;
      if (dcto < 0) faltas.push(`Linea ${n}: el descuento no puede ser negativo`);
      if (dcto > 0 && dcto > (parseMonto(l.precio_unitario) || 0)) {
        faltas.push(`Linea ${n}: el descuento es mayor que el precio`);
      }
      const hay = l.referencia ? hayDe(l.referencia, l.calidad) : null;
      const disp = hay?.disponibles || 0;
      if (l.referencia && cant > disp) {
        faltas.push(`Linea ${n}: pides ${cant} y hay ${disp} disponibles`);
      }
    });
    return faltas;
  };

  const crearDirecto = async () => {
    const faltas = problemasDirecto();
    if (faltas.length) { addToast(faltas[0], 'warning'); return; }
    try {
      setCreandoDirecto(true);
      const r = await despachosApi.crearDirecto({
        cliente_id: directo.cliente_id,
        lineas: directo.lineas
          .filter((l) => l.referencia && (parseInt(l.cantidad) || 0) > 0)
          .map((l) => ({
            referencia: l.referencia, calidad: l.calidad,
            cantidad: parseInt(l.cantidad) || 0,
            precio_unitario: parseMonto(l.precio_unitario),
            descuento_unitario: parseMonto(l.descuento_unitario) || 0,
          })),
        fecha: directo.fecha || undefined,
        destinatario: directo.destinatario, ciudad_entrega: directo.ciudad_entrega,
        direccion_entrega: directo.direccion_entrega, celular: directo.celular,
        tipo_transporte: directo.tipo_transporte,
        transportadora: directo.transportadora, fletes: directo.fletes,
        notas: directo.notas,
        abono: parseMonto(directo.abono) || 0, metodo_pago: directo.metodo_pago,
      });
      addToast(r.mensaje || `Despacho ${r.numero} creado`, 'success');
      setDirectoOpen(false);
      loadDespachos();
    } catch (err) {
      addToast(err.message || 'No se pudo crear el despacho', 'error');
    } finally {
      setCreandoDirecto(false);
    }
  };

  // ══ VARIOS DESPACHOS A LA VEZ ═══════════════════════════════════
  //
  // Ir cliente por cliente es lo que hace que capturar aquí sea más lento que
  // capturar en el Excel del que salen los datos. La tanda del día ya existe en
  // una hoja de cálculo: esta rejilla la recibe pegada y la parte en despachos
  // sola, agrupando por cliente.
  //
  // UN RENGLÓN = UNA LÍNEA, NO UN DESPACHO. Cinco referencias para la misma
  // persona son cinco renglones y UN despacho, igual que en la hoja: nadie
  // repite el nombre cinco veces. Los tres datos de transporte se deciden por
  // cliente, así que basta escribirlos en el primer renglón de cada uno.
  //
  // Se crea TODO O NADA (POST /despachos/directo/lote, una sola transacción):
  // media tanda cargada es peor que ninguna, porque nadie sabe qué mitad quedó.
  const LINEA_LOTE = {
    cliente: '', referencia: '', calidad: '', cantidad: '',
    precio_unitario: '', descuento_unitario: '',
    tipo_transporte: '', transportadora: '', fletes: '',
  };
  const FILAS_LOTE_INICIALES = 6;
  const [loteOpen, setLoteOpen]       = useState(false);
  const [creandoLote, setCreandoLote] = useState(false);
  const [lote, setLote] = useState({ fecha: hoy(), lineas: [] });

  const abrirLote = async () => {
    setLote({
      fecha: hoy(),
      lineas: Array.from({ length: FILAS_LOTE_INICIALES }, () => ({ ...LINEA_LOTE })),
    });
    setLoteOpen(true);
    await cargarParaDespachar();
  };

  // Mismo gesto que en el despacho de uno: al elegir referencia se sugiere el
  // precio de hoy y, si sólo hay una calidad con existencias, se escoge sola.
  const setLineaLote = (i, campo, valor) => setLote((L) => {
    const lineas = [...L.lineas];
    const linea = { ...lineas[i], [campo]: valor };
    if (campo === 'referencia') {
      const cals = calidadesDe(valor);
      if (cals.length === 1) linea.calidad = cals[0];
    }
    if (campo === 'referencia' || campo === 'calidad') {
      const hay = hayDe(linea.referencia, linea.calidad);
      if (hay?.precio != null && !linea.precio_unitario) linea.precio_unitario = String(hay.precio);
    }
    lineas[i] = linea;
    return { ...L, lineas };
  });

  // Los clientes por nombre. Se guarda la LISTA y no el primero que aparezca:
  // si hay dos personas con el mismo nombre, elegir una a espaldas de quien
  // pega le cargaría la deuda al cliente equivocado.
  const clientesPorNombre = useMemo(() => {
    const m = new Map();
    for (const c of clientes) {
      const k = normPegado(c.nombre);
      if (!k) continue;
      m.set(k, [...(m.get(k) || []), c]);
    }
    return m;
  }, [clientes]);

  // 'vacio' | 'ambiguo' | null (no existe) | el cliente
  const resolverCliente = (nombre) => {
    const k = normPegado(nombre);
    if (!k) return 'vacio';
    const hallados = clientesPorNombre.get(k);
    if (!hallados) return null;
    return hallados.length > 1 ? 'ambiguo' : hallados[0];
  };

  const lineasUtilesLote = (L = lote) => L.lineas.filter(
    (l) => l.cliente || l.referencia || l.cantidad || l.precio_unitario);

  // Pegar desde la hoja de cálculo, a partir de la fila donde está el cursor.
  // Si lo pegado no es un bloque —una sola celda— no se toca nada y el campo se
  // comporta como siempre.
  const pegarEnLote = (iDesde) => (e) => {
    const bloque = leerDespachosPegados(e.clipboardData?.getData('text/plain') || '');
    if (!bloque) return;
    e.preventDefault();
    setLote((L) => {
      const lineas = [...L.lineas];
      // El cliente se ARRASTRA hacia abajo mientras los renglones vengan sin
      // nombre, que es como está escrita la hoja de verdad.
      let arrastrado = lineas[iDesde]?.cliente || '';
      bloque.lineas.forEach((p, k) => {
        const i = iDesde + k;
        while (lineas.length <= i) lineas.push({ ...LINEA_LOTE });
        const cliente = p.cliente || arrastrado;
        arrastrado = cliente;
        lineas[i] = { ...LINEA_LOTE, ...p, cliente };
      });
      return { ...L, lineas };
    });
    const sinCliente = bloque.lineas.filter((p) => p.cliente && !resolverCliente(p.cliente)).length;
    addToast(
      `${bloque.lineas.length} línea(s) pegada(s)`
      + (sinCliente ? ` · ${sinCliente} con un cliente que no está en la lista` : ''),
      sinCliente ? 'warning' : 'success');
  };

  // La tanda repartida en despachos: uno por cliente.
  const despachosDelLote = useMemo(() => {
    const porCliente = new Map();
    lineasUtilesLote().forEach((l, i) => {
      const k = normPegado(l.cliente);
      if (!porCliente.has(k)) porCliente.set(k, { nombre: l.cliente, lineas: [], transporte: {} });
      const g = porCliente.get(k);
      g.lineas.push({ ...l, fila: i + 1 });
      // Los tres de transporte son por cliente: gana el primer renglón que los
      // traiga, para no obligar a repetirlos en cada línea.
      for (const campo of ['tipo_transporte', 'transportadora', 'fletes']) {
        if (!g.transporte[campo] && l[campo]) g.transporte[campo] = l[campo];
      }
    });
    return [...porCliente.values()];
  }, [lote.lineas, clientesPorNombre]);

  const totalLote = lineasUtilesLote().reduce(
    (sum, l) => sum + (parseInt(l.cantidad) || 0) * netoLinea(l), 0);

  const problemasLote = () => {
    const faltas = [];
    const utiles = lineasUtilesLote();
    if (!utiles.length) return ['No hay ninguna línea'];

    // Lo que se pide SUMANDO TODAS LAS FILAS. Dos clientes pidiendo cuatro cada
    // uno de algo que tiene seis unidades pasa cada fila por separado y revienta
    // el lote entero al enviarlo; aquí se ve antes.
    const pedido = new Map();

    utiles.forEach((l, i) => {
      const n = i + 1;
      const cant = parseInt(l.cantidad) || 0;
      const cli = resolverCliente(l.cliente);
      if (cli === 'vacio') faltas.push(`Fila ${n}: falta el cliente`);
      else if (cli === 'ambiguo') faltas.push(`Fila ${n}: hay más de un cliente llamado «${l.cliente}»`);
      else if (!cli) faltas.push(`Fila ${n}: «${l.cliente}» no está en los clientes`);

      if (!l.referencia) faltas.push(`Fila ${n}: falta la referencia`);
      else if (!hayDe(l.referencia, l.calidad)) {
        faltas.push(`Fila ${n}: «${l.referencia}${l.calidad ? ' / ' + l.calidad : ''}» no tiene existencias`);
      }
      if (cant <= 0) faltas.push(`Fila ${n}: falta la cantidad`);
      if (!(parseMonto(l.precio_unitario) > 0)) faltas.push(`Fila ${n}: falta el precio`);
      const dcto = parseMonto(l.descuento_unitario) || 0;
      if (dcto < 0) faltas.push(`Fila ${n}: el descuento no puede ser negativo`);
      if (dcto > 0 && dcto > (parseMonto(l.precio_unitario) || 0)) {
        faltas.push(`Fila ${n}: el descuento es mayor que el precio`);
      }
      if (l.referencia && cant > 0) {
        const k = claveStock(l.referencia, l.calidad);
        pedido.set(k, (pedido.get(k) || 0) + cant);
      }
    });

    for (const [k, cant] of pedido) {
      const g = stockDirecto.find((x) => claveStock(x.referencia, x.calidad) === k);
      const disp = g?.disponibles || 0;
      if (cant > disp) {
        const nombre = g ? `${g.referencia}${g.calidad ? ' / ' + g.calidad : ''}` : k.replace('|', ' / ');
        faltas.push(`En todo el lote pides ${cant} de ${nombre} y hay ${disp}`);
      }
    }
    return faltas;
  };

  const crearLote = async () => {
    const faltas = problemasLote();
    if (faltas.length) { addToast(faltas[0], 'warning'); return; }
    try {
      setCreandoLote(true);
      const payload = despachosDelLote.map((g) => {
        const cli = resolverCliente(g.nombre);
        return {
          cliente_id: cli.id,
          // Viaja el nombre para que, si el servidor rechaza una fila, el aviso
          // diga de quién era y no sólo «despacho 8 de 15».
          cliente_nombre: g.nombre,
          fecha: lote.fecha || undefined,
          tipo_transporte: g.transporte.tipo_transporte || null,
          transportadora: g.transporte.transportadora || null,
          fletes: g.transporte.fletes || null,
          lineas: g.lineas
            .filter((l) => l.referencia && (parseInt(l.cantidad) || 0) > 0)
            .map((l) => ({
              referencia: l.referencia, calidad: l.calidad,
              cantidad: parseInt(l.cantidad) || 0,
              precio_unitario: parseMonto(l.precio_unitario),
              descuento_unitario: parseMonto(l.descuento_unitario) || 0,
            })),
        };
      });
      const r = await despachosApi.crearDirectoLote(payload);
      addToast(r.mensaje || `${r.creados} despachos creados`, 'success');
      setLoteOpen(false);
      loadDespachos();
    } catch (err) {
      addToast(err.message || 'No se pudo crear el lote', 'error');
    } finally {
      setCreandoLote(false);
    }
  };

  // ══ CONFIRMAR LA SALIDA DE TODOS A LA VEZ ═══════════════════════
  //
  // La bodega se recorre UNA vez. Confirmar despacho por despacho obliga a
  // abrir, marcar y cerrar quince veces la misma pantalla para una sola vuelta
  // por la bodega, y a descargar quince papeles para un solo viaje.
  //
  // Lo que se marca y se desmarca es lo mismo que antes —unidad por unidad—,
  // sólo que ahora están todos los despachos juntos. Lo que se desmarca NO sale
  // y su despacho queda parcial, igual que en la vista de uno.
  const [salidaOpen, setSalidaOpen]         = useState(false);
  const [salidaCargando, setSalidaCargando] = useState(false);
  const [salidaEnviando, setSalidaEnviando] = useState(false);
  const [salidaLista, setSalidaLista]       = useState([]);
  const [salidaSel, setSalidaSel]           = useState({});
  const [salidaFecha, setSalidaFecha]       = useState(hoy());

  // «domicilio» y «recogida» son las dos de esta operación; el catálogo de
  // transportes administrable se suma detrás, sin repetir.
  const opcionesTipoDespacho = useMemo(() => {
    const vistos = new Set();
    const out = [];
    for (const v of [...TIPOS_DESPACHO, ...(transportes || []).map((t) => t.nombre)]) {
      const k = normPegado(v);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      out.push({ value: v, label: v });
    }
    return out;
  }, [transportes]);

  const pendientesDe = (d) => (d.items || []).filter((i) => i.paca_estado === 'vendida');

  const abrirSalidaGeneral = async () => {
    setSalidaOpen(true);
    setSalidaCargando(true);
    setSalidaFecha(hoy());
    setSalidaLista([]);
    setSalidaSel({});
    try {
      // El inventario entra para poder poner el COSTO en el Excel de bodega, y
      // los clientes para la ciudad y la dirección cuando el despacho no las
      // lleva escritas.
      await cargarParaDespachar();
      const r = await Promise.allSettled((despachos || []).map((d) => despachosApi.getOne(d.id)));
      const completos = r.filter((x) => x.status === 'fulfilled').map((x) => x.value);
      const conPendientes = completos.filter((d) => pendientesDe(d).length > 0);
      const sel = {};
      for (const d of conPendientes) for (const i of pendientesDe(d)) sel[i.paca_id] = true;
      setSalidaLista(conPendientes);
      setSalidaSel(sel);
      const fallidos = r.length - completos.length;
      if (fallidos) addToast(`No pude leer ${fallidos} despacho(s); no aparecen en la lista`, 'warning');
    } finally {
      setSalidaCargando(false);
    }
  };

  const marcarDespacho = (d, valor) => setSalidaSel((s) => {
    const next = { ...s };
    for (const i of pendientesDe(d)) next[i.paca_id] = valor;
    return next;
  });

  const idsMarcados = (d) => pendientesDe(d).filter((i) => salidaSel[i.paca_id]).map((i) => Number(i.paca_id));
  const totalMarcado = salidaLista.reduce((s, d) => s + idsMarcados(d).length, 0);

  // ── El Excel del despacho ───────────────────────────────────────
  //
  // Sale del MISMO molde que el general (`hojaDespachoGeneral`), se pida de
  // todos o de uno solo: el papel que recibe la bodega tiene que verse igual en
  // los dos casos, o se lee de dos maneras distintas.
  const costoPorClave = useMemo(() => {
    const m = new Map();
    for (const f of inventario) {
      const k = claveStock(f.referencia, f.calidad);
      const c = parseFloat(f?.precio_minimo);
      if (!Number.isFinite(c) || c <= 0) continue;
      if (!m.has(k)) m.set(k, c);
      // Dos costos distintos para el mismo producto: se deja EN BLANCO. Un
      // costo que no es el que dice ser es peor que ninguno.
      else if (m.get(k) !== c) m.set(k, null);
    }
    return m;
  }, [inventario]);

  const paraHojaDespacho = (d, pacaIds) => {
    const cli = (clientes || []).find((c) => c.id === d.cliente_id);
    const items = (d.items || []).filter((i) => !pacaIds || pacaIds.includes(Number(i.paca_id)));
    const grupos = new Map();
    for (const it of items) {
      const k = claveStock(it.referencia, it.calidad);
      if (!grupos.has(k)) {
        grupos.set(k, {
          referencia: it.referencia || '', calidad: it.calidad || '',
          costo: costoPorClave.get(k) ?? null, precio: null, cantidad: 0, primera: true,
        });
      }
      const g = grupos.get(k);
      g.cantidad++;
      const neto = (parseFloat(it.precio_unitario) || 0) - (parseFloat(it.descuento_unitario) || 0);
      // Precios distintos dentro del mismo producto: columna en blanco, no uno
      // de los dos. La hoja la lee alguien que no puede comprobarlo.
      if (g.primera) { g.precio = neto; g.primera = false; }
      else if (g.precio !== neto) g.precio = null;
    }
    return {
      nombre: d.destinatario || d.cliente_nombre || '',
      ciudad: d.ciudad_entrega || cli?.ciudad || d.cliente_ciudad || '',
      direccion: d.direccion_entrega || cli?.direccion || d.cliente_direccion || '',
      celular: d.celular || cli?.telefono || d.cliente_telefono || '',
      tipo_transporte: etiquetaTransporte(d.tipo_transporte),
      transportadora: d.transportadora || '',
      fletes: d.fletes || '',
      grupos: [...grupos.values()].sort((a, b) =>
        a.referencia.localeCompare(b.referencia, 'es') || a.calidad.localeCompare(b.calidad, 'es')),
    };
  };

  const excelDespachos = async (lista, meta, archivo) => {
    const wb = nuevoLibro();
    hojaDespachoGeneral(wb, lista.map(({ d, pacaIds }) => paraHojaDespacho(d, pacaIds)), [], meta);
    await descargar(wb, archivo);
  };

  // EL PAPEL DE LA BODEGA, EN PDF. El Excel se queda para quien lo quiera tal
  // cual, pero este es el que se imprime: un Excel de doce columnas se lee mal
  // en papel y pagina donde quiere.
  const pdfDeLaSalida = () => {
    const lista = salidaLista
      .map((d) => ({ d, pacaIds: idsMarcados(d) }))
      .filter((x) => x.pacaIds.length);
    if (!lista.length) { addToast('No hay nada marcado', 'warning'); return; }
    exportarPDFDespacho(
      lista.map(({ d, pacaIds }) => paraHojaDespacho(d, pacaIds)), [],
      { titulo: 'DESPACHO', fecha: salidaFecha }, 'Despacho_General');
  };

  const pdfDeUno = (d) => {
    const pacaIds = idsMarcados(d);
    if (!pacaIds.length) { addToast(`No hay nada marcado en ${d.numero}`, 'warning'); return; }
    exportarPDFDespacho([paraHojaDespacho(d, pacaIds)], [],
      { titulo: d.numero, fecha: salidaFecha }, `Despacho_${d.numero}`);
  };

  const excelDeLaSalida = async () => {
    const lista = salidaLista
      .map((d) => ({ d, pacaIds: idsMarcados(d) }))
      .filter((x) => x.pacaIds.length);
    if (!lista.length) { addToast('No hay nada marcado', 'warning'); return; }
    await excelDespachos(lista,
      { titulo: 'DESPACHO(GENERAL)', fecha: salidaFecha, totales: null },
      'Despacho_General');
  };

  const excelDeUno = async (d) => {
    const pacaIds = idsMarcados(d);
    if (!pacaIds.length) { addToast(`No hay nada marcado en ${d.numero}`, 'warning'); return; }
    await excelDespachos([{ d, pacaIds }],
      { titulo: 'DESPACHO(GENERAL)', fecha: salidaFecha, numero: d.numero },
      `Despacho_${d.numero}`);
  };

  const confirmarSalidaGeneral = async () => {
    const lista = salidaLista
      .map((d) => ({ d, pacaIds: idsMarcados(d) }))
      .filter((x) => x.pacaIds.length);
    if (!lista.length) { addToast('Marca al menos una unidad', 'warning'); return; }

    const parciales = lista.filter((x) => x.pacaIds.length < pendientesDe(x.d).length);
    const ok = await confirm({
      title: `¿Sacar ${totalMarcado} unidad(es) de bodega?`,
      message: `Se confirma la salida de ${lista.length} despacho(s) con fecha ${salidaFecha}.`
        + (parciales.length
          ? ` ${parciales.length} queda(n) parcial(es): lo que dejaste sin marcar NO sale y sigue pendiente.`
          : ''),
      confirmText: 'Sí, confirmar la salida',
    });
    if (!ok) return;

    try {
      setSalidaEnviando(true);
      const r = await despachosApi.confirmarLote(
        lista.map(({ d, pacaIds }) => ({ id: d.id, paca_ids: pacaIds })),
        salidaFecha);
      addToast(r.mensaje || `${r.unidades} unidad(es) salieron`, 'success');
      // El papel de la bodega se descarga con lo que ACABA de salir, que es lo
      // que hay que ir a buscar. Si falla la descarga la salida ya está hecha y
      // no se deshace: se avisa y se puede volver a bajar.
      try {
        await excelDespachos(lista,
          { titulo: 'DESPACHO(GENERAL)', fecha: salidaFecha, totales: null },
          'Despacho_General');
      } catch {
        addToast('La salida quedó registrada, pero no pude generar el Excel', 'warning');
      }
      setSalidaOpen(false);
      loadDespachos();
      if (vistaActiva === 'despachados' || despachados.length > 0) loadDespachados();
    } catch (err) {
      addToast(err.message || 'No se pudo confirmar la salida', 'error');
    } finally {
      setSalidaEnviando(false);
    }
  };

  const [submitting, setSubmitting]             = useState(false);
  const [entrega, setEntrega]                   = useState({ tipo_transporte: '', destinatario: '', direccion_entrega: '', ciudad_entrega: '', celular: '' });

  // Sección Despachados
  const [vistaActiva, setVistaActiva]               = useState('pendientes');
  const [despachados, setDespachados]               = useState([]);
  const [loadingDespachados, setLoadingDespachados] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => { loadDespachos(); loadTransportes(); }, []);

  const loadTransportes = async () => {
    try { setTransportes(await transportesApi.getAll() || []); } catch { setTransportes([]); }
  };

  useEffect(() => {
    if (vistaActiva === 'despachados' && despachados.length === 0) {
      loadDespachados();
    }
  }, [vistaActiva]);

  // Deep-link: ?focus=<id> abre el detalle de ese despacho (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    despachosApi.getOne(focus)
      .then(data => { setSelectedDespacho(data); setViewModalOpen(true); })
      .catch(() => addToast('No se encontró el despacho', 'error'));
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  const loadDespachos = async () => {
    try {
      setLoading(true);
      const data = await despachosApi.getAll({ estado: 'en_proceso' });
      setDespachos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDespachados = async () => {
    try {
      setLoadingDespachados(true);
      const data = await despachosApi.getAll({ con_salida: true });
      setDespachados(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingDespachados(false);
    }
  };

  const openView = async (despacho) => {
    try {
      const data = await despachosApi.getOne(despacho.id);
      setSelectedDespacho(data);
      setViewModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const abrirConfirmModal = () => {
    const pendientes = (selectedDespacho?.items || []).filter(i => i.paca_estado === 'vendida');
    if (!pendientes.length) { addToast('No hay unidades vendidas pendientes de despacho', 'warning'); return; }
    const init = {};
    pendientes.forEach(i => { init[i.paca_id] = true; });
    setSeleccion(init);
    // Prefill datos de entrega: del despacho si existen, si no del cliente.
    const d = selectedDespacho || {};
    setEntrega({
      tipo_transporte:   d.tipo_transporte || '',
      destinatario:      d.destinatario || d.cliente_nombre || '',
      direccion_entrega: d.direccion_entrega || d.cliente_direccion || '',
      ciudad_entrega:    d.ciudad_entrega || d.cliente_ciudad || '',
      celular:           d.celular || d.cliente_telefono || '',
    });
    setConfirmModalOpen(true);
  };

  const handleConfirmar = async () => {
    const pacaIds = Object.entries(seleccion)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id));
    if (!pacaIds.length) { addToast('Selecciona al menos una unidad', 'warning'); return; }
    try {
      setSubmitting(true);
      const result = await despachosApi.confirmar(selectedDespacho.id, {
        paca_ids: pacaIds,
        tipo_transporte:   entrega.tipo_transporte || null,
        destinatario:      entrega.destinatario || null,
        direccion_entrega: entrega.direccion_entrega || null,
        ciudad_entrega:    entrega.ciudad_entrega || null,
        celular:           entrega.celular || null,
      });
      addToast(
        `${result.pacas_despachadas} unidad(es) despachada(s)${result.pacas_pendientes ? ` · ${result.pacas_pendientes} pendiente(s)` : ''}`,
        'success'
      );
      setConfirmModalOpen(false);

      // Recargar despacho completo y exportar Excel solo con las unidades recién despachadas
      const updated = await despachosApi.getOne(selectedDespacho.id);
      setSelectedDespacho(updated);
      const despachoSalida = {
        ...updated,
        items: (updated.items || []).filter(i => pacaIds.includes(Number(i.paca_id))),
      };
      await exportarExcel(despachoSalida);

      if (result.pacas_pendientes === 0) {
        setViewModalOpen(false);
      }

      // Recargar listas
      loadDespachos();
      if (vistaActiva === 'despachados' || despachados.length > 0) {
        loadDespachados();
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnular = async (id) => {
    const ok = await confirm({
      title: '¿Anular despacho?',
      message: 'La venta se cancelará y las unidades volverán a estado separado en la cotización.',
      confirmText: 'Anular',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await despachosApi.anular(id);
      addToast('Despacho anulado y venta revertida', 'success');
      setViewModalOpen(false);
      loadDespachos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleImprimir = () => {
    if (!imprimirDespacho(selectedDespacho)) {
      addToast('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio y vuelve a intentarlo.', 'error');
    }
  };

  // Renombrar un transporte del catálogo. Solo cambia la lista: los despachos ya
  // emitidos guardan el nombre con el que salieron y no se tocan.
  const renombrarTransporte = async (id) => {
    const nombre = editTranspNombre.trim();
    if (!nombre) return;
    try {
      await transportesApi.update(id, { nombre });
      addToast('Nombre actualizado', 'success');
      setEditTranspId(null);
      setEditTranspNombre('');
      loadTransportes();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const cerrarTransportes = () => {
    setTranspOpen(false);
    setEditTranspId(null);
    setEditTranspNombre('');
  };

  // El catálogo viene del servidor y se administra desde el botón "Transportes".
  // Se completa con los valores ya usados en despachos viejos para que ninguno
  // quede sin etiqueta.
  const tiposTransporteDisponibles = (() => {
    const vistos = new Map(transportes.map(t => [t.nombre, { value: t.nombre, label: t.nombre }]));
    for (const d of despachos) {
      const v = (d.tipo_transporte || '').trim();
      if (v && !vistos.has(v)) vistos.set(v, { value: v, label: etiquetaTransporte(v) });
    }
    return [...vistos.values()];
  })();

  const filtered = despachos.filter(d =>
    !search || d.numero?.includes(search) || d.cliente_nombre?.toLowerCase().includes(search.toLowerCase())
  );

  // Agrupar despachados por cliente
  const despachadosAgrupados = useMemo(() => {
    const map = {};
    despachados.forEach(d => {
      const key = d.cliente_nombre || 'Sin cliente';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [despachados]);

  const totalItems = despachos.reduce((s, d) => s + (parseInt(d.num_items) || 0), 0);
  const totalDespachados = despachados.reduce((s, d) => s + (parseInt(d.num_items) || 0), 0);

  return (
    <Layout title="Despachos" subtitle="Gestión de salidas de mercancía">
      <div className="space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="En Proceso"   value={despachos.length}   icon={Clock}       color="bg-warning/70"   sub="pendientes de confirmar salida" />
          <KpiCard label="Confirmados"  value={despachados.length} icon={CheckCircle} color="bg-success/70"   sub="salidas confirmadas" />
          <KpiCard label="Uds Pendientes" value={totalItems}       icon={Package}     color="bg-secondary/70" sub="en despachos activos" />
          <KpiCard label="Uds Despachadas" value={totalDespachados} icon={Truck}      color="bg-primary/70"   sub="entregadas a clientes" />
        </div>

        {/* Tabs Pendientes / Despachados */}
        <div className="flex items-center gap-1 p-1 bg-primary/5 rounded-2xl w-fit">
          <button
            onClick={() => setVistaActiva('pendientes')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              vistaActiva === 'pendientes'
                ? 'bg-surface shadow-sm text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            <Clock size={15} />
            Pendientes
            {despachos.length > 0 && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vistaActiva === 'pendientes' ? 'bg-warning/20 text-warning' : 'bg-primary/10 text-muted'}`}>
                {despachos.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setVistaActiva('despachados')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              vistaActiva === 'despachados'
                ? 'bg-surface shadow-sm text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            <CheckCircle size={15} />
            Despachados
            {despachados.length > 0 && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vistaActiva === 'despachados' ? 'bg-success/20 text-success' : 'bg-primary/10 text-muted'}`}>
                {despachados.length}
              </span>
            )}
          </button>
        </div>

        {/* ── VISTA PENDIENTES ─────────────────────────────────── */}
        {vistaActiva === 'pendientes' && (
          <>
            {/* Búsqueda + despacho directo */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input type="text" placeholder="Buscar por número o cliente..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30" />
              </div>
              <div className="flex-shrink-0 flex flex-wrap gap-2">
                <button type="button" onClick={abrirDirecto}
                  title="Vender y despachar mercancía disponible sin pasar por una cotización"
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 active:scale-[0.98] transition-all duration-150">
                  <Plus size={17} aria-hidden="true" /> Nuevo despacho
                </button>
                <button type="button" onClick={abrirLote}
                  title="Pegar la tanda del día desde una hoja de cálculo y crear todos los despachos de una"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-secondary/40 text-secondary text-sm font-semibold hover:bg-secondary/5 active:scale-[0.98] transition-all duration-150">
                  <LayoutGrid size={16} aria-hidden="true" /> Varios a la vez
                </button>
                {/* El botón grande: una vuelta por la bodega, un papel y una
                    salida para todos los despachos que estén pendientes. */}
                <button type="button" onClick={abrirSalidaGeneral}
                  disabled={!despachos.length}
                  title={despachos.length
                    ? 'Confirmar la salida de todos los despachos pendientes de una vez'
                    : 'No hay despachos pendientes de salir'}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150">
                  <Truck size={16} aria-hidden="true" /> Despachar todo
                  {despachos.length > 0 && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/20">{despachos.length}</span>
                  )}
                </button>
              </div>
            </div>

            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-primary/3 border-b border-border/50">
                    <tr>
                      {['Número', 'Cliente', 'Cotización', 'Fecha', 'Items', 'Total', 'Estado', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      <TableSkeleton cols={8} rows={5} />
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={8}>
                        <EmptyState icon={Truck} title="Sin despachos pendientes" description="Todos los despachos han sido confirmados o no hay despachos activos" />
                      </td></tr>
                    ) : filtered.map(d => (
                      /* LA FILA ENTERA ABRE EL DESPACHO, no sólo el ojito. Un
                         objetivo de 28 píxeles en una tableta es un objetivo
                         que se falla; la fila mide seiscientos. El ojito se
                         queda porque es la pista de que hay algo que abrir, y
                         los botones de dentro paran la propagación para que
                         pulsarlos no abra además el detalle.

                         role y tabIndex para que también se llegue con el
                         teclado: una fila con onClick y sin ellos es un botón
                         que el lector de pantalla no anuncia. */
                      <tr key={d.id}
                          onClick={() => openView(d)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openView(d); } }}
                          role="button" tabIndex={0}
                          aria-label={`Ver el despacho ${d.numero} de ${d.cliente_nombre || ''}`}
                          className="hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary cursor-pointer transition-colors duration-150 bg-warning/3">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{d.numero}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-primary">
                          <RefLink to="/cartera" id={d.cliente_id} title="Ver cartera del cliente">{d.cliente_nombre}</RefLink>
                        </td>
                        <td className="px-4 py-3">
                          {d.cotizacion_numero
                            ? <RefLink to="/cotizaciones" id={d.cotizacion_id} title="Ver cotización"
                                className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full">{d.cotizacion_numero}</RefLink>
                            : <span className="text-muted/40 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{formatDate(d.fecha)}</td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-primary">{d.num_items || 0}</td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold">{formatCurrency(d.total)}</td>
                        <td className="px-4 py-3"><EstadoBadge estado={d.estado} /></td>
                        <td className="px-4 py-3">
                          <button onClick={() => openView(d)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors">
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ── VISTA DESPACHADOS ─────────────────────────────────── */}
        {vistaActiva === 'despachados' && (
          <div className="space-y-4">
            {loadingDespachados ? (
              <Card padding={false}>
                <table className="w-full"><tbody><TableSkeleton cols={6} rows={6} /></tbody></table>
              </Card>
            ) : despachadosAgrupados.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Sin salidas registradas"
                description="Los despachos con al menos una salida aparecerán aquí agrupados por cliente"
              />
            ) : despachadosAgrupados.map(([cliente, items]) => {
              const totalUds   = items.reduce((s, d) => s + (parseInt(d.num_despachadas) || 0), 0);
              const totalMonto = items.reduce((s, d) => s + parseFloat(d.total || 0), 0);
              return (
                <Card key={cliente} padding={false}>
                  {/* Header de cliente */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-primary/3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center flex-shrink-0">
                        <Users size={15} className="text-secondary" />
                      </div>
                      <div>
                        <RefLink to="/cartera" id={items[0]?.cliente_id} title="Ver cartera del cliente"
                          className="font-display font-bold text-primary text-sm">{cliente}</RefLink>
                        <p className="text-xs text-muted">{items.length} despacho{items.length !== 1 ? 's' : ''} · {totalUds} unidades</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-primary">{formatCurrency(totalMonto)}</p>
                      <p className="text-xs text-muted">total entregado</p>
                    </div>
                  </div>

                  {/* Tabla de despachos del cliente */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/30">
                          {['Número', 'Cotización', 'Fecha Salida', 'Despachadas', 'Total', 'Estado', ''].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {items.map(d => (
                          <tr key={d.id}
                              onClick={() => openView(d)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openView(d); } }}
                              role="button" tabIndex={0}
                              aria-label={`Ver el despacho ${d.numero} de ${d.cliente_nombre || ''}`}
                              className="hover:bg-success/5 focus-visible:bg-success/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary cursor-pointer transition-colors duration-150">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{d.numero}</td>
                            <td className="px-4 py-3">
                              {d.cotizacion_numero
                                ? <RefLink to="/cotizaciones" id={d.cotizacion_id} title="Ver cotización"
                                    className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full">{d.cotizacion_numero}</RefLink>
                                : <span className="text-muted/40 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-success font-medium whitespace-nowrap">{formatDate(d.fecha_salida)}</td>
                            <td className="px-4 py-3 text-center font-mono font-bold text-primary">
                              <span>{d.num_despachadas || 0}</span>
                              {d.num_items > d.num_despachadas && (
                                <span className="text-muted font-normal">/{d.num_items}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{formatCurrency(d.total)}</td>
                            <td className="px-4 py-3">
                              {d.estado === 'confirmado'
                                ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-success/15 text-success">Completo</span>
                                : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-warning/15 text-warning">Parcial</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => openView(d)}
                                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                                title="Ver detalle">
                                <Eye size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Ver Despacho */}
      {selectedDespacho && (
        <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={selectedDespacho.numero} size="xl">
          <div className="space-y-5">
            {/* Info general */}
            <div className="flex flex-wrap items-center gap-3">
              <EstadoBadge estado={selectedDespacho.estado} />
              <span className="text-xs text-muted">Cliente: <RefLink to="/cartera" id={selectedDespacho.cliente_id} title="Ver cartera del cliente"><strong>{selectedDespacho.cliente_nombre}</strong></RefLink></span>
              {selectedDespacho.cotizacion_numero && (
                <RefLink to="/cotizaciones" id={selectedDespacho.cotizacion_id} title="Ver cotización"
                  className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full">Cot. {selectedDespacho.cotizacion_numero}</RefLink>
              )}
              <span className="text-xs text-muted">Fecha cotización: <strong className="text-primary">{formatDate(selectedDespacho.fecha)}</strong></span>
              {selectedDespacho.fecha_salida && (
                <span className="text-xs text-muted">Fecha salida: <strong className="text-success">{formatDate(selectedDespacho.fecha_salida)}</strong></span>
              )}
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Unidades en el despacho</p>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-primary/3 border-b border-border/40">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted">UUID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted">Clasificación</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted">Referencia</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted">Calidad</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted">Estado</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {(selectedDespacho.items || []).map((item, i) => (
                      <tr key={i} className={`hover:bg-primary/3 transition-colors ${item.paca_estado === 'despachada' ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-2 text-xs text-muted font-mono">{item.paca_uuid?.slice(0, 8)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-primary capitalize">{item.clasificacion}</td>
                        <td className="px-4 py-2 text-sm text-muted capitalize">{item.referencia}</td>
                        <td className="px-4 py-2 text-sm text-muted capitalize">{item.calidad || '—'}</td>
                        <td className="px-4 py-2">
                          {item.paca_estado === 'despachada'
                            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">Despachado</span>
                            : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning">Pendiente</span>
                          }
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-secondary">{formatCurrency(item.precio_unitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5 border-t border-border/40">
                    {(() => {
                      const subPacas = (selectedDespacho.items || []).reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
                      const sub = selectedDespacho.cot_subtotal != null ? parseFloat(selectedDespacho.cot_subtotal) : subPacas;
                      const desc = parseFloat(selectedDespacho.cot_descuento || 0);
                      const trans = parseFloat(selectedDespacho.cot_transporte || 0);
                      const tot = selectedDespacho.cot_total != null ? parseFloat(selectedDespacho.cot_total) : subPacas;
                      const hayDesglose = desc > 0 || trans > 0;
                      return (
                        <>
                          {hayDesglose && (
                            <>
                              <tr>
                                <td colSpan={5} className="px-4 py-1.5 text-right text-xs text-muted">Subtotal</td>
                                <td className="px-4 py-1.5 text-right font-mono text-xs text-muted">{formatCurrency(sub)}</td>
                              </tr>
                              {desc > 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-1.5 text-right text-xs text-muted">Descuento</td>
                                  <td className="px-4 py-1.5 text-right font-mono text-xs text-warning">- {formatCurrency(desc)}</td>
                                </tr>
                              )}
                              {trans > 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-1.5 text-right text-xs text-muted">Transporte</td>
                                  <td className="px-4 py-1.5 text-right font-mono text-xs text-muted">{formatCurrency(trans)}</td>
                                </tr>
                              )}
                            </>
                          )}
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-sm font-bold text-primary">Total{hayDesglose ? ' (cotización)' : ''}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary">{formatCurrency(tot)}</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>

            {selectedDespacho.notas && (
              <p className="text-sm text-muted italic">{selectedDespacho.notas}</p>
            )}

            {/* Footer acciones */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-2">
                <button onClick={() => exportarExcel(selectedDespacho)}
                  title="Excel con precios para enviar al cliente"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-xs font-medium transition-colors">
                  <Download size={13} /> Excel cliente
                </button>
                <button onClick={() => exportarExcelBodega(selectedDespacho)}
                  title="Orden de alistamiento para la bodega: referencia, calidad y cantidad, sin precios"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-success/40 text-success hover:bg-success/10 text-xs font-semibold transition-colors">
                  <Download size={13} /> Excel bodega
                </button>
                <button onClick={handleImprimir}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-xs font-medium transition-colors">
                  <Printer size={13} /> PDF / Imprimir
                </button>
              </div>

              {selectedDespacho.estado === 'en_proceso' && (
                <div className="flex gap-3">
                  <button onClick={() => handleAnular(selectedDespacho.id)} disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-error/30 text-error hover:bg-error/10 text-sm font-medium transition-colors disabled:opacity-40">
                    <X size={15} /> Anular
                  </button>
                  <button onClick={abrirConfirmModal} disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-success text-white text-sm font-semibold hover:bg-success/85 active:scale-95 transition-all disabled:opacity-40">
                    <CheckCircle size={15} /> Confirmar Salida
                  </button>
                </div>
              )}

              {selectedDespacho.estado === 'anulado' && (
                <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-sm text-error">
                  <AlertTriangle size={15} /> Este despacho fue anulado
                </div>
              )}

              {selectedDespacho.estado === 'confirmado' && (
                <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-sm text-success">
                  <CheckCircle size={15} /> Mercancía despachada el {formatDate(selectedDespacho.fecha_salida)}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Confirmar Salida de Bodega */}
      {selectedDespacho && (
        <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Confirmar Salida de Bodega" size="lg">
          <div className="space-y-4">
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning-dark flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-warning" />
              <span>Selecciona las unidades que saldrán físicamente de bodega ahora. Al confirmar se descargará automáticamente el comprobante Excel.</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Unidades pendientes</p>
                <button
                  type="button"
                  onClick={() => {
                    const all = {};
                    (selectedDespacho.items || [])
                      .filter(i => i.paca_estado === 'vendida')
                      .forEach(i => { all[i.paca_id] = true; });
                    setSeleccion(all);
                  }}
                  className="text-xs text-secondary hover:underline"
                >
                  Seleccionar todo
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {(selectedDespacho.items || [])
                  .filter(i => i.paca_estado === 'vendida')
                  .map(item => (
                    <label
                      key={item.paca_id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        seleccion[item.paca_id]
                          ? 'border-secondary/50 bg-secondary/5'
                          : 'border-border/60 bg-surface hover:bg-primary/3'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!seleccion[item.paca_id]}
                        onChange={e => setSeleccion(s => ({ ...s, [item.paca_id]: e.target.checked }))}
                        className="w-4 h-4 accent-secondary flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary capitalize truncate">
                          {item.clasificacion}{item.referencia ? ` / ${item.referencia}` : ''}{item.calidad ? ` / ${item.calidad}` : ''}
                        </p>
                        <p className="text-xs text-muted font-mono">{item.paca_uuid?.slice(0, 8)}</p>
                      </div>
                      <span className="text-sm font-mono font-semibold text-secondary flex-shrink-0">
                        {formatCurrency(item.precio_unitario)}
                      </span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Datos de entrega para el documento de bodega */}
            <div className="space-y-2 pt-3 border-t border-border/40">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">Datos de entrega</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1" htmlFor="tipo-transporte">
                    Tipo de transporte
                  </label>
                  {/* Combo abierto: se elige de la lista o se escribe uno nuevo,
                      que queda disponible para los siguientes despachos. */}
                  <input
                    id="tipo-transporte"
                    list="lista-transportes"
                    value={entrega.tipo_transporte}
                    onChange={e => setEntrega(s => ({ ...s, tipo_transporte: e.target.value }))}
                    placeholder="Elige o escribe uno nuevo…"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                  <datalist id="lista-transportes">
                    {tiposTransporteDisponibles.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </datalist>
                  <button type="button" onClick={() => setTranspOpen(true)}
                    className="mt-1 text-[11px] font-semibold text-secondary hover:underline underline-offset-2">
                    Administrar la lista de transportes
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Destinatario</label>
                  <input type="text" value={entrega.destinatario}
                    onChange={e => setEntrega(s => ({ ...s, destinatario: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Dirección de entrega</label>
                  <input type="text" value={entrega.direccion_entrega}
                    onChange={e => setEntrega(s => ({ ...s, direccion_entrega: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Ciudad</label>
                  <input type="text" value={entrega.ciudad_entrega}
                    onChange={e => setEntrega(s => ({ ...s, ciudad_entrega: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Celular</label>
                  <input type="text" value={entrega.celular}
                    onChange={e => setEntrega(s => ({ ...s, celular: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div>
                <p className="text-sm font-bold text-primary">
                  {Object.values(seleccion).filter(Boolean).length} unidad(es) seleccionada(s)
                </p>
                <p className="text-xs text-muted">
                  Total: {formatCurrency(
                    (selectedDespacho.items || [])
                      .filter(i => seleccion[i.paca_id])
                      .reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0)
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-muted hover:text-primary text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmar}
                  disabled={submitting || Object.values(seleccion).filter(Boolean).length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/85 disabled:opacity-40 active:scale-95 transition-all"
                >
                  {submitting
                    ? <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <CheckCircle size={15} />}
                  {submitting ? 'Confirmando...' : 'Confirmar Salida'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Catálogo de tipos de transporte ─────────────────────── */}
      {/* ══ DESPACHO DIRECTO ════════════════════════════════
          Una venta de mostrador: se elige cliente, se teclean las líneas y sale
          el despacho, la venta y la deuda en cartera de una vez. Sólo ofrece
          mercancía DISPONIBLE: lo que ya está apartado para alguien tiene su
          camino por cotización, y tirar de ahí es como se le quita en silencio a
          un cliente lo que tenía pedido. */}
      <Modal isOpen={directoOpen} onClose={() => setDirectoOpen(false)}
             title="Nuevo despacho (sin cotización)" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label htmlFor="dir-cliente" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Cliente *</label>
              <BuscadorLista id="dir-cliente"
                value={directo.cliente_id}
                onChange={(v) => setDirecto((d) => ({ ...d, cliente_id: v }))}
                opcionVacia="Elige el cliente"
                opciones={clientes.map((c) => ({
                  value: String(c.id),
                  label: c.nombre,
                  detalle: c.ciudad || '',
                }))}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm" />
            </div>
            <div>
              <label htmlFor="dir-fecha" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Fecha</label>
              {/* Se puede poner una fecha de atrás: la mercancía salió el
                  viernes y esto se teclea el lunes. Es la fecha de la venta y
                  del movimiento de cartera, no sólo un rótulo. */}
              <input id="dir-fecha" type="date"
                value={directo.fecha}
                onChange={(e) => setDirecto((d) => ({ ...d, fecha: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm" />
            </div>
          </div>

          {/* ── Las líneas ──────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Qué se despacha</p>
              <span className="text-xs text-muted">
                {stockDirecto.length} producto(s) con existencias
              </span>
            </div>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary/[0.03] text-[10px] font-bold text-muted uppercase tracking-wider">
                    <th className="px-2 py-2 text-left w-[25%]">Referencia *</th>
                    <th className="px-2 py-2 text-left w-[15%]">Calidad</th>
                    <th className="px-2 py-2 text-center w-[11%]">Cant. *</th>
                    <th className="px-2 py-2 text-right w-[16%]">Precio *</th>
                    <th className="px-2 py-2 text-right w-[15%]">Dcto. c/u</th>
                    <th className="px-2 py-2 text-right w-[14%]">Subtotal</th>
                    <th className="px-2 py-2 w-[4%]"><span className="sr-only">Quitar</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {directo.lineas.map((l, i) => {
                    const hay = l.referencia ? hayDe(l.referencia, l.calidad) : null;
                    const disp = hay?.disponibles || 0;
                    const cant = parseInt(l.cantidad) || 0;
                    const excede = Boolean(l.referencia) && cant > disp;
                    const dcto = parseMonto(l.descuento_unitario) || 0;
                    const dctoExcede = dcto > 0 && dcto > (parseMonto(l.precio_unitario) || 0);
                    return (
                      <tr key={i} className={excede ? 'bg-warning/[0.07]' : ''}>
                        <td className="px-2 py-1.5">
                          <BuscadorLista
                            value={l.referencia}
                            onChange={(v) => setLinea(i, 'referencia', v)}
                            opciones={refsDirecto.map((r) => ({ value: r, label: r }))}
                            placeholder="Referencia"
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                        </td>
                        <td className="px-2 py-1.5">
                          <BuscadorLista
                            value={l.calidad}
                            onChange={(v) => setLinea(i, 'calidad', v)}
                            opciones={calidadesDe(l.referencia).map((q) => ({ value: q, label: q || '—' }))}
                            placeholder="Calidad"
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                        </td>
                        <td className="px-2 py-1.5">
                          <CampoMonto decimales={0} placeholder="0"
                            value={l.cantidad}
                            onChange={(e) => setLinea(i, 'cantidad', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs text-center font-mono" />
                          {/* Cuánto hay, en la línea y no en un tooltip: en la
                              tableta un title no existe, y este número es el que
                              decide si la venta se puede hacer. */}
                          {l.referencia && (
                            <p className={`text-[9px] mt-0.5 text-center leading-none ${excede ? 'text-warning font-bold' : 'text-muted'}`}>
                              hay {disp}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <CampoMonto decimales={0} placeholder="0"
                            value={l.precio_unitario}
                            onChange={(e) => setLinea(i, 'precio_unitario', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs text-right font-mono" />
                        </td>
                        <td className="px-2 py-1.5">
                          {/* EL DESCUENTO VA POR UNIDAD, como en la cotización:
                              lo que se rebaja es «esta paca te la dejo en cien
                              mil menos», no un porcentaje del despacho. Se
                              guarda aparte del precio para que dentro de seis
                              meses se siga viendo a cuánto estaba en lista. */}
                          <CampoMonto decimales={0} placeholder="0"
                            value={l.descuento_unitario}
                            onChange={(e) => setLinea(i, 'descuento_unitario', e.target.value)}
                            aria-label={`Descuento por unidad de la línea ${i + 1}`}
                            className={`w-full px-2 py-1.5 rounded-lg border bg-surface text-xs text-right font-mono ${
                              dctoExcede ? 'border-error text-error' : 'border-border'}`} />
                          {dctoExcede && (
                            <p className="text-[9px] mt-0.5 text-right leading-none text-error font-bold">
                              mayor que el precio
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-secondary font-semibold">
                          {cant > 0 && netoLinea(l) > 0
                            ? formatCOP(cant * netoLinea(l))
                            : <span className="text-muted/40">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {directo.lineas.length > 1 && (
                            <button type="button"
                              onClick={() => setDirecto((d) => ({ ...d, lineas: d.lineas.filter((_, j) => j !== i) }))}
                              aria-label={`Quitar la línea ${i + 1}`}
                              className="p-1 rounded-md text-muted hover:text-error hover:bg-error/10">
                              <X size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button"
              onClick={() => setDirecto((d) => ({ ...d, lineas: [...d.lineas, { ...LINEA_VACIA }] }))}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-secondary/40 text-secondary text-xs font-semibold hover:bg-secondary/5">
              <Plus size={13} /> Agregar línea
            </button>
          </div>

          {/* ── A dónde va ─────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">A dónde va (opcional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" placeholder="Quién recibe" aria-label="Quién recibe"
                value={directo.destinatario} onChange={(e) => setDirecto((d) => ({ ...d, destinatario: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <input type="text" placeholder="Ciudad" aria-label="Ciudad de entrega"
                value={directo.ciudad_entrega} onChange={(e) => setDirecto((d) => ({ ...d, ciudad_entrega: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <input type="text" placeholder="Dirección" aria-label="Dirección de entrega"
                value={directo.direccion_entrega} onChange={(e) => setDirecto((d) => ({ ...d, direccion_entrega: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <input type="text" placeholder="Celular" aria-label="Celular"
                value={directo.celular} onChange={(e) => setDirecto((d) => ({ ...d, celular: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              {/* Los tres datos de transporte. Van con BuscadorLista y no con
                  un <input list> porque este módulo ya arrastra un bug de
                  datalist, y porque la lista cerrada es lo correcto aquí: estos
                  tres valores viajan al Excel que lee la bodega y a la etiqueta
                  del paquete, y «interapidisimo» mal escrito una vez es una
                  transportadora nueva para siempre. El tipo de despacho sí se
                  amplía sin tocar código, desde «Administrar la lista de
                  transportes», que es el catálogo que ella ya administra. */}
              <BuscadorLista
                value={directo.tipo_transporte}
                onChange={(v) => setDirecto((d) => ({ ...d, tipo_transporte: v }))}
                opcionVacia="Tipo de despacho"
                opciones={opcionesTipoDespacho}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <BuscadorLista
                value={directo.transportadora}
                onChange={(v) => setDirecto((d) => ({ ...d, transportadora: v }))}
                opcionVacia="Transportadora"
                opciones={TRANSPORTADORAS.map((t) => ({ value: t, label: t }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <BuscadorLista
                value={directo.fletes}
                onChange={(v) => setDirecto((d) => ({ ...d, fletes: v }))}
                opcionVacia="Fletes"
                opciones={FLETES.map((f) => ({ value: f, label: f }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
              <input type="text" placeholder="Notas" aria-label="Notas del despacho"
                value={directo.notas} onChange={(e) => setDirecto((d) => ({ ...d, notas: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
            </div>
          </div>

          {/* ── Lo que paga en el acto ────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Abono (opcional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CampoMonto decimales={0} placeholder="Cuánto paga ahora" aria-label="Abono"
                value={directo.abono} onChange={(e) => setDirecto((d) => ({ ...d, abono: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm font-mono text-right" />
              <BuscadorLista
                value={directo.metodo_pago}
                onChange={(v) => setDirecto((d) => ({ ...d, metodo_pago: v }))}
                opcionVacia="Método de pago"
                opciones={['efectivo', 'transferencia', 'cheque', 'otro'].map((m) => ({ value: m, label: m }))}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm" />
            </div>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">
              El despacho crea la venta y la deuda en cartera del cliente. Lo que abone
              aquí se registra de una vez; el resto queda como saldo.
            </p>
          </div>

          {/* ── Total, avisos y acciones ─────────────────── */}
          {(() => {
            const faltas = problemasDirecto();
            return (
              <>
                {faltas.length > 0 && (
                  /* Se dice QUÉ falta. Un botón apagado sin explicar por qué es
                     una pared: quien lo mira no sabe si le falta un dato o si el
                     sistema se rompió. */
                  <ul className="rounded-xl border border-warning/40 bg-warning/[0.07] px-4 py-3 text-xs text-warning space-y-0.5">
                    {faltas.slice(0, 4).map((f, i) => <li key={i}>· {f}</li>)}
                    {faltas.length > 4 && <li className="text-muted">y {faltas.length - 4} más…</li>}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/50">
                  <span className="text-sm text-muted">
                    Total <b className="font-mono tabular-nums text-primary ml-1">{formatCOP(totalDirecto)}</b>
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDirectoOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium">
                      Cancelar
                    </button>
                    <button type="button" onClick={crearDirecto}
                      disabled={creandoDirecto || faltas.length > 0}
                      className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl text-sm font-bold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Truck size={16} /> {creandoDirecto ? 'Creando…' : 'Crear despacho'}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      <Modal isOpen={transpOpen} onClose={cerrarTransportes} title="Tipos de transporte">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Esta es la lista que aparece al confirmar una salida. Agregar aquí evita que la misma
            transportadora quede escrita de varias formas. Puedes cambiarle el nombre a cualquiera
            con el lápiz; los despachos ya emitidos conservan el nombre con el que salieron.
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const nombre = nuevoTransp.trim();
              if (!nombre) return;
              try {
                await transportesApi.create({ nombre });
                addToast(`"${nombre}" agregado`, 'success');
                setNuevoTransp('');
                loadTransportes();
              } catch (err) { addToast(err.message, 'error'); }
            }}
            className="flex gap-2"
          >
            <input type="text" value={nuevoTransp} onChange={(e) => setNuevoTransp(e.target.value)}
              placeholder="Ej: Envía, Coordinadora, Servientrega…"
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
            <button type="submit" disabled={!nuevoTransp.trim()}
              className="px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold disabled:opacity-40">
              Agregar
            </button>
          </form>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
            {transportes.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Sin transportes en la lista</p>
            ) : transportes.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                {editTranspId === t.id ? (
                  <>
                    <input
                      type="text"
                      value={editTranspNombre}
                      autoFocus
                      onChange={(e) => setEditTranspNombre(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); renombrarTransporte(t.id); }
                        if (e.key === 'Escape') {
                          // stopPropagation es obligatorio: Modal escucha Escape en
                          // `document`, así que sin esto una sola pulsación cancelaba
                          // la edición Y cerraba el modal entero de transportes.
                          e.stopPropagation();
                          setEditTranspId(null);
                          setEditTranspNombre('');
                        }
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-border bg-surface text-sm text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <button type="button" title="Guardar el nuevo nombre"
                      disabled={!editTranspNombre.trim()}
                      onClick={() => renombrarTransporte(t.id)}
                      className="p-1.5 text-success rounded-lg hover:bg-success/10 disabled:opacity-40 flex-shrink-0">
                      <Check size={15} />
                    </button>
                    <button type="button" title="Cancelar"
                      onClick={() => { setEditTranspId(null); setEditTranspNombre(''); }}
                      className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-primary/5 flex-shrink-0">
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-primary truncate">{t.nombre}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button type="button" title="Cambiar el nombre"
                        onClick={() => { setEditTranspId(t.id); setEditTranspNombre(t.nombre); }}
                        className="p-1.5 text-muted hover:text-secondary rounded-lg hover:bg-secondary/5">
                        <Pencil size={14} />
                      </button>
                      <button type="button" title="Quitar de la lista"
                        onClick={async () => {
                          const ok = await confirm({
                            title: '¿Quitar transporte?',
                            message: `"${t.nombre}" dejará de aparecer en la lista. Los despachos ya emitidos lo conservan.`,
                            confirmText: 'Quitar', variant: 'danger',
                          });
                          if (!ok) return;
                          try {
                            await transportesApi.delete(t.id);
                            addToast('Transporte quitado', 'success');
                            loadTransportes();
                          } catch (err) { addToast(err.message, 'error'); }
                        }}
                        className="p-1.5 text-muted hover:text-error rounded-lg hover:bg-error/5">
                        <X size={15} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={cerrarTransportes}
              className="px-4 py-2 rounded-xl border border-border text-sm text-muted hover:text-primary hover:bg-primary/5">
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* ══ VARIOS DESPACHOS A LA VEZ ═══════════════════════════════
          La tanda del día ya existe en una hoja de cálculo. Aquí se pega y se
          parte en despachos sola, agrupando por cliente. Un renglón es una
          LÍNEA, no un despacho: cinco referencias para la misma persona son
          cinco renglones y un solo despacho. */}
      {/* `full` y no `xl`: son diez columnas, y en max-w-4xl las palabras se
          parten a mitad. Esta rejilla es una hoja de cálculo, y una hoja de
          cálculo necesita ancho. */}
      <Modal isOpen={loteOpen} onClose={() => setLoteOpen(false)}
             title="Varios despachos a la vez" size="full">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="lote-fecha" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Fecha de todos
              </label>
              <input id="lote-fecha" type="date"
                value={lote.fecha}
                onChange={(e) => setLote((L) => ({ ...L, fecha: e.target.value }))}
                className="px-4 py-2.5 rounded-xl border border-border bg-surface text-sm" />
            </div>
            <p className="flex-1 min-w-[16rem] text-[11px] text-muted leading-snug">
              <strong className="text-primary">Pega desde Excel</strong> en cualquier casilla y las
              filas se llenan solas desde ahí. El orden sin rótulos es{' '}
              {CAMPOS_DESPACHO.map((c) => c.rotulo).join(' · ')}. Si un renglón
              viene sin cliente, se le pone el del renglón de arriba.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 overflow-x-auto">
            <table className="w-full text-xs min-w-[64rem]">
              <thead>
                <tr className="bg-primary/[0.03] text-[10px] font-bold text-muted uppercase tracking-wider">
                  <th className="px-2 py-2 text-left w-[17%]">Cliente *</th>
                  <th className="px-2 py-2 text-left w-[17%]">Referencia *</th>
                  <th className="px-2 py-2 text-left w-[10%]">Calidad</th>
                  <th className="px-2 py-2 text-center w-[7%]">Cant. *</th>
                  <th className="px-2 py-2 text-right w-[11%]">Precio *</th>
                  <th className="px-2 py-2 text-right w-[10%]">Dcto. c/u</th>
                  <th className="px-2 py-2 text-left w-[10%]">Tipo</th>
                  <th className="px-2 py-2 text-left w-[10%]">Transp.</th>
                  <th className="px-2 py-2 text-left w-[9%]">Fletes</th>
                  <th className="px-2 py-2 w-[3%]"><span className="sr-only">Quitar</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {lote.lineas.map((l, i) => {
                  const cli = resolverCliente(l.cliente);
                  const clienteMal = cli !== 'vacio' && (cli === 'ambiguo' || !cli);
                  const hay = l.referencia ? hayDe(l.referencia, l.calidad) : null;
                  const disp = hay?.disponibles || 0;
                  const cant = parseInt(l.cantidad) || 0;
                  const excede = Boolean(l.referencia) && cant > disp;
                  const dcto = parseMonto(l.descuento_unitario) || 0;
                  const dctoExcede = dcto > 0 && dcto > (parseMonto(l.precio_unitario) || 0);
                  return (
                    /* El onPaste va en la FILA: pegar en cualquiera de sus
                       casillas llena desde esta fila hacia abajo, que es lo que
                       uno espera al pegar en una hoja de cálculo. */
                    <tr key={i} onPaste={pegarEnLote(i)}
                        className={clienteMal || excede || dctoExcede ? 'bg-warning/[0.07]' : ''}>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.cliente}
                          onChange={(v) => setLineaLote(i, 'cliente', v)}
                          opciones={clientes.map((c) => ({ value: c.nombre, label: c.nombre, detalle: c.ciudad || '' }))}
                          placeholder="Cliente"
                          anchoLista={260}
                          className={`w-full px-2 py-1.5 rounded-lg border bg-surface text-xs ${
                            clienteMal ? 'border-error' : 'border-border'}`} />
                        {/* Se dice QUÉ pasa con ese nombre. Un nombre pegado que
                            no casa con ningún cliente no se sustituye por el más
                            parecido: cargarle la deuda al cliente equivocado no
                            se descubre hasta que él la reclama. */}
                        {clienteMal && (
                          <p className="text-[9px] mt-0.5 leading-none text-error font-bold">
                            {cli === 'ambiguo' ? 'hay varios con ese nombre' : 'no está en los clientes'}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.referencia}
                          onChange={(v) => setLineaLote(i, 'referencia', v)}
                          opciones={refsDirecto.map((r) => ({ value: r, label: r }))}
                          placeholder="Referencia"
                          anchoLista={260}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.calidad}
                          onChange={(v) => setLineaLote(i, 'calidad', v)}
                          opciones={calidadesDe(l.referencia).map((q) => ({ value: q, label: q || '—' }))}
                          placeholder="Calidad"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <CampoMonto decimales={0} placeholder="0"
                          value={l.cantidad}
                          onChange={(e) => setLineaLote(i, 'cantidad', e.target.value)}
                          aria-label={`Cantidad de la fila ${i + 1}`}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs text-center font-mono" />
                        {l.referencia && (
                          <p className={`text-[9px] mt-0.5 text-center leading-none ${excede ? 'text-warning font-bold' : 'text-muted'}`}>
                            hay {disp}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <CampoMonto decimales={0} placeholder="0"
                          value={l.precio_unitario}
                          onChange={(e) => setLineaLote(i, 'precio_unitario', e.target.value)}
                          aria-label={`Precio de la fila ${i + 1}`}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs text-right font-mono" />
                      </td>
                      <td className="px-2 py-1.5">
                        <CampoMonto decimales={0} placeholder="0"
                          value={l.descuento_unitario}
                          onChange={(e) => setLineaLote(i, 'descuento_unitario', e.target.value)}
                          aria-label={`Descuento por unidad de la fila ${i + 1}`}
                          className={`w-full px-2 py-1.5 rounded-lg border bg-surface text-xs text-right font-mono ${
                            dctoExcede ? 'border-error text-error' : 'border-border'}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.tipo_transporte}
                          onChange={(v) => setLineaLote(i, 'tipo_transporte', v)}
                          opciones={opcionesTipoDespacho}
                          placeholder="Tipo"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.transportadora}
                          onChange={(v) => setLineaLote(i, 'transportadora', v)}
                          opciones={TRANSPORTADORAS.map((t) => ({ value: t, label: t }))}
                          placeholder="Transp."
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <BuscadorLista
                          value={l.fletes}
                          onChange={(v) => setLineaLote(i, 'fletes', v)}
                          opciones={FLETES.map((f) => ({ value: f, label: f }))}
                          placeholder="Fletes"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs" />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {lote.lineas.length > 1 && (
                          <button type="button"
                            onClick={() => setLote((L) => ({ ...L, lineas: L.lineas.filter((_, j) => j !== i) }))}
                            aria-label={`Quitar la fila ${i + 1}`}
                            className="p-1 rounded-md text-muted hover:text-error hover:bg-error/10">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button"
              onClick={() => setLote((L) => ({
                ...L, lineas: [...L.lineas, ...Array.from({ length: 5 }, () => ({ ...LINEA_LOTE }))],
              }))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-secondary/40 text-secondary text-xs font-semibold hover:bg-secondary/5">
              <Plus size={13} /> 5 filas más
            </button>
            <button type="button"
              onClick={() => setLote((L) => ({
                ...L, lineas: Array.from({ length: FILAS_LOTE_INICIALES }, () => ({ ...LINEA_LOTE })),
              }))}
              className="px-3 py-2 rounded-lg border border-border text-muted text-xs font-semibold hover:text-primary hover:bg-primary/5">
              Vaciar la rejilla
            </button>
          </div>

          {/* En qué se va a convertir la rejilla. Es la comprobación que
              importa: lo que se crea son DESPACHOS, no filas, y agrupar por
              cliente es la única decisión que esta pantalla toma sola. */}
          {despachosDelLote.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-primary/[0.02] p-3">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
                Van a quedar {despachosDelLote.length} despacho(s)
              </p>
              <ul className="space-y-1">
                {despachosDelLote.map((g, i) => {
                  const unidades = g.lineas.reduce((n, l) => n + (parseInt(l.cantidad) || 0), 0);
                  const plata = g.lineas.reduce((n, l) => n + (parseInt(l.cantidad) || 0) * netoLinea(l), 0);
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-primary font-semibold">{g.nombre || <em className="text-error">sin cliente</em>}</span>
                      <span className="flex-shrink-0 text-muted">
                        {g.lineas.length} línea(s) · {unidades} unidad(es)
                        {g.transporte.tipo_transporte ? ` · ${g.transporte.tipo_transporte}` : ''}
                        {g.transporte.transportadora ? ` · ${g.transporte.transportadora}` : ''}
                        {g.transporte.fletes ? ` · ${g.transporte.fletes}` : ''}
                      </span>
                      <span className="flex-shrink-0 font-mono font-semibold text-secondary">{formatCurrency(plata)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(() => {
            const faltas = problemasLote();
            const vacia = lineasUtilesLote().length === 0;
            return (
              <>
                {!vacia && faltas.length > 0 && (
                  <ul className="rounded-xl border border-warning/40 bg-warning/[0.07] px-4 py-3 text-xs text-warning space-y-0.5">
                    {faltas.slice(0, 5).map((f, i) => <li key={i}>· {f}</li>)}
                    {faltas.length > 5 && <li className="text-muted">y {faltas.length - 5} más…</li>}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
                  <div>
                    <p className="text-sm font-bold text-primary">{formatCurrency(totalLote)}</p>
                    <p className="text-[11px] text-muted">
                      {lineasUtilesLote().length} línea(s) en {despachosDelLote.length} despacho(s).
                      Se crean todos o ninguno.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setLoteOpen(false)}
                      className="px-4 py-2 rounded-xl border border-border text-muted hover:text-primary text-sm font-medium">
                      Cancelar
                    </button>
                    <button type="button" onClick={crearLote}
                      disabled={creandoLote || vacia || faltas.length > 0}
                      className="flex items-center gap-2 px-5 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all">
                      {creandoLote ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      {creandoLote ? 'Creando…' : `Crear ${despachosDelLote.length || ''} despacho(s)`}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      {/* ══ CONFIRMAR LA SALIDA DE TODOS ════════════════════════════
          La bodega se recorre UNA vez. Marcar y desmarcar es lo mismo que en la
          vista de un solo despacho; la diferencia es que están todos juntos y
          salen de una. Lo que se desmarca NO sale y su despacho queda
          parcial. */}
      <Modal isOpen={salidaOpen} onClose={() => setSalidaOpen(false)}
             title="Confirmar salida de bodega" size="xl">
        <div className="space-y-4">
          {salidaCargando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
              <Loader2 size={18} className="animate-spin" /> Leyendo los despachos pendientes…
            </div>
          ) : salidaLista.length === 0 ? (
            <EmptyState icon={Truck} title="No hay nada que sacar"
              description="Ninguno de los despachos pendientes tiene unidades esperando salida." />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="salida-fecha" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Fecha de salida
                  </label>
                  {/* La mercancía pudo salir el viernes y esto registrarse el
                      lunes. Sin este campo habría que mentirle la fecha al
                      sistema o corregirla después a mano. */}
                  <input id="salida-fecha" type="date"
                    value={salidaFecha}
                    onChange={(e) => setSalidaFecha(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-surface text-sm" />
                </div>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { const n = {}; for (const d of salidaLista) for (const i of pendientesDe(d)) n[i.paca_id] = true; setSalidaSel(n); }}
                    className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:text-primary hover:bg-primary/5">
                    Marcar todo
                  </button>
                  <button type="button"
                    onClick={() => setSalidaSel({})}
                    className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:text-primary hover:bg-primary/5">
                    Desmarcar todo
                  </button>
                </div>
                <p className="flex-1 min-w-[14rem] text-[11px] text-muted leading-snug">
                  Al confirmar se descarga el Excel de bodega con todo lo que sale.
                  Cada despacho puede bajarse aparte con su propio botón.
                </p>
              </div>

              <div className="max-h-[26rem] overflow-y-auto space-y-3 pr-1">
                {salidaLista.map((d) => {
                  const pend = pendientesDe(d);
                  const marcados = idsMarcados(d);
                  const todos = marcados.length === pend.length;
                  return (
                    <div key={d.id} className={`rounded-xl border overflow-hidden ${
                      marcados.length ? 'border-success/40' : 'border-border/60'}`}>
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary/[0.03]">
                        <input type="checkbox"
                          checked={todos}
                          ref={(el) => { if (el) el.indeterminate = marcados.length > 0 && !todos; }}
                          onChange={(e) => marcarDespacho(d, e.target.checked)}
                          aria-label={`Marcar todas las unidades del despacho ${d.numero}`}
                          className="w-4 h-4 accent-success flex-shrink-0" />
                        <span className="font-mono text-xs font-bold text-primary">{d.numero}</span>
                        <span className="text-sm text-primary truncate flex-1 min-w-0">{d.cliente_nombre}</span>
                        <span className="text-[11px] text-muted flex-shrink-0">
                          {marcados.length} de {pend.length}
                          {marcados.length > 0 && marcados.length < pend.length && (
                            <strong className="text-warning"> · queda parcial</strong>
                          )}
                        </span>
                        <button type="button" onClick={() => pdfDeUno(d)}
                          disabled={!marcados.length}
                          title={`Descargar el papel de bodega de ${d.numero}, para imprimir`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                          <FileText size={12} /> PDF
                        </button>
                        <button type="button" onClick={() => excelDeUno(d)}
                          disabled={!marcados.length}
                          title={`Descargar sólo el Excel de ${d.numero}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                          <FileSpreadsheet size={12} /> Excel
                        </button>
                      </div>
                      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {pend.map((item) => (
                          <label key={item.paca_id}
                            className={`flex items-center gap-2 px-2 py-2 rounded-lg border cursor-pointer transition-colors ${
                              salidaSel[item.paca_id]
                                ? 'border-success/40 bg-success/5'
                                : 'border-border/50 bg-surface'}`}>
                            <input type="checkbox"
                              checked={!!salidaSel[item.paca_id]}
                              onChange={(e) => setSalidaSel((x) => ({ ...x, [item.paca_id]: e.target.checked }))}
                              className="w-4 h-4 accent-success flex-shrink-0" />
                            <span className="flex-1 min-w-0 text-xs text-primary truncate">
                              {item.referencia}{item.calidad ? ` / ${item.calidad}` : ''}
                            </span>
                            <span className="text-[11px] font-mono text-secondary flex-shrink-0">
                              {formatCurrency((parseFloat(item.precio_unitario) || 0) - (parseFloat(item.descuento_unitario) || 0))}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
                <div>
                  <p className="text-sm font-bold text-primary">{totalMarcado} unidad(es) van a salir</p>
                  <p className="text-[11px] text-muted">
                    de {salidaLista.reduce((n, d) => n + pendientesDe(d).length, 0)} pendientes,
                    en {salidaLista.filter((d) => idsMarcados(d).length).length} despacho(s)
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* PDF primero: es el que se imprime y se lleva a la bodega.
                      El Excel se queda para quien lo quiera tal cual. */}
                  <button type="button" onClick={pdfDeLaSalida}
                    disabled={!totalMarcado}
                    title="El papel de bodega, para imprimir: qué recoger y cómo empacarlo"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-secondary/40 text-sm font-semibold text-secondary hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed">
                    <FileText size={15} /> PDF de bodega
                  </button>
                  <button type="button" onClick={excelDeLaSalida}
                    disabled={!totalMarcado}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed">
                    <FileSpreadsheet size={15} /> Excel
                  </button>
                  <button type="button" onClick={() => setSalidaOpen(false)}
                    className="px-4 py-2 rounded-xl border border-border text-muted hover:text-primary text-sm font-medium">
                    Cancelar
                  </button>
                  <button type="button" onClick={confirmarSalidaGeneral}
                    disabled={salidaEnviando || !totalMarcado}
                    className="flex items-center gap-2 px-5 py-2 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all">
                    {salidaEnviando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    {salidaEnviando ? 'Confirmando…' : 'Confirmar la salida'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
