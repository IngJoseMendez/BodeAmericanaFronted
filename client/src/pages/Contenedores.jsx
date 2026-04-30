import { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import {
  Package2, Plus, Edit2, Trash2, Eye, CheckCircle, X,
  TrendingUp, DollarSign, Archive, Boxes,
  ArrowRight, AlertTriangle, Layers, Search, Download,
  BarChart2, Calendar, List, ChevronRight, BookTemplate, Save,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Modal, useToast, useConfirm } from '../components/common';
import { contenedoresApi, tiposPacaApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

// ── Constants ────────────────────────────────────────────────────
const TIPOS_SERVICIO = ['transporte', 'aduana', 'cargue', 'descargue', 'almacenaje', 'otro'];

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Factory helpers ───────────────────────────────────────────────
const emptyProveedor = () => ({
  proveedor_nombre: '', moneda: 'USD', costo: '', notas: '',
  detalles: [{ clasificacion: '', referencia: '', calidad: '', cantidad: '' }],
});
const emptyServicio = () => ({ proveedor_nombre: '', tipo_servicio: '', moneda: 'COP', costo: '', notas: '' });

// ── Price input with auto-formatting ─────────────────────────────
function PriceInput({ value, onChange, className = '', placeholder = '0', ...rest }) {
  const [focused, setFocused] = useState(false);

  const formatDisplay = (raw) => {
    const n = parseFloat(raw);
    if (!raw || isNaN(n)) return '';
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  };

  const handleChange = (e) => {
    const stripped = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    onChange(stripped);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={focused ? value : formatDisplay(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={handleChange}
    />
  );
}

// ── Shared style tokens ───────────────────────────────────────────
const inpBase =
  'px-3 py-2.5 rounded-xl border border-border bg-surface text-primary text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30 ' +
  'placeholder:text-muted/60 transition-colors duration-150';
const inp = `w-full ${inpBase}`;
const lbl = 'block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider';

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ estado }) {
  const isFinal = estado === 'finalizado';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isFinal ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isFinal ? 'bg-success' : 'bg-warning'}`} />
      {isFinal ? 'Finalizado' : 'Borrador'}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-surface rounded-2xl p-5 border border-border/60 shadow-card hover:shadow-card-hover transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</p>
        <div className={`p-2 rounded-xl ${color} transition-transform duration-200 group-hover:scale-110`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-display font-bold text-primary">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

// ── Timeline View ─────────────────────────────────────────────────
function TimelineView({ items, onView }) {
  const withDate = [...items]
    .filter(c => c.fecha_llegada)
    .sort((a, b) => new Date(a.fecha_llegada) - new Date(b.fecha_llegada));
  const withoutDate = items.filter(c => !c.fecha_llegada);

  const groups = {};
  withDate.forEach(c => {
    const key = new Date(c.fecha_llegada).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Package2 size={32} className="text-muted/40" />
        <p className="text-muted text-sm">No hay contenedores para mostrar</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-2">
      {Object.entries(groups).map(([month, conts]) => (
        <div key={month} className="mb-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 text-secondary rounded-full flex-shrink-0">
              <Calendar size={11} />
              <span className="text-xs font-bold capitalize">{month}</span>
            </div>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted flex-shrink-0">{conts.length} contenedor{conts.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="relative pl-7 space-y-2.5 mb-5">
            <div className="absolute left-2.5 top-1 bottom-4 w-px bg-border/50" />
            {conts.map(cont => (
              <div key={cont.id} className="relative flex items-center gap-3">
                <div className={`absolute left-[-15px] w-3.5 h-3.5 rounded-full border-2 border-surface flex-shrink-0 ${cont.estado === 'finalizado' ? 'bg-success' : 'bg-warning'}`} />
                <div
                  className="flex-1 flex items-center justify-between bg-surface border border-border/60 rounded-xl px-4 py-3 hover:border-secondary/30 hover:shadow-sm transition-all duration-150 cursor-pointer group"
                  onClick={() => onView(cont)}
                >
                  <div>
                    <p className="font-semibold text-primary font-heading text-sm">{cont.numero}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(cont.fecha_llegada).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      {' · '}{parseInt(cont.total_pacas).toLocaleString()} pacas
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isAdmin && parseFloat(cont.costo_unitario) > 0 && (
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-muted uppercase tracking-wide">Costo/paca</p>
                        <p className="text-sm font-mono font-bold text-secondary">{formatCurrency(cont.costo_unitario)}</p>
                      </div>
                    )}
                    <StatusBadge estado={cont.estado} />
                    <ChevronRight size={14} className="text-muted/50 group-hover:text-secondary transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {withoutDate.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="px-3 py-1.5 bg-primary/8 text-muted rounded-full text-xs font-bold flex-shrink-0">Sin fecha</div>
            <div className="flex-1 h-px bg-border/40" />
          </div>
          <div className="relative pl-7 space-y-2.5">
            <div className="absolute left-2.5 top-1 bottom-2 w-px bg-border/40" />
            {withoutDate.map(cont => (
              <div key={cont.id} className="relative flex items-center gap-3">
                <div className="absolute left-[-15px] w-3.5 h-3.5 rounded-full border-2 border-surface bg-muted/40" />
                <div
                  className="flex-1 flex items-center justify-between bg-surface border border-border/60 rounded-xl px-4 py-3 hover:border-secondary/30 transition-all duration-150 cursor-pointer"
                  onClick={() => onView(cont)}
                >
                  <p className="font-semibold text-primary text-sm">{cont.numero}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{parseInt(cont.total_pacas).toLocaleString()} pacas</span>
                    <StatusBadge estado={cont.estado} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comparador Modal ──────────────────────────────────────────────
function ComparadorModal({ isOpen, onClose, items }) {
  const finalizados = items.filter(c => c.estado === 'finalizado');
  const costos = finalizados.map(c => parseFloat(c.costo_unitario) || 0).filter(v => v > 0);
  const minCosto = costos.length ? Math.min(...costos) : 0;
  const maxCosto = costos.length ? Math.max(...costos) : 0;

  const metrics = [
    { label: 'Fecha llegada',  fn: (c) => formatDate(c.fecha_llegada),                       mono: false },
    { label: 'Pacas',          fn: (c) => parseInt(c.total_pacas).toLocaleString(),           mono: true  },
    { label: 'Costo Unitario', fn: (c) => formatCurrency(c.costo_unitario),
      raw: (c) => parseFloat(c.costo_unitario) || 0, highlight: true, mono: true },
    { label: 'Costo Total',    fn: (c) => formatCurrency(c.costo_total),                      mono: true  },
    { label: 'N° Servicios',   fn: (c) => c.num_servicios ?? '—',                             mono: true  },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comparador de Contenedores" size="xl">
      {finalizados.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <BarChart2 size={36} className="text-muted/30" />
          <p className="text-sm text-muted">Necesitas al menos 2 contenedores finalizados para comparar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-primary/3">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider min-w-28">Métrica</th>
                  {finalizados.map(c => {
                    const costo = parseFloat(c.costo_unitario) || 0;
                    return (
                      <th key={c.id} className="px-4 py-3 text-center">
                        <p className="text-xs font-bold text-primary">{c.numero}</p>
                        {costo === minCosto && costos.length > 0 && (
                          <span className="inline-block mt-1 text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-bold">Mejor costo</span>
                        )}
                        {costo === maxCosto && maxCosto !== minCosto && (
                          <span className="inline-block mt-1 text-[10px] bg-error/10 text-error px-2 py-0.5 rounded-full font-bold">Mayor costo</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {metrics.map(metric => (
                  <tr key={metric.label} className="hover:bg-primary/3 transition-colors">
                    <td className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">{metric.label}</td>
                    {finalizados.map(c => {
                      const rawVal = metric.raw ? metric.raw(c) : null;
                      const isBest  = metric.highlight && rawVal !== null && rawVal === minCosto && minCosto > 0;
                      const isWorst = metric.highlight && rawVal !== null && rawVal === maxCosto && maxCosto !== minCosto;
                      return (
                        <td key={c.id} className={`px-4 py-3 text-center ${metric.mono ? 'font-mono' : ''} font-semibold ${isBest ? 'text-success' : isWorst ? 'text-error' : 'text-primary'}`}>
                          {metric.fn(c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visual bar chart */}
          <div className="px-1 pb-2">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Costo por Paca — Visual</p>
            <div className="space-y-2.5">
              {finalizados.map(c => {
                const val    = parseFloat(c.costo_unitario) || 0;
                const pct    = maxCosto > 0 ? (val / maxCosto) * 100 : 0;
                const isBest = val === minCosto && val > 0;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted font-medium w-32 truncate">{c.numero}</span>
                    <div className="flex-1 h-2.5 bg-primary/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isBest ? 'bg-success' : 'bg-secondary/60'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono font-bold w-28 text-right tabular-nums ${isBest ? 'text-success' : 'text-primary'}`}>
                      {formatCurrency(val)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Templates (localStorage) ─────────────────────────────────────
function useContenedorTemplates() {
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ba-contenedor-templates') || '[]'); }
    catch { return []; }
  });
  const save = (nombre, formData, proveedores, servicios) => {
    const nueva = {
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      creadoEn: new Date().toISOString(),
      tasa_conversion: formData.tasa_conversion,
      total_pacas: formData.total_pacas,
      notas: formData.notas,
      proveedores,
      servicios,
    };
    const lista = [...templates.filter(t => t.nombre !== nueva.nombre), nueva];
    localStorage.setItem('ba-contenedor-templates', JSON.stringify(lista));
    setTemplates(lista);
  };
  const remove = (id) => {
    const lista = templates.filter(t => t.id !== id);
    localStorage.setItem('ba-contenedor-templates', JSON.stringify(lista));
    setTemplates(lista);
  };
  return { templates, save, remove };
}

// ════════════════════════════════════════════════════════════════
export default function Contenedores() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { tieneRol } = useAuth();
  const isAdmin  = tieneRol('admin');
  const canEdit  = tieneRol(['admin', 'vendedor']);

  // ── List state ─────────────────────────────────────────────────
  const [contenedores, setContenedores]     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [filtroEstado, setFiltroEstado]     = useState('');
  const [busqueda, setBusqueda]             = useState('');
  const [vista, setVista]                   = useState('tabla');
  const [comparadorOpen, setComparadorOpen] = useState(false);

  // ── Modals ─────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]                   = useState(false);
  const [viewModalOpen, setViewModalOpen]           = useState(false);
  const [finalizarModalOpen, setFinalizarModalOpen] = useState(false);

  // ── Selection ──────────────────────────────────────────────────
  const [selectedContenedor, setSelectedContenedor] = useState(null);
  const [editMode, setEditMode]                     = useState(false);
  const [submitting, setSubmitting]                 = useState(false);

  // ── Catálogo dinámico ─────────────────────────────────────────
  const [tiposOpts, setTiposOpts]           = useState([]);
  const [categoriasOpts, setCategoriasOpts] = useState([]);
  const [calidadesOpts, setCalidadesOpts]   = useState([]);

  useEffect(() => {
    tiposPacaApi.getTipos().then(d => setTiposOpts(d.map(t => t.nombre))).catch(() => {});
    tiposPacaApi.getCategorias().then(d => setCategoriasOpts(d.map(t => t.nombre))).catch(() => {});
    tiposPacaApi.getCalidades().then(d => setCalidadesOpts(d.map(t => t.nombre))).catch(() => {});
  }, []);

  // ── Form ───────────────────────────────────────────────────────
  const [formData, setFormData]       = useState({ numero: '', fecha_llegada: '', fecha_salida: '', tasa_conversion: '1', total_pacas: '', notas: '' });
  const [proveedores, setProveedores] = useState([emptyProveedor()]);
  const [servicios, setServicios]     = useState([emptyServicio()]);

  // ── Finalize ───────────────────────────────────────────────────
  const [preciosVenta, setPreciosVenta]           = useState({});
  const [combsFinalizacion, setCombsFinalizacion] = useState([]);

  // ── Templates ─────────────────────────────────────────────────
  const { templates, save: saveTemplate, remove: removeTemplate } = useContenedorTemplates();
  const [templateModalOpen, setTemplateModalOpen]         = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [nombrePlantilla, setNombrePlantilla]             = useState('');

  // ── Load ───────────────────────────────────────────────────────
  const loadContenedores = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await contenedoresApi.getAll(params);
      setContenedores(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadContenedores(); }, [filtroEstado]);

  // ── Filtered list (client-side search) ────────────────────────
  const contenedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contenedores;
    return contenedores.filter(c => c.numero.toLowerCase().includes(q));
  }, [contenedores, busqueda]);

  // ── Export Excel ───────────────────────────────────────────────
  const handleExportExcel = async () => {
    const primary   = '1a1a2e';
    const secondary = 'd4a373';
    const success   = '6a994e';
    const warning   = 'f4a261';
    const accent    = 'bc4749';
    const lightGray = 'F5F5F0';

    const fmtCurrency = (v) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
    const fmtDate = (v) => v ? new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bodega Americana';
    wb.created = new Date();

    const ws = wb.addWorksheet('Contenedores');
    ws.properties.tabColor = { argb: secondary };

    // ── Anchos de columna ──────────────────────────────────────────
    ws.columns = [
      { key: 'numero',     width: 22 }, // A
      { key: 'fecha',      width: 14 }, // B
      { key: 'estado',     width: 13 }, // C
      { key: 'pacas',      width: 13 }, // D
      { key: 'costo_u',    width: 18 }, // E
      { key: 'mercancia',  width: 20 }, // F
      { key: 'servicios',  width: 18 }, // G
      { key: 'total',      width: 20 }, // H
      { key: 'nprov',      width: 14 }, // I
      { key: 'nsrv',       width: 14 }, // J
    ];

    // ── Fila 1: Título ─────────────────────────────────────────────
    ws.mergeCells('A1:J1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'BODEGA AMERICANA — Reporte de Contenedores';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    // ── Fila 2: Fecha ──────────────────────────────────────────────
    ws.mergeCells('A2:J2');
    const subCell = ws.getCell('A2');
    subCell.value = `Generado: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}   |   Total registros: ${contenedoresFiltrados.length}`;
    subCell.font = { size: 10, italic: true, color: { argb: '888888' } };
    subCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // ── Fila 4: Sección KPIs ───────────────────────────────────────
    ws.mergeCells('A4:J4');
    const kpiHeader = ws.getCell('A4');
    kpiHeader.value = 'RESUMEN EJECUTIVO';
    kpiHeader.font = { size: 11, bold: true, color: { argb: 'FFFFFF' } };
    kpiHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
    kpiHeader.alignment = { horizontal: 'center' };
    ws.getRow(4).height = 22;

    // KPI data
    const totales = contenedoresFiltrados;
    const finalizados = totales.filter(c => c.estado === 'finalizado');
    const borradores  = totales.filter(c => c.estado === 'borrador');
    const invTotal    = finalizados.reduce((s, c) => s + parseFloat(c.costo_total || 0), 0);
    const totalPacas  = finalizados.reduce((s, c) => s + parseInt(c.total_pacas || 0), 0);
    const promUnitario = finalizados.length > 0
      ? finalizados.reduce((s, c) => s + parseFloat(c.costo_unitario || 0), 0) / finalizados.length
      : 0;

    const kpis = [
      ['Total contenedores', totales.length,               primary,   null],
      ['Finalizados',         finalizados.length,           success,   null],
      ['En borrador',         borradores.length,            warning,   null],
      ['Total pacas generadas', totalPacas,                 primary,   null],
      ['Inversión total (finalizados)', invTotal,           accent,    '$#,##0.00'],
      ['Costo promedio por paca',       promUnitario,       secondary, '$#,##0.00'],
    ];

    let row = 5;
    for (const [label, value, color, fmt] of kpis) {
      ws.getCell(`A${row}`).value = label;
      ws.getCell(`A${row}`).font = { bold: true, size: 10 };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGray } };
      ws.mergeCells(`A${row}:D${row}`);

      ws.getCell(`E${row}`).value = value;
      ws.getCell(`E${row}`).font = { bold: true, size: 12, color: { argb: color } };
      ws.getCell(`E${row}`).alignment = { horizontal: 'right' };
      if (fmt) ws.getCell(`E${row}`).numFmt = fmt;
      ws.mergeCells(`E${row}:J${row}`);
      ws.getRow(row).height = 20;
      row++;
    }

    row++; // blank row

    // ── Sección detalle ────────────────────────────────────────────
    ws.mergeCells(`A${row}:J${row}`);
    const detHeader = ws.getCell(`A${row}`);
    detHeader.value = 'DETALLE DE CONTENEDORES';
    detHeader.font = { size: 11, bold: true, color: { argb: 'FFFFFF' } };
    detHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    detHeader.alignment = { horizontal: 'center' };
    ws.getRow(row).height = 22;
    row++;

    // ── Cabeceras de tabla ─────────────────────────────────────────
    const cols = ['Número', 'Fecha Llegada', 'Estado', 'Total Pacas', 'Costo/Paca', 'Costo Mercancía', 'Costo Servicios', 'Costo Total', 'Proveedores', 'Servicios'];
    cols.forEach((h, i) => {
      const cell = ws.getCell(`${String.fromCharCode(65 + i)}${row}`);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: secondary } } };
    });
    ws.getRow(row).height = 24;
    row++;

    // ── Filas de datos ─────────────────────────────────────────────
    contenedoresFiltrados.forEach((c, idx) => {
      const isFinalizado = c.estado === 'finalizado';
      const bg = idx % 2 === 0 ? 'FFFFFF' : 'FAF9F7';

      const setCell = (col, value, extra = {}) => {
        const cell = ws.getCell(`${col}${row}`);
        cell.value = value;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { size: 10, ...extra.font };
        cell.alignment = { vertical: 'middle', ...extra.alignment };
        if (extra.numFmt) cell.numFmt = extra.numFmt;
        if (extra.border) cell.border = extra.border;
      };

      setCell('A', c.numero, { font: { bold: true, size: 10 } });
      setCell('B', c.fecha_llegada ? new Date(c.fecha_llegada) : '—', {
        numFmt: c.fecha_llegada ? 'dd/mm/yyyy' : undefined,
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      setCell('C', c.estado === 'finalizado' ? 'Finalizado' : 'Borrador', {
        font: { bold: true, size: 10, color: { argb: isFinalizado ? success : warning } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      setCell('D', parseInt(c.total_pacas || 0), {
        numFmt: '#,##0',
        alignment: { horizontal: 'right', vertical: 'middle' },
      });
      setCell('E', parseFloat(c.costo_unitario || 0), {
        numFmt: '$#,##0.00',
        alignment: { horizontal: 'right', vertical: 'middle' },
        font: { bold: isFinalizado, size: 10, color: { argb: isFinalizado ? primary : '999999' } },
      });
      setCell('F', parseFloat(c.costo_mercancia_total || 0), {
        numFmt: '$#,##0.00',
        alignment: { horizontal: 'right', vertical: 'middle' },
      });
      setCell('G', parseFloat(c.costo_servicios_total || 0), {
        numFmt: '$#,##0.00',
        alignment: { horizontal: 'right', vertical: 'middle' },
      });
      setCell('H', parseFloat(c.costo_total || 0), {
        numFmt: '$#,##0.00',
        alignment: { horizontal: 'right', vertical: 'middle' },
        font: { bold: true, size: 10 },
      });
      setCell('I', parseInt(c.num_proveedores || 0), {
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      setCell('J', parseInt(c.num_servicios || 0), {
        alignment: { horizontal: 'center', vertical: 'middle' },
      });

      ws.getRow(row).height = 20;
      row++;
    });

    // ── Fila de totales ────────────────────────────────────────────
    ws.mergeCells(`A${row}:C${row}`);
    ws.getCell(`A${row}`).value = 'TOTALES (finalizados)';
    ws.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle' };

    const totalsCells = [
      ['D', totalPacas,  '#,##0',    true],
      ['E', promUnitario,'$#,##0.00',true],
      ['F', finalizados.reduce((s, c) => s + parseFloat(c.costo_mercancia_total || 0), 0), '$#,##0.00', true],
      ['G', finalizados.reduce((s, c) => s + parseFloat(c.costo_servicios_total || 0), 0), '$#,##0.00', true],
      ['H', invTotal,    '$#,##0.00',true],
    ];
    for (const [col, val, fmt, bold] of totalsCells) {
      const cell = ws.getCell(`${col}${row}`);
      cell.value = val;
      cell.numFmt = fmt;
      cell.font = { bold, size: 10, color: { argb: primary } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDE8DF' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    ws.getRow(row).height = 22;
    row += 2;

    // ── Pie de página ──────────────────────────────────────────────
    ws.mergeCells(`A${row}:J${row}`);
    ws.getCell(`A${row}`).value = `Documento generado el ${new Date().toLocaleString('es-CO')} — Bodega Americana`;
    ws.getCell(`A${row}`).font = { size: 8, italic: true, color: { argb: 'AAAAAA' } };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };

    // ── Descargar ──────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Contenedores_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    addToast('Excel descargado correctamente', 'success');
  };

  // ── Export Excel individual por contenedor ─────────────────────
  const handleExportContenedorExcel = async (cont) => {
    const primary   = '1a1a2e';
    const secondary = 'd4a373';
    const success   = '6a994e';
    const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

    let full = cont;
    if (!cont.proveedores_mercancia) {
      try { full = await contenedoresApi.getOne(cont.id); } catch (err) { addToast(err.message, 'error'); return; }
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bodega Americana';
    const tasa = parseFloat(full.tasa_conversion) || 1;
    const totalPacas = parseInt(full.total_pacas) || 0;

    // ── Hoja Resumen ────────────────────────────────────────────────
    const wsR = wb.addWorksheet('Resumen');
    wsR.properties.tabColor = { argb: secondary };
    wsR.columns = [{ width: 30 }, { width: 28 }, { width: 20 }, { width: 20 }];
    const addHeader = (ws, text, cols = 'A1:D1') => {
      ws.mergeCells(cols);
      const c = ws.getCell(cols.split(':')[0]);
      c.value = text; c.font = { bold: true, color: { argb: 'FFFFFF' }, size: 12 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(parseInt(cols.match(/\d+/)[0])).height = 26;
    };
    addHeader(wsR, `CONTENEDOR ${full.numero} — Detalle Completo`);
    const fields = [
      ['Número', full.numero], ['Estado', full.estado],
      ['Fecha Salida', full.fecha_salida ? new Date(full.fecha_salida).toLocaleDateString('es-CO') : '—'],
      ['Fecha Llegada', full.fecha_llegada ? new Date(full.fecha_llegada).toLocaleDateString('es-CO') : '—'],
      ['Tasa USD→COP', tasa.toLocaleString('es-CO')],
      ['Total Pacas', totalPacas],
      ['Costo Mercancía', fmtCOP(full.costo_mercancia_total)],
      ['Costo Servicios', fmtCOP(full.costo_servicios_total)],
      ['Costo Total', fmtCOP(full.costo_total)],
      ['Costo por Paca', fmtCOP(full.costo_unitario)],
    ];
    fields.forEach(([label, val], i) => {
      const r = i + 2;
      wsR.getCell(`A${r}`).value = label; wsR.getCell(`A${r}`).font = { bold: true, size: 10 };
      wsR.getCell(`B${r}`).value = val;   wsR.getCell(`B${r}`).font = { size: 10 };
      wsR.getRow(r).height = 18;
    });

    // ── Hoja Mercancía ───────────────────────────────────────────────
    const wsM = wb.addWorksheet('Mercancía');
    wsM.columns = [{ width: 24 }, { width: 8 }, { width: 18 }, { width: 18 }, { width: 18 }];
    addHeader(wsM, 'PROVEEDORES DE MERCANCÍA', 'A1:E1');
    ['Proveedor', 'Moneda', 'Costo Original', 'Costo COP', 'Costo/Paca'].forEach((h, i) => {
      const c = wsM.getCell(`${String.fromCharCode(65+i)}2`);
      c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
    });
    wsM.getRow(2).height = 20;
    (full.proveedores_mercancia || []).forEach((p, i) => {
      const r = i + 3;
      const costoCOP = p.moneda === 'USD' ? parseFloat(p.costo) * tasa : parseFloat(p.costo);
      wsM.getCell(`A${r}`).value = p.proveedor_nombre;
      wsM.getCell(`B${r}`).value = p.moneda || 'USD';
      wsM.getCell(`C${r}`).value = parseFloat(p.costo); wsM.getCell(`C${r}`).numFmt = '#,##0.00';
      wsM.getCell(`D${r}`).value = costoCOP;             wsM.getCell(`D${r}`).numFmt = '$ #,##0';
      wsM.getCell(`E${r}`).value = totalPacas > 0 ? costoCOP / totalPacas : 0; wsM.getCell(`E${r}`).numFmt = '$ #,##0';
      wsM.getRow(r).height = 18;
    });

    // ── Hoja Servicios ───────────────────────────────────────────────
    const wsS = wb.addWorksheet('Servicios');
    wsS.columns = [{ width: 16 }, { width: 24 }, { width: 18 }, { width: 18 }];
    addHeader(wsS, 'SERVICIOS', 'A1:D1');
    ['Tipo', 'Proveedor', 'Costo COP', 'Costo/Paca'].forEach((h, i) => {
      const c = wsS.getCell(`${String.fromCharCode(65+i)}2`);
      c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
    });
    wsS.getRow(2).height = 20;
    (full.servicios || []).forEach((s, i) => {
      const r = i + 3;
      wsS.getCell(`A${r}`).value = s.tipo_servicio; wsS.getCell(`B${r}`).value = s.proveedor_nombre;
      wsS.getCell(`C${r}`).value = parseFloat(s.costo); wsS.getCell(`C${r}`).numFmt = '$ #,##0';
      wsS.getCell(`D${r}`).value = totalPacas > 0 ? parseFloat(s.costo) / totalPacas : 0; wsS.getCell(`D${r}`).numFmt = '$ #,##0';
      wsS.getRow(r).height = 18;
    });

    // ── Hoja Distribución ────────────────────────────────────────────
    const wsD = wb.addWorksheet('Distribución');
    wsD.columns = [{ width: 20 }, { width: 18 }, { width: 16 }, { width: 12 }, { width: 12 }];
    addHeader(wsD, 'DISTRIBUCIÓN DE PACAS POR PROVEEDOR', 'A1:E1');
    ['Proveedor', 'Clasificación', 'Referencia', 'Calidad', 'Cantidad'].forEach((h, i) => {
      const c = wsD.getCell(`${String.fromCharCode(65+i)}2`);
      c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
    });
    wsD.getRow(2).height = 20;
    let dr = 3;
    (full.proveedores_mercancia || []).forEach(p => {
      (p.detalles || []).forEach(d => {
        wsD.getCell(`A${dr}`).value = p.proveedor_nombre;
        wsD.getCell(`B${dr}`).value = d.clasificacion;
        wsD.getCell(`C${dr}`).value = d.referencia;
        wsD.getCell(`D${dr}`).value = d.calidad || '—';
        wsD.getCell(`E${dr}`).value = parseInt(d.cantidad);
        wsD.getRow(dr).height = 18; dr++;
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Contenedor_${full.numero}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    addToast(`Excel de "${full.numero}" descargado`, 'success');
  };

  // ── Derived summary (live) ─────────────────────────────────────
  const calcularResumen = () => {
    const tasa       = parseFloat(formData.tasa_conversion) || 1;
    const totalPacas = parseInt(formData.total_pacas) || 0;

    const proveedoresDetalle = proveedores.map(p => {
      const costoOriginal = parseFloat(p.costo) || 0;
      const costoEnCOP    = p.moneda === 'USD' ? costoOriginal * tasa : costoOriginal;
      return { nombre: p.proveedor_nombre, moneda: p.moneda || 'USD', costoOriginal, costoEnCOP,
               costoPorPaca: totalPacas > 0 ? costoEnCOP / totalPacas : 0 };
    });

    const serviciosDetalle = servicios.map(sv => {
      const costoOriginal = parseFloat(sv.costo) || 0;
      const moneda = sv.moneda || 'COP';
      const costoEnCOP = moneda === 'USD' ? costoOriginal * tasa : costoOriginal;
      return { tipo: sv.tipo_servicio, nombre: sv.proveedor_nombre, moneda, costoOriginal, costo: costoEnCOP,
               costoPorPaca: totalPacas > 0 ? costoEnCOP / totalPacas : 0 };
    });

    const costoMercancia = proveedoresDetalle.reduce((s, p) => s + p.costoEnCOP, 0);
    const costoServicios = serviciosDetalle.reduce((s, sv) => s + sv.costo, 0);
    const costoTotal     = costoMercancia + costoServicios;
    const costoUnitario  = totalPacas > 0 ? costoTotal / totalPacas : 0;
    const sumDetalles    = proveedores.reduce(
      (s, p) => s + p.detalles.reduce((s2, d) => s2 + (parseInt(d.cantidad) || 0), 0), 0
    );
    const cantidadValida = totalPacas > 0 && sumDetalles === totalPacas;
    return { proveedoresDetalle, serviciosDetalle, costoMercancia, costoServicios, costoTotal, costoUnitario, sumDetalles, cantidadValida };
  };

  // ── Provider row management ────────────────────────────────────
  const addProveedor    = () => setProveedores([...proveedores, emptyProveedor()]);
  const removeProveedor = (pi) => proveedores.length > 1 && setProveedores(proveedores.filter((_, i) => i !== pi));
  const updateProveedor = (pi, field, val) => {
    const n = [...proveedores]; n[pi] = { ...n[pi], [field]: val }; setProveedores(n);
  };
  const addDetalle    = (pi) => {
    const n = [...proveedores];
    n[pi] = { ...n[pi], detalles: [...n[pi].detalles, { tipo: '', categoria: '', cantidad: '' }] };
    setProveedores(n);
  };
  const removeDetalle = (pi, di) => {
    const n = [...proveedores];
    if (n[pi].detalles.length > 1) { n[pi] = { ...n[pi], detalles: n[pi].detalles.filter((_, i) => i !== di) }; setProveedores(n); }
  };
  const updateDetalle = (pi, di, field, val) => {
    const n = [...proveedores];
    const detalles = [...n[pi].detalles]; detalles[di] = { ...detalles[di], [field]: val };
    n[pi] = { ...n[pi], detalles }; setProveedores(n);
  };

  // ── Service row management ─────────────────────────────────────
  const addServicio    = () => setServicios([...servicios, emptyServicio()]);
  const removeServicio = (si) => servicios.length > 1 && setServicios(servicios.filter((_, i) => i !== si));
  const updateServicio = (si, field, val) => {
    const n = [...servicios]; n[si] = { ...n[si], [field]: val }; setServicios(n);
  };

  // ── Reset ──────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({ numero: '', fecha_llegada: '', fecha_salida: '', tasa_conversion: '1', total_pacas: '', notas: '' });
    setProveedores([emptyProveedor()]);
    setServicios([emptyServicio()]);
  };

  const handleSaveTemplate = () => {
    if (!nombrePlantilla.trim()) return;
    saveTemplate(nombrePlantilla, formData, proveedores, servicios);
    addToast(`Plantilla "${nombrePlantilla.trim()}" guardada`, 'success');
    setSaveTemplateModalOpen(false);
  };

  // ── Open modals ────────────────────────────────────────────────
  const openCreateModal = () => { resetForm(); setEditMode(false); setSelectedContenedor(null); setModalOpen(true); };

  const openEditModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      setFormData({
        numero: full.numero,
        fecha_llegada: full.fecha_llegada?.split('T')[0] || '',
        fecha_salida: full.fecha_salida?.split('T')[0] || '',
        tasa_conversion: String(full.tasa_conversion || '1'),
        total_pacas: String(full.total_pacas),
        notas: full.notas || '',
      });
      setProveedores(full.proveedores_mercancia.length > 0
        ? full.proveedores_mercancia.map((p) => ({
            proveedor_nombre: p.proveedor_nombre,
            moneda: p.moneda || 'USD',
            costo: String(p.costo || ''),
            notas: p.notas || '',
            detalles: p.detalles.length > 0
              ? p.detalles.map((d) => ({ clasificacion: d.clasificacion, referencia: d.referencia, calidad: d.calidad || '', cantidad: String(d.cantidad) }))
              : [{ clasificacion: '', referencia: '', calidad: '', cantidad: '' }],
          }))
        : [emptyProveedor()]);
      setServicios(full.servicios.length > 0
        ? full.servicios.map((s) => ({ proveedor_nombre: s.proveedor_nombre, tipo_servicio: s.tipo_servicio, moneda: s.moneda || 'COP', costo: String(s.costo || ''), notas: s.notas || '' }))
        : [emptyServicio()]);
      setEditMode(true); setModalOpen(true);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const openViewModal = async (contenedor) => {
    try { const full = await contenedoresApi.getOne(contenedor.id); setSelectedContenedor(full); setViewModalOpen(true); }
    catch (err) { addToast(err.message, 'error'); }
  };

  // ── Submit form ────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const r = calcularResumen();
    if (!r.cantidadValida) {
      addToast(`Detalles (${r.sumDetalles}) ≠ total pacas (${formData.total_pacas || '?'})`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        numero: formData.numero,
        fecha_llegada: formData.fecha_llegada || null,
        fecha_salida: formData.fecha_salida || null,
        tasa_conversion: parseFloat(formData.tasa_conversion) || 1,
        total_pacas: parseInt(formData.total_pacas),
        notas: formData.notas || null,
        proveedores_mercancia: proveedores.map((p) => ({
          proveedor_nombre: p.proveedor_nombre,
          moneda: p.moneda || 'USD',
          costo: parseFloat(p.costo) || 0,
          notas: p.notas || null,
          detalles: p.detalles.map((d) => ({ clasificacion: d.clasificacion, referencia: d.referencia, calidad: d.calidad, cantidad: parseInt(d.cantidad) || 0 })),
        })),
        servicios: servicios.filter((s) => s.proveedor_nombre || s.tipo_servicio).map((s) => ({ ...s, costo: parseFloat(s.costo) || 0 })),
      };
      if (editMode && selectedContenedor) {
        await contenedoresApi.update(selectedContenedor.id, payload);
        addToast('Contenedor actualizado', 'success');
      } else {
        await contenedoresApi.create(payload);
        addToast('Contenedor creado', 'success');
      }
      setModalOpen(false); resetForm(); loadContenedores();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete = async (contenedor) => {
    const ok = await confirm({ title: 'Eliminar contenedor', message: `¿Eliminar "${contenedor.numero}"? Esta acción es irreversible.`, confirmText: 'Eliminar', variant: 'danger' });
    if (!ok) return;
    try { await contenedoresApi.delete(contenedor.id); addToast('Contenedor eliminado', 'success'); loadContenedores(); }
    catch (err) { addToast(err.message, 'error'); }
  };

  // ── Finalizar ──────────────────────────────────────────────────
  const openFinalizarModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      const combSet = new Set();
      full.proveedores_mercancia.forEach((p) => p.detalles.forEach((d) =>
        combSet.add(`${d.clasificacion}|${d.referencia}|${d.calidad || ''}`)
      ));
      const combs = Array.from(combSet).map((c) => {
        const [clasificacion, referencia, calidad] = c.split('|');
        return { clasificacion, referencia, calidad, key: c };
      });
      setCombsFinalizacion(combs);
      const init = {}; combs.forEach((c) => { init[c.key] = ''; });
      setPreciosVenta(init);
      setViewModalOpen(false); setFinalizarModalOpen(true);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleFinalizar = async () => {
    for (const c of combsFinalizacion) {
      const pv = parseFloat(preciosVenta[c.key]);
      if (isNaN(pv) || pv <= 0) {
        addToast(`Falta precio de venta para "${c.clasificacion} / ${c.referencia} / ${c.calidad}"`, 'error'); return;
      }
    }
    setSubmitting(true);
    try {
      const precios = combsFinalizacion.map((c) => ({ clasificacion: c.clasificacion, referencia: c.referencia, calidad: c.calidad, precio_venta: parseFloat(preciosVenta[c.key]) }));
      const result = await contenedoresApi.finalizar(selectedContenedor.id, { precios });
      addToast(`Lote "${result.lote_numero}" creado — ${result.total_pacas_creadas} pacas al inventario`, 'success');
      setFinalizarModalOpen(false); loadContenedores();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  // ── Derived stats ──────────────────────────────────────────────
  const borradores  = contenedores.filter((c) => c.estado === 'borrador').length;
  const finalizados = contenedores.filter((c) => c.estado === 'finalizado').length;
  const totalPacas  = contenedores.reduce((s, c) => s + parseInt(c.total_pacas || 0), 0);
  const costoPromedio = finalizados > 0
    ? contenedores.filter((c) => c.estado === 'finalizado').reduce((s, c) => s + parseFloat(c.costo_unitario || 0), 0) / finalizados
    : 0;

  const resumen = calcularResumen();

  // ════════════════════════════════════════════════════════════════
  return (
    <Layout
      title="Contenedores"
      subtitle="Gestión de costos, proveedores y cálculo unitario"
      actions={
        canEdit && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 active:scale-95 transition-all duration-150 shadow-sm"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">Nuevo Contenedor</span>
          </button>
        )
      }
    >
      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total"        value={contenedores.length}          icon={Boxes}    color="bg-secondary/80" sub={`${borradores} en borrador`} />
        <KpiCard label="Borradores"   value={borradores}                   icon={Layers}   color="bg-warning/70"   sub="Pendientes de finalizar" />
        <KpiCard label="Finalizados"  value={finalizados}                  icon={Archive}  color="bg-success/70"   sub="Lotes creados en inventario" />
        <KpiCard label="Pacas Totales" value={totalPacas.toLocaleString()} icon={TrendingUp} color="bg-accent/70" sub={costoPromedio > 0 ? `Costo prom. ${formatCurrency(costoPromedio)}` : 'Sin datos aún'} />
      </div>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número..."
            className="w-full pl-8 pr-8 py-2 rounded-xl border border-border bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 placeholder:text-muted/60 transition-colors"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Estado filter */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 cursor-pointer"
        >
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="finalizado">Finalizado</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center rounded-xl border border-border overflow-hidden flex-shrink-0">
          <button
            onClick={() => setVista('tabla')}
            title="Vista tabla"
            className={`p-2 transition-colors ${vista === 'tabla' ? 'bg-secondary text-white' : 'bg-surface text-muted hover:text-primary'}`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setVista('timeline')}
            title="Vista timeline"
            className={`p-2 transition-colors ${vista === 'timeline' ? 'bg-secondary text-white' : 'bg-surface text-muted hover:text-primary'}`}
          >
            <Calendar size={15} />
          </button>
        </div>

        {/* Comparar — only when ≥2 finalized */}
        {finalizados >= 2 && (
          <button
            onClick={() => setComparadorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-primary text-sm font-medium hover:border-secondary/40 hover:text-secondary transition-colors flex-shrink-0"
          >
            <BarChart2 size={14} />
            <span className="hidden sm:inline">Comparar</span>
          </button>
        )}

        {/* Export Excel */}
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-primary text-sm font-medium hover:border-secondary/40 hover:text-secondary transition-colors flex-shrink-0"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Excel</span>
        </button>
      </div>

      {/* ── Main content ──────────────────────────────────────── */}
      {loading ? (
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card flex flex-col items-center justify-center py-20 gap-3">
          <div className="animate-spin rounded-full h-9 w-9 border-4 border-secondary/30 border-t-secondary" />
          <p className="text-muted text-sm">Cargando contenedores...</p>
        </div>
      ) : contenedores.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center">
            <Package2 size={32} className="text-secondary/60" />
          </div>
          <div>
            <p className="font-semibold text-primary">No hay contenedores</p>
            <p className="text-sm text-muted mt-1">
              {filtroEstado ? `Sin contenedores con estado "${filtroEstado}"` : 'Crea el primero para comenzar'}
            </p>
          </div>
          {canEdit && !filtroEstado && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-xl text-sm font-semibold hover:bg-secondary/20 transition-colors"
            >
              <Plus size={16} /> Crear contenedor
            </button>
          )}
        </div>
      ) : contenedoresFiltrados.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Search size={28} className="text-muted/40" />
          <p className="font-semibold text-primary">Sin resultados</p>
          <p className="text-sm text-muted">No hay contenedores que coincidan con "<span className="font-medium">{busqueda}</span>"</p>
          <button onClick={() => setBusqueda('')} className="text-xs text-secondary hover:underline mt-1">Limpiar búsqueda</button>
        </div>
      ) : vista === 'tabla' ? (

        /* ── TABLE VIEW ─────────────────────────────────────── */
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-primary/3">
                  {['Número', 'Fecha', 'Pacas', 'Costo Unitario', 'Costo Total', 'Servicios', 'Estado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contenedoresFiltrados.map((cont, idx) => (
                  <tr
                    key={cont.id}
                    className={`border-b border-border/40 hover:bg-secondary/5 transition-colors duration-150 ${idx % 2 === 0 ? '' : 'bg-primary/2'}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-primary font-heading">{cont.numero}</p>
                        {cont.num_proveedores_mercancia > 0 && (
                          <p className="text-xs text-muted mt-0.5">{cont.num_proveedores_mercancia} prov. mercancía</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap text-xs">{formatDate(cont.fecha_llegada)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-primary text-center">{parseInt(cont.total_pacas).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      {isAdmin
                        ? <span className="text-secondary font-semibold">{formatCurrency(cont.costo_unitario)}</span>
                        : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-primary">{formatCurrency(cont.costo_total)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/8 text-primary text-xs font-bold">
                        {cont.num_servicios}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge estado={cont.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionBtn icon={Eye} title="Ver detalle" onClick={() => openViewModal(cont)} />
                        {canEdit && cont.estado === 'borrador' && (
                          <ActionBtn icon={Edit2} title="Editar" color="hover:text-secondary hover:bg-secondary/10" onClick={() => openEditModal(cont)} />
                        )}
                        {isAdmin && cont.estado === 'borrador' && (
                          <>
                            <ActionBtn icon={CheckCircle} title="Finalizar" color="hover:text-success hover:bg-success/10" onClick={() => openFinalizarModal(cont)} />
                            <ActionBtn icon={Trash2} title="Eliminar" color="hover:text-error hover:bg-error/10" onClick={() => handleDelete(cont)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
            <p className="text-xs text-muted">
              {contenedoresFiltrados.length} de {contenedores.length} contenedor{contenedores.length !== 1 ? 'es' : ''}
            </p>
            <p className="text-xs text-muted">
              {finalizados} finalizado{finalizados !== 1 ? 's' : ''} · {borradores} en borrador
            </p>
          </div>
        </div>

      ) : (

        /* ── TIMELINE VIEW ──────────────────────────────────── */
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card px-5 py-4">
          <TimelineView items={contenedoresFiltrados} onView={openViewModal} />
        </div>

      )}

      {/* ════════════════════════════════════════════════════════
          CREATE / EDIT MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={editMode ? `Editar — ${selectedContenedor?.numero}` : 'Nuevo Contenedor'}
        size="full"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* ── LEFT: form sections ─────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* [1] Información Básica */}
              <div className="rounded-2xl border border-border/60 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-primary/[0.03] border-b border-border/40">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <div>
                    <p className="text-sm font-semibold text-primary leading-none">Información Básica</p>
                    <p className="text-[11px] text-muted mt-0.5">Identificación y datos generales del contenedor</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 pt-3">
                  <button type="button" onClick={() => setTemplateModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-secondary px-3 py-1.5 rounded-lg border border-secondary/30 hover:bg-secondary/8 transition-all">
                    <BookTemplate size={13} /> Cargar plantilla{templates.length > 0 && ` (${templates.length})`}
                  </button>
                  <button type="button" onClick={() => { setNombrePlantilla(''); setSaveTemplateModalOpen(true); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary px-3 py-1.5 rounded-lg border border-border hover:bg-primary/5 transition-all">
                    <Save size={13} /> Guardar como plantilla
                  </button>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={lbl}>Número *</label>
                    <input type="text" className={inp} placeholder="CNT-2026-0001"
                      value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} required />
                  </div>
                  <div>
                    <label className={lbl}>Fecha Salida</label>
                    <input type="date" className={inp}
                      value={formData.fecha_salida} onChange={(e) => setFormData({ ...formData, fecha_salida: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Fecha Llegada</label>
                    <input type="date" className={inp}
                      value={formData.fecha_llegada} onChange={(e) => setFormData({ ...formData, fecha_llegada: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Total de Pacas *</label>
                    <input type="number" min="1" className={inp} placeholder="200"
                      value={formData.total_pacas} onChange={(e) => setFormData({ ...formData, total_pacas: e.target.value })} required />
                  </div>
                  <div>
                    <label className={lbl}>Tasa USD→COP</label>
                    <input type="number" min="0.01" step="0.01" className={inp} placeholder="ej. 4100"
                      value={formData.tasa_conversion} onChange={(e) => setFormData({ ...formData, tasa_conversion: e.target.value })} required />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className={lbl}>Notas</label>
                    <input type="text" className={inp} placeholder="Observaciones opcionales..."
                      value={formData.notas} onChange={(e) => setFormData({ ...formData, notas: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* [2] Proveedores de Mercancía */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <div>
                    <p className="text-sm font-semibold text-primary leading-none">Proveedores de Mercancía</p>
                    <p className="text-[11px] text-muted mt-0.5">Quién suministra qué tipos de paca y en qué cantidad</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {proveedores.map((prov, pi) => (
                    <div key={pi} className="rounded-2xl border border-border/60 bg-surface overflow-hidden">
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-secondary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{pi + 1}</span>
                          <input type="text" className={`${inp} flex-1`} placeholder="Nombre del proveedor *"
                            value={prov.proveedor_nombre} onChange={(e) => updateProveedor(pi, 'proveedor_nombre', e.target.value)} required />
                          <select className={`${inpBase} w-20 flex-shrink-0`} value={prov.moneda || 'USD'}
                            onChange={(e) => updateProveedor(pi, 'moneda', e.target.value)}>
                            <option value="USD">USD</option>
                            <option value="COP">COP</option>
                          </select>
                          <PriceInput className={`${inpBase} w-32`} placeholder="Costo"
                            value={prov.costo} onChange={(val) => updateProveedor(pi, 'costo', val)} />
                          {proveedores.length > 1 && (
                            <button type="button" onClick={() => removeProveedor(pi)}
                              className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        {(prov.moneda || 'USD') === 'USD' && parseFloat(prov.costo) > 0 && (
                          <div className="flex items-center gap-2 pl-8">
                            <span className="text-[10px] text-muted">≈</span>
                            <span className="text-sm font-semibold font-mono text-secondary tabular-nums">
                              {formatCurrency(parseFloat(prov.costo) * (parseFloat(formData.tasa_conversion) || 1))}
                            </span>
                            <span className="text-[10px] font-medium text-muted bg-secondary/10 px-1.5 py-0.5 rounded">COP</span>
                          </div>
                        )}
                        <input type="text" className={`${inp} text-xs`} placeholder="Notas del proveedor (opcional)"
                          value={prov.notas} onChange={(e) => updateProveedor(pi, 'notas', e.target.value)} />
                      </div>
                      <div className="px-4 pb-4 pt-3 bg-cream/50 border-t border-border/30">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2.5">Distribución por tipo y categoría</p>
                        <div className="space-y-2">
                          {prov.detalles.map((det, di) => (
                            <div key={di} className="bg-surface rounded-xl px-3 pt-2.5 pb-3 border border-border/40 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <select className={inp} value={det.clasificacion}
                                  onChange={(e) => updateDetalle(pi, di, 'clasificacion', e.target.value)} required>
                                  <option value="">Clasificación</option>
                                  {tiposOpts.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                </select>
                                <select className={inp} value={det.referencia}
                                  onChange={(e) => updateDetalle(pi, di, 'referencia', e.target.value)} required>
                                  <option value="">Referencia</option>
                                  {categoriasOpts.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                                </select>
                                <select className={inp} value={det.calidad}
                                  onChange={(e) => updateDetalle(pi, di, 'calidad', e.target.value)} required>
                                  <option value="">Calidad</option>
                                  {calidadesOpts.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="number" min="1" className={`${inp} flex-1 text-center font-mono`} placeholder="0"
                                  value={det.cantidad} onChange={(e) => updateDetalle(pi, di, 'cantidad', e.target.value)} required />
                                <span className="text-xs text-muted font-medium">pacas</span>
                                {prov.detalles.length > 1 && (
                                  <button type="button" onClick={() => removeDetalle(pi, di)}
                                    className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={() => addDetalle(pi)}
                          className="mt-2.5 flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-secondary transition-colors">
                          <Plus size={13} /> Agregar línea de distribución
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addProveedor}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 hover:border-primary/50 transition-all">
                  <Plus size={15} /> Agregar proveedor
                </button>
              </div>

              {/* [3] Servicios */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <div>
                    <p className="text-sm font-semibold text-primary leading-none">Servicios</p>
                    <p className="text-[11px] text-muted mt-0.5">Transporte, aduana, maniobras y otros costos operativos</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-surface overflow-hidden">
                  <div className="divide-y divide-border/30">
                    {servicios.map((srv, si) => (
                      <div key={si} className="px-4 py-3 space-y-2">
                        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
                          <select className={`${inpBase} lg:w-36`} value={srv.tipo_servicio}
                            onChange={(e) => updateServicio(si, 'tipo_servicio', e.target.value)}>
                            <option value="">Tipo</option>
                            {TIPOS_SERVICIO.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                          </select>
                          <input type="text" className={`${inp} flex-1 min-w-0`} placeholder="Empresa o proveedor"
                            value={srv.proveedor_nombre} onChange={(e) => updateServicio(si, 'proveedor_nombre', e.target.value)} />
                          <select className={`${inpBase} w-20 flex-shrink-0`} value={srv.moneda || 'COP'}
                            onChange={(e) => updateServicio(si, 'moneda', e.target.value)}>
                            <option value="USD">USD</option>
                            <option value="COP">COP</option>
                          </select>
                          <PriceInput className={`${inpBase} lg:w-32`} placeholder="Costo $"
                            value={srv.costo} onChange={(val) => updateServicio(si, 'costo', val)} />
                          {servicios.length > 1 && (
                            <button type="button" onClick={() => removeServicio(si)}
                              className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        {(srv.moneda || 'COP') === 'USD' && parseFloat(srv.costo) > 0 && (
                          <div className="flex items-center gap-2 pl-1">
                            <span className="text-[10px] text-muted">≈</span>
                            <span className="text-sm font-semibold font-mono text-secondary tabular-nums">
                              {formatCurrency(parseFloat(srv.costo) * (parseFloat(formData.tasa_conversion) || 1))}
                            </span>
                            <span className="text-[10px] font-medium text-muted bg-secondary/10 px-1.5 py-0.5 rounded">COP</span>
                          </div>
                        )}
                        <input type="text" className={inp} placeholder="Notas (opcional)"
                          value={srv.notas} onChange={(e) => updateServicio(si, 'notas', e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-border/30 bg-cream/30">
                    <button type="button" onClick={addServicio}
                      className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-secondary transition-colors">
                      <Plus size={13} /> Agregar servicio
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile cost summary — visible below lg */}
              <div className="lg:hidden rounded-2xl border border-border/60 bg-surface p-4 space-y-2.5">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Resumen de Costos</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Costo total</span>
                  <span className="text-sm font-mono font-bold text-primary tabular-nums">{formatCurrency(resumen.costoTotal)}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs text-muted">Por paca</span>
                  <span className="text-sm font-mono font-bold text-secondary tabular-nums">{formatCurrency(resumen.costoUnitario)}</span>
                </div>
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${resumen.cantidadValida ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                  {resumen.cantidadValida
                    ? <><CheckCircle size={13} /> {resumen.sumDetalles}/{formData.total_pacas} pacas — OK</>
                    : <><AlertTriangle size={13} className="text-warning" /> {resumen.sumDetalles}/{formData.total_pacas || '?'} — ajustar distribución</>
                  }
                </div>
              </div>

              {/* Mobile action row */}
              <div className="flex lg:hidden gap-3 pt-1">
                <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting || !resumen.cantidadValida}
                  className="flex-1 py-2.5 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150">
                  {submitting ? 'Guardando...' : editMode ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>

            {/* ── RIGHT: sticky summary ────────────────────────── */}
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-0 space-y-3">
                <div className={`rounded-2xl border p-4 transition-colors duration-300 ${resumen.cantidadValida ? 'border-success/30 bg-success/5' : 'border-border bg-surface shadow-sm'}`}>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">Resumen de Costos</p>

                  {/* Mercancía por proveedor */}
                  {resumen.proveedoresDetalle.some(p => p.costoEnCOP > 0) && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Mercancía</p>
                      <div className="space-y-1.5">
                        {resumen.proveedoresDetalle.map((p, i) => p.costoEnCOP > 0 && (
                          <div key={i} className="flex items-start justify-between gap-1">
                            <span className="text-[11px] text-muted truncate flex-1">{p.nombre || `Prov. ${i+1}`}</span>
                            <div className="text-right flex-shrink-0">
                              {p.moneda === 'USD' && (
                                <p className="text-[10px] text-muted/70">USD {p.costoOriginal.toLocaleString('es-CO')}</p>
                              )}
                              <p className="text-xs font-mono font-semibold text-primary tabular-nums">{formatCurrency(p.costoEnCOP)}</p>
                              <p className="text-[10px] text-muted/70">{formatCurrency(p.costoPorPaca)}/paca</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Servicios */}
                  {resumen.serviciosDetalle.some(s => s.costo > 0) && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Servicios</p>
                      <div className="space-y-1.5">
                        {resumen.serviciosDetalle.map((s, i) => s.costo > 0 && (
                          <div key={i} className="flex items-start justify-between gap-1">
                            <span className="text-[11px] text-muted truncate flex-1 capitalize">{s.tipo || s.nombre || `Srv. ${i+1}`}</span>
                            <div className="text-right flex-shrink-0">
                              {s.moneda === 'USD' && (
                                <p className="text-[10px] text-muted/70">USD {s.costoOriginal.toLocaleString('es-CO')}</p>
                              )}
                              <p className="text-xs font-mono font-semibold text-primary tabular-nums">{formatCurrency(s.costo)}</p>
                              <p className="text-[10px] text-muted/70">{formatCurrency(s.costoPorPaca)}/paca</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-border/50 mb-3" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-primary">Total</span>
                    <span className="text-base font-mono font-bold text-primary tabular-nums">{formatCurrency(resumen.costoTotal)}</span>
                  </div>

                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-center mb-3">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Costo por Paca</p>
                    <p className="text-2xl font-display font-bold text-primary">{formatCurrency(resumen.costoUnitario)}</p>
                  </div>
                  <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${resumen.cantidadValida ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                    {resumen.cantidadValida
                      ? <><CheckCircle size={13} /> {resumen.sumDetalles}/{formData.total_pacas} pacas — OK</>
                      : <><AlertTriangle size={13} className="text-warning" /> {resumen.sumDetalles}/{formData.total_pacas || '?'} — ajustar</>
                    }
                  </div>
                </div>
                <div className="space-y-2">
                  <button type="submit" disabled={submitting || !resumen.cantidadValida}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150">
                    {submitting ? 'Guardando...' : editMode ? 'Actualizar Contenedor' : 'Crear Contenedor'}
                  </button>
                  <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
                    className="w-full py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          VIEW DETAIL MODAL
      ════════════════════════════════════════════════════════ */}
      {selectedContenedor && (
        <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={selectedContenedor.numero} size="xl">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge estado={selectedContenedor.estado} />
              {selectedContenedor.fecha_salida && (
                <span className="text-xs text-muted">Salida: {formatDate(selectedContenedor.fecha_salida)}</span>
              )}
              {selectedContenedor.fecha_llegada && (
                <span className="text-xs text-muted">Llegada: {formatDate(selectedContenedor.fecha_llegada)}</span>
              )}
              <span className="text-xs text-muted">{selectedContenedor.total_pacas} pacas</span>
              {selectedContenedor.tasa_conversion && parseFloat(selectedContenedor.tasa_conversion) !== 1 && (
                <span className="text-xs bg-primary/8 text-muted px-2 py-0.5 rounded-full">Tasa: {parseFloat(selectedContenedor.tasa_conversion).toLocaleString('es-CO')}</span>
              )}
              {selectedContenedor.lote_id && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">Lote #{selectedContenedor.lote_id}</span>
              )}
            </div>

            {/* Desglose de costos por proveedor y servicio */}
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              {/* Proveedores */}
              {selectedContenedor.proveedores_mercancia.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-primary/3 border-b border-border/40">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Mercancía — por proveedor</p>
                  </div>
                  <div className="divide-y divide-border/30">
                    {selectedContenedor.proveedores_mercancia.map((prov, i) => {
                      const tasa = parseFloat(selectedContenedor.tasa_conversion) || 1;
                      const costoCOP = (prov.moneda === 'USD') ? parseFloat(prov.costo) * tasa : parseFloat(prov.costo);
                      const costoPorPaca = parseInt(selectedContenedor.total_pacas) > 0 ? costoCOP / parseInt(selectedContenedor.total_pacas) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/3 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-primary">{prov.proveedor_nombre}</p>
                            {prov.moneda === 'USD' && (
                              <p className="text-xs text-muted">USD {parseFloat(prov.costo).toLocaleString('es-CO')} × {tasa.toLocaleString('es-CO')}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-secondary text-sm font-semibold">{formatCurrency(costoCOP)}</p>
                            <p className="text-[10px] text-muted">{formatCurrency(costoPorPaca)}/paca</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Servicios */}
              {selectedContenedor.servicios.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-primary/3 border-b border-border/40 border-t border-t-border/40">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Servicios</p>
                  </div>
                  <div className="divide-y divide-border/30">
                    {selectedContenedor.servicios.map((srv, i) => {
                      const costoPorPaca = parseInt(selectedContenedor.total_pacas) > 0 ? parseFloat(srv.costo) / parseInt(selectedContenedor.total_pacas) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/3 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="capitalize text-xs font-semibold bg-primary/8 text-primary px-2 py-0.5 rounded-md">{srv.tipo_servicio}</span>
                            <span className="text-sm text-muted">{srv.proveedor_nombre}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-secondary text-sm font-semibold">{formatCurrency(srv.costo)}</p>
                            <p className="text-[10px] text-muted">{formatCurrency(costoPorPaca)}/paca</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Totales */}
              <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-t border-border/40">
                <span className="text-sm font-bold text-primary">Total</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-primary text-base">{formatCurrency(selectedContenedor.costo_total)}</p>
                  <p className="text-[10px] text-muted font-mono">{formatCurrency(selectedContenedor.costo_unitario)}/paca</p>
                </div>
              </div>
            </div>
            {/* Distribución de pacas por proveedor */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Distribución de Pacas</p>
              <div className="space-y-2">
                {selectedContenedor.proveedores_mercancia.map((prov, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-primary/3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-primary text-sm">{prov.proveedor_nombre}</p>
                        {prov.moneda && <span className="text-[10px] bg-primary/8 text-muted px-1.5 py-0.5 rounded font-bold">{prov.moneda}</span>}
                      </div>
                    </div>
                    <div className="px-4 py-2.5 flex flex-wrap gap-2">
                      {prov.detalles.map((det, di) => (
                        <span key={di} className="inline-flex items-center gap-1.5 bg-primary/5 border border-border/50 rounded-lg px-2.5 py-1 text-xs">
                          <span className="capitalize font-semibold text-secondary">{det.clasificacion}</span>
                          <span className="text-muted">/</span>
                          <span className="capitalize text-muted">{det.referencia}</span>
                          {det.calidad && <><span className="text-muted">/</span><span className="capitalize text-muted">{det.calidad}</span></>}
                          <span className="w-px h-3 bg-border/60" />
                          <span className="font-bold text-primary tabular-nums">{det.cantidad}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedContenedor.notas && (
              <p className="text-sm text-muted italic border-l-2 border-border pl-3">{selectedContenedor.notas}</p>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-border/40 gap-3 flex-wrap">
              <button onClick={() => handleExportContenedorExcel(selectedContenedor)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-sm font-medium transition-colors">
                <Download size={15} /> Exportar Excel
              </button>
              {isAdmin && selectedContenedor.estado === 'borrador' && (
                <div className="flex gap-3 ml-auto">
                  <button onClick={() => openEditModal(selectedContenedor)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-sm font-medium transition-colors">
                    <Edit2 size={15} /> Editar
                  </button>
                  <button onClick={() => openFinalizarModal(selectedContenedor)}
                    className="flex items-center gap-2 px-5 py-2 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/85 active:scale-95 transition-all duration-150">
                    <CheckCircle size={17} /> Finalizar Contenedor
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════
          FINALIZAR MODAL
      ════════════════════════════════════════════════════════ */}
      {selectedContenedor && (
        <Modal isOpen={finalizarModalOpen} onClose={() => setFinalizarModalOpen(false)} title="Finalizar Contenedor" size="lg">
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-primary/5 border border-primary/10 p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <DollarSign size={16} className="text-muted" />
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">Costo unitario por paca</p>
              </div>
              <p className="text-4xl font-display font-bold text-primary">{formatCurrency(selectedContenedor.costo_unitario)}</p>
              <p className="text-xs text-muted mt-1.5">Este valor se asignará como <strong className="text-primary">costo_base</strong> a cada paca</p>
            </div>
            <div className="flex items-start gap-3 bg-primary/5 rounded-xl px-4 py-3 text-sm text-muted">
              <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
              <p>Se crearán <strong className="text-primary">{selectedContenedor.total_pacas} pacas</strong> en el inventario y un nuevo lote. Esta acción es irreversible.</p>
            </div>
            <div>
              <p className={lbl}>Precio de Venta por Clasificación / Referencia / Calidad</p>
              <div className="rounded-xl border border-border/60 bg-surface overflow-hidden divide-y divide-border/40">
                {combsFinalizacion.map((comb) => (
                  <div key={comb.key} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <span className="capitalize text-sm font-semibold bg-secondary/10 text-secondary px-2.5 py-1 rounded-lg">{comb.clasificacion}</span>
                      <ArrowRight size={13} className="text-muted flex-shrink-0" />
                      <span className="capitalize text-sm text-muted">{comb.referencia}</span>
                      {comb.calidad && (
                        <><ArrowRight size={13} className="text-muted flex-shrink-0" />
                        <span className="capitalize text-sm text-muted">{comb.calidad}</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted">$</span>
                      <PriceInput
                        className={`${inp} w-32 text-right font-mono`} placeholder="0.00"
                        value={preciosVenta[comb.key] || ''}
                        onChange={(val) => setPreciosVenta({ ...preciosVenta, [comb.key]: val })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setFinalizarModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleFinalizar} disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/85 disabled:opacity-40 active:scale-95 transition-all duration-150">
                {submitting ? 'Finalizando...' : <><CheckCircle size={17} /> Confirmar y crear pacas</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════
          COMPARADOR MODAL
      ════════════════════════════════════════════════════════ */}
      <ComparadorModal
        isOpen={comparadorOpen}
        onClose={() => setComparadorOpen(false)}
        items={contenedores}
      />

      {/* ════════════════════════════════════════════════════════
          CARGAR PLANTILLA MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title="Plantillas guardadas" size="sm">
        {templates.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <BookTemplate size={28} className="mx-auto text-muted/30" />
            <p className="text-sm text-muted">No hay plantillas guardadas aún</p>
            <p className="text-xs text-muted/60">Llena un formulario y usa "Guardar como plantilla"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-secondary/30 hover:bg-primary/3 transition-all group">
                <div className="flex-1 cursor-pointer min-w-0" onClick={() => {
                  setFormData(f => ({ ...f, tasa_conversion: t.tasa_conversion, total_pacas: t.total_pacas, notas: t.notas }));
                  setProveedores(t.proveedores);
                  setServicios(t.servicios);
                  setTemplateModalOpen(false);
                  addToast(`Plantilla "${t.nombre}" cargada`, 'success');
                }}>
                  <p className="text-sm font-semibold text-primary truncate">{t.nombre}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {t.proveedores.length} prov. · {t.servicios.length} serv. · {new Date(t.creadoEn).toLocaleDateString('es-CO')}
                  </p>
                </div>
                <button type="button" onClick={() => removeTemplate(t.id)}
                  className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          GUARDAR PLANTILLA MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={saveTemplateModalOpen} onClose={() => setSaveTemplateModalOpen(false)} title="Guardar plantilla" size="sm">
        <div className="space-y-4">
          <div>
            <label className={lbl}>Nombre de la plantilla *</label>
            <input type="text" className={inp} placeholder="ej. Contenedor USA 40ft estándar"
              value={nombrePlantilla} onChange={e => setNombrePlantilla(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()} autoFocus />
            {templates.some(t => t.nombre === nombrePlantilla.trim()) && nombrePlantilla.trim() && (
              <p className="text-xs text-warning mt-1.5">Ya existe una plantilla con ese nombre — se sobreescribirá.</p>
            )}
          </div>
          <div className="text-xs text-muted bg-primary/5 rounded-xl p-3 space-y-0.5">
            <p className="font-semibold text-primary mb-1">Se guardará:</p>
            <p>· Tasa de conversión ({formData.tasa_conversion || '1'})</p>
            <p>· Total pacas ({formData.total_pacas || '—'})</p>
            <p>· {proveedores.length} proveedor(es) con distribución</p>
            <p>· {servicios.filter(s => s.tipo_servicio).length} servicio(s)</p>
            <p className="text-muted/60 mt-1.5 italic">No se guardan: número ni fechas.</p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => setSaveTemplateModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleSaveTemplate} disabled={!nombrePlantilla.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 transition-all">
              <Save size={15} /> Guardar
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

// ── Mini helper component ─────────────────────────────────────────
function ActionBtn({ icon: Icon, title, onClick, color = 'hover:text-primary hover:bg-primary/10' }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-lg text-muted ${color} transition-colors duration-150 cursor-pointer`}
      aria-label={title}>
      <Icon size={15} />
    </button>
  );
}
