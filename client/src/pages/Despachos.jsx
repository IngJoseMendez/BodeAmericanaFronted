import { useEffect, useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Modal, useToast, useConfirm, TableSkeleton, EmptyState } from '../components/common';
import { despachosApi } from '../services/api';
import { Truck, Eye, CheckCircle, X, Clock, Package, Search, AlertTriangle, Download, Printer, Users } from 'lucide-react';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

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

async function exportarExcel(despacho) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bodega Americana';
  wb.created  = new Date();

  const PRIMARY   = '0f172a';
  const SECONDARY = '6366f1';
  const SUCCESS   = '16a34a';
  const WARNING   = 'f59e0b';
  const LIGHT     = 'f8fafc';
  const WHITE     = 'FFFFFF';

  const items     = despacho.items || [];
  const vendidas  = items.filter(i => i.paca_estado === 'vendida');
  const pendientes= items.filter(i => i.paca_estado !== 'vendida');
  const total     = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
  const totalVend = vendidas.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);

  // ── Hoja 1: Resumen ─────────────────────────────────────────────
  const ws = wb.addWorksheet('Resumen');
  ws.properties.tabColor = { argb: PRIMARY };

  // Banner título
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value     = 'BODEGA AMERICANA';
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
  const infoRows = [
    ['Número de Despacho', despacho.numero],
    ['Cliente', despacho.cliente_nombre],
    ['Cotización', despacho.cotizacion_numero || '—'],
    ['Fecha Despacho', formatDate(despacho.fecha)],
    ['Fecha Salida', formatDate(despacho.fecha_salida)],
    ['Estado', despacho.estado === 'confirmado' ? 'CONFIRMADO' : despacho.estado === 'en_proceso' ? 'EN PROCESO' : 'ANULADO'],
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

  [[vendidas.length, 'Unidades despachadas', SUCCESS],
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

  // Total
  const totalRow = kpiRow + 3;
  ws.getRow(totalRow - 1).height = 12;
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
  const headers = ['#', 'UUID', 'Clasificación', 'Referencia', 'Calidad', 'Precio', 'Estado'];
  const hRow = wi.getRow(1);
  hRow.height = 28;
  headers.forEach((h, ci) => {
    const cell = hRow.getCell(ci + 1);
    cell.value     = h;
    cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
    cell.alignment = { horizontal: ci >= 5 ? 'right' : 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'thin', color: { argb: SECONDARY } } };
  });

  items.forEach((item, idx) => {
    const r = wi.getRow(2 + idx);
    r.height = 20;
    const isVendida = item.paca_estado === 'vendida';
    const bg = idx % 2 === 0 ? LIGHT : WHITE;

    const vals = [
      idx + 1,
      item.paca_uuid?.slice(0, 8) || '—',
      item.clasificacion || '—',
      item.referencia || '—',
      item.calidad || '—',
      parseFloat(item.precio_unitario || 0),
      isVendida ? 'Despachado' : 'Pendiente',
    ];
    vals.forEach((val, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value     = val;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: ci >= 5 ? 'right' : ci === 0 ? 'center' : 'left', indent: ci > 0 && ci < 5 ? 1 : 0 };
      if (ci === 5) {
        cell.numFmt = '$#,##0';
        cell.font   = { bold: true, color: { argb: SECONDARY } };
      } else if (ci === 6) {
        cell.font = { bold: true, color: { argb: isVendida ? SUCCESS : WARNING } };
      } else {
        cell.font = { size: 9, color: { argb: PRIMARY } };
      }
    });
  });

  // Fila total
  const totRow = wi.getRow(2 + items.length);
  totRow.height = 24;
  wi.mergeCells(`A${2 + items.length}:E${2 + items.length}`);
  const totLbl = totRow.getCell(1);
  totLbl.value     = 'TOTAL';
  totLbl.font      = { bold: true, size: 10, color: { argb: WHITE } };
  totLbl.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  totLbl.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const totVal = totRow.getCell(6);
  totVal.value     = total;
  totVal.numFmt    = '$#,##0';
  totVal.font      = { bold: true, color: { argb: WHITE } };
  totVal.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
  totVal.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  totRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };

  wi.getColumn(1).width  = 5;
  wi.getColumn(2).width  = 12;
  wi.getColumn(3).width  = 20;
  wi.getColumn(4).width  = 20;
  wi.getColumn(5).width  = 16;
  wi.getColumn(6).width  = 18;
  wi.getColumn(7).width  = 14;

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
  const total = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0);
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
      <tfoot><tr><td colspan="4">Total</td><td style="text-align:right">${formatCurrency(total)}</td></tr></tfoot>
    </table>
    <script>window.onload=()=>{window.print();window.close();}</script>
    </body></html>`;

  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html);
  w.document.close();
}

export default function Despachos() {
  const [despachos, setDespachos]               = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState(null);
  const [viewModalOpen, setViewModalOpen]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [seleccion, setSeleccion]               = useState({});
  const [submitting, setSubmitting]             = useState(false);

  // Sección Despachados
  const [vistaActiva, setVistaActiva]               = useState('pendientes');
  const [despachados, setDespachados]               = useState([]);
  const [loadingDespachados, setLoadingDespachados] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => { loadDespachos(); }, []);

  useEffect(() => {
    if (vistaActiva === 'despachados' && despachados.length === 0) {
      loadDespachados();
    }
  }, [vistaActiva]);

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
      const data = await despachosApi.getAll({ estado: 'confirmado' });
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
    const pendientes = (selectedDespacho?.items || []).filter(i => i.paca_estado === 'separada');
    if (!pendientes.length) { addToast('No hay unidades pendientes de despacho', 'warning'); return; }
    const init = {};
    pendientes.forEach(i => { init[i.paca_id] = true; });
    setSeleccion(init);
    setConfirmModalOpen(true);
  };

  const handleConfirmar = async () => {
    const pacaIds = Object.entries(seleccion)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id));
    if (!pacaIds.length) { addToast('Selecciona al menos una unidad', 'warning'); return; }
    try {
      setSubmitting(true);
      const result = await despachosApi.confirmar(selectedDespacho.id, { paca_ids: pacaIds });
      addToast(
        `${result.pacas_vendidas} unidad(es) despachada(s)${result.pacas_pendientes ? ` · ${result.pacas_pendientes} pendiente(s)` : ''}`,
        'success'
      );
      setConfirmModalOpen(false);

      // Recargar despacho completo y exportar Excel automáticamente
      const updated = await despachosApi.getOne(selectedDespacho.id);
      setSelectedDespacho(updated);
      await exportarExcel(updated);

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
                        <td className="px-4 py-3 text-sm font-semibold text-primary">{d.cliente_nombre}</td>
                        <td className="px-4 py-3">
                          {d.cotizacion_numero
                            ? <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">{d.cotizacion_numero}</span>
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
                title="Sin despachos confirmados"
                description="Los despachos confirmados aparecerán aquí agrupados por cliente"
              />
            ) : despachadosAgrupados.map(([cliente, items]) => {
              const totalUds   = items.reduce((s, d) => s + (parseInt(d.num_items) || 0), 0);
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
                        <p className="font-display font-bold text-primary text-sm">{cliente}</p>
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
                          {['Número', 'Cotización', 'Fecha Salida', 'Unidades', 'Total', ''].map(h => (
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
                                ? <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">{d.cotizacion_numero}</span>
                                : <span className="text-muted/40 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-success font-medium whitespace-nowrap">{formatDate(d.fecha_salida || d.fecha)}</td>
                            <td className="px-4 py-3 text-center font-mono font-bold text-primary">{d.num_items || 0}</td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">{formatCurrency(d.total)}</td>
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
              <span className="text-xs text-muted">Cliente: <strong className="text-primary">{selectedDespacho.cliente_nombre}</strong></span>
              {selectedDespacho.cotizacion_numero && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">Cot. {selectedDespacho.cotizacion_numero}</span>
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
                      <tr key={i} className={`hover:bg-primary/3 transition-colors ${item.paca_estado === 'vendida' ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-2 text-xs text-muted font-mono">{item.paca_uuid?.slice(0, 8)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-primary capitalize">{item.clasificacion}</td>
                        <td className="px-4 py-2 text-sm text-muted capitalize">{item.referencia}</td>
                        <td className="px-4 py-2 text-sm text-muted capitalize">{item.calidad || '—'}</td>
                        <td className="px-4 py-2">
                          {item.paca_estado === 'vendida'
                            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">Despachado</span>
                            : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning">Pendiente</span>
                          }
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-secondary">{formatCurrency(item.precio_unitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5 border-t border-border/40">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm font-bold text-primary">Total</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                        {formatCurrency((selectedDespacho.items || []).reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0))}
                      </td>
                    </tr>
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-xs font-medium transition-colors">
                  <Download size={13} /> Excel
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
                      .filter(i => i.paca_estado === 'separada')
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
                  .filter(i => i.paca_estado === 'separada')
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
    </Layout>
  );
}
