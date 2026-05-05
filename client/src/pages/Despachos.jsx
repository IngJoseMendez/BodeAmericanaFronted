import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Modal, useToast, useConfirm } from '../components/common';
import { despachosApi } from '../services/api';
import { Truck, Eye, CheckCircle, X, Clock, Package, Search, AlertTriangle, Download, Printer } from 'lucide-react';

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

  // Hoja resumen
  const ws = wb.addWorksheet('Despacho');
  ws.columns = [
    { header: 'Campo', key: 'campo', width: 20 },
    { header: 'Valor', key: 'valor', width: 40 },
  ];
  [
    ['Número', despacho.numero],
    ['Cliente', despacho.cliente_nombre],
    ['Cotización', despacho.cotizacion_numero || '—'],
    ['Fecha', formatDate(despacho.fecha)],
    ['Estado', despacho.estado],
    ['Total', formatCurrency((despacho.items || []).reduce((s, i) => s + parseFloat(i.precio_unitario || 0), 0))],
  ].forEach(([campo, valor]) => ws.addRow({ campo, valor }));

  ws.getRow(1).font = { bold: true };

  // Hoja items
  const wi = wb.addWorksheet('Unidades');
  wi.columns = [
    { header: 'UUID',          key: 'uuid',       width: 12 },
    { header: 'Clasificación', key: 'clas',       width: 18 },
    { header: 'Referencia',    key: 'ref',        width: 18 },
    { header: 'Calidad',       key: 'cal',        width: 14 },
    { header: 'Precio',        key: 'precio',     width: 16 },
  ];
  (despacho.items || []).forEach(item => {
    wi.addRow({
      uuid:   item.paca_uuid?.slice(0, 8),
      clas:   item.clasificacion,
      ref:    item.referencia,
      cal:    item.calidad || '—',
      precio: parseFloat(item.precio_unitario || 0),
    });
  });
  wi.getRow(1).font = { bold: true };
  wi.getColumn('precio').numFmt = '#,##0';

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
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
      th { background: #f0f0f0; padding: 6px 8px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
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
  const [despachos, setDespachos]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [search, setSearch]             = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState(null);
  const [viewModalOpen, setViewModalOpen]       = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [seleccion, setSeleccion]               = useState({});
  const [submitting, setSubmitting]             = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => { loadDespachos(); }, [filtroEstado]);

  const loadDespachos = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await despachosApi.getAll(params);
      setDespachos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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
      if (result.pacas_pendientes > 0) {
        const updated = await despachosApi.getOne(selectedDespacho.id);
        setSelectedDespacho(updated);
      } else {
        setViewModalOpen(false);
      }
      loadDespachos();
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

  const enProceso   = despachos.filter(d => d.estado === 'en_proceso').length;
  const confirmados = despachos.filter(d => d.estado === 'confirmado').length;
  const anulados    = despachos.filter(d => d.estado === 'anulado').length;
  const totalItems  = despachos.reduce((s, d) => s + (parseInt(d.num_items) || 0), 0);

  return (
    <Layout title="Despachos" subtitle={`${despachos.length} despachos registrados`}>
      <div className="space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="En Proceso"  value={enProceso}   icon={Clock}       color="bg-warning/70"   sub="pendientes de confirmar salida" />
          <KpiCard label="Confirmados" value={confirmados} icon={CheckCircle} color="bg-success/70"   sub="salidas confirmadas" />
          <KpiCard label="Anulados"    value={anulados}    icon={X}           color="bg-error/70"     sub="este período" />
          <KpiCard label="Unidades"    value={totalItems}  icon={Package}     color="bg-secondary/70" sub="en todos los despachos" />
        </div>

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input type="text" placeholder="Buscar por número o cliente..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30" />
          </div>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-4 py-3 rounded-xl border border-border bg-surface">
            <option value="">Todos los estados</option>
            <option value="en_proceso">En Proceso</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
          </select>
        </div>

        {/* Tabla */}
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
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No hay despachos</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id} className={`hover:bg-primary/3 transition-colors ${d.estado === 'en_proceso' ? 'bg-warning/3' : ''}`}>
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
                      <tr key={i} className={`hover:bg-primary/3 ${item.paca_estado === 'vendida' ? 'opacity-60' : ''}`}>
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

            {/* Footer con acciones + exportar */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
              {/* Exportar */}
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

              {/* Acciones de estado */}
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
                  <CheckCircle size={15} /> Mercancía despachada
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
              <span>Selecciona las unidades que saldrán físicamente de bodega ahora. Las unidades no seleccionadas quedarán pendientes para despacho posterior.</span>
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
                  <CheckCircle size={15} />
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
