import { useEffect, useState, Fragment } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Modal, useToast, useConfirm } from '../components/common';
import { cuentasPagarApi, contenedoresApi } from '../services/api';
import {
  CreditCard, Plus, Eye, Trash2, DollarSign, Clock, CheckCircle,
  Search, Package2, ChevronDown, ChevronRight,
} from 'lucide-react';

const formatCurrency = (value, moneda = 'COP') => {
  if (moneda === 'USD') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value || 0);
  }
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TODAY = new Date().toISOString().split('T')[0];
const emptyInline = () => ({ monto: '', fecha: TODAY, metodo_pago: 'efectivo', notas: '' });

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroContenedor, setFiltroContenedor] = useState('');

  // Vista de historial
  const [selectedCuenta, setSelectedCuenta] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

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
  }, []);

  useEffect(() => { loadCuentas(); }, [filtroEstado, filtroContenedor]);

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
      setInlineForm(emptyInline());
    }
  };

  const handleInlineAbono = async (cuenta) => {
    if (!inlineForm.monto || parseFloat(inlineForm.monto) <= 0) {
      addToast('El monto debe ser mayor a 0', 'error');
      return;
    }
    try {
      setInlineSubmitting(true);
      await cuentasPagarApi.registrarAbono(cuenta.id, {
        monto: parseFloat(inlineForm.monto),
        fecha: inlineForm.fecha,
        metodo_pago: inlineForm.metodo_pago,
        notas: inlineForm.notas || null,
      });
      addToast(`Abono registrado — ${cuenta.proveedor_nombre}`, 'success');
      setExpandedId(null);
      setInlineForm(emptyInline());
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

  const grupos = {};
  filtered.forEach(c => {
    const key = c.contenedor_id ? String(c.contenedor_id) : 'sin';
    const label = c.contenedor_numero || 'Sin Contenedor';
    if (!grupos[key]) grupos[key] = { label, cuentas: [], pendienteCOP: 0, pendienteUSD: 0 };
    grupos[key].cuentas.push(c);
    if (c.estado !== 'pagada') {
      const pen = parseFloat(c.total_factura) - parseFloat(c.total_abonado);
      if (c.moneda === 'USD') grupos[key].pendienteUSD += pen;
      else grupos[key].pendienteCOP += pen;
    }
  });

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
          <Button onClick={() => setCreateModalOpen(true)} variant="secondary">
            <Plus size={16} /> Nueva Cuenta
          </Button>
        </div>

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
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No hay cuentas por pagar</td></tr>
                ) : Object.entries(grupos).map(([key, grupo]) => (
                  <Fragment key={key}>
                    {/* Encabezado de grupo */}
                    <tr className="bg-secondary/8 border-y border-secondary/20">
                      <td colSpan={9} className="px-4 py-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Package2 size={14} className="text-secondary" />
                            <span className="text-sm font-bold text-secondary">
                              {key === 'sin' ? 'Sin Contenedor' : `Contenedor ${grupo.label}`}
                            </span>
                            <span className="text-xs text-muted">({grupo.cuentas.length} cuenta{grupo.cuentas.length !== 1 ? 's' : ''})</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            {grupo.pendienteCOP > 0 && (
                              <span className="text-warning">{formatCurrency(grupo.pendienteCOP, 'COP')} pendiente</span>
                            )}
                            {grupo.pendienteUSD > 0 && (
                              <span className="text-warning">${grupo.pendienteUSD.toLocaleString('es-CO', { maximumFractionDigits: 0 })} USD pendiente</span>
                            )}
                            {grupo.pendienteCOP === 0 && grupo.pendienteUSD === 0 && (
                              <span className="text-success flex items-center gap-1"><CheckCircle size={12} /> Liquidado</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de cuentas */}
                    {grupo.cuentas.map(c => {
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
                            <td className="px-4 py-3 font-mono text-sm font-semibold">{formatCurrency(c.total_factura, c.moneda)}</td>
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
                                  <div className="grid grid-cols-4 gap-3 items-end">
                                    <div>
                                      <label className="block text-xs font-medium text-muted mb-1">Monto *</label>
                                      <input type="number" min="0.01" step="0.01" autoFocus
                                        className={inpSm}
                                        value={inlineForm.monto}
                                        onChange={(e) => setInlineForm({ ...inlineForm, monto: e.target.value })}
                                        placeholder="0.00" />
                                    </div>
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
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">Contenedor {selectedCuenta.contenedor_numero}</span>
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
                        <p className="text-xs text-muted">{formatDate(ab.fecha)}{ab.metodo_pago ? ` · ${ab.metodo_pago}` : ''}</p>
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

