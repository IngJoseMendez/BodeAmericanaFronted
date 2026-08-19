import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink } from '../components/common';
import { despachosApi, pacasApi, transportesApi } from '../services/api';
import { Truck, Eye, CheckCircle, X, Clock, Package, Search, AlertTriangle, Download, Printer, Users } from 'lucide-react';
import { hoy, formatFecha } from '../lib/fecha';
import { formatCOP } from '../lib/money';

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
            <Icon className="w-5 h-5 text-white" />
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
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Bodega_${despacho.numero || 'despacho'}_${hoy()}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${despacho.numero}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function imprimirDespacho(despacho) {
  const items = despacho.items || [];
  const subtotalPacas = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
  const descuento  = parseFloat(despacho.cot_descuento || 0);
  const transporte = parseFloat(despacho.cot_transporte || 0);
  const subtotalCot = despacho.cot_subtotal != null ? parseFloat(despacho.cot_subtotal) : subtotalPacas;
  const total = despacho.cot_total != null ? parseFloat(despacho.cot_total) : subtotalPacas;
  const filas = items.map(i => `
    <tr>
      <td>${i.paca_uuid?.slice(0, 8) || ''}</td>
      <td>${i.clasificacion || ''}</td>
      <td>${i.referencia || ''}</td>
      <td>${i.calidad || '—'}</td>
      <td style="text-align:right">${formatCurrency(i.precio_unitario)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${despacho.numero}</title>
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
    <h1>Despacho ${despacho.numero}</h1>
    <div class="meta">
      Cliente: <strong>${despacho.cliente_nombre}</strong> &nbsp;|&nbsp;
      ${despacho.cotizacion_numero ? `Cotización: ${despacho.cotizacion_numero} &nbsp;|&nbsp;` : ''}
      Fecha: ${formatDate(despacho.fecha)} &nbsp;|&nbsp;
      Estado: ${despacho.estado}
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

  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html);
  w.document.close();
}

export default function Despachos() {
  const [despachos, setDespachos]               = useState([]);
  const [transportes, setTransportes]           = useState([]);
  const [transpOpen, setTranspOpen]             = useState(false);
  const [nuevoTransp, setNuevoTransp]           = useState('');
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState(null);
  const [viewModalOpen, setViewModalOpen]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [seleccion, setSeleccion]               = useState({});
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
        `${result.pacas_vendidas} unidad(es) despachada(s)${result.pacas_pendientes ? ` · ${result.pacas_pendientes} pendiente(s)` : ''}`,
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
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Buscar por número o cliente..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30" />
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
                      <tr key={d.id} className="hover:bg-primary/3 transition-colors duration-150 bg-warning/3">
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
                          <tr key={d.id} className="hover:bg-success/3 transition-colors duration-150">
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
                <button onClick={() => imprimirDespacho(selectedDespacho)}
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
      <Modal isOpen={transpOpen} onClose={() => setTranspOpen(false)} title="Tipos de transporte">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Esta es la lista que aparece al confirmar una salida. Agregar aquí evita que la misma
            transportadora quede escrita de varias formas.
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
                <span className="text-sm text-primary truncate">{t.nombre}</span>
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
                  className="p-1.5 text-muted hover:text-error rounded-lg hover:bg-error/5 flex-shrink-0">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={() => setTranspOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm text-muted hover:text-primary hover:bg-primary/5">
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
