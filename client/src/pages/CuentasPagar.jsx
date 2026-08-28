import { useEffect, useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink } from '../components/common';
import { cuentasPagarApi, contenedoresApi, cuentasApi } from '../services/api';
import {
  CreditCard, Plus, Eye, Trash2, DollarSign, Clock, CheckCircle,
  Search, Package2, ChevronDown, ChevronRight, Download,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { parseMonto, formatMoneda, MONEDAS } from '../lib/money';
import { hoy, formatFecha } from '../lib/fecha';
import { descargarExcel } from '../lib/descargar';

const formatCurrency = (value, moneda = 'USD') => formatMoneda(value, moneda, { decimales: 0 });

const formatDate = formatFecha;

const TODAY = hoy();

// El abono puede pagarse en una moneda distinta a la de la factura (factura en USD
// pagada por transferencia en pesos, por ejemplo). Se guarda lo que realmente salió
// del banco —moneda y tasa— y además el equivalente en la moneda de la factura, que
// es el valor que descuenta el saldo.
const emptyInline = (monedaFactura = 'USD') => ({
  monto: '', fecha: TODAY, metodo_pago: 'efectivo', cuenta_banco_id: '', notas: '',
  moneda: monedaFactura, monedaOtra: '', tasa_cambio: '',
});

// La factura del proveedor viene en su moneda (normalmente USD) pero el saldo se
// lleva en COP, que es contra lo que se registran los abonos. Se muestran las dos.
const facturaOriginal = (c) => {
  const mo = (c.moneda_original || '').toUpperCase();
  const to = parseFloat(c.total_factura_original);
  if (!mo || !Number.isFinite(to) || mo === (c.moneda || 'COP').toUpperCase()) return null;
  return { moneda: mo, total: to };
};

// Moneda que se propone al registrar un abono: la de la factura del proveedor.
const monedaSugerida = (c) => (c?.moneda_original || c?.moneda || 'USD').toUpperCase();

const codigoMoneda = (f) =>
  (f.moneda === 'OTRA' ? (f.monedaOtra || '').trim().toUpperCase() : f.moneda) || 'USD';

// Cuánto descuenta el abono del saldo, expresado en la moneda de la factura.
const equivalenteFactura = (f, monedaFactura) => {
  const monto = parseMonto(f.monto);
  if (!monto) return 0;
  if (codigoMoneda(f) === String(monedaFactura || 'USD').toUpperCase()) return monto;
  const tasa = parseMonto(f.tasa_cambio);
  return tasa > 0 ? monto * tasa : 0;
};

function EstadoBadge({ estado }) {
  const map = {
    pendiente: 'bg-warning/15 text-warning',
    parcial:   'bg-secondary/15 text-secondary',
    pagada:    'bg-success/15 text-success',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${map[estado] || 'bg-primary/10 text-primary'}`}>
      {estado}
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

export default function CuentasPagar() {
  const [cuentas, setCuentas] = useState([]);
  const [contenedores, setContenedores] = useState([]);
  const [cuentasBanco, setCuentasBanco] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroContenedor, setFiltroContenedor] = useState('');

  // Vista de historial
  const [selectedCuenta, setSelectedCuenta] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Acordeón por contenedor. null = comportamiento automático (ver estaAbierto).
  const [gruposAbiertos, setGruposAbiertos] = useState(null);

  // Fila expandible para abono directo
  const [expandedId, setExpandedId] = useState(null);
  const [inlineForm, setInlineForm] = useState(emptyInline());
  const [inlineSubmitting, setInlineSubmitting] = useState(false);

  // Crear cuenta manual
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ proveedor_nombre: '', total_factura: '', moneda: 'USD', notas: '' });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    contenedoresApi.getAll().then(setContenedores).catch(() => {});
    cuentasApi.getAll().then(setCuentasBanco).catch(() => {});
  }, []);

  // Deep-link: ?contenedor=<id> pre-filtra las CxP de ese contenedor (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cont = searchParams.get('contenedor');
    if (!cont) return;
    setFiltroContenedor(cont);
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  useEffect(() => { loadCuentas(); }, [filtroEstado, filtroContenedor]);

  // Al cambiar de filtro se vuelve al automático: si queda un solo contenedor,
  // se abre solo; si quedan varios, todos cerrados.
  useEffect(() => { setGruposAbiertos(null); setExpandedId(null); }, [filtroEstado, filtroContenedor, search]);

  const loadCuentas = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroContenedor) params.contenedor_id = filtroContenedor;
      const data = await cuentasPagarApi.getAll(params);
      setCuentas(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (cuenta) => {
    if (expandedId === cuenta.id) {
      setExpandedId(null);
    } else {
      setExpandedId(cuenta.id);
      // La moneda arranca en la de la factura: es el caso normal.
      setInlineForm(emptyInline(monedaSugerida(cuenta)));
    }
  };

  const handleInlineAbono = async (cuenta) => {
    const monedaFactura = String(cuenta.moneda || 'USD').toUpperCase();
    const monedaAbono = codigoMoneda(inlineForm);
    const montoAbono = parseMonto(inlineForm.monto);

    if (montoAbono <= 0) {
      addToast('El monto debe ser mayor a 0', 'error');
      return;
    }
    if (inlineForm.moneda === 'OTRA' && !inlineForm.monedaOtra.trim()) {
      addToast('Escribe el código de la moneda (ej: BRL, GBP)', 'error');
      return;
    }
    const tasa = monedaAbono === monedaFactura ? 1 : parseMonto(inlineForm.tasa_cambio);
    if (tasa <= 0) {
      addToast(`Escribe la tasa: a cuántos ${monedaFactura} equivale 1 ${monedaAbono}`, 'error');
      return;
    }

    const equivalente = montoAbono * tasa;

    try {
      setInlineSubmitting(true);
      await cuentasPagarApi.registrarAbono(cuenta.id, {
        // `monto` va siempre en la moneda de la factura: es lo que descuenta el saldo.
        monto: equivalente,
        fecha: inlineForm.fecha,
        metodo_pago: inlineForm.metodo_pago,
        cuenta_banco_id: inlineForm.cuenta_banco_id ? Number(inlineForm.cuenta_banco_id) : null,
        notas: inlineForm.notas || null,
        // Constancia de lo que realmente se pagó.
        moneda_pago: monedaAbono,
        monto_pagado: montoAbono,
        tasa_cambio: tasa,
      });
      addToast(`Abono registrado — ${cuenta.proveedor_nombre}`, 'success');
      setExpandedId(null);
      setInlineForm(emptyInline(monedaSugerida(cuenta)));
      loadCuentas();
      // Refrescar vista de detalle si estaba abierta
      if (selectedCuenta?.id === cuenta.id) {
        const updated = await cuentasPagarApi.getOne(cuenta.id);
        setSelectedCuenta(updated);
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setInlineSubmitting(false);
    }
  };

  const openView = async (cuenta) => {
    try {
      const data = await cuentasPagarApi.getOne(cuenta.id);
      setSelectedCuenta(data);
      setViewModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setCreateSubmitting(true);
      await cuentasPagarApi.create({
        proveedor_nombre: createForm.proveedor_nombre,
        total_factura: parseFloat(createForm.total_factura),
        moneda: createForm.moneda,
        notas: createForm.notas || null,
      });
      addToast('Cuenta por pagar creada', 'success');
      setCreateModalOpen(false);
      setCreateForm({ proveedor_nombre: '', total_factura: '', moneda: 'USD', notas: '' });
      loadCuentas();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDelete = async (cuenta) => {
    const ok = await confirm({
      title: '¿Eliminar cuenta por pagar?',
      message: 'Solo se puede eliminar si no tiene abonos registrados.',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cuentasPagarApi.delete(cuenta.id);
      addToast('Cuenta eliminada', 'success');
      if (expandedId === cuenta.id) setExpandedId(null);
      loadCuentas();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const filtered = cuentas.filter(c =>
    !search || c.proveedor_nombre?.toLowerCase().includes(search.toLowerCase()) || c.numero?.includes(search)
  );

  const exportarExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cuentas por Pagar');
    ws.columns = [
      { header: 'Proveedor',         key: 'proveedor',  width: 28 },
      { header: 'Contenedor',        key: 'contenedor', width: 16 },
      { header: 'Moneda',            key: 'moneda',     width: 10 },
      { header: 'Total Factura',     key: 'total',      width: 18 },
      { header: 'Total Abonado',     key: 'abonado',    width: 18 },
      { header: 'Saldo Pendiente',   key: 'saldo',      width: 18 },
      { header: 'Estado',            key: 'estado',     width: 12 },
      { header: 'Fecha Creación',    key: 'fecha',      width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    filtered.forEach(c => {
      ws.addRow({
        proveedor:  c.proveedor_nombre || '—',
        contenedor: c.contenedor_numero || 'Manual',
        moneda:     c.moneda || 'COP',
        total:      parseFloat(c.total_factura) || 0,
        abonado:    parseFloat(c.total_abonado) || 0,
        saldo:      (parseFloat(c.total_factura) || 0) - (parseFloat(c.total_abonado) || 0),
        estado:     c.estado,
        fecha:      c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : '—',
      });
    });
    ['total', 'abonado', 'saldo'].forEach(k => {
      ws.getColumn(k).numFmt = '#,##0.00';
    });
    const buffer = await wb.xlsx.writeBuffer();
    descargarExcel(buffer, `cuentas-pagar-${hoy()}.xlsx`);
  };

  const grupos = {};
  filtered.forEach(c => {
    const key = c.contenedor_id ? String(c.contenedor_id) : 'sin';
    const label = c.contenedor_numero || 'Sin Contenedor';
    // Una cuenta nacida de una ESTIMACIÓN corresponde a una factura que todavía
    // no existe: el proveedor aún no ha despachado nada. Se le abona igual —para
    // eso se crea la estimación—, pero mezclada con las reales no había forma de
    // saber cuál era cuál, ni por qué un contenedor "debe" plata de mercancía
    // que no ha llegado.
    if (!grupos[key]) grupos[key] = {
      label, cuentas: [], pendienteCOP: 0, pendienteUSD: 0, pagadas: 0,
      esEstimacion: c.contenedor_estado === 'estimacion',
      deEstimacion: c.contenedor_origen === 'estimacion',
    };
    grupos[key].cuentas.push(c);
    if (c.estado === 'pagada') grupos[key].pagadas++;
    else {
      const pen = parseFloat(c.total_factura) - parseFloat(c.total_abonado);
      if (c.moneda === 'USD') grupos[key].pendienteUSD += pen;
      else grupos[key].pendienteCOP += pen;
    }
  });
  const gruposKeys = Object.keys(grupos);

  // Acordeón: cada contenedor se despliega por separado. Mientras nadie toque
  // nada (gruposAbiertos === null) manda el automático, que abre el grupo solo
  // cuando hay uno —justo el caso de llegar desde el enlace de un contenedor—.
  const estaAbierto = (key) => (gruposAbiertos ? gruposAbiertos.has(key) : gruposKeys.length === 1);
  const toggleGrupo = (key) => {
    setGruposAbiertos(prev => {
      const base = prev ?? new Set(gruposKeys.length === 1 ? gruposKeys : []);
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const contenedorEnfocado = filtroContenedor
    ? (contenedores.find(c => String(c.id) === String(filtroContenedor))?.numero || `#${filtroContenedor}`)
    : null;

  const totalPendienteCOP = cuentas.filter(c => c.estado !== 'pagada' && c.moneda === 'COP')
    .reduce((s, c) => s + (parseFloat(c.total_factura) - parseFloat(c.total_abonado)), 0);
  const totalPendienteUSD = cuentas.filter(c => c.estado !== 'pagada' && c.moneda === 'USD')
    .reduce((s, c) => s + (parseFloat(c.total_factura) - parseFloat(c.total_abonado)), 0);
  const pagadas = cuentas.filter(c => c.estado === 'pagada').length;
  const pendientes = cuentas.filter(c => c.estado !== 'pagada').length;

  const inpSm = 'w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm';
  const inp = 'w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm';
  const lbl = 'block text-sm font-medium text-primary mb-1';

  return (
    <Layout title="Cuentas por Pagar" subtitle={`${cuentas.length} cuentas registradas`}>
      <div className="space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Pendiente COP"  value={formatCurrency(totalPendienteCOP)} icon={CreditCard} color="bg-warning/70"  sub={`${pendientes} cuenta(s) activas`} />
          <KpiCard label="Pendiente USD"  value={`$${totalPendienteUSD.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="bg-secondary/70" sub="en dólares" />
          <KpiCard label="Pagadas"        value={pagadas}    icon={CheckCircle} color="bg-success/70"  sub="completamente liquidadas" />
          <KpiCard label="Por liquidar"   value={pendientes} icon={Clock}        color="bg-accent/70"   sub="pendientes o parciales" />
        </div>

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input type="text" placeholder="Buscar por proveedor o número..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30" />
          </div>
          <select value={filtroContenedor} onChange={(e) => setFiltroContenedor(e.target.value)}
            className="px-4 py-3 rounded-xl border border-border bg-surface">
            <option value="">Todos los contenedores</option>
            {contenedores.map(c => (
              <option key={c.id} value={c.id}>{c.numero}</option>
            ))}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-4 py-3 rounded-xl border border-border bg-surface">
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagada">Pagada</option>
          </select>
          <button onClick={exportarExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-primary hover:bg-primary/5 transition-colors">
            <Download size={15} /> Excel
          </button>
          <Button onClick={() => setCreateModalOpen(true)} variant="secondary">
            <Plus size={16} /> Nueva Cuenta
          </Button>
        </div>

        {/* Aviso de contenedor enfocado (llegada desde el enlace de Contenedores) */}
        {contenedorEnfocado && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-secondary/30 bg-secondary/8 px-4 py-2.5">
            <p className="text-sm text-primary flex items-center gap-2">
              <Package2 size={15} className="text-secondary flex-shrink-0" />
              Viendo solo las cuentas del <b>contenedor {contenedorEnfocado}</b>
            </p>
            <button
              onClick={() => setFiltroContenedor('')}
              className="text-xs font-semibold text-secondary hover:underline underline-offset-2"
            >
              Ver todos los contenedores
            </button>
          </div>
        )}

        {/* Controles del acordeón */}
        {gruposKeys.length > 1 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted">{gruposKeys.length} contenedores</span>
            <button
              onClick={() => setGruposAbiertos(new Set(gruposKeys))}
              className="font-semibold text-secondary hover:underline underline-offset-2"
            >
              Desplegar todos
            </button>
            <button
              onClick={() => setGruposAbiertos(new Set())}
              className="font-semibold text-muted hover:text-primary"
            >
              Contraer todos
            </button>
          </div>
        )}

        {/* Tabla agrupada por contenedor */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary/3 border-b border-border/50">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  {['Número', 'Proveedor', 'Total', 'Mon.', 'Abonado', 'Pendiente', 'Estado', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton cols={9} rows={5} />
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState title="Sin cuentas por pagar" description="Las facturas de los contenedores aparecerán aquí" /></td></tr>
                ) : Object.entries(grupos).map(([key, grupo]) => (
                  <Fragment key={key}>
                    {/* Encabezado de grupo — clic para desplegar solo este contenedor */}
                    <tr
                      className={`border-y border-secondary/20 cursor-pointer transition-colors ${estaAbierto(key) ? 'bg-secondary/12' : 'bg-secondary/8 hover:bg-secondary/12'}`}
                      onClick={() => toggleGrupo(key)}
                    >
                      <td colSpan={9} className="px-4 py-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={15}
                              className={`text-secondary flex-shrink-0 transition-transform duration-200 ${estaAbierto(key) ? 'rotate-90' : ''}`}
                              aria-hidden="true"
                            />
                            <Package2 size={14} className="text-secondary flex-shrink-0" />
                            {key === 'sin' ? (
                              <span className="text-sm font-bold text-secondary">Sin Contenedor</span>
                            ) : (
                              <RefLink to="/contenedores" id={key} title="Ver contenedor"
                                className="text-sm font-bold">Contenedor {grupo.label}</RefLink>
                            )}
                            {grupo.esEstimacion ? (
                              <span title="Estas cuentas salen de una estimación: el proveedor todavía no ha facturado"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 border border-dashed border-amber-400/60">
                                Estimación
                              </span>
                            ) : grupo.deEstimacion && (
                              <span title="El contenedor nació como estimación: estas cuentas se crearon antes de que llegara"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-500/10 text-blue-600 border border-blue-400/40">
                                De estimación
                              </span>
                            )}
                            <span className="text-xs text-muted">
                              {grupo.cuentas.length} cuenta{grupo.cuentas.length !== 1 ? 's' : ''}
                              {grupo.pagadas > 0 && ` · ${grupo.pagadas} pagada${grupo.pagadas !== 1 ? 's' : ''}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            {grupo.pendienteUSD > 0 && (
                              <span className="text-warning">{formatCurrency(grupo.pendienteUSD, 'USD')} pendiente</span>
                            )}
                            {grupo.pendienteCOP > 0 && (
                              <span className="text-warning">{formatCurrency(grupo.pendienteCOP, 'COP')} pendiente</span>
                            )}
                            {grupo.pendienteCOP === 0 && grupo.pendienteUSD === 0 && (
                              <span className="text-success flex items-center gap-1"><CheckCircle size={12} /> Liquidado</span>
                            )}
                            <span className="text-muted font-normal hidden sm:inline">
                              {estaAbierto(key) ? 'Ocultar' : 'Ver cuentas'}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de cuentas — solo las del contenedor desplegado */}
                    {estaAbierto(key) && grupo.cuentas.map(c => {
                      const pendiente = parseFloat(c.total_factura) - parseFloat(c.total_abonado);
                      const isExpanded = expandedId === c.id;
                      const canAbono = c.estado !== 'pagada';
                      return (
                        <Fragment key={c.id}>
                          <tr
                            className={`border-b border-border/40 transition-colors ${isExpanded ? 'bg-secondary/5' : 'hover:bg-primary/3'}`}>
                            {/* Chevron toggle */}
                            <td className="w-8 pl-3 py-3">
                              {canAbono && (
                                <button onClick={() => toggleExpand(c)}
                                  className="p-1 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10 transition-colors"
                                  title={isExpanded ? 'Cerrar' : 'Registrar abono'}>
                                  {isExpanded
                                    ? <ChevronDown size={15} className="text-secondary" />
                                    : <ChevronRight size={15} />}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted">{c.numero}</td>
                            <td className="px-4 py-3 font-semibold text-primary text-sm">{c.proveedor_nombre}</td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold">
                              {(() => {
                                const orig = facturaOriginal(c);
                                if (!orig) return formatCurrency(c.total_factura, c.moneda);
                                return (
                                  <>
                                    <span className="text-primary">{formatMoneda(orig.total, orig.moneda)}</span>
                                    <span className="block text-[11px] font-normal text-muted">
                                      ≈ {formatCurrency(c.total_factura, c.moneda)}
                                    </span>
                                  </>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.moneda === 'USD' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>{c.moneda}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-success">{formatCurrency(c.total_abonado, c.moneda)}</td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold text-warning">{formatCurrency(pendiente, c.moneda)}</td>
                            <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => openView(c)}
                                  className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                                  title="Ver historial">
                                  <Eye size={15} />
                                </button>
                                <button onClick={() => handleDelete(c)}
                                  className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors"
                                  disabled={parseFloat(c.total_abonado) > 0}
                                  title="Eliminar">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Fila expandida: formulario de abono inline */}
                          {isExpanded && (
                            <tr key={`exp-${c.id}`} className="border-b border-secondary/20">
                              <td colSpan={9} className="px-6 pb-4 pt-1 bg-secondary/5">
                                <div className="rounded-xl border border-secondary/20 bg-surface p-4 shadow-sm">
                                  {/* Resumen de saldo */}
                                  <div className="flex items-center gap-6 mb-4 pb-3 border-b border-border/40">
                                    <div>
                                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Total factura</p>
                                      <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(c.total_factura, c.moneda)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Abonado</p>
                                      <p className="text-sm font-mono font-semibold text-success">{formatCurrency(c.total_abonado, c.moneda)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Saldo pendiente</p>
                                      <p className="text-lg font-mono font-bold text-warning">{formatCurrency(pendiente, c.moneda)}</p>
                                    </div>
                                  </div>

                                  {/* Campos del abono */}
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">
                                        Monto * <span className="text-muted/70 font-normal">en {codigoMoneda(inlineForm)}</span>
                                      </label>
                                      <input type="text" inputMode="decimal" autoFocus
                                        className={inpSm}
                                        value={inlineForm.monto}
                                        onChange={(e) => setInlineForm({ ...inlineForm, monto: e.target.value })}
                                        placeholder="0" />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Moneda del pago</label>
                                      <select className={inpSm}
                                        value={inlineForm.moneda}
                                        onChange={(e) => setInlineForm({
                                          ...inlineForm,
                                          moneda: e.target.value,
                                          tasa_cambio: e.target.value === (c.moneda || 'USD') ? '' : inlineForm.tasa_cambio,
                                        })}>
                                        {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.value === 'OTRA' ? m.label : m.value}</option>)}
                                      </select>
                                      {inlineForm.moneda === 'OTRA' && (
                                        <input type="text" maxLength={8}
                                          className={inpSm + ' mt-2 uppercase'}
                                          value={inlineForm.monedaOtra}
                                          onChange={(e) => setInlineForm({ ...inlineForm, monedaOtra: e.target.value.toUpperCase() })}
                                          placeholder="Ej: BRL" />
                                      )}
                                    </div>

                                    {codigoMoneda(inlineForm) !== String(c.moneda || 'USD').toUpperCase() && (
                                      <div>
                                        <label className="block text-xs font-medium text-muted mb-1">
                                          Tasa <span className="text-muted/70 font-normal">1 {codigoMoneda(inlineForm)} = ? {c.moneda}</span>
                                        </label>
                                        <input type="text" inputMode="decimal"
                                          className={inpSm}
                                          value={inlineForm.tasa_cambio}
                                          onChange={(e) => setInlineForm({ ...inlineForm, tasa_cambio: e.target.value })}
                                          placeholder="Ej: 0.00025" />
                                      </div>
                                    )}

                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Método</label>
                                      <select className={inpSm}
                                        value={inlineForm.metodo_pago}
                                        onChange={(e) => setInlineForm({ ...inlineForm, metodo_pago: e.target.value })}>
                                        <option value="efectivo">Efectivo</option>
                                        <option value="transferencia">Transferencia</option>
                                        <option value="cheque">Cheque</option>
                                        <option value="otro">Otro</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Cuenta</label>
                                      <select className={inpSm}
                                        value={inlineForm.cuenta_banco_id}
                                        onChange={(e) => setInlineForm({ ...inlineForm, cuenta_banco_id: e.target.value })}>
                                        <option value="">— Sin cuenta —</option>
                                        {cuentasBanco.map((cu) => (
                                          <option key={cu.id} value={cu.id}>
                                            {cu.banco ? `${cu.banco} — ${cu.nombre}` : cu.nombre}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Fecha</label>
                                      <input type="date" className={inpSm}
                                        value={inlineForm.fecha}
                                        onChange={(e) => setInlineForm({ ...inlineForm, fecha: e.target.value })} />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Notas</label>
                                      <input type="text" className={inpSm}
                                        value={inlineForm.notas}
                                        onChange={(e) => setInlineForm({ ...inlineForm, notas: e.target.value })}
                                        placeholder="Opcional..." />
                                    </div>
                                  </div>

                                  {/* Qué se va a descontar del saldo, en la moneda de la factura */}
                                  {(() => {
                                    const eq = equivalenteFactura(inlineForm, c.moneda);
                                    const distinta = codigoMoneda(inlineForm) !== String(c.moneda || 'USD').toUpperCase();
                                    if (!parseMonto(inlineForm.monto)) return null;
                                    return (
                                      <div className="mt-3 rounded-lg bg-primary/5 border border-border px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                                        {distinta && !eq ? (
                                          <span className="text-warning font-semibold">
                                            Falta la tasa para saber cuánto descuenta del saldo.
                                          </span>
                                        ) : (
                                          <>
                                            <span className="text-muted">
                                              Descuenta del saldo:{' '}
                                              <b className="font-mono text-primary">{formatCurrency(eq, c.moneda)}</b>
                                            </span>
                                            <span className="text-muted">
                                              Saldo después:{' '}
                                              <b className={`font-mono ${pendiente - eq < 0 ? 'text-error' : 'text-success'}`}>
                                                {formatCurrency(pendiente - eq, c.moneda)}
                                              </b>
                                            </span>
                                            {pendiente - eq < 0 && (
                                              <span className="text-error font-semibold">El abono supera el saldo pendiente.</span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  <div className="flex items-center justify-end gap-2 mt-3">
                                    <button type="button" onClick={() => setExpandedId(null)}
                                      className="px-3 py-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 text-sm transition-colors">
                                      Cancelar
                                    </button>
                                    <button type="button" onClick={() => handleInlineAbono(c)} disabled={inlineSubmitting}
                                      className="flex items-center gap-1.5 px-4 py-1.5 bg-secondary text-white rounded-lg text-sm font-semibold hover:bg-secondary/85 disabled:opacity-40 active:scale-[0.98] transition-all">
                                      {inlineSubmitting
                                        ? 'Registrando...'
                                        : <><CheckCircle size={13} /> Registrar Abono</>}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal: Ver historial de abonos */}
      {selectedCuenta && (
        <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={selectedCuenta.numero} size="lg">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3 items-center">
              <EstadoBadge estado={selectedCuenta.estado} />
              <span className="text-xs bg-primary/8 text-primary px-2 py-0.5 rounded-full font-semibold">{selectedCuenta.moneda}</span>
              {selectedCuenta.contenedor_numero && (
                <RefLink to="/contenedores" id={selectedCuenta.contenedor_id} title="Ver contenedor"
                  className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full">Contenedor {selectedCuenta.contenedor_numero}</RefLink>
              )}
            </div>

            <div className="rounded-2xl border border-border/60 overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-border/40">
                <div className="p-4 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Total Factura</p>
                  <p className="text-lg font-display font-bold text-primary">{formatCurrency(selectedCuenta.total_factura, selectedCuenta.moneda)}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Abonado</p>
                  <p className="text-lg font-display font-bold text-success">{formatCurrency(selectedCuenta.total_abonado, selectedCuenta.moneda)}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Pendiente</p>
                  <p className="text-lg font-display font-bold text-warning">
                    {formatCurrency(parseFloat(selectedCuenta.total_factura) - parseFloat(selectedCuenta.total_abonado), selectedCuenta.moneda)}
                  </p>
                </div>
              </div>
            </div>

            {selectedCuenta.notas && (
              <p className="text-sm text-muted italic">{selectedCuenta.notas}</p>
            )}

            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Historial de Abonos</p>
              {(!selectedCuenta.abonos || selectedCuenta.abonos.length === 0) ? (
                <p className="text-sm text-muted text-center py-4">Sin abonos registrados</p>
              ) : (
                <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/30">
                  {selectedCuenta.abonos.map((ab, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-primary/3">
                      <div>
                        <p className="text-sm font-semibold text-primary">{formatCurrency(ab.monto, selectedCuenta.moneda)}</p>
                        {/* Si se pagó en otra moneda, se deja constancia de lo que salió del banco */}
                        {ab.moneda_pago && String(ab.moneda_pago).toUpperCase() !== String(selectedCuenta.moneda || 'USD').toUpperCase() && (
                          <p className="text-xs text-secondary font-medium">
                            Pagado {formatMoneda(ab.monto_pagado, ab.moneda_pago)}
                            {ab.tasa_cambio ? ` · tasa ${Number(ab.tasa_cambio).toLocaleString('es-CO', { maximumFractionDigits: 6 })}` : ''}
                          </p>
                        )}
                        <p className="text-xs text-muted">
                          {formatDate(ab.fecha)}{ab.metodo_pago ? ` · ${ab.metodo_pago}` : ''}
                          {ab.cuenta_banco_nombre && (
                            <> · <RefLink to="/cuentas" id={ab.cuenta_banco_id} title="Ver cuenta" icon={false}>{ab.cuenta_banco_nombre}</RefLink></>
                          )}
                          {ab.cuenta_banco_banco && <span className="text-muted/70"> ({ab.cuenta_banco_banco})</span>}
                        </p>
                        {ab.notas && <p className="text-xs text-muted/70 italic">{ab.notas}</p>}
                      </div>
                      <CheckCircle size={16} className="text-success flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Crear Cuenta Manual */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nueva Cuenta por Pagar" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className={lbl}>Proveedor *</label>
            <input type="text" className={inp} required
              value={createForm.proveedor_nombre} onChange={(e) => setCreateForm({ ...createForm, proveedor_nombre: e.target.value })}
              placeholder="Nombre del proveedor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Total Factura *</label>
              <input type="number" min="0.01" step="0.01" className={inp} required
                value={createForm.total_factura} onChange={(e) => setCreateForm({ ...createForm, total_factura: e.target.value })}
                placeholder="0.00" />
            </div>
            <div>
              <label className={lbl}>Moneda</label>
              <select className={inp} value={createForm.moneda} onChange={(e) => setCreateForm({ ...createForm, moneda: e.target.value })}>
                <option value="USD">USD</option>
                <option value="COP">COP</option>
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>Notas (opcional)</label>
            <input type="text" className={inp} value={createForm.notas}
              onChange={(e) => setCreateForm({ ...createForm, notas: e.target.value })}
              placeholder="Observaciones..." />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary" disabled={createSubmitting}>
              {createSubmitting ? 'Creando...' : 'Crear Cuenta'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}

