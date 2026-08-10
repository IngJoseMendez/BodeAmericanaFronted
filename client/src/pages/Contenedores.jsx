import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import {
  Package2, Plus, Edit2, Trash2, Eye, CheckCircle, X,
  TrendingUp, DollarSign, Archive, Boxes,
  ArrowRight, AlertTriangle, Layers, Search, Download,
  BarChart2, Calendar, List, ChevronRight, BookTemplate, Save,
  ClipboardCheck, Sparkles, RefreshCw,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Modal, useToast, useConfirm, TableSkeleton, RefLink } from '../components/common';
import { contenedoresApi, preciosApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { useAuth } from '../context/AuthContext';

// ── Constants ────────────────────────────────────────────────────
const TIPOS_SERVICIO = ['transporte', 'aduana', 'cargue', 'descargue', 'almacenaje', 'otro'];

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Factory helpers ───────────────────────────────────────────────

const emptyProveedor = () => ({
  proveedor_nombre: '', moneda: 'USD', notas: '',
  factura_estimada: '', cantidad_estimada: '', valor_unidad_estimado: '',
  detalles: [{ categoria: '', clasificacion: '', referencia: '', calidad: '', cantidad: '', costo_unitario: '' }],
});
const emptyServicio = () => ({
  proveedor_nombre: '', tipo_servicio: '', moneda: 'COP', costo: '', notas: '',
  factura_estimada: '', cantidad_estimada: '', valor_unidad_estimado: '',
});

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
  if (estado === 'finalizado') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Finalizado
      </span>
    );
  }
  if (estado === 'revision') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        En Revisión
      </span>
    );
  }
  if (estado === 'estimacion') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-dashed border-amber-400/50">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Estimación
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/15 text-warning">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
      Borrador
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
// isAdmin llega por prop: antes se leía la variable del componente padre, que no
// está en el ámbito de esta función, y abrir la vista Línea de tiempo lanzaba
// "ReferenceError: isAdmin is not defined" y dejaba la pantalla en blanco.
function TimelineView({ items, onView, isAdmin = false }) {
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
                      {cont.fecha_salida && <>Sal. {new Date(cont.fecha_salida).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}{' → '}</>}
                      Lleg. {new Date(cont.fecha_llegada).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      {' · '}{parseInt(cont.total_pacas).toLocaleString()} unidades
                    </p>
                    {cont.proveedores_nombres && (
                      <p className="text-[11px] text-muted/80 mt-0.5 truncate max-w-[260px]" title={cont.proveedores_nombres}>
                        {cont.proveedores_nombres.split(', ').slice(0, 3).join(', ')}
                      </p>
                    )}
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
                    <span className="text-xs text-muted">{parseInt(cont.total_pacas).toLocaleString()} unidades</span>
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
    { label: 'Unidades',       fn: (c) => parseInt(c.total_pacas).toLocaleString(),           mono: true  },
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
  const save = (nombre, formData, proveedores, servicios, tipo = 'normal') => {
    const nueva = {
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      creadoEn: new Date().toISOString(),
      tipo,
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
  const [revisionModalOpen, setRevisionModalOpen]   = useState(false);

  // ── Revisión ────────────────────────────────────────────────────
  const [revisionRows, setRevisionRows] = useState([]);

  // ── Selection ──────────────────────────────────────────────────
  const [selectedContenedor, setSelectedContenedor] = useState(null);
  const [editMode, setEditMode]                     = useState(false);
  const [modoEstimacion, setModoEstimacion]         = useState(false);
  const [submitting, setSubmitting]                 = useState(false);

  // ── Catálogo dinámico ─────────────────────────────────────────
  const { tipos: tiposRaw, categorias: categoriasRaw, calidades: calidadesRaw, temporadas: temporadasRaw } = useCatalog();
  const tiposOpts      = tiposRaw.map(t => t.nombre);
  const categoriasOpts = categoriasRaw;
  const calidadesOpts  = calidadesRaw.map(t => t.nombre);
  const temporadasOpts = temporadasRaw.map(t => t.nombre);

  // ── Form ───────────────────────────────────────────────────────
  const [formData, setFormData]       = useState({ numero: '', fecha_llegada: '', fecha_salida: '', tasa_conversion: '1', total_pacas: '', notas: '' });
  const [proveedores, setProveedores] = useState([emptyProveedor()]);
  const [servicios, setServicios]     = useState([emptyServicio()]);

  // ── Finalize ───────────────────────────────────────────────────
  const [preciosVenta, setPreciosVenta]           = useState({});
  const [combsFinalizacion, setCombsFinalizacion] = useState([]);
  const [preciosAutocompletados, setPreciosAutocompletados] = useState(new Set());

  // ── Templates ─────────────────────────────────────────────────
  const { templates, save: saveTemplate, remove: removeTemplate } = useContenedorTemplates();
  const [templateModalOpen, setTemplateModalOpen]         = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [nombrePlantilla, setNombrePlantilla]             = useState('');
  const [templateFromView, setTemplateFromView]           = useState(false);

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

  // Deep-link: ?focus=<id> abre el detalle de ese contenedor (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    contenedoresApi.getOne(focus)
      .then(data => { setSelectedContenedor(data); setViewModalOpen(true); })
      .catch(() => addToast('No se encontró el contenedor', 'error'));
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  // Auto-calcula total_pacas: suma de cantidades de las líneas; en estimación,
  // suma de las cantidades estimadas de cada proveedor.
  useEffect(() => {
    const sumaLineas = proveedores.reduce(
      (s, p) => s + (p.detalles || []).reduce((s2, d) => s2 + (parseInt(d.cantidad) || 0), 0),
      0
    );
    const suma = sumaLineas > 0
      ? sumaLineas
      : (modoEstimacion ? proveedores.reduce((s, p) => s + (parseInt(p.cantidad_estimada) || 0), 0) : 0);
    const sumaStr = suma > 0 ? String(suma) : '';
    setFormData(prev => prev.total_pacas === sumaStr ? prev : { ...prev, total_pacas: sumaStr });
  }, [proveedores, modoEstimacion]);

  // ── Filtered list (client-side search) ────────────────────────
  const contenedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contenedores;
    return contenedores.filter(c => c.numero.toLowerCase().includes(q));
  }, [contenedores, busqueda]);

  // ── Export Excel ───────────────────────────────────────────────
  const handleExportExcel = async () => {
    const primary   = '0f172a';
    const secondary = '6366f1';
    const success   = '16a34a';
    const warning   = 'd97706';
    const accent    = '06b6d4';
    const lightGray = 'f8fafc';

    const fmtCurrency = (v) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
    const fmtDate = (v) => v ? new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Comercio Global Logístico';
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
    titleCell.value = 'Comercio Global Logístico — Reporte de Contenedores';
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
      ['Total unidades generadas', totalPacas,               primary,   null],
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
    const cols = ['Número', 'Fecha Llegada', 'Estado', 'Total Unidades', 'Costo/Unidad', 'Costo Mercancía', 'Costo Servicios', 'Costo Total', 'Proveedores', 'Servicios'];
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
    ws.getCell(`A${row}`).value = `Documento generado el ${new Date().toLocaleString('es-CO')} — Comercio Global Logístico`;
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
  // ── Export Reclamación por Proveedor ───────────────────────────
  const handleExportReclamacionExcel = async (cont) => {
    const primary   = '0f172a';
    const blue      = '2563eb';
    const success   = '16a34a';
    const error     = 'dc2626';
    const warning   = 'd97706';
    const lightGray = 'f8fafc';

    let full = cont;
    if (!cont.proveedores_mercancia) {
      try { full = await contenedoresApi.getOne(cont.id); } catch (err) { addToast(err.message, 'error'); return; }
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Comercio Global Logístico';
    wb.created = new Date();

    // Hoja índice / resumen
    const wsR = wb.addWorksheet('Resumen');
    wsR.properties.tabColor = { argb: blue };
    wsR.columns = [{ width: 32 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
    wsR.mergeCells('A1:E1');
    const tCell = wsR.getCell('A1');
    tCell.value = `RECLAMACIÓN — Contenedor ${full.numero}`;
    tCell.font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsR.getRow(1).height = 28;

    wsR.mergeCells('A2:E2');
    wsR.getCell('A2').value = `Generado: ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    wsR.getCell('A2').font = { size: 10, italic: true, color: { argb: '888888' } };
    wsR.getCell('A2').alignment = { horizontal: 'center' };

    // Cabecera de tabla resumen por proveedor
    const headers = ['Proveedor', 'Enviado', 'Recibido', 'Final', 'Diferencia'];
    headers.forEach((h, i) => {
      const c = wsR.getCell(`${String.fromCharCode(65 + i)}4`);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    wsR.getRow(4).height = 22;

    let rRow = 5;
    full.proveedores_mercancia.forEach(p => {
      const env = p.detalles.reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
      const rec = p.detalles.reduce((s, d) => s + (parseInt(d.cantidad_recibida) || 0), 0);
      const fin = p.detalles.reduce((s, d) => s + (parseInt(d.cantidad_final) || 0), 0);
      const diff = rec - env;
      wsR.getCell(`A${rRow}`).value = p.proveedor_nombre;
      wsR.getCell(`A${rRow}`).font = { bold: true, size: 10 };
      wsR.getCell(`B${rRow}`).value = env;
      wsR.getCell(`C${rRow}`).value = rec;
      wsR.getCell(`C${rRow}`).font = { color: { argb: blue }, bold: true };
      wsR.getCell(`D${rRow}`).value = fin;
      wsR.getCell(`D${rRow}`).font = { color: { argb: success }, bold: true };
      wsR.getCell(`E${rRow}`).value = diff;
      wsR.getCell(`E${rRow}`).font = { bold: true, color: { argb: diff < 0 ? error : diff > 0 ? warning : '888888' } };
      ['B','C','D','E'].forEach(col => wsR.getCell(`${col}${rRow}`).alignment = { horizontal: 'center' });
      wsR.getRow(rRow).height = 18;
      rRow++;
    });

    // Totales
    rRow++;
    wsR.getCell(`A${rRow}`).value = 'TOTAL';
    wsR.getCell(`A${rRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
    wsR.getCell(`A${rRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    const totalEnv = full.proveedores_mercancia.reduce((s, p) => s + p.detalles.reduce((s2, d) => s2 + (parseInt(d.cantidad) || 0), 0), 0);
    const totalRec = full.proveedores_mercancia.reduce((s, p) => s + p.detalles.reduce((s2, d) => s2 + (parseInt(d.cantidad_recibida) || 0), 0), 0);
    const totalFin = parseInt(full.total_pacas_recibidas) || 0;
    [[`B${rRow}`, totalEnv], [`C${rRow}`, totalRec], [`D${rRow}`, totalFin], [`E${rRow}`, totalRec - totalEnv]].forEach(([cell, val]) => {
      wsR.getCell(cell).value = val;
      wsR.getCell(cell).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
      wsR.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      wsR.getCell(cell).alignment = { horizontal: 'center' };
    });
    wsR.getRow(rRow).height = 22;

    // Una hoja por proveedor con el detalle
    full.proveedores_mercancia.forEach((prov, pi) => {
      const sheetName = (prov.proveedor_nombre || `Proveedor ${pi+1}`).substring(0, 30).replace(/[*?:/\\\[\]]/g, ' ');
      const ws = wb.addWorksheet(sheetName);
      ws.properties.tabColor = { argb: blue };
      ws.columns = [
        { width: 14 }, { width: 18 }, { width: 18 }, { width: 14 }, // facturado
        { width: 8 },  // pedido
        { width: 18 }, { width: 18 }, { width: 14 }, // recibido
        { width: 10 }, { width: 10 }, { width: 10 }, // recib/final/dif
        { width: 30 }, // notas
      ];

      ws.mergeCells('A1:L1');
      const t = ws.getCell('A1');
      t.value = `Reclamación — ${prov.proveedor_nombre}`;
      t.font = { size: 13, bold: true, color: { argb: 'FFFFFF' } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // Cabeceras de grupos
      ws.mergeCells('A3:E3');
      const g1 = ws.getCell('A3');
      g1.value = 'LO FACTURADO';
      g1.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      g1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '475569' } };
      g1.alignment = { horizontal: 'center' };

      ws.mergeCells('F3:H3');
      const g2 = ws.getCell('F3');
      g2.value = 'LO QUE LLEGÓ';
      g2.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      g2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
      g2.alignment = { horizontal: 'center' };

      ws.mergeCells('I3:K3');
      const g3 = ws.getCell('I3');
      g3.value = 'CANTIDADES';
      g3.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      g3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: success }};
      g3.alignment = { horizontal: 'center' };

      ws.getCell('L3').value = 'OBSERVACIONES';
      ws.getCell('L3').font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      ws.getCell('L3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: warning } };
      ws.getCell('L3').alignment = { horizontal: 'center' };
      ws.getRow(3).height = 18;

      const cols = ['Categoría','Clasificación','Referencia','Calidad','Cant.','Clasificación','Referencia','Calidad','Recibida','Final','Dif.','Notas'];
      cols.forEach((h, i) => {
        const c = ws.getCell(`${String.fromCharCode(65 + i)}4`);
        c.value = h;
        c.font = { bold: true, size: 9, color: { argb: 'FFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      ws.getRow(4).height = 18;

      let row = 5;
      prov.detalles.forEach(det => {
        const enviado = parseInt(det.cantidad) || 0;
        const recibido = parseInt(det.cantidad_recibida) || 0;
        const final = parseInt(det.cantidad_final) || 0;
        const diff = recibido - enviado;
        const cambioTipo = det.clasificacion_recibida || det.referencia_recibida || det.calidad_recibida;

        ws.getCell(`A${row}`).value = det.categoria || '—';
        ws.getCell(`B${row}`).value = det.clasificacion;
        ws.getCell(`C${row}`).value = det.referencia;
        ws.getCell(`D${row}`).value = det.calidad || '—';
        ws.getCell(`E${row}`).value = enviado;

        ws.getCell(`F${row}`).value = det.clasificacion_recibida || det.clasificacion;
        ws.getCell(`G${row}`).value = det.referencia_recibida || det.referencia;
        ws.getCell(`H${row}`).value = det.calidad_recibida || det.calidad || '—';
        if (cambioTipo) {
          ['F','G','H'].forEach(c => {
            ws.getCell(`${c}${row}`).font = { bold: true, color: { argb: warning } };
          });
        }

        ws.getCell(`I${row}`).value = recibido;
        ws.getCell(`I${row}`).font = { bold: true, color: { argb: blue } };
        ws.getCell(`J${row}`).value = final;
        ws.getCell(`J${row}`).font = { bold: true, color: { argb: success } };
        ws.getCell(`K${row}`).value = diff;
        if (diff !== 0) {
          ws.getCell(`K${row}`).font = { bold: true, color: { argb: diff < 0 ? error : warning } };
        }
        ws.getCell(`L${row}`).value = det.notas_revision || '';

        // Highlight row if discrepancy
        if (diff !== 0 || cambioTipo) {
          for (let c = 0; c < 12; c++) {
            const cell = ws.getCell(`${String.fromCharCode(65 + c)}${row}`);
            if (!cell.fill || cell.fill.fgColor?.argb !== warning) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
            }
          }
        }
        ['A','B','C','D','E','F','G','H','I','J','K','L'].forEach(c => {
          ws.getCell(`${c}${row}`).alignment = { horizontal: ['E','I','J','K'].includes(c) ? 'center' : 'left', vertical: 'middle', wrapText: true };
        });
        ws.getRow(row).height = 22;
        row++;
      });

      // Totales del proveedor
      row++;
      ws.mergeCells(`A${row}:D${row}`);
      ws.getCell(`A${row}`).value = 'TOTAL DEL PROVEEDOR';
      ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      const provEnv = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
      const provRec = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad_recibida) || 0), 0);
      const provFin = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad_final) || 0), 0);
      ws.getCell(`E${row}`).value = provEnv;
      ws.getCell(`I${row}`).value = provRec;
      ws.getCell(`J${row}`).value = provFin;
      ws.getCell(`K${row}`).value = provRec - provEnv;
      ['E','I','J','K'].forEach(c => {
        ws.getCell(`${c}${row}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
        ws.getCell(`${c}${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
        ws.getCell(`${c}${row}`).alignment = { horizontal: 'center' };
      });
      ws.getRow(row).height = 22;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Reclamacion_${full.numero}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    addToast('Reclamación exportada', 'success');
  };

  const handleExportContenedorExcel = async (cont) => {
    const primary   = '0f172a';
    const secondary = '6366f1';
    const success   = '16a34a';
    const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

    let full = cont;
    if (!cont.proveedores_mercancia) {
      try { full = await contenedoresApi.getOne(cont.id); } catch (err) { addToast(err.message, 'error'); return; }
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Comercio Global Logístico';
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
      ['Total Unidades', totalPacas],
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

    // ── Estilos compartidos ──────────────────────────────────────────
    const thinBorder = {
      top:    { style: 'thin', color: { argb: 'E5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
      left:   { style: 'thin', color: { argb: 'E5E7EB' } },
      right:  { style: 'thin', color: { argb: 'E5E7EB' } },
    };
    const rowStripe = (idx) => idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

    const drawTableHeader = (ws, headers, headerRow) => {
      headers.forEach((h, i) => {
        const c = ws.getCell(`${String.fromCharCode(65 + i)}${headerRow}`);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondary } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = thinBorder;
      });
      ws.getRow(headerRow).height = 24;
    };

    // ── Hoja Mercancía ───────────────────────────────────────────────
    const wsM = wb.addWorksheet('Mercancía');
    wsM.properties.tabColor = { argb: secondary };
    wsM.columns = [
      { width: 22 }, // A Proveedor
      { width: 14 }, // B Categoría
      { width: 16 }, // C Clasificación
      { width: 16 }, // D Referencia
      { width: 14 }, // E Calidad
      { width: 10 }, // F Cantidad
      { width: 14 }, // G Costo Unit
      { width: 8 },  // H Moneda
      { width: 16 }, // I Subtotal Moneda
      { width: 18 }, // J Subtotal COP
      { width: 16 }, // K Costo/Paca COP
    ];
    addHeader(wsM, `MERCANCÍA — Contenedor ${full.numero}`, 'A1:K1');

    drawTableHeader(wsM, [
      'Proveedor', 'Categoría', 'Clasificación', 'Referencia', 'Calidad',
      'Cantidad', 'Costo Unit', 'Moneda', 'Subtotal', 'Subtotal COP', 'Costo/Paca COP'
    ], 2);

    let mRow = 3;
    let mIdx = 0;
    let totalMercanciaCOP = 0;
    (full.proveedores_mercancia || []).forEach((p) => {
      const moneda = p.moneda || 'USD';
      const factor = moneda === 'USD' ? tasa : 1;
      const provStart = mRow;
      (p.detalles || []).forEach((d) => {
        const cantidad = parseInt(d.cantidad) || 0;
        const costoUnit = parseFloat(d.costo_unitario) || 0;
        const subtotal = cantidad * costoUnit;
        const subtotalCOP = subtotal * factor;
        const costoPorPaca = totalPacas > 0 ? subtotalCOP / totalPacas : 0;
        totalMercanciaCOP += subtotalCOP;

        const bg = rowStripe(mIdx);
        wsM.getCell(`A${mRow}`).value = p.proveedor_nombre;
        wsM.getCell(`B${mRow}`).value = d.categoria || '—';
        wsM.getCell(`C${mRow}`).value = d.clasificacion;
        wsM.getCell(`D${mRow}`).value = d.referencia;
        wsM.getCell(`E${mRow}`).value = d.calidad || '—';
        wsM.getCell(`F${mRow}`).value = cantidad;
        wsM.getCell(`G${mRow}`).value = costoUnit;
        wsM.getCell(`G${mRow}`).numFmt = '#,##0.00';
        wsM.getCell(`H${mRow}`).value = moneda;
        wsM.getCell(`I${mRow}`).value = subtotal;
        wsM.getCell(`I${mRow}`).numFmt = '#,##0.00';
        wsM.getCell(`J${mRow}`).value = subtotalCOP;
        wsM.getCell(`J${mRow}`).numFmt = '$ #,##0';
        wsM.getCell(`K${mRow}`).value = costoPorPaca;
        wsM.getCell(`K${mRow}`).numFmt = '$ #,##0.00';

        ['A','B','C','D','E','F','G','H','I','J','K'].forEach((col, ci) => {
          const cell = wsM.getCell(`${col}${mRow}`);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { size: 10, ...(cell.font || {}) };
          cell.alignment = {
            horizontal: ['F','G','I','J','K'].includes(col) ? 'right' : (col === 'H' ? 'center' : 'left'),
            vertical: 'middle',
          };
          cell.border = thinBorder;
        });
        wsM.getRow(mRow).height = 19;
        mRow++; mIdx++;
      });

      // Subtotal por proveedor
      if ((p.detalles || []).length > 0) {
        const provEnd = mRow;
        wsM.mergeCells(`A${provEnd}:H${provEnd}`);
        wsM.getCell(`A${provEnd}`).value = `Subtotal — ${p.proveedor_nombre}`;
        wsM.getCell(`A${provEnd}`).font = { bold: true, size: 10, color: { argb: primary } };
        wsM.getCell(`A${provEnd}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDE8DF' } };
        wsM.getCell(`A${provEnd}`).alignment = { horizontal: 'right', vertical: 'middle' };

        const subProvOriginal = (p.detalles || []).reduce(
          (s, d) => s + ((parseInt(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0)), 0
        );
        const subProvCOP = subProvOriginal * factor;

        wsM.getCell(`I${provEnd}`).value = subProvOriginal;
        wsM.getCell(`I${provEnd}`).numFmt = '#,##0.00';
        wsM.getCell(`J${provEnd}`).value = subProvCOP;
        wsM.getCell(`J${provEnd}`).numFmt = '$ #,##0';
        ['I','J','K'].forEach(col => {
          wsM.getCell(`${col}${provEnd}`).font = { bold: true, size: 10, color: { argb: primary } };
          wsM.getCell(`${col}${provEnd}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDE8DF' } };
          wsM.getCell(`${col}${provEnd}`).alignment = { horizontal: 'right', vertical: 'middle' };
          wsM.getCell(`${col}${provEnd}`).border = thinBorder;
        });
        ['A','B','C','D','E','F','G','H'].forEach(col => {
          wsM.getCell(`${col}${provEnd}`).border = thinBorder;
        });
        wsM.getRow(provEnd).height = 20;
        mRow++; mIdx = 0; // reset stripe per provider
      }
    });

    // Total general mercancía
    wsM.mergeCells(`A${mRow}:I${mRow}`);
    wsM.getCell(`A${mRow}`).value = 'TOTAL MERCANCÍA (COP)';
    wsM.getCell(`A${mRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
    wsM.getCell(`A${mRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    wsM.getCell(`A${mRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    wsM.getCell(`J${mRow}`).value = totalMercanciaCOP;
    wsM.getCell(`J${mRow}`).numFmt = '$ #,##0';
    wsM.getCell(`J${mRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
    wsM.getCell(`J${mRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    wsM.getCell(`J${mRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    wsM.getCell(`K${mRow}`).value = totalPacas > 0 ? totalMercanciaCOP / totalPacas : 0;
    wsM.getCell(`K${mRow}`).numFmt = '$ #,##0.00';
    wsM.getCell(`K${mRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
    wsM.getCell(`K${mRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    wsM.getCell(`K${mRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    wsM.getRow(mRow).height = 24;

    // ── Hoja Servicios ───────────────────────────────────────────────
    const wsS = wb.addWorksheet('Servicios');
    wsS.properties.tabColor = { argb: success };
    wsS.columns = [
      { width: 18 }, // A Tipo
      { width: 26 }, // B Proveedor
      { width: 10 }, // C Moneda
      { width: 16 }, // D Costo Original
      { width: 18 }, // E Costo COP
      { width: 16 }, // F Costo/Paca COP
      { width: 32 }, // G Notas
    ];
    addHeader(wsS, `SERVICIOS — Contenedor ${full.numero}`, 'A1:G1');

    drawTableHeader(wsS, ['Tipo', 'Proveedor', 'Moneda', 'Costo Original', 'Costo COP', 'Costo/Paca COP', 'Notas'], 2);

    let sRow = 3;
    let totalServiciosCOP = 0;
    (full.servicios || []).forEach((s, i) => {
      const moneda = s.moneda || 'COP';
      const costo = parseFloat(s.costo) || 0;
      const costoCOP = moneda === 'USD' ? costo * tasa : costo;
      const costoPorPaca = totalPacas > 0 ? costoCOP / totalPacas : 0;
      totalServiciosCOP += costoCOP;
      const bg = rowStripe(i);

      wsS.getCell(`A${sRow}`).value = (s.tipo_servicio || '').toString();
      wsS.getCell(`B${sRow}`).value = s.proveedor_nombre || '—';
      wsS.getCell(`C${sRow}`).value = moneda;
      wsS.getCell(`D${sRow}`).value = costo;
      wsS.getCell(`D${sRow}`).numFmt = '#,##0.00';
      wsS.getCell(`E${sRow}`).value = costoCOP;
      wsS.getCell(`E${sRow}`).numFmt = '$ #,##0';
      wsS.getCell(`F${sRow}`).value = costoPorPaca;
      wsS.getCell(`F${sRow}`).numFmt = '$ #,##0.00';
      wsS.getCell(`G${sRow}`).value = s.notas || '';

      ['A','B','C','D','E','F','G'].forEach(col => {
        const cell = wsS.getCell(`${col}${sRow}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { size: 10, ...(col === 'A' ? { bold: true } : {}) };
        cell.alignment = {
          horizontal: ['D','E','F'].includes(col) ? 'right' : (col === 'C' ? 'center' : 'left'),
          vertical: 'middle',
          wrapText: col === 'G',
        };
        cell.border = thinBorder;
      });
      // Capitalizar primera letra del tipo
      if (s.tipo_servicio) {
        wsS.getCell(`A${sRow}`).value = s.tipo_servicio.charAt(0).toUpperCase() + s.tipo_servicio.slice(1);
      }
      wsS.getRow(sRow).height = 22;
      sRow++;
    });

    // Total general servicios
    if ((full.servicios || []).length > 0) {
      wsS.mergeCells(`A${sRow}:D${sRow}`);
      wsS.getCell(`A${sRow}`).value = 'TOTAL SERVICIOS (COP)';
      wsS.getCell(`A${sRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
      wsS.getCell(`A${sRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      wsS.getCell(`A${sRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      wsS.getCell(`E${sRow}`).value = totalServiciosCOP;
      wsS.getCell(`E${sRow}`).numFmt = '$ #,##0';
      wsS.getCell(`F${sRow}`).value = totalPacas > 0 ? totalServiciosCOP / totalPacas : 0;
      wsS.getCell(`F${sRow}`).numFmt = '$ #,##0.00';
      ['E','F'].forEach(col => {
        wsS.getCell(`${col}${sRow}`).font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
        wsS.getCell(`${col}${sRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
        wsS.getCell(`${col}${sRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      });
      wsS.getRow(sRow).height = 24;
    } else {
      wsS.mergeCells(`A${sRow}:G${sRow}`);
      wsS.getCell(`A${sRow}`).value = 'Sin servicios registrados';
      wsS.getCell(`A${sRow}`).font = { italic: true, size: 10, color: { argb: '888888' } };
      wsS.getCell(`A${sRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

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
    // En estimación, el total de unidades es la suma de las cantidades estimadas.
    const sumEstimada = proveedores.reduce((s, p) => s + (parseInt(p.cantidad_estimada) || 0), 0);
    const totalPacas = (parseInt(formData.total_pacas) || 0) || (modoEstimacion ? sumEstimada : 0);

    const proveedoresDetalle = proveedores.map(p => {
      // Costo real de las líneas; si no hay, la estimación (cantidad_estimada × valor_unidad_estimado).
      const costoReal = (p.detalles || []).reduce(
        (s, d) => s + (parseInt(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0), 0
      );
      const costoOriginal = costoReal > 0
        ? costoReal
        : (parseInt(p.cantidad_estimada) || 0) * (parseFloat(p.valor_unidad_estimado) || 0);
      const costoEnCOP = p.moneda === 'USD' ? costoOriginal * tasa : costoOriginal;
      return { nombre: p.proveedor_nombre, moneda: p.moneda || 'USD', costoOriginal, costoEnCOP,
               costoPorPaca: totalPacas > 0 ? costoEnCOP / totalPacas : 0 };
    });

    const serviciosDetalle = servicios.map(sv => {
      const costoReal = parseFloat(sv.costo) || 0;
      const costoOriginal = costoReal > 0
        ? costoReal
        : ((parseInt(sv.cantidad_estimada) || 0) * (parseFloat(sv.valor_unidad_estimado) || 0)) || (parseFloat(sv.valor_unidad_estimado) || 0);
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
    // Contenedor "estimado": sin líneas de distribución todavía (solo datos estimados).
    const esEstimado = sumDetalles === 0;
    const cantidadValida = esEstimado || (totalPacas > 0 && sumDetalles === totalPacas);

    // Avance por proveedor: permite ir cargando la distribución de a un proveedor
    // por vez y ver en todo momento a quién le falta. Ya no hace falta tener el
    // contenedor completo para poder guardar.
    const avanceProveedores = proveedores.map(p => {
      const registrada = (p.detalles || []).reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
      const estimada = parseInt(p.cantidad_estimada) || 0;
      return {
        nombre: p.proveedor_nombre?.trim() || 'Proveedor sin nombre',
        estimada,
        registrada,
        falta: estimada > 0 ? Math.max(0, estimada - registrada) : 0,
        sobra: estimada > 0 ? Math.max(0, registrada - estimada) : 0,
        // Sin estimación previa no hay contra qué comparar: basta con tener líneas.
        completo: estimada > 0 ? registrada === estimada : registrada > 0,
        sinEmpezar: registrada === 0,
      };
    });

    const faltanUnidades = totalPacas > 0 ? totalPacas - sumDetalles : 0;
    const provsCompletos = avanceProveedores.filter(a => a.completo).length;

    return {
      proveedoresDetalle, serviciosDetalle, costoMercancia, costoServicios, costoTotal,
      costoUnitario, sumDetalles, cantidadValida, esEstimado, totalPacas,
      avanceProveedores, faltanUnidades, provsCompletos,
    };
  };

  // ── Provider row management ────────────────────────────────────
  const addProveedor    = () => setProveedores([...proveedores, emptyProveedor()]);
  const removeProveedor = (pi) => proveedores.length > 1 && setProveedores(proveedores.filter((_, i) => i !== pi));
  const updateProveedor = (pi, field, val) => {
    const n = [...proveedores];
    const updated = { ...n[pi], [field]: val };
    if (field === 'factura_estimada' || field === 'cantidad_estimada') {
      const factura  = parseFloat(field === 'factura_estimada'  ? val : updated.factura_estimada)  || 0;
      const cantidad = parseInt(field === 'cantidad_estimada' ? val : updated.cantidad_estimada) || 0;
      if (factura > 0 && cantidad > 0) updated.valor_unidad_estimado = String((factura / cantidad).toFixed(2));
    }
    n[pi] = updated;
    setProveedores(n);
  };
  const addDetalle    = (pi) => {
    const n = [...proveedores];
    n[pi] = { ...n[pi], detalles: [...n[pi].detalles, { categoria: '', clasificacion: '', referencia: '', calidad: '', cantidad: '', costo_unitario: '' }] };
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
    const n = [...servicios];
    const updated = { ...n[si], [field]: val };
    if (field === 'factura_estimada' || field === 'cantidad_estimada') {
      const factura  = parseFloat(field === 'factura_estimada'  ? val : updated.factura_estimada)  || 0;
      const cantidad = parseInt(field === 'cantidad_estimada' ? val : updated.cantidad_estimada) || 0;
      if (factura > 0 && cantidad > 0) {
        updated.valor_unidad_estimado = String((factura / cantidad).toFixed(2));
      } else if (field === 'factura_estimada' && factura > 0 && !updated.cantidad_estimada) {
        updated.valor_unidad_estimado = String(factura.toFixed(2));
      }
    }
    n[si] = updated;
    setServicios(n);
  };

  // ── Reset ──────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({ numero: '', fecha_llegada: '', fecha_salida: '', tasa_conversion: '1', total_pacas: '', notas: '' });
    setProveedores([emptyProveedor()]);
    setServicios([emptyServicio()]);
  };

  const handleSaveTemplate = () => {
    if (!nombrePlantilla.trim()) return;
    if (templateFromView && selectedContenedor) {
      const c = selectedContenedor;
      const provs = (c.proveedores_mercancia || []).map(p => ({
        proveedor_nombre: p.proveedor_nombre,
        moneda: p.moneda || 'USD',
        notas: p.notas || '',
        factura_estimada: p.factura_estimada || '',
        cantidad_estimada: p.cantidad_estimada != null ? String(p.cantidad_estimada) : '',
        valor_unidad_estimado: p.valor_unidad_estimado != null ? String(p.valor_unidad_estimado) : '',
        detalles: (p.detalles || []).map(d => ({
          categoria: d.categoria || '',
          clasificacion: d.clasificacion || '',
          referencia: d.referencia || '',
          calidad: d.calidad || '',
          cantidad: String(d.cantidad || ''),
          costo_unitario: String(d.costo_unitario || ''),
        })),
      }));
      const srvs = (c.servicios || []).map(s => ({
        proveedor_nombre: s.proveedor_nombre || '',
        tipo_servicio: s.tipo_servicio || '',
        moneda: s.moneda || 'COP',
        costo: String(s.costo || ''),
        notas: s.notas || '',
        factura_estimada: s.factura_estimada || '',
        cantidad_estimada: s.cantidad_estimada != null ? String(s.cantidad_estimada) : '',
        valor_unidad_estimado: s.valor_unidad_estimado != null ? String(s.valor_unidad_estimado) : '',
      }));
      saveTemplate(nombrePlantilla, {
        tasa_conversion: String(c.tasa_conversion || '1'),
        total_pacas: String(c.total_pacas || ''),
        notas: c.notas || '',
      }, provs, srvs, c.estado === 'estimacion' ? 'estimacion' : 'normal');
    } else {
      saveTemplate(nombrePlantilla, formData, proveedores, servicios, modoEstimacion ? 'estimacion' : 'normal');
    }
    addToast(`Plantilla "${nombrePlantilla.trim()}" guardada`, 'success');
    setSaveTemplateModalOpen(false);
    setTemplateFromView(false);
  };

  // ── Open modals ────────────────────────────────────────────────
  const openCreateModal = (estimacion = false) => { resetForm(); setEditMode(false); setModoEstimacion(estimacion); setSelectedContenedor(null); setModalOpen(true); };

  const openEditModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      setModoEstimacion(full.estado === 'estimacion');
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
            notas: p.notas || '',
            factura_estimada: p.factura_estimada || '',
            cantidad_estimada: p.cantidad_estimada != null ? String(p.cantidad_estimada) : '',
            valor_unidad_estimado: p.valor_unidad_estimado != null ? String(p.valor_unidad_estimado) : '',
            detalles: p.detalles.length > 0
              ? p.detalles.map((d) => ({
                  categoria: d.categoria || '',
                  clasificacion: d.clasificacion,
                  referencia: d.referencia,
                  calidad: d.calidad || '',
                  cantidad: String(d.cantidad),
                  costo_unitario: String(d.costo_unitario || ''),
                }))
              : [{ categoria: '', clasificacion: '', referencia: '', calidad: '', cantidad: '', costo_unitario: '' }],
          }))
        : [emptyProveedor()]);
      setServicios(full.servicios.length > 0
        ? full.servicios.map((s) => ({
            proveedor_nombre: s.proveedor_nombre, tipo_servicio: s.tipo_servicio, moneda: s.moneda || 'COP',
            costo: String(s.costo || ''), notas: s.notas || '',
            factura_estimada: s.factura_estimada || '',
            cantidad_estimada: s.cantidad_estimada != null ? String(s.cantidad_estimada) : '',
            valor_unidad_estimado: s.valor_unidad_estimado != null ? String(s.valor_unidad_estimado) : '',
          }))
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
    // Se permite guardar a medias: el contenedor se puede ir cargando proveedor por
    // proveedor a lo largo de varios días. Que las líneas cuadren con el total solo
    // se exige al FINALIZAR, que es el paso irreversible que crea las unidades.
    if (modoEstimacion && !proveedores.some(p => p.proveedor_nombre?.trim())) {
      addToast('Agrega al menos un proveedor con su estimación', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        numero: formData.numero,
        fecha_llegada: formData.fecha_llegada || null,
        fecha_salida: formData.fecha_salida || null,
        tasa_conversion: parseFloat(formData.tasa_conversion) || 1,
        total_pacas: parseInt(formData.total_pacas) || 0,
        notas: formData.notas || null,
        ...(modoEstimacion && !editMode ? { estado: 'estimacion' } : {}),
        proveedores_mercancia: proveedores.map((p) => ({
          proveedor_nombre: p.proveedor_nombre,
          moneda: p.moneda || 'USD',
          notas: p.notas || null,
          factura_estimada: p.factura_estimada || null,
          cantidad_estimada: p.cantidad_estimada ? parseInt(p.cantidad_estimada) : null,
          valor_unidad_estimado: p.valor_unidad_estimado ? parseFloat(p.valor_unidad_estimado) : null,
          detalles: p.detalles.map((d) => ({
            categoria: d.categoria || null,
            clasificacion: d.clasificacion,
            referencia: d.referencia,
            calidad: d.calidad,
            cantidad: parseInt(d.cantidad) || 0,
            costo_unitario: parseFloat(d.costo_unitario) || 0,
          })),
        })),
        servicios: servicios.filter((s) => s.proveedor_nombre || s.tipo_servicio || s.factura_estimada).map((s) => ({
          ...s,
          costo: parseFloat(s.costo) || 0,
          factura_estimada: s.factura_estimada || null,
          cantidad_estimada: s.cantidad_estimada ? parseInt(s.cantidad_estimada) : null,
          valor_unidad_estimado: s.valor_unidad_estimado ? parseFloat(s.valor_unidad_estimado) : null,
        })),
      };
      // Aviso de avance: deja claro que quedó guardado a medias y qué falta.
      const parcial = !modoEstimacion && !r.esEstimado && r.totalPacas > 0 && r.sumDetalles !== r.totalPacas;
      const avisoParcial = parcial
        ? ` — guardado parcial: ${r.sumDetalles} de ${r.totalPacas} unidades (${r.faltanUnidades > 0 ? `faltan ${r.faltanUnidades}` : `sobran ${Math.abs(r.faltanUnidades)}`})`
        : '';

      if (editMode && selectedContenedor) {
        await contenedoresApi.update(selectedContenedor.id, payload);
        addToast((modoEstimacion ? 'Estimación actualizada' : 'Contenedor actualizado') + avisoParcial, parcial ? 'warning' : 'success');
      } else {
        await contenedoresApi.create(payload);
        addToast(modoEstimacion
          ? 'Estimación creada — revisa Cuentas por Pagar para registrar abonos'
          : 'Contenedor creado' + avisoParcial, parcial ? 'warning' : 'success');
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

  // ── Convertir estimación → contenedor normal ───────────────────
  const handleConvertirNormal = async (contenedor) => {
    const ok = await confirm({
      title: '¿Convertir a contenedor normal?',
      message: `El contenedor "${contenedor.numero}" pasará de estimación a borrador para registrar lo que realmente llegó (líneas de distribución, revisión y finalización). Las Cuentas por Pagar y sus abonos se conservan.`,
      confirmText: 'Convertir',
      variant: 'info',
    });
    if (!ok) return;
    try {
      const full = await contenedoresApi.convertirNormal(contenedor.id);
      addToast('Convertido a contenedor normal — completa las líneas reales', 'success');
      loadContenedores();
      openEditModal(full); // abre el formulario normal para diligenciar lo real
    } catch (err) { addToast(err.message, 'error'); }
  };

  // ── Finalizar ──────────────────────────────────────────────────
  const openFinalizarModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      const combMap = new Map();
      full.proveedores_mercancia.forEach((p) => p.detalles.forEach((d) => {
        const cantidad = parseInt(d.cantidad_final) || 0;
        if (cantidad === 0 && full.estado === 'revision') return;
        const clasificacion = d.clasificacion_recibida || d.clasificacion;
        const referencia    = d.referencia_recibida    || d.referencia;
        const calidad       = d.calidad_recibida       || d.calidad || '';
        const categoria     = d.categoria || '';
        const key = `${categoria}|${clasificacion}|${referencia}|${calidad}`;
        if (!combMap.has(key)) {
          combMap.set(key, { categoria, clasificacion, referencia, calidad, key, cantidad });
        } else {
          combMap.get(key).cantidad += cantidad;
        }
      }));
      const combs = Array.from(combMap.values());
      setCombsFinalizacion(combs);

      // Autocompletar precios preestablecidos — una sola llamada por par único (categoria+calidad)
      const uniquePairs = [...new Set(
        combs.filter(c => c.categoria && c.calidad).map(c => `${c.categoria.trim()}|||${c.calidad.trim()}`)
      )];
      const presetMap = {};
      await Promise.all(uniquePairs.map(async (pk) => {
        const sep = pk.indexOf('|||');
        const categoria = pk.slice(0, sep).trim();
        const calidad = pk.slice(sep + 3).trim();
        try {
          const preset = await preciosApi.buscar({ categoria, calidad });
          if (preset && preset.precio > 0) presetMap[pk] = preset.precio;
        } catch (_) {}
      }));
      const init = {};
      const autoKeys = new Set();
      for (const c of combs) {
        const pk = `${c.categoria.trim()}|||${c.calidad.trim()}`;
        if (c.categoria && c.calidad && presetMap[pk]) {
          init[c.key] = String(presetMap[pk]);
          autoKeys.add(c.key);
        } else {
          init[c.key] = '';
        }
      }
      setPreciosVenta(init);
      setPreciosAutocompletados(autoKeys);
      setViewModalOpen(false); setFinalizarModalOpen(true);
    } catch (err) { addToast(err.message, 'error'); }
  };

  // ── Revisión ──────────────────────────────────────────────────
  const openRevisionModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      const rows = [];
      for (const prov of full.proveedores_mercancia) {
        for (const det of prov.detalles) {
          rows.push({
            detalle_id: det.id,
            proveedor_nombre: prov.proveedor_nombre,
            // Enviado (read-only)
            categoria: det.categoria || '',
            clasificacion: det.clasificacion,
            referencia: det.referencia,
            calidad: det.calidad || '',
            cantidad_enviada: det.cantidad,
            // Revisión (editable, pre-rellenado)
            cantidad_recibida: det.cantidad_recibida != null ? String(det.cantidad_recibida) : String(det.cantidad),
            cantidad_final: det.cantidad_final != null ? String(det.cantidad_final) : String(det.cantidad),
            clasificacion_recibida: det.clasificacion_recibida || '',
            referencia_recibida: det.referencia_recibida || '',
            calidad_recibida: det.calidad_recibida || '',
            notas_revision: det.notas_revision || '',
          });
        }
      }
      setRevisionRows(rows);
      setViewModalOpen(false);
      setRevisionModalOpen(true);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const updateRevisionRow = (idx, field, val) => {
    setRevisionRows(prev => {
      const next = [...prev];
      const updated = { ...next[idx], [field]: val };
      // Cantidad final siempre refleja lo recibido (lo que entra al inventario).
      if (field === 'cantidad_recibida') updated.cantidad_final = val;
      next[idx] = updated;
      return next;
    });
  };

  const handleGuardarRevision = async () => {
    for (const r of revisionRows) {
      if (parseInt(r.cantidad_final) < 0) {
        addToast('La cantidad final no puede ser negativa', 'error');
        return;
      }
    }
    // Detecta discrepancias antes de guardar para ofrecer exportar después.
    const discrepancias = revisionRows.filter(r =>
      (parseInt(r.cantidad_recibida) || 0) !== (parseInt(r.cantidad_enviada) || 0) ||
      r.clasificacion_recibida.trim() || r.referencia_recibida.trim() || r.calidad_recibida.trim()
    );
    const hayDiscrepancias = discrepancias.length > 0;

    setSubmitting(true);
    try {
      const revisiones = revisionRows.map(r => ({
        detalle_id: r.detalle_id,
        cantidad_recibida: parseInt(r.cantidad_recibida) || 0,
        cantidad_final: parseInt(r.cantidad_final) || 0,
        clasificacion_recibida: r.clasificacion_recibida.trim() || null,
        referencia_recibida: r.referencia_recibida.trim() || null,
        calidad_recibida: r.calidad_recibida.trim() || null,
        notas_revision: r.notas_revision.trim() || null,
      }));
      const contenedorActualizado = await contenedoresApi.revisar(selectedContenedor.id, { revisiones });
      addToast('Revisión guardada — el contenedor está listo para finalizar', 'success');
      setRevisionModalOpen(false);
      loadContenedores();

      // Si hay discrepancias, ofrecer exportar reclamación inmediatamente.
      if (hayDiscrepancias) {
        const exportar = await confirm({
          title: '⚠ Se detectaron discrepancias',
          message: `Se encontraron ${discrepancias.length} línea${discrepancias.length !== 1 ? 's' : ''} con diferencias entre lo pedido y lo recibido. ¿Quieres exportar ahora la reclamación por proveedor (Excel) para enviársela?\n\nPodrás hacerlo más tarde desde el botón "Ver detalle" (👁) del contenedor.`,
          confirmText: 'Exportar Excel ahora',
          cancelText: 'Más tarde',
        });
        if (exportar) {
          await handleExportReclamacionExcel(contenedorActualizado);
        }
      }
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  // Cuánto queda por distribuir en un contenedor ya guardado. Se usa para avisar
  // antes de finalizar, que es el único punto donde la incompletitud importa.
  const avanceFinalizacion = (cont) => {
    if (!cont) return null;
    const totalDeclarado = parseInt(cont.total_pacas) || 0;
    const provs = cont.proveedores_mercancia || [];
    const sumLineas = provs.reduce(
      (s, p) => s + (p.detalles || []).reduce((s2, d) => s2 + (parseInt(d.cantidad) || 0), 0), 0
    );
    const pendientes = provs
      .map(p => ({
        nombre: p.proveedor_nombre || 'Sin nombre',
        estimada: parseInt(p.cantidad_estimada) || 0,
        registrada: (p.detalles || []).reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0),
      }))
      .filter(p => (p.estimada > 0 ? p.registrada !== p.estimada : p.registrada === 0));

    return {
      totalDeclarado, sumLineas,
      faltan: totalDeclarado - sumLineas,
      cuadra: totalDeclarado === 0 || sumLineas === totalDeclarado,
      pendientes,
    };
  };

  const handleFinalizar = async () => {
    for (const c of combsFinalizacion) {
      const pv = parseFloat(preciosVenta[c.key]);
      if (isNaN(pv) || pv <= 0) {
        addToast(`Falta precio de venta para "${c.clasificacion} / ${c.referencia} / ${c.calidad}"`, 'error'); return;
      }
    }

    // No se bloquea, pero no puede pasar inadvertido: es irreversible.
    const av = avanceFinalizacion(selectedContenedor);
    if (av && !av.cuadra) {
      const ok = await confirm({
        title: 'El contenedor está incompleto',
        message: `Hay ${av.sumLineas} unidades distribuidas de las ${av.totalDeclarado} declaradas (${av.faltan > 0 ? `faltan ${av.faltan}` : `sobran ${Math.abs(av.faltan)}`}).\n\nSi continúas, el costo por unidad se repartirá entre ${av.totalDeclarado} unidades y solo entrarán al inventario las distribuidas. Esta acción es irreversible.\n\n¿Finalizar de todas formas?`,
        confirmText: 'Finalizar así',
        cancelText: 'Volver y completar',
        variant: 'danger',
      });
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const precios = combsFinalizacion.map((c) => ({ categoria: c.categoria || null, clasificacion: c.clasificacion, referencia: c.referencia, calidad: c.calidad, precio_venta: parseFloat(preciosVenta[c.key]) }));
      const result = await contenedoresApi.finalizar(selectedContenedor.id, { precios });
      addToast(`Lote "${result.lote_numero}" creado — ${result.total_pacas_creadas} unidades al inventario`, 'success');
      setFinalizarModalOpen(false); loadContenedores();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  // ── Derived stats ──────────────────────────────────────────────
  const borradores  = contenedores.filter((c) => c.estado === 'borrador').length;
  const enRevision  = contenedores.filter((c) => c.estado === 'revision').length;
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => openCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-600 border border-dashed border-amber-400/60 rounded-xl text-sm font-semibold hover:bg-amber-500/20 active:scale-95 transition-all duration-150"
              title="Crear un contenedor estimado (lo que crees que llegará) para empezar a registrar abonos"
            >
              <Sparkles size={17} />
              <span className="hidden sm:inline">Nueva estimación</span>
            </button>
            <button
              onClick={() => openCreateModal(false)}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 active:scale-95 transition-all duration-150 shadow-sm"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Nuevo Contenedor</span>
            </button>
          </div>
        )
      }
    >
      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total"        value={contenedores.length}          icon={Boxes}    color="bg-secondary/80" sub={`${borradores} borrador · ${enRevision} en revisión`} />
        <KpiCard label="Borradores"   value={borradores}                   icon={Layers}   color="bg-warning/70"   sub="Registro inicial pendiente" />
        <KpiCard label="En Revisión"  value={enRevision}                   icon={ClipboardCheck} color="bg-blue-500/70" sub="Verificación física" />
        <KpiCard label="Finalizados"  value={finalizados}                  icon={Archive}  color="bg-success/70"   sub={costoPromedio > 0 ? `Costo prom. ${formatCurrency(costoPromedio)}` : 'Lotes en inventario'} />
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
          <option value="estimacion">Estimación</option>
          <option value="borrador">Borrador</option>
          <option value="revision">En Revisión</option>
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
        <div className="bg-surface rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <table className="w-full text-sm"><tbody><TableSkeleton cols={8} rows={6} /></tbody></table>
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
                  {['Número', 'Fecha', 'Unidades', 'Costo Unitario', 'Costo Total', 'Servicios', 'Estado', ''].map((h) => (
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
                        {cont.proveedores_nombres && (
                          <p className="text-xs text-muted mt-0.5" title={cont.proveedores_nombres}>
                            {cont.proveedores_nombres.split(', ').slice(0, 3).join(', ')}
                            {cont.proveedores_nombres.split(', ').length > 3 ? '…' : ''}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span><span className="text-[10px] uppercase text-muted/60">Salida:</span> {formatDate(cont.fecha_salida)}</span>
                        <span><span className="text-[10px] uppercase text-muted/60">Llegada:</span> {formatDate(cont.fecha_llegada)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-primary text-center">
                      {(cont.estado === 'revision' || cont.estado === 'finalizado') && cont.total_pacas_recibidas != null ? (
                        cont.total_pacas_recibidas !== parseInt(cont.total_pacas) ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-muted line-through text-xs font-normal">{parseInt(cont.total_pacas).toLocaleString()}</span>
                            <ArrowRight size={11} className="text-muted" />
                            <span className="text-blue-600 font-bold">{parseInt(cont.total_pacas_recibidas).toLocaleString()}</span>
                          </div>
                        ) : (
                          parseInt(cont.total_pacas_recibidas).toLocaleString()
                        )
                      ) : (
                        parseInt(cont.total_pacas).toLocaleString()
                      )}
                    </td>
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
                        {canEdit && (cont.estado === 'borrador' || cont.estado === 'estimacion') && (
                          <ActionBtn icon={Edit2} title={cont.estado === 'estimacion' ? 'Editar estimación' : 'Editar'} color="hover:text-secondary hover:bg-secondary/10" onClick={() => openEditModal(cont)} />
                        )}
                        {canEdit && cont.estado === 'estimacion' && (
                          <ActionBtn icon={RefreshCw} title="Convertir a contenedor normal" color="hover:text-amber-600 hover:bg-amber-500/10" onClick={() => handleConvertirNormal(cont)} />
                        )}
                        {isAdmin && cont.estado === 'estimacion' && (
                          <ActionBtn icon={Trash2} title="Eliminar" color="hover:text-error hover:bg-error/10" onClick={() => handleDelete(cont)} />
                        )}
                        {isAdmin && cont.estado === 'borrador' && (
                          <>
                            <ActionBtn icon={ClipboardCheck} title="Revisar contenedor" color="hover:text-blue-600 hover:bg-blue-500/10" onClick={() => openRevisionModal(cont)} />
                            <ActionBtn icon={Trash2} title="Eliminar" color="hover:text-error hover:bg-error/10" onClick={() => handleDelete(cont)} />
                          </>
                        )}
                        {isAdmin && cont.estado === 'revision' && (
                          <>
                            <ActionBtn icon={ClipboardCheck} title="Editar revisión" color="hover:text-blue-600 hover:bg-blue-500/10" onClick={() => openRevisionModal(cont)} />
                            <ActionBtn icon={CheckCircle} title="Finalizar" color="hover:text-success hover:bg-success/10" onClick={() => openFinalizarModal(cont)} />
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
          <TimelineView items={contenedoresFiltrados} onView={openViewModal} isAdmin={isAdmin} />
        </div>

      )}

      {/* ════════════════════════════════════════════════════════
          CREATE / EDIT MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={editMode
          ? `${modoEstimacion ? 'Editar estimación' : 'Editar'} — ${selectedContenedor?.numero}`
          : (modoEstimacion ? 'Nueva estimación de contenedor' : 'Nuevo Contenedor')}
        size="full"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* ── LEFT: form sections ─────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Banner modo estimación */}
              {modoEstimacion && (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-amber-400/60 bg-amber-500/5 px-4 py-3">
                  <Sparkles size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <p className="font-semibold">Modo estimación</p>
                    <p className="text-xs text-amber-700/80 mt-0.5">
                      Registra lo que <strong>crees que llegará</strong> en cada parte (factura, cantidad y valor por unidad estimados).
                      Al guardar se generan las <strong>Cuentas por Pagar</strong> para que registres abonos antes de que llegue.
                      Cuando llegue, conviértelo a contenedor normal para registrar lo real.
                    </p>
                  </div>
                </div>
              )}

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
                    <label className={lbl}>
                      Total de Unidades
                      <span className="ml-1.5 text-[9px] font-semibold normal-case text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">AUTO</span>
                    </label>
                    <input type="number" readOnly tabIndex={-1}
                      className={`${inp} bg-primary/5 text-primary font-mono font-bold text-center cursor-not-allowed select-none`}
                      placeholder="0"
                      value={formData.total_pacas}
                      title="Se calcula automáticamente desde las cantidades de cada proveedor" />
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
                <div className="space-y-6">
                  {proveedores.map((prov, pi) => (
                    <div key={pi} className="rounded-2xl border-2 border-secondary/20 bg-surface overflow-hidden shadow-sm hover:shadow-md hover:border-secondary/40 transition-all duration-200">
                      {/* ── Cabecera del proveedor (color destacado) ─── */}
                      <div className="px-4 py-3 bg-gradient-to-r from-secondary/10 to-secondary/5 border-b-2 border-secondary/20">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-xl bg-secondary text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                            P{pi + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none mb-0.5">Proveedor {pi + 1}</p>
                            <input type="text" className={`${inp} font-semibold`} placeholder="Nombre del proveedor *"
                              value={prov.proveedor_nombre} onChange={(e) => updateProveedor(pi, 'proveedor_nombre', e.target.value)} required />
                          </div>
                          <select className={`${inpBase} w-20 flex-shrink-0 font-semibold`} value={prov.moneda || 'USD'}
                            onChange={(e) => updateProveedor(pi, 'moneda', e.target.value)}>
                            <option value="USD">USD</option>
                            <option value="COP">COP</option>
                          </select>
                          {proveedores.length > 1 && (
                            <button type="button" onClick={() => removeProveedor(pi)}
                              title="Eliminar proveedor"
                              className="p-2 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          {(() => {
                            const totalPacasProv = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
                            return totalPacasProv > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-white text-xs font-bold shadow-sm">
                                <Boxes size={11} />
                                {totalPacasProv.toLocaleString()} {totalPacasProv === 1 ? 'paca' : 'pacas'}
                              </span>
                            ) : null;
                          })()}
                          <input type="text" className={`${inp} text-xs flex-1`} placeholder="Notas del proveedor (opcional)"
                            value={prov.notas} onChange={(e) => updateProveedor(pi, 'notas', e.target.value)} />
                        </div>
                        {/* ── Datos estimados (solo en modo estimación; en el contenedor real se ocultan) ─── */}
                        {modoEstimacion && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2.5">
                          <input type="text" className={`${inp} text-xs`} placeholder="Factura estimada"
                            value={prov.factura_estimada || ''} onChange={(e) => updateProveedor(pi, 'factura_estimada', e.target.value)} />
                          <input type="text" inputMode="numeric" className={`${inp} text-xs`} placeholder="Cantidad estimada"
                            value={prov.cantidad_estimada || ''} onChange={(e) => updateProveedor(pi, 'cantidad_estimada', e.target.value.replace(/[^0-9]/g, ''))} />
                          <PriceInput className={`${inp} text-xs`} placeholder="Valor/unidad (auto: factura÷cant.)"
                            value={prov.valor_unidad_estimado || ''} onChange={(val) => updateProveedor(pi, 'valor_unidad_estimado', val)} />
                        </div>
                        )}
                      </div>

                      {/* ── Líneas de distribución (oculto en modo estimación) ─── */}
                      {!modoEstimacion && (
                      <div className="px-4 pb-4 pt-3 bg-cream/30">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Layers size={12} className="text-muted" />
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest">
                              Líneas de Distribución ({prov.detalles.length})
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-secondary tabular-nums bg-secondary/10 px-2 py-0.5 rounded-full">
                            Total: {formatCurrency(prov.detalles.reduce((s,d)=>s+(parseInt(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0),0))}
                            {(prov.moneda==='USD') && (parseFloat(formData.tasa_conversion)||1) > 1 &&
                              ` ≈ ${formatCurrency(prov.detalles.reduce((s,d)=>s+(parseInt(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0),0)*(parseFloat(formData.tasa_conversion)||1))} COP`
                            }
                          </span>
                        </div>
                        <div className="space-y-4">
                          {prov.detalles.map((det, di) => {
                            const subtotal = (parseInt(det.cantidad)||0)*(parseFloat(det.costo_unitario)||0);
                            return (
                              <div key={di} className="bg-surface rounded-xl border border-border/60 border-l-4 border-l-secondary/50 shadow-sm hover:shadow-md hover:border-l-secondary transition-all duration-150 overflow-hidden">
                                {/* Cabecera de la línea */}
                                <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/5 border-b border-border/30">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-md bg-secondary/15 text-secondary text-[10px] font-bold flex items-center justify-center">
                                      {di + 1}
                                    </span>
                                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Línea {di + 1}</span>
                                    {subtotal > 0 && (
                                      <span className="ml-2 text-[10px] text-muted font-mono">
                                        Subtotal: <span className="font-bold text-secondary">{subtotal.toLocaleString('es-CO', {maximumFractionDigits: 0})}</span>
                                      </span>
                                    )}
                                  </div>
                                  {prov.detalles.length > 1 && (
                                    <button type="button" onClick={() => removeDetalle(pi, di)}
                                      title="Eliminar línea"
                                      className="p-1 rounded-md text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                                {/* Campos */}
                                <div className="px-3 pt-2.5 pb-3 space-y-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  <div>
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Categoría</label>
                                    <input list={`temporadas-${pi}-${di}`} className={inp} placeholder="Verano / Invierno"
                                      value={det.categoria}
                                      onChange={(e) => updateDetalle(pi, di, 'categoria', e.target.value)} />
                                    <datalist id={`temporadas-${pi}-${di}`}>
                                      {temporadasOpts.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Clasificación *</label>
                                    <input list={`tipos-${pi}-${di}`} className={inp} placeholder="Hombre / Mujer..."
                                      value={det.clasificacion} required
                                      onChange={(e) => updateDetalle(pi, di, 'clasificacion', e.target.value)} />
                                    <datalist id={`tipos-${pi}-${di}`}>
                                      {tiposOpts.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Referencia *</label>
                                    <input list={`cats-${pi}-${di}`} className={inp} placeholder="Chaqueta / Pantalón..."
                                      value={det.referencia} required
                                      onChange={(e) => updateDetalle(pi, di, 'referencia', e.target.value)} />
                                    <datalist id={`cats-${pi}-${di}`}>
                                      {categoriasOpts
                                        .filter(c => !det.categoria || !c.temporada_nombre || c.temporada_nombre.toLowerCase() === det.categoria.toLowerCase())
                                        .map(c => <option key={c.nombre} value={c.nombre} />)}
                                    </datalist>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Calidad *</label>
                                    <input list={`cals-${pi}-${di}`} className={inp} placeholder="Premium / Supreme..."
                                      value={det.calidad} required
                                      onChange={(e) => updateDetalle(pi, di, 'calidad', e.target.value)} />
                                    <datalist id={`cals-${pi}-${di}`}>
                                      {calidadesOpts.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1">
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Cantidad *</label>
                                    <input type="number" min="1" className={`${inp} text-center font-mono`} placeholder="0"
                                      value={det.cantidad} required
                                      onChange={(e) => updateDetalle(pi, di, 'cantidad', e.target.value)} />
                                  </div>
                                  <div className="flex-1">
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Costo Unitario *</label>
                                    <PriceInput className={inp} placeholder="0"
                                      value={det.costo_unitario}
                                      onChange={(val) => updateDetalle(pi, di, 'costo_unitario', val)} />
                                  </div>
                                  <div className="flex-1">
                                    <label className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1 block">Subtotal</label>
                                    <div className={`${inp} bg-primary/3 text-secondary font-mono font-semibold text-sm text-right select-none`}>
                                      {subtotal > 0 ? subtotal.toLocaleString('es-CO', {maximumFractionDigits: 0}) : '—'}
                                    </div>
                                  </div>
                                </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button type="button" onClick={() => addDetalle(pi)}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-secondary/40 text-secondary text-xs font-semibold hover:bg-secondary/5 hover:border-secondary transition-all">
                          <Plus size={13} /> Agregar línea a {prov.proveedor_nombre || `Proveedor ${pi+1}`}
                        </button>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addProveedor}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-secondary/40 text-secondary text-sm font-bold hover:bg-secondary/5 hover:border-secondary transition-all">
                  <Plus size={16} /> Agregar otro proveedor
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
                        {/* ── Datos estimados (solo en modo estimación; en el contenedor real se ocultan) ─── */}
                        {modoEstimacion && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input type="text" className={`${inp} text-xs`} placeholder="Factura estimada"
                            value={srv.factura_estimada || ''} onChange={(e) => updateServicio(si, 'factura_estimada', e.target.value)} />
                          <input type="text" inputMode="numeric" className={`${inp} text-xs`} placeholder="Cantidad estimada"
                            value={srv.cantidad_estimada || ''} onChange={(e) => updateServicio(si, 'cantidad_estimada', e.target.value.replace(/[^0-9]/g, ''))} />
                          <PriceInput className={`${inp} text-xs`} placeholder="Valor/unidad (auto: factura÷cant.)"
                            value={srv.valor_unidad_estimado || ''} onChange={(val) => updateServicio(si, 'valor_unidad_estimado', val)} />
                        </div>
                        )}
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
                  <span className="text-xs text-muted">Por unidad</span>
                  <span className="text-sm font-mono font-bold text-secondary tabular-nums">{formatCurrency(resumen.costoUnitario)}</span>
                </div>
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${modoEstimacion ? 'bg-amber-500/10 text-amber-600' : resumen.cantidadValida ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                  {modoEstimacion
                    ? <><Sparkles size={13} /> Estimación · {formData.total_pacas || 0} unidades estimadas</>
                    : resumen.cantidadValida
                      ? <><CheckCircle size={13} /> {resumen.sumDetalles}/{formData.total_pacas} unidades — completo</>
                      : <><AlertTriangle size={13} className="text-warning" /> {resumen.sumDetalles}/{formData.total_pacas || '?'} — en progreso, puedes guardar así</>
                  }
                </div>

                {!modoEstimacion && resumen.avanceProveedores.length > 0 && !resumen.cantidadValida && (
                  <div className="pt-2 border-t border-border/40 space-y-1">
                    {resumen.avanceProveedores.filter(a => !a.completo).map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-muted">{a.nombre}</span>
                        <span className="font-mono tabular-nums text-warning font-semibold flex-shrink-0">
                          {a.registrada}{a.estimada > 0 && `/${a.estimada}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile action row */}
              <div className="flex lg:hidden gap-3 pt-1">
                <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150">
                  {submitting && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {submitting ? 'Guardando...' : editMode ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>

            {/* ── RIGHT: sticky summary ────────────────────────── */}
            <div className="hidden lg:block w-[32rem] flex-shrink-0">
              <div className="sticky top-0 space-y-3">
                <div className={`rounded-2xl border p-6 transition-colors duration-300 ${resumen.cantidadValida ? 'border-success/30 bg-success/5' : 'border-border bg-surface shadow-sm'}`}>
                  {/* Título + cabecera de columnas */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-end mb-3">
                    <p className="text-xs font-bold text-muted uppercase tracking-widest">Resumen de Costos</p>
                    <span className="text-xs font-bold text-primary/80 uppercase tracking-wider w-32 text-right">COP</span>
                    <span className="text-xs font-bold text-secondary uppercase tracking-wider w-24 text-right">USD</span>
                  </div>
                  <div className="h-px bg-border/50 mb-4" />

                  {/* Mercancía por proveedor */}
                  {resumen.proveedoresDetalle.some(p => p.costoEnCOP > 0) && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Mercancía</p>
                      <div className="space-y-2">
                        {resumen.proveedoresDetalle.map((p, i) => p.costoEnCOP > 0 && (
                          <div key={i} className="space-y-0.5">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
                              <span className="text-sm font-semibold text-primary truncate">{p.nombre || `Prov. ${i+1}`}</span>
                              <span className="text-sm font-mono font-semibold text-primary tabular-nums text-right w-32">
                                {formatCurrency(p.costoEnCOP)}
                              </span>
                              <span className="text-sm font-mono font-medium text-secondary tabular-nums text-right w-24">
                                ${(p.costoEnCOP / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
                              <span className="text-xs text-muted/70">por unidad</span>
                              <span className="text-xs font-mono text-muted tabular-nums text-right w-32">
                                {formatCurrency(p.costoPorPaca)}
                              </span>
                              <span className="text-xs font-mono text-muted/70 tabular-nums text-right w-24">
                                ${(p.costoPorPaca / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {resumen.proveedoresDetalle.filter(p => p.costoEnCOP > 0).length > 1 && (
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline pt-1.5 border-t border-border/30">
                            <span className="text-xs font-semibold text-muted">Subtotal</span>
                            <span className="text-sm font-mono font-bold text-primary tabular-nums text-right w-32">
                              {formatCurrency(resumen.costoMercancia)}
                            </span>
                            <span className="text-sm font-mono font-semibold text-secondary tabular-nums text-right w-24">
                              ${(resumen.costoMercancia / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Servicios */}
                  {resumen.serviciosDetalle.some(s => s.costo > 0) && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Servicios</p>
                      <div className="space-y-2">
                        {resumen.serviciosDetalle.map((s, i) => s.costo > 0 && (
                          <div key={i} className="space-y-0.5">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
                              <span className="text-sm font-semibold text-primary truncate capitalize">{s.tipo || s.nombre || `Srv. ${i+1}`}</span>
                              <span className="text-sm font-mono font-semibold text-primary tabular-nums text-right w-32">
                                {formatCurrency(s.costo)}
                              </span>
                              <span className="text-sm font-mono font-medium text-secondary tabular-nums text-right w-24">
                                ${(s.costo / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
                              <span className="text-xs text-muted/70">por unidad</span>
                              <span className="text-xs font-mono text-muted tabular-nums text-right w-32">
                                {formatCurrency(s.costoPorPaca)}
                              </span>
                              <span className="text-xs font-mono text-muted/70 tabular-nums text-right w-24">
                                ${(s.costoPorPaca / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {resumen.serviciosDetalle.filter(s => s.costo > 0).length > 1 && (
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline pt-1.5 border-t border-border/30">
                            <span className="text-xs font-semibold text-muted">Subtotal</span>
                            <span className="text-sm font-mono font-bold text-primary tabular-nums text-right w-32">
                              {formatCurrency(resumen.costoServicios)}
                            </span>
                            <span className="text-sm font-mono font-semibold text-secondary tabular-nums text-right w-24">
                              ${(resumen.costoServicios / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Total */}
                  <div className="h-px bg-border/60 mb-3" />
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline mb-4">
                    <span className="text-base font-bold text-primary">Total</span>
                    <span className="text-lg font-mono font-bold text-primary tabular-nums text-right w-32">
                      {formatCurrency(resumen.costoTotal)}
                    </span>
                    <span className="text-lg font-mono font-bold text-secondary tabular-nums text-right w-24">
                      ${(resumen.costoTotal / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </span>
                  </div>

                  {/* Por unidad */}
                  <div className="grid grid-cols-2 gap-4 border border-primary/10 rounded-xl p-4 bg-primary/5 mb-3">
                    <div>
                      <p className="text-xs font-bold text-primary/60 uppercase tracking-widest mb-1">COP / unidad</p>
                      <p className="text-2xl font-display font-bold text-primary tabular-nums leading-tight">{formatCurrency(resumen.costoUnitario)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-secondary/80 uppercase tracking-widest mb-1">USD / unidad</p>
                      <p className="text-2xl font-display font-bold text-secondary tabular-nums leading-tight">
                        ${(resumen.costoUnitario / (parseFloat(formData.tasa_conversion) || 1)).toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${modoEstimacion ? 'bg-amber-500/10 text-amber-600' : resumen.cantidadValida ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                    {modoEstimacion
                      ? <><Sparkles size={13} /> Estimación · {formData.total_pacas || 0} unidades estimadas</>
                      : resumen.cantidadValida
                        ? <><CheckCircle size={13} /> {resumen.sumDetalles}/{formData.total_pacas} unidades — completo</>
                        : <><AlertTriangle size={13} className="text-warning" /> {resumen.sumDetalles}/{formData.total_pacas || '?'} — en progreso</>
                    }
                  </div>
                </div>

                {/* Avance proveedor por proveedor: se puede guardar a medias y
                    retomar después; aquí se ve exactamente a quién le falta. */}
                {!modoEstimacion && resumen.avanceProveedores.length > 0 && (
                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Avance del registro</p>
                      <span className="text-[11px] font-semibold text-muted tabular-nums">
                        {resumen.provsCompletos}/{resumen.avanceProveedores.length} proveedores
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {resumen.avanceProveedores.map((a, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className={`truncate flex items-center gap-1.5 ${a.completo ? 'text-success font-medium' : a.sinEmpezar ? 'text-muted' : 'text-primary'}`}>
                            {a.completo
                              ? <CheckCircle size={12} className="flex-shrink-0" />
                              : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.sinEmpezar ? 'bg-border' : 'bg-warning'}`} />}
                            {a.nombre}
                          </span>
                          <span className="font-mono tabular-nums flex-shrink-0 text-muted">
                            {a.registrada}{a.estimada > 0 && <span className="text-muted/60">/{a.estimada}</span>}
                            {a.falta > 0 && <span className="text-warning font-semibold ml-1">−{a.falta}</span>}
                            {a.sobra > 0 && <span className="text-error font-semibold ml-1">+{a.sobra}</span>}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted leading-relaxed">
                      {resumen.cantidadValida
                        ? 'Todo cuadra. El contenedor está listo para revisión.'
                        : <>Puedes <b className="text-primary">guardar así e ir completando</b> un proveedor por vez. Solo se exige que cuadre al <b className="text-primary">finalizar</b>.</>}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <button type="submit" disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150">
                    {submitting && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                    {submitting ? 'Guardando...' : editMode ? (modoEstimacion ? 'Actualizar Estimación' : 'Actualizar Contenedor') : (modoEstimacion ? 'Crear Estimación' : 'Crear Contenedor')}
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
              <span className="text-xs text-muted">{selectedContenedor.total_pacas} unidades</span>
              {selectedContenedor.tasa_conversion && parseFloat(selectedContenedor.tasa_conversion) !== 1 && (
                <span className="text-xs bg-primary/8 text-muted px-2 py-0.5 rounded-full">Tasa: {parseFloat(selectedContenedor.tasa_conversion).toLocaleString('es-CO')}</span>
              )}
              {selectedContenedor.lote_id && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">Lote #{selectedContenedor.lote_id}</span>
              )}
              <RefLink to="/cuentas-pagar" param="contenedor" id={selectedContenedor.id} title="Ver cuentas por pagar de este contenedor"
                className="text-xs bg-warning/10 px-2 py-0.5 rounded-full font-semibold">Cuentas por pagar</RefLink>
            </div>

            {/* ── Estimado vs. Real ──────────────────────────────
                Solo aparece si el contenedor nació como estimación (hay datos
                estimados guardados). Compara lo que se creyó que venía contra lo
                que efectivamente se registró al convertirlo a contenedor normal. */}
            {(() => {
              const provs = selectedContenedor.proveedores_mercancia || [];
              const conEstimacion = provs.filter(p =>
                (parseInt(p.cantidad_estimada) || 0) > 0 || (parseFloat(p.factura_estimada) || 0) > 0
              );
              if (conEstimacion.length === 0) return null;

              const filas = conEstimacion.map(p => {
                const cantEst = parseInt(p.cantidad_estimada) || 0;
                const cantReal = (p.detalles || []).reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
                const factEst = parseFloat(p.factura_estimada) || (cantEst * (parseFloat(p.valor_unidad_estimado) || 0));
                const costoReal = (p.detalles || []).reduce(
                  (s, d) => s + (parseInt(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0), 0
                );
                return {
                  nombre: p.proveedor_nombre, moneda: p.moneda || 'USD',
                  cantEst, cantReal, diffCant: cantReal - cantEst,
                  factEst, costoReal, diffCosto: costoReal - factEst,
                  registrado: cantReal > 0,
                };
              });

              const totEst = filas.reduce((s, f) => s + f.cantEst, 0);
              const totReal = filas.reduce((s, f) => s + f.cantReal, 0);
              const sinRegistrar = filas.filter(f => !f.registrado).length;

              const num = (v) => v.toLocaleString('es-CO');
              const signo = (v) => (v > 0 ? '+' : '');
              const colorDiff = (v) => (v === 0 ? 'text-muted' : v > 0 ? 'text-success' : 'text-error');

              return (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={13} /> Estimado vs. lo que llegó
                    </p>
                    <span className="text-xs font-semibold tabular-nums">
                      <span className="text-muted">{num(totEst)} estimadas</span>
                      <span className="text-muted/50 mx-1.5">→</span>
                      <span className="text-primary">{num(totReal)} registradas</span>
                      {totEst > 0 && (
                        <span className={`ml-2 ${colorDiff(totReal - totEst)}`}>
                          ({signo(totReal - totEst)}{num(totReal - totEst)})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface/60 border-b border-amber-500/20">
                          <th className="px-3 py-2 text-left font-semibold text-muted uppercase tracking-wider">Proveedor</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Unid. estimadas</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Unid. reales</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Dif.</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Factura estimada</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Costo real</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted uppercase tracking-wider">Dif.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-500/10">
                        {filas.map((f, i) => (
                          <tr key={i} className="hover:bg-surface/50">
                            <td className="px-3 py-2 font-medium text-primary">
                              {f.nombre}
                              {!f.registrado && (
                                <span className="ml-2 text-[10px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                                  sin registrar
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted tabular-nums">{f.cantEst ? num(f.cantEst) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-primary font-semibold tabular-nums">{f.registrado ? num(f.cantReal) : '—'}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${f.registrado && f.cantEst ? colorDiff(f.diffCant) : 'text-muted'}`}>
                              {f.registrado && f.cantEst ? `${signo(f.diffCant)}${num(f.diffCant)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted tabular-nums">
                              {f.factEst ? `${f.moneda} ${num(Math.round(f.factEst))}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-primary font-semibold tabular-nums">
                              {f.costoReal ? `${f.moneda} ${num(Math.round(f.costoReal))}` : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${f.costoReal && f.factEst ? colorDiff(-f.diffCosto) : 'text-muted'}`}>
                              {f.costoReal && f.factEst ? `${signo(f.diffCosto)}${num(Math.round(f.diffCosto))}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {sinRegistrar > 0 && (
                    <p className="px-4 py-2.5 text-xs text-amber-700 border-t border-amber-500/20 bg-amber-500/5">
                      Faltan <b>{sinRegistrar}</b> proveedor{sinRegistrar !== 1 ? 'es' : ''} por registrar lo que realmente llegó.
                      Puedes hacerlo de a uno desde <b>Editar</b>.
                    </p>
                  )}
                </div>
              );
            })()}

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
                      // Costo real de las líneas; si aún no hay, usa la estimación (igual que el backend).
                      const costoReal = (prov.detalles || []).reduce((s, d) => s + (parseInt(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0), 0);
                      const costoOriginal = costoReal > 0 ? costoReal : (parseInt(prov.cantidad_estimada) || 0) * (parseFloat(prov.valor_unidad_estimado) || 0);
                      const costoCOP = prov.moneda === 'USD' ? costoOriginal * tasa : costoOriginal;
                      const costoPorUnidad = parseInt(selectedContenedor.total_pacas) > 0 ? costoCOP / parseInt(selectedContenedor.total_pacas) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/3 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-primary">{prov.proveedor_nombre}</p>
                            {prov.moneda === 'USD' && costoOriginal > 0 && (
                              <p className="text-xs text-muted">USD {costoOriginal.toLocaleString('es-CO')} × {tasa.toLocaleString('es-CO')}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-secondary text-sm font-semibold">{formatCurrency(costoCOP)}</p>
                            <p className="text-[10px] text-muted">{formatCurrency(costoPorUnidad)}/unidad</p>
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
                      const costoPorUnidad = parseInt(selectedContenedor.total_pacas) > 0 ? parseFloat(srv.costo) / parseInt(selectedContenedor.total_pacas) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/3 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="capitalize text-xs font-semibold bg-primary/8 text-primary px-2 py-0.5 rounded-md">{srv.tipo_servicio}</span>
                            <span className="text-sm text-muted">{srv.proveedor_nombre}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-secondary text-sm font-semibold">{formatCurrency(srv.costo)}</p>
                            <p className="text-[10px] text-muted">{formatCurrency(costoPorUnidad)}/unidad</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Totales */}
              <div className="px-4 py-3 bg-primary/5 border-t border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-primary">Total COP</span>
                  <span className="font-mono font-bold text-primary text-base tabular-nums">{formatCurrency(selectedContenedor.costo_total)}</span>
                </div>
                {parseFloat(selectedContenedor.tasa_conversion) > 1 && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-secondary">Total USD</span>
                    <span className="font-mono font-bold text-secondary text-base tabular-nums">
                      ${(parseFloat(selectedContenedor.costo_total) / parseFloat(selectedContenedor.tasa_conversion)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-xs text-muted">Por unidad</span>
                  <div className="text-right">
                    <span className="font-mono text-sm font-semibold text-primary tabular-nums">{formatCurrency(selectedContenedor.costo_unitario)}</span>
                    {parseFloat(selectedContenedor.tasa_conversion) > 1 && (
                      <span className="text-xs text-secondary font-mono ml-2">
                        / ${(parseFloat(selectedContenedor.costo_unitario) / parseFloat(selectedContenedor.tasa_conversion)).toFixed(2)} USD
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Distribución de unidades por proveedor */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Distribución de Unidades</p>
              <div className="space-y-2">
                {selectedContenedor.proveedores_mercancia.map((prov, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-primary/3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-primary text-sm">{prov.proveedor_nombre}</p>
                        {prov.moneda && <span className="text-[10px] bg-primary/8 text-muted px-1.5 py-0.5 rounded font-bold">{prov.moneda}</span>}
                      </div>
                      {selectedContenedor.estado === 'estimacion' && (prov.factura_estimada || prov.cantidad_estimada || prov.valor_unidad_estimado) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted">
                          {prov.factura_estimada && <span>Fact. est.: <strong className="text-primary">{prov.factura_estimada}</strong></span>}
                          {prov.cantidad_estimada != null && <span>Cant. est.: <strong className="text-primary">{prov.cantidad_estimada}</strong></span>}
                          {prov.valor_unidad_estimado != null && <span>Val/u est.: <strong className="text-primary">{formatCurrency(prov.valor_unidad_estimado)}</strong></span>}
                        </div>
                      )}
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
            {/* Comparación detallada por proveedor — visible cuando hay revisión */}
            {(selectedContenedor.estado === 'revision' || selectedContenedor.estado === 'finalizado') && selectedContenedor.total_pacas_recibidas != null && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck size={15} className="text-blue-600" />
                    <p className="text-sm font-bold text-blue-700 uppercase tracking-wider">Comparación por Proveedor</p>
                  </div>
                  <button onClick={() => handleExportReclamacionExcel(selectedContenedor)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors">
                    <Download size={13} /> Exportar reclamación
                  </button>
                </div>

                {/* Totales globales */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-white rounded-lg px-4 py-3 border border-border/40">
                    <p className="text-[10px] text-muted uppercase font-semibold">Total Pedido</p>
                    <p className="text-2xl font-mono font-bold text-primary">{parseInt(selectedContenedor.total_pacas).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-lg px-4 py-3 border border-success/30">
                    <p className="text-[10px] text-success uppercase font-semibold">Total Recibido (al inventario)</p>
                    <p className="text-2xl font-mono font-bold text-success">{parseInt(selectedContenedor.total_pacas_recibidas).toLocaleString()}</p>
                    {parseInt(selectedContenedor.total_pacas_recibidas) !== parseInt(selectedContenedor.total_pacas) && (
                      <p className="text-xs font-semibold mt-0.5 text-warning">
                        {parseInt(selectedContenedor.total_pacas_recibidas) - parseInt(selectedContenedor.total_pacas)} vs. pedido
                      </p>
                    )}
                  </div>
                </div>

                {/* Por proveedor */}
                {selectedContenedor.proveedores_mercancia.map((prov) => {
                  const provEnv = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad) || 0), 0);
                  const provRec = prov.detalles.reduce((s, d) => s + (parseInt(d.cantidad_recibida) || 0), 0);
                  const provDiff = provRec - provEnv;
                  const hayDiscrepancias = prov.detalles.some(d =>
                    (parseInt(d.cantidad_recibida) || 0) !== (parseInt(d.cantidad) || 0) ||
                    d.clasificacion_recibida || d.referencia_recibida || d.calidad_recibida
                  );
                  return (
                    <div key={prov.id} className="bg-white rounded-xl border border-border/60 overflow-hidden">
                      <div className="px-4 py-2.5 bg-primary/3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-primary">{prov.proveedor_nombre}</p>
                          {hayDiscrepancias && (
                            <span className="text-[10px] font-bold bg-warning/15 text-warning px-2 py-0.5 rounded-full">
                              ⚠ Discrepancias
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-muted">Pedido: <strong className="text-primary">{provEnv}</strong></span>
                          <ArrowRight size={11} className="text-muted" />
                          <span className="text-success">Recibido: <strong>{provRec}</strong></span>
                          {provDiff !== 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${provDiff < 0 ? 'bg-error/10 text-error' : 'bg-warning/15 text-warning'}`}>
                              {provDiff > 0 ? '+' : ''}{provDiff}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/40 bg-primary/2">
                              <th className="px-3 py-2 text-left font-semibold text-muted uppercase tracking-wider">Producto Pedido</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted uppercase tracking-wider w-16">Pedido</th>
                              <th className="px-3 py-2 text-left font-semibold text-success uppercase tracking-wider">Producto Recibido</th>
                              <th className="px-3 py-2 text-center font-semibold text-success uppercase tracking-wider w-20">Recibido</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted uppercase tracking-wider w-16">Dif.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {prov.detalles.map((det, i) => {
                              const enviado = parseInt(det.cantidad) || 0;
                              const recibido = parseInt(det.cantidad_recibida) || 0;
                              const diff = recibido - enviado;
                              const cambioTipo = det.clasificacion_recibida || det.referencia_recibida || det.calidad_recibida;
                              const clasRec = det.clasificacion_recibida || det.clasificacion;
                              const refRec  = det.referencia_recibida    || det.referencia;
                              const calRec  = det.calidad_recibida       || det.calidad || '';
                              return (
                                <tr key={i} className={diff !== 0 || cambioTipo ? 'bg-warning/5' : ''}>
                                  <td className="px-3 py-2">
                                    {det.categoria && <span className="text-[10px] text-muted">{det.categoria} · </span>}
                                    <span className="capitalize font-medium text-primary">{det.clasificacion}</span>
                                    <span className="text-muted"> / </span>
                                    <span className="capitalize">{det.referencia}</span>
                                    {det.calidad && <><span className="text-muted"> / </span><span className="capitalize text-muted">{det.calidad}</span></>}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono font-semibold">{enviado}</td>
                                  <td className="px-3 py-2">
                                    {recibido === 0 ? (
                                      <span className="text-error italic font-medium">No llegó</span>
                                    ) : cambioTipo ? (
                                      <>
                                        <span className="capitalize font-bold text-warning">{clasRec}</span>
                                        <span className="text-warning"> / </span>
                                        <span className="capitalize text-warning">{refRec}</span>
                                        {calRec && <><span className="text-warning"> / </span><span className="capitalize text-warning">{calRec}</span></>}
                                        <span className="block text-[10px] text-warning italic font-semibold mt-0.5">⚠ tipo distinto al pedido</span>
                                      </>
                                    ) : (
                                      <>
                                        {det.categoria && <span className="text-[10px] text-muted">{det.categoria} · </span>}
                                        <span className="capitalize font-medium text-success">{clasRec}</span>
                                        <span className="text-muted"> / </span>
                                        <span className="capitalize">{refRec}</span>
                                        {calRec && <><span className="text-muted"> / </span><span className="capitalize text-muted">{calRec}</span></>}
                                      </>
                                    )}
                                    {det.notas_revision && <p className="text-[10px] text-muted italic mt-0.5">📝 {det.notas_revision}</p>}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono font-bold text-success">{recibido}</td>
                                  <td className="px-3 py-2 text-center font-mono text-xs">
                                    {diff === 0 ? (
                                      <span className="text-muted">—</span>
                                    ) : (
                                      <span className={`font-bold ${diff < 0 ? 'text-error' : 'text-warning'}`}>
                                        {diff > 0 ? '+' : ''}{diff}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedContenedor.notas && (
              <p className="text-sm text-muted italic border-l-2 border-border pl-3">{selectedContenedor.notas}</p>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-border/40 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button onClick={() => handleExportContenedorExcel(selectedContenedor)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-sm font-medium transition-colors">
                  <Download size={15} /> Exportar Excel
                </button>
                <button onClick={() => { setNombrePlantilla(''); setTemplateFromView(true); setSaveTemplateModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-sm font-medium transition-colors">
                  <Save size={15} /> Guardar como plantilla
                </button>
              </div>
              {isAdmin && selectedContenedor.estado === 'borrador' && (
                <div className="flex gap-3 ml-auto">
                  <button onClick={() => openEditModal(selectedContenedor)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted hover:text-secondary hover:border-secondary/40 text-sm font-medium transition-colors">
                    <Edit2 size={15} /> Editar
                  </button>
                  <button onClick={() => openRevisionModal(selectedContenedor)}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all duration-150">
                    <ClipboardCheck size={17} /> Revisar Contenedor
                  </button>
                </div>
              )}
              {isAdmin && selectedContenedor.estado === 'revision' && (
                <div className="flex gap-3 ml-auto">
                  <button onClick={() => openRevisionModal(selectedContenedor)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-300 text-blue-600 hover:bg-blue-50 text-sm font-medium transition-colors">
                    <ClipboardCheck size={15} /> Editar Revisión
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
            {(() => {
              const totalFinal = parseInt(selectedContenedor.total_pacas_recibidas) || parseInt(selectedContenedor.total_pacas);
              const costoFinal = totalFinal > 0 ? parseFloat(selectedContenedor.costo_total) / totalFinal : parseFloat(selectedContenedor.costo_unitario);
              const costoOriginal = parseFloat(selectedContenedor.costo_unitario);
              const recalculado = totalFinal !== parseInt(selectedContenedor.total_pacas);
              return (
                <div className="relative overflow-hidden rounded-2xl bg-primary/5 border border-primary/10 p-5 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <DollarSign size={16} className="text-muted" />
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Costo unitario por unidad</p>
                  </div>
                  <p className="text-4xl font-display font-bold text-primary">{formatCurrency(costoFinal)}</p>
                  {recalculado && (
                    <p className="text-[11px] text-blue-600 mt-1 font-medium">
                      Recalculado para {totalFinal} unidades (originalmente {formatCurrency(costoOriginal)} para {selectedContenedor.total_pacas})
                    </p>
                  )}
                  <p className="text-xs text-muted mt-1.5">Este valor se asignará como <strong className="text-primary">costo_base</strong> a cada unidad</p>
                  <div className="mt-3 pt-3 border-t border-primary/10 flex items-center justify-center gap-2">
                    <span className="text-xs text-muted uppercase tracking-wider">Costo total del contenedor</span>
                    <span className="text-lg font-display font-bold text-secondary tabular-nums">{formatCurrency(selectedContenedor.costo_total)}</span>
                  </div>
                </div>
              );
            })()}
            {/* Aviso explícito: como ahora se puede guardar el contenedor a medias,
                este es el punto donde hay que ver si quedó algo sin registrar. */}
            {(() => {
              const a = avanceFinalizacion(selectedContenedor);
              if (!a || a.cuadra) return null;
              return (
                <div className="rounded-xl border-2 border-warning/40 bg-warning/10 px-4 py-3.5">
                  <p className="text-sm font-bold text-warning flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    El contenedor está incompleto
                  </p>
                  <p className="text-sm text-primary">
                    Tienes <b>{a.sumLineas.toLocaleString('es-CO')}</b> unidades distribuidas,
                    pero el contenedor declara <b>{a.totalDeclarado.toLocaleString('es-CO')}</b>
                    {a.faltan > 0
                      ? <> — <b className="text-warning">faltan {a.faltan.toLocaleString('es-CO')}</b>.</>
                      : <> — hay <b className="text-error">{Math.abs(a.faltan).toLocaleString('es-CO')} de más</b>.</>}
                  </p>
                  {a.pendientes.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {a.pendientes.map((p, i) => (
                        <li key={i} className="text-xs text-muted flex items-center justify-between gap-2">
                          <span className="truncate">{p.nombre}</span>
                          <span className="font-mono tabular-nums flex-shrink-0">
                            {p.registrada}{p.estimada > 0 && `/${p.estimada}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted mt-2.5 pt-2 border-t border-warning/25">
                    Si finalizas así, el costo por unidad se repartirá entre <b className="text-primary">{a.totalDeclarado.toLocaleString('es-CO')}</b> unidades
                    y solo entrarán al inventario las que estén distribuidas. Puedes cerrar esta ventana y completar lo que falta desde <b className="text-primary">Editar</b>.
                  </p>
                </div>
              );
            })()}

            <div className="flex items-start gap-3 bg-primary/5 rounded-xl px-4 py-3 text-sm text-muted">
              <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
              <p>Se crearán <strong className="text-primary">{selectedContenedor.total_pacas_recibidas ?? selectedContenedor.total_pacas} unidades</strong> en el inventario y un nuevo lote. Esta acción es irreversible.</p>
            </div>
            <div>
              <p className={lbl}>Precio de Venta por Clasificación / Referencia / Calidad</p>
              <div className="rounded-xl border border-border/60 bg-surface overflow-hidden divide-y divide-border/40">
                {combsFinalizacion.map((comb) => (
                  <div key={comb.key} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      {comb.categoria && (
                        <><span className="capitalize text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">{comb.categoria}</span>
                        <ArrowRight size={13} className="text-muted flex-shrink-0" /></>
                      )}
                      <span className="capitalize text-sm font-semibold bg-secondary/10 text-secondary px-2.5 py-1 rounded-lg">{comb.clasificacion}</span>
                      <ArrowRight size={13} className="text-muted flex-shrink-0" />
                      <span className="capitalize text-sm text-muted">{comb.referencia}</span>
                      {comb.calidad && (
                        <><ArrowRight size={13} className="text-muted flex-shrink-0" />
                        <span className="capitalize text-sm text-muted">{comb.calidad}</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {comb.cantidad != null && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/8 text-primary text-xs font-bold tabular-nums whitespace-nowrap">
                          <Boxes size={11} />
                          {comb.cantidad} {comb.cantidad === 1 ? 'paca' : 'pacas'}
                        </span>
                      )}
                      {preciosAutocompletados.has(comb.key) && (
                        <span className="text-xs text-secondary font-medium whitespace-nowrap">⚡ Preset</span>
                      )}
                      <span className="text-xs text-muted">$</span>
                      <PriceInput
                        className={`${inp} w-32 text-right font-mono ${preciosAutocompletados.has(comb.key) ? 'border-secondary/50 bg-secondary/5' : ''}`} placeholder="0.00"
                        value={preciosVenta[comb.key] || ''}
                        onChange={(val) => {
                          setPreciosVenta({ ...preciosVenta, [comb.key]: val });
                          setPreciosAutocompletados(prev => { const s = new Set(prev); s.delete(comb.key); return s; });
                        }} />
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
                {submitting ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Finalizando...</> : <><CheckCircle size={17} /> Confirmar y crear unidades</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════
          REVISIÓN MODAL — Etapa 2: verificación física
      ════════════════════════════════════════════════════════ */}
      {selectedContenedor && (
        <Modal isOpen={revisionModalOpen} onClose={() => setRevisionModalOpen(false)} title={`Revisión — ${selectedContenedor.numero}`} size="full">
          <div className="space-y-3">
            {/* Banner compacto */}
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              <ClipboardCheck size={14} className="flex-shrink-0 text-blue-600" />
              <p>
                <strong>{selectedContenedor.estado === 'revision' ? 'Editando revisión.' : 'Verificación física.'}</strong>
                {' '}Registra la <strong>cantidad recibida</strong> de cada producto (entra al inventario). Si llegó un producto distinto al pedido, indícalo en la columna "Tipo Recibido".
              </p>
            </div>

            {/* Distribución de unidades (pedido) — referencia rápida */}
            {selectedContenedor.proveedores_mercancia && selectedContenedor.proveedores_mercancia.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-cream/20 p-3">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Distribución de Unidades (pedido)</p>
                <div className="space-y-2">
                  {selectedContenedor.proveedores_mercancia.map((prov, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-primary mr-1">{prov.proveedor_nombre}:</span>
                      {prov.detalles.map((det, di) => (
                        <span key={di} className="inline-flex items-center gap-1.5 bg-surface border border-border/50 rounded-lg px-2 py-0.5 text-[11px]">
                          <span className="capitalize font-semibold text-secondary">{det.clasificacion}</span>
                          <span className="text-muted">/</span>
                          <span className="capitalize text-muted">{det.referencia}</span>
                          {det.calidad && <><span className="text-muted">/</span><span className="capitalize text-muted">{det.calidad}</span></>}
                          <span className="w-px h-3 bg-border/60" />
                          <span className="font-bold text-primary tabular-nums">{det.cantidad}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agrupar filas por proveedor */}
            <div className="space-y-3">
            {(() => {
              const porProveedor = {};
              revisionRows.forEach((row, idx) => {
                if (!porProveedor[row.proveedor_nombre]) porProveedor[row.proveedor_nombre] = [];
                porProveedor[row.proveedor_nombre].push({ ...row, idx });
              });
              const provEntries = Object.entries(porProveedor);
              return provEntries.map(([prov, rows], provIdx) => {
                const provEnviado = rows.reduce((s, r) => s + (parseInt(r.cantidad_enviada) || 0), 0);
                const provRecibido = rows.reduce((s, r) => s + (parseInt(r.cantidad_recibida) || 0), 0);
                const provDiff = provRecibido - provEnviado;
                const hayDiscrepancias = rows.some(r =>
                  parseInt(r.cantidad_recibida) !== parseInt(r.cantidad_enviada) ||
                  r.clasificacion_recibida || r.referencia_recibida || r.calidad_recibida
                );
                return (
                <div key={prov} className="rounded-xl border-2 border-secondary/20 bg-surface overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                  {/* ── Cabecera compacta del proveedor ─────────────── */}
                  <div className="px-3 py-2 bg-gradient-to-r from-secondary/10 to-secondary/5 border-b-2 border-secondary/20 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-secondary text-white text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                        P{provIdx + 1}
                      </span>
                      <p className="text-sm font-bold text-primary truncate">{prov}</p>
                      {hayDiscrepancias && (
                        <span className="text-[10px] font-bold bg-warning/15 text-warning px-2 py-0.5 rounded-full flex-shrink-0">⚠</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono">
                      <span className="bg-white/80 rounded px-2 py-0.5 border border-primary/10">
                        <span className="text-muted">Ped:</span> <strong className="text-primary">{provEnviado}</strong>
                      </span>
                      <ArrowRight size={11} className="text-muted" />
                      <span className="bg-white/80 rounded px-2 py-0.5 border border-success/20">
                        <span className="text-success/80">Rec:</span> <strong className="text-success">{provRecibido}</strong>
                      </span>
                      {provDiff !== 0 && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${provDiff < 0 ? 'bg-error text-white' : 'bg-warning text-white'}`}>
                          {provDiff > 0 ? '+' : ''}{provDiff}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Cabecera de columnas compacta ──────────────────── */}
                  <div className="hidden lg:grid grid-cols-[1fr_1fr_140px_minmax(160px,1.2fr)] gap-2 px-3 py-1 bg-cream/40 border-b border-border/40 text-[9px] font-bold uppercase tracking-widest">
                    <div className="text-muted">📦 Enviado / Facturado</div>
                    <div className="text-blue-700">🔄 Tipo Recibido <span className="normal-case font-normal text-blue-500/70">(si difiere)</span></div>
                    <div className="text-success text-center">✅ Cant. Inventario</div>
                    <div className="text-muted">📝 Notas</div>
                  </div>

                  {/* ── Líneas (filas compactas) ───────────────────────── */}
                  <div className="divide-y divide-border/30 bg-cream/10">
                    {rows.map(({ idx, ...row }, lineaIdx) => {
                      const hayDiff = parseInt(row.cantidad_recibida) !== parseInt(row.cantidad_enviada);
                      const hayCambioTipo = row.clasificacion_recibida || row.referencia_recibida || row.calidad_recibida;
                      return (
                      <div key={row.detalle_id} className={`border-l-4 ${hayDiff || hayCambioTipo ? 'border-l-warning' : 'border-l-secondary/40'} hover:border-l-secondary hover:bg-surface transition-all duration-150`}>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_140px_minmax(160px,1.2fr)] gap-2 p-2 items-center">
                          {/* Col 1: Enviado (read-only) */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="w-5 h-5 rounded-md bg-secondary/15 text-secondary text-[10px] font-bold flex items-center justify-center flex-shrink-0">{lineaIdx + 1}</span>
                            {row.categoria && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium capitalize">{row.categoria}</span>
                            )}
                            <span className="text-xs bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-semibold capitalize">{row.clasificacion}</span>
                            <span className="text-xs text-muted capitalize">{row.referencia}</span>
                            {row.calidad && <span className="text-xs text-muted/80 capitalize">/ {row.calidad}</span>}
                            <span className="ml-auto text-xs font-bold font-mono text-primary bg-primary/5 px-2 py-0.5 rounded">×{row.cantidad_enviada}</span>
                          </div>

                          {/* Col 2: Tipo recibido (inline, compacto) */}
                          <div className="flex items-center gap-1 bg-blue-50/40 border border-blue-100 rounded-lg p-1">
                            <p className="text-[9px] font-bold text-blue-700 uppercase lg:hidden mr-1">🔄 Tipo recibido:</p>
                            <input list={`rev-tipos-${row.detalle_id}`} className={`${inpBase} text-xs flex-1 min-w-0 py-1.5`}
                              placeholder={row.clasificacion}
                              title="Clasificación recibida"
                              value={row.clasificacion_recibida}
                              onChange={e => updateRevisionRow(idx, 'clasificacion_recibida', e.target.value)} />
                            <datalist id={`rev-tipos-${row.detalle_id}`}>
                              {tiposOpts.map(t => <option key={t} value={t} />)}
                            </datalist>
                            <input list={`rev-refs-${row.detalle_id}`} className={`${inpBase} text-xs flex-1 min-w-0 py-1.5`}
                              placeholder={row.referencia}
                              title="Referencia recibida"
                              value={row.referencia_recibida}
                              onChange={e => updateRevisionRow(idx, 'referencia_recibida', e.target.value)} />
                            <datalist id={`rev-refs-${row.detalle_id}`}>
                              {categoriasOpts.map(c => <option key={c.nombre} value={c.nombre} />)}
                            </datalist>
                            <input list={`rev-cals-${row.detalle_id}`} className={`${inpBase} text-xs flex-1 min-w-0 py-1.5`}
                              placeholder={row.calidad || 'Calidad'}
                              title="Calidad recibida"
                              value={row.calidad_recibida}
                              onChange={e => updateRevisionRow(idx, 'calidad_recibida', e.target.value)} />
                            <datalist id={`rev-cals-${row.detalle_id}`}>
                              {calidadesOpts.map(c => <option key={c} value={c} />)}
                            </datalist>
                          </div>

                          {/* Col 3: Cantidad recibida (input grande, compacto verticalmente) */}
                          <div className="flex items-center gap-2">
                            <p className="text-[9px] font-bold text-success uppercase lg:hidden">✅</p>
                            <input type="number" min="0" className={`${inpBase} text-center font-mono font-bold border-2 border-success/40 bg-success/5 text-success text-xl py-2 w-20 flex-shrink-0`}
                              value={row.cantidad_recibida}
                              onChange={e => updateRevisionRow(idx, 'cantidad_recibida', e.target.value)} />
                            {parseInt(row.cantidad_recibida) !== parseInt(row.cantidad_enviada) && (
                              <span className="text-[10px] text-warning font-bold whitespace-nowrap">
                                {(parseInt(row.cantidad_recibida) || 0) - (parseInt(row.cantidad_enviada) || 0) > 0 ? '+' : ''}
                                {(parseInt(row.cantidad_recibida) || 0) - (parseInt(row.cantidad_enviada) || 0)}
                              </span>
                            )}
                          </div>

                          {/* Col 4: Notas (inline) */}
                          <input type="text" className={`${inpBase} text-xs py-1.5`}
                            placeholder="Notas / diferencias (opcional)"
                            value={row.notas_revision}
                            onChange={e => updateRevisionRow(idx, 'notas_revision', e.target.value)} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                );
              });
            })()}
            </div>

            {/* Resumen totales (compacto, sticky) */}
            {(() => {
              const totalEnv = revisionRows.reduce((s, r) => s + (parseInt(r.cantidad_enviada) || 0), 0);
              const totalRec = revisionRows.reduce((s, r) => s + (parseInt(r.cantidad_recibida) || 0), 0);
              const diff = totalRec - totalEnv;
              return (
                <div className="flex items-center justify-center gap-3 bg-primary/5 rounded-lg px-4 py-2 sticky bottom-0">
                  <div className="text-center">
                    <span className="text-[10px] text-muted uppercase font-bold mr-1">Pedido:</span>
                    <span className="text-lg font-bold font-mono text-primary">{totalEnv.toLocaleString()}</span>
                  </div>
                  <ArrowRight size={16} className="text-muted" />
                  <div className="text-center">
                    <span className="text-[10px] text-success uppercase font-bold mr-1">Recibido (inventario):</span>
                    <span className="text-lg font-bold font-mono text-success">{totalRec.toLocaleString()}</span>
                  </div>
                  {diff !== 0 && (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${diff < 0 ? 'bg-error text-white' : 'bg-warning text-white'}`}>
                      {diff > 0 ? '+' : ''}{diff}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setRevisionModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardarRevision} disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 active:scale-95 transition-all duration-150">
                {submitting
                  ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Guardando...</>
                  : <><ClipboardCheck size={17} /> Guardar Revisión</>
                }
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
        {(() => {
          const tipoActual = modoEstimacion ? 'estimacion' : 'normal';
          const templatesFiltradas = templates.filter(t => (t.tipo || 'normal') === tipoActual);
          return templatesFiltradas.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <BookTemplate size={28} className="mx-auto text-muted/30" />
              <p className="text-sm text-muted">No hay plantillas de {modoEstimacion ? 'estimación' : 'contenedor normal'}</p>
              <p className="text-xs text-muted/60">Llena el formulario y usa "Guardar como plantilla"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templatesFiltradas.map(t => (
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
          );
        })()}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          GUARDAR PLANTILLA MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={saveTemplateModalOpen} onClose={() => { setSaveTemplateModalOpen(false); setTemplateFromView(false); }} title="Guardar plantilla" size="sm">
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
            <p>· Total unidades ({formData.total_pacas || '—'})</p>
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
