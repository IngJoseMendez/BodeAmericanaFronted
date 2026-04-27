import { useState, useEffect, useMemo } from 'react';
import {
  Package2, Plus, Edit2, Trash2, Eye, CheckCircle, X,
  TrendingUp, DollarSign, Archive, Boxes,
  ArrowRight, AlertTriangle, Layers, Search, Download,
  BarChart2, Calendar, List, ChevronRight,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Modal, useToast, useConfirm } from '../components/common';
import { contenedoresApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PACA_TIPOS, PACA_CATEGORIAS } from '../types/index';

// ── Constants ────────────────────────────────────────────────────
const TIPOS_SERVICIO = ['transporte', 'aduana', 'cargue', 'descargue', 'almacenaje', 'otro'];

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Factory helpers ───────────────────────────────────────────────
const emptyProveedor = () => ({
  proveedor_nombre: '', costo: '', notas: '',
  detalles: [{ tipo: '', categoria: '', cantidad: '' }],
});
const emptyServicio = () => ({ proveedor_nombre: '', tipo_servicio: '', costo: '', notas: '' });

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
const inp =
  'w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/30 ' +
  'placeholder:text-muted/60 transition-colors duration-150';
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
                    {parseFloat(cont.costo_unitario) > 0 && (
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

  // ── Form ───────────────────────────────────────────────────────
  const [formData, setFormData]       = useState({ numero: '', fecha_llegada: '', total_pacas: '', notas: '' });
  const [proveedores, setProveedores] = useState([emptyProveedor()]);
  const [servicios, setServicios]     = useState([emptyServicio()]);

  // ── Finalize ───────────────────────────────────────────────────
  const [preciosVenta, setPreciosVenta]           = useState({});
  const [combsFinalizacion, setCombsFinalizacion] = useState([]);

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

  // ── Export CSV ─────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ['Número', 'Fecha Llegada', 'Estado', 'Total Pacas', 'Costo Unitario', 'Costo Total', 'N° Servicios'];
    const rows = contenedoresFiltrados.map(c => [
      c.numero,
      c.fecha_llegada ? new Date(c.fecha_llegada).toLocaleDateString('es-MX') : '',
      c.estado,
      c.total_pacas,
      parseFloat(c.costo_unitario || 0).toFixed(2),
      parseFloat(c.costo_total || 0).toFixed(2),
      c.num_servicios ?? 0,
    ]);
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contenedores-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived summary (live) ─────────────────────────────────────
  const calcularResumen = () => {
    const costoMercancia = proveedores.reduce((s, p) => s + (parseFloat(p.costo) || 0), 0);
    const costoServicios = servicios.reduce((s, sv) => s + (parseFloat(sv.costo) || 0), 0);
    const costoTotal     = costoMercancia + costoServicios;
    const totalPacas     = parseInt(formData.total_pacas) || 0;
    const costoUnitario  = totalPacas > 0 ? costoTotal / totalPacas : 0;
    const sumDetalles    = proveedores.reduce(
      (s, p) => s + p.detalles.reduce((s2, d) => s2 + (parseInt(d.cantidad) || 0), 0), 0
    );
    const cantidadValida = totalPacas > 0 && sumDetalles === totalPacas;
    return { costoMercancia, costoServicios, costoTotal, costoUnitario, sumDetalles, cantidadValida };
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
    setFormData({ numero: '', fecha_llegada: '', total_pacas: '', notas: '' });
    setProveedores([emptyProveedor()]);
    setServicios([emptyServicio()]);
  };

  // ── Open modals ────────────────────────────────────────────────
  const openCreateModal = () => { resetForm(); setEditMode(false); setSelectedContenedor(null); setModalOpen(true); };

  const openEditModal = async (contenedor) => {
    try {
      const full = await contenedoresApi.getOne(contenedor.id);
      setSelectedContenedor(full);
      setFormData({ numero: full.numero, fecha_llegada: full.fecha_llegada?.split('T')[0] || '', total_pacas: String(full.total_pacas), notas: full.notas || '' });
      setProveedores(full.proveedores_mercancia.length > 0
        ? full.proveedores_mercancia.map((p) => ({
            proveedor_nombre: p.proveedor_nombre, costo: String(p.costo || ''), notas: p.notas || '',
            detalles: p.detalles.length > 0
              ? p.detalles.map((d) => ({ tipo: d.tipo, categoria: d.categoria, cantidad: String(d.cantidad) }))
              : [{ tipo: '', categoria: '', cantidad: '' }],
          }))
        : [emptyProveedor()]);
      setServicios(full.servicios.length > 0
        ? full.servicios.map((s) => ({ proveedor_nombre: s.proveedor_nombre, tipo_servicio: s.tipo_servicio, costo: String(s.costo || ''), notas: s.notas || '' }))
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
        ...formData, total_pacas: parseInt(formData.total_pacas),
        proveedores_mercancia: proveedores.map((p) => ({ ...p, costo: parseFloat(p.costo) || 0, detalles: p.detalles.map((d) => ({ ...d, cantidad: parseInt(d.cantidad) || 0 })) })),
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
      full.proveedores_mercancia.forEach((p) => p.detalles.forEach((d) => combSet.add(`${d.tipo}|${d.categoria}`)));
      const combs = Array.from(combSet).map((c) => { const [tipo, categoria] = c.split('|'); return { tipo, categoria, key: c }; });
      setCombsFinalizacion(combs);
      const init = {}; combs.forEach((c) => { init[c.key] = ''; });
      setPreciosVenta(init);
      setViewModalOpen(false); setFinalizarModalOpen(true);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleFinalizar = async () => {
    for (const c of combsFinalizacion) {
      if (!preciosVenta[c.key] || parseFloat(preciosVenta[c.key]) <= 0) {
        addToast(`Falta precio de venta para "${c.tipo} / ${c.categoria}"`, 'error'); return;
      }
    }
    setSubmitting(true);
    try {
      const precios = combsFinalizacion.map((c) => ({ tipo: c.tipo, categoria: c.categoria, precio_venta: parseFloat(preciosVenta[c.key]) }));
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

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-primary text-sm font-medium hover:border-secondary/40 hover:text-secondary transition-colors flex-shrink-0"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Exportar</span>
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
                      <span className="text-secondary font-semibold">{formatCurrency(cont.costo_unitario)}</span>
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
          <div className="flex flex-col xl:flex-row gap-6 items-start">

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
                <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="col-span-2 lg:col-span-1">
                    <label className={lbl}>Número *</label>
                    <input type="text" className={inp} placeholder="CNT-2026-0001"
                      value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} required />
                  </div>
                  <div>
                    <label className={lbl}>Fecha de Llegada</label>
                    <input type="date" className={inp}
                      value={formData.fecha_llegada} onChange={(e) => setFormData({ ...formData, fecha_llegada: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Total de Pacas *</label>
                    <input type="number" min="1" className={inp} placeholder="200"
                      value={formData.total_pacas} onChange={(e) => setFormData({ ...formData, total_pacas: e.target.value })} required />
                  </div>
                  <div>
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
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-muted font-medium hidden sm:inline">$</span>
                            <PriceInput className={`${inp} w-32`} placeholder="Costo mercancía"
                              value={prov.costo} onChange={(val) => updateProveedor(pi, 'costo', val)} />
                          </div>
                          {proveedores.length > 1 && (
                            <button type="button" onClick={() => removeProveedor(pi)}
                              className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        <input type="text" className={`${inp} text-xs`} placeholder="Notas del proveedor (opcional)"
                          value={prov.notas} onChange={(e) => updateProveedor(pi, 'notas', e.target.value)} />
                      </div>
                      <div className="px-4 pb-4 pt-3 bg-cream/50 border-t border-border/30">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2.5">Distribución por tipo y categoría</p>
                        <div className="space-y-2">
                          {prov.detalles.map((det, di) => (
                            <div key={di} className="flex items-center gap-2 bg-surface rounded-xl px-3 py-2.5 border border-border/40">
                              <select className={`${inp} flex-1 min-w-0`} value={det.tipo}
                                onChange={(e) => updateDetalle(pi, di, 'tipo', e.target.value)} required>
                                <option value="">Tipo de paca</option>
                                {PACA_TIPOS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                              </select>
                              <select className={`${inp} flex-1 min-w-0`} value={det.categoria}
                                onChange={(e) => updateDetalle(pi, di, 'categoria', e.target.value)} required>
                                <option value="">Categoría</option>
                                {PACA_CATEGORIAS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                              </select>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <input type="number" min="1" className={`${inp} w-20 text-center font-mono`} placeholder="0"
                                  value={det.cantidad} onChange={(e) => updateDetalle(pi, di, 'cantidad', e.target.value)} required />
                                <span className="text-xs text-muted hidden sm:inline">pcs</span>
                              </div>
                              {prov.detalles.length > 1 && (
                                <button type="button" onClick={() => removeDetalle(pi, di)}
                                  className="p-1 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                                  <X size={13} />
                                </button>
                              )}
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
                      <div key={si} className="flex flex-wrap xl:flex-nowrap items-center gap-2 px-4 py-3">
                        <select className={`${inp} xl:w-36`} value={srv.tipo_servicio}
                          onChange={(e) => updateServicio(si, 'tipo_servicio', e.target.value)}>
                          <option value="">Tipo</option>
                          {TIPOS_SERVICIO.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <input type="text" className={`${inp} flex-1`} placeholder="Empresa o proveedor"
                          value={srv.proveedor_nombre} onChange={(e) => updateServicio(si, 'proveedor_nombre', e.target.value)} />
                        <PriceInput className={`${inp} xl:w-32`} placeholder="Costo $"
                          value={srv.costo} onChange={(val) => updateServicio(si, 'costo', val)} />
                        <input type="text" className={`${inp} flex-1`} placeholder="Notas (opcional)"
                          value={srv.notas} onChange={(e) => updateServicio(si, 'notas', e.target.value)} />
                        {servicios.length > 1 && (
                          <button type="button" onClick={() => removeServicio(si)}
                            className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                            <X size={15} />
                          </button>
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

              {/* Mobile action row */}
              <div className="flex xl:hidden gap-3 pt-1">
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
            <div className="hidden xl:block w-72 flex-shrink-0">
              <div className="sticky top-0 space-y-3">
                <div className={`rounded-2xl border p-4 transition-colors duration-300 ${resumen.cantidadValida ? 'border-success/30 bg-success/5' : 'border-border bg-surface shadow-sm'}`}>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Resumen de Costos</p>
                  <div className="space-y-2.5 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">Mercancía</span>
                      <span className="text-sm font-mono font-semibold text-primary tabular-nums">{formatCurrency(resumen.costoMercancia)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">Servicios</span>
                      <span className="text-sm font-mono font-semibold text-primary tabular-nums">{formatCurrency(resumen.costoServicios)}</span>
                    </div>
                    <div className="h-px bg-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">Total</span>
                      <span className="text-base font-mono font-bold text-primary tabular-nums">{formatCurrency(resumen.costoTotal)}</span>
                    </div>
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
              <span className="text-xs text-muted">{formatDate(selectedContenedor.fecha_llegada)}</span>
              <span className="text-xs text-muted">{selectedContenedor.total_pacas} pacas</span>
              {selectedContenedor.lote_id && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">Lote #{selectedContenedor.lote_id}</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Mercancía',   value: selectedContenedor.costo_mercancia_total },
                { label: 'Servicios',   value: selectedContenedor.costo_servicios_total },
                { label: 'Total',       value: selectedContenedor.costo_total           },
                { label: 'Costo / Paca', value: selectedContenedor.costo_unitario, highlight: true },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl p-3 text-center border ${item.highlight ? 'bg-primary/10 border-primary/20' : 'bg-primary/4 border-border/40'}`}>
                  <p className="text-xs text-muted mb-1">{item.label}</p>
                  <p className={`font-bold font-mono ${item.highlight ? 'text-primary text-xl' : 'text-primary text-base'}`}>{formatCurrency(item.value)}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Proveedores de Mercancía</p>
              <div className="space-y-2">
                {selectedContenedor.proveedores_mercancia.map((prov, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-primary/3">
                      <p className="font-semibold text-primary text-sm">{prov.proveedor_nombre}</p>
                      <p className="font-mono text-secondary text-sm font-semibold">{formatCurrency(prov.costo)}</p>
                    </div>
                    <div className="px-4 py-2.5 flex flex-wrap gap-2">
                      {prov.detalles.map((det, di) => (
                        <span key={di} className="inline-flex items-center gap-1.5 bg-primary/5 border border-border/50 rounded-lg px-2.5 py-1 text-xs">
                          <span className="capitalize font-semibold text-secondary">{det.tipo}</span>
                          <span className="text-muted">/</span>
                          <span className="capitalize text-muted">{det.categoria}</span>
                          <span className="w-px h-3 bg-border/60" />
                          <span className="font-bold text-primary tabular-nums">{det.cantidad}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedContenedor.servicios.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Servicios</p>
                <div className="rounded-xl border border-border/60 bg-surface overflow-hidden divide-y divide-border/40">
                  {selectedContenedor.servicios.map((srv, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/3 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-xs font-semibold bg-primary/8 text-primary px-2 py-0.5 rounded-md">{srv.tipo_servicio}</span>
                        <span className="text-sm text-muted">{srv.proveedor_nombre}</span>
                      </div>
                      <span className="font-mono text-secondary text-sm font-semibold">{formatCurrency(srv.costo)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedContenedor.notas && (
              <p className="text-sm text-muted italic border-l-2 border-border pl-3">{selectedContenedor.notas}</p>
            )}
            {isAdmin && selectedContenedor.estado === 'borrador' && (
              <div className="flex justify-end gap-3 pt-2 border-t border-border/40">
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
              <p className={lbl}>Precio de Venta por Tipo / Categoría</p>
              <div className="rounded-xl border border-border/60 bg-surface overflow-hidden divide-y divide-border/40">
                {combsFinalizacion.map((comb) => (
                  <div key={comb.key} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="capitalize text-sm font-semibold bg-secondary/10 text-secondary px-2.5 py-1 rounded-lg">{comb.tipo}</span>
                      <ArrowRight size={13} className="text-muted flex-shrink-0" />
                      <span className="capitalize text-sm text-muted">{comb.categoria}</span>
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
