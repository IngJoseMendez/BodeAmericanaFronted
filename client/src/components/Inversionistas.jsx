import { useEffect, useState, useMemo } from 'react';
import { Card, CardBody, Button, Modal, useToast, useConfirm } from './common';
import { inversionistasApi, contenedoresApi } from '../services/api';
import { Users, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { parseMonto, formatCOP } from '../lib/money';

// Reparto de la utilidad de un contenedor entre quienes lo financiaron.
//
//   porcentaje = aporte del inversionista / inversión total del contenedor
//   utilidad   = utilidad del contenedor × porcentaje
//
// Inversión total y utilidad salen del propio contenedor (costo total +
// utilidad, y utilidad por unidad × unidades). Nada de esto se guarda: si
// mañana cambia un costo, el reparto se recalcula solo.

const usd = (cop, tasa) => (tasa > 0 ? cop / tasa : 0);
const fmtUSD = (v) => 'US$ ' + (v || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Inversionistas() {
  const [inversionistas, setInversionistas] = useState([]);
  const [contenedores, setContenedores] = useState([]);
  const [contSel, setContSel] = useState('');
  const [detalleCont, setDetalleCont] = useState(null);
  const [aportes, setAportes] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Alta / edición de aporte
  const [aporteForm, setAporteForm] = useState({ inversionista_id: '', aporte_cop: '', aporte_usd: '' });
  const [editAporte, setEditAporte] = useState(null);

  // Gestión del catálogo
  const [gestorOpen, setGestorOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [editInv, setEditInv] = useState(null);

  const { addToast } = useToast();
  const confirm = useConfirm();

  const cargarBase = async () => {
    const [inv, cont] = await Promise.allSettled([
      inversionistasApi.getAll(),
      contenedoresApi.getAll(),
    ]);
    setInversionistas(inv.status === 'fulfilled' ? (inv.value || []) : []);
    const cs = cont.status === 'fulfilled' ? (cont.value || []) : [];
    setContenedores(cs);
    if (!contSel && cs.length) setContSel(String(cs[0].id));
    setCargando(false);
  };

  useEffect(() => { cargarBase(); }, []);

  const cargarContenedor = async () => {
    if (!contSel) { setDetalleCont(null); setAportes([]); return; }
    const [full, ap] = await Promise.allSettled([
      contenedoresApi.getOne(contSel),
      inversionistasApi.getAportes({ contenedor_id: contSel }),
    ]);
    setDetalleCont(full.status === 'fulfilled' ? full.value : null);
    setAportes(ap.status === 'fulfilled' ? (ap.value || []) : []);
  };

  useEffect(() => { cargarContenedor(); }, [contSel]);

  // Cifras del contenedor sobre las que se reparte
  const cifras = useMemo(() => {
    const c = detalleCont;
    if (!c) return { tasa: 0, unidades: 0, utilidad: 0, inversion: 0, costo: 0 };
    const tasa = parseFloat(c.tasa_conversion) || 0;
    const unidades = parseInt(c.total_pacas_recibidas) || parseInt(c.total_pacas) || 0;
    const costo = parseFloat(c.costo_total) || 0;
    const utilidad = (parseFloat(c.utilidad_unitaria) || 0) * unidades;
    return { tasa, unidades, utilidad, inversion: costo + utilidad, costo };
  }, [detalleCont]);

  const filas = useMemo(() => {
    return aportes.map(a => {
      const cop = parseFloat(a.aporte_cop) || 0;
      // Si no se registró el aporte en dólares se deriva con la tasa.
      const dol = parseFloat(a.aporte_usd) || usd(cop, cifras.tasa);
      const pct = cifras.inversion > 0 ? (cop / cifras.inversion) * 100 : 0;
      const utilCop = cifras.utilidad * (pct / 100);
      return { ...a, cop, dol, pct, utilCop, utilUsd: usd(utilCop, cifras.tasa) };
    });
  }, [aportes, cifras]);

  const totales = useMemo(() => ({
    cop: filas.reduce((s, f) => s + f.cop, 0),
    dol: filas.reduce((s, f) => s + f.dol, 0),
    pct: filas.reduce((s, f) => s + f.pct, 0),
    utilCop: filas.reduce((s, f) => s + f.utilCop, 0),
    utilUsd: filas.reduce((s, f) => s + f.utilUsd, 0),
  }), [filas]);

  const disponibles = inversionistas.filter(
    i => !aportes.some(a => a.inversionista_id === i.id)
  );

  // ── Aportes ────────────────────────────────────────────────────

  const guardarAporte = async (e) => {
    e.preventDefault();
    if (!aporteForm.inversionista_id) { addToast('Elige el inversionista', 'error'); return; }
    const cop = parseMonto(aporteForm.aporte_cop);
    const dol = parseMonto(aporteForm.aporte_usd);
    if (cop <= 0 && dol <= 0) { addToast('Escribe el aporte en pesos o en dólares', 'error'); return; }
    try {
      await inversionistasApi.crearAporte({
        inversionista_id: Number(aporteForm.inversionista_id),
        contenedor_id: Number(contSel),
        // Si solo escriben una moneda, la otra se completa con la tasa.
        aporte_cop: cop > 0 ? cop : dol * cifras.tasa,
        aporte_usd: dol > 0 ? dol : usd(cop, cifras.tasa),
      });
      addToast('Aporte registrado', 'success');
      setAporteForm({ inversionista_id: '', aporte_cop: '', aporte_usd: '' });
      cargarContenedor();
      cargarBase();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const guardarEdicion = async () => {
    const cop = parseMonto(editAporte.aporte_cop);
    const dol = parseMonto(editAporte.aporte_usd);
    try {
      await inversionistasApi.actualizarAporte(editAporte.id, {
        aporte_cop: cop > 0 ? cop : dol * cifras.tasa,
        aporte_usd: dol > 0 ? dol : usd(cop, cifras.tasa),
      });
      addToast('Aporte actualizado', 'success');
      setEditAporte(null);
      cargarContenedor();
      cargarBase();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const borrarAporte = async (f) => {
    const ok = await confirm({
      title: '¿Quitar el aporte?',
      message: `Se quitará el aporte de ${f.inversionista_nombre} en este contenedor.`,
      confirmText: 'Quitar', variant: 'danger',
    });
    if (!ok) return;
    try {
      await inversionistasApi.eliminarAporte(f.id);
      addToast('Aporte eliminado', 'success');
      cargarContenedor();
      cargarBase();
    } catch (err) { addToast(err.message, 'error'); }
  };

  // ── Catálogo ───────────────────────────────────────────────────

  const crearInversionista = async (e) => {
    e?.preventDefault();
    if (!nuevoNombre.trim()) return;
    try {
      await inversionistasApi.create({ nombre: nuevoNombre.trim() });
      addToast(`"${nuevoNombre.trim()}" agregado`, 'success');
      setNuevoNombre('');
      cargarBase();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const renombrar = async () => {
    if (!editInv?.nombre.trim()) return;
    try {
      await inversionistasApi.update(editInv.id, { nombre: editInv.nombre.trim() });
      addToast('Inversionista actualizado', 'success');
      setEditInv(null);
      cargarBase();
      cargarContenedor();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const borrarInversionista = async (i) => {
    const enUso = i.contenedores > 0;
    const ok = await confirm({
      title: enUso ? '¿Desactivar inversionista?' : '¿Eliminar inversionista?',
      message: enUso
        ? `${i.nombre} tiene aportes en ${i.contenedores} contenedor(es), así que se desactivará para no descuadrarlos.`
        : `Se eliminará a ${i.nombre} de la lista.`,
      confirmText: enUso ? 'Desactivar' : 'Eliminar', variant: 'danger',
    });
    if (!ok) return;
    try {
      await inversionistasApi.delete(i.id);
      addToast(enUso ? 'Inversionista desactivado' : 'Inversionista eliminado', 'success');
      cargarBase();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const inp = 'px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-secondary" />
              <h2 className="font-display font-bold text-primary">Inversionistas</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setGestorOpen(true)}>
              Administrar lista ({inversionistas.length})
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[14rem]">
              <label className="block text-xs font-semibold text-muted mb-1" htmlFor="inv-cont">
                Contenedor
              </label>
              <select id="inv-cont" value={contSel} onChange={(e) => setContSel(e.target.value)}
                      className={inp + ' w-full'}>
                <option value="">Elige un contenedor…</option>
                {contenedores.map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.estado}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cifras del contenedor sobre las que se reparte */}
          {detalleCont && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { l: 'Inversión total', v: cifras.inversion, tone: 'text-primary' },
                { l: 'Utilidad del contenedor', v: cifras.utilidad, tone: 'text-emerald-600' },
                { l: 'Aportado', v: totales.cop, tone: 'text-secondary' },
                { l: 'Sin cubrir', v: cifras.inversion - totales.cop, tone: cifras.inversion - totales.cop > 0 ? 'text-warning' : 'text-emerald-600' },
              ].map((c, i) => (
                <div key={i} className="rounded-xl bg-primary/5 border border-border px-3 py-2">
                  <p className="text-[9px] font-bold text-muted uppercase tracking-wide">{c.l}</p>
                  <p className={`text-sm font-mono font-bold tabular-nums ${c.tone}`}>{formatCOP(c.v)}</p>
                  <p className="text-[10px] text-muted font-mono">{fmtUSD(usd(c.v, cifras.tasa))}</p>
                </div>
              ))}
            </div>
          )}

          {cifras.tasa === 0 && detalleCont && (
            <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              Este contenedor no tiene tasa registrada, así que los dólares no se pueden calcular.
            </p>
          )}
          {detalleCont && cifras.utilidad === 0 && (
            <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              El contenedor no tiene utilidad por unidad, así que no hay utilidad que repartir.
              Se registra al editar el contenedor.
            </p>
          )}

          {/* Tabla de reparto */}
          {contSel && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-primary/3 border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted uppercase">Inversionista</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase">Aporte COP</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase">Aporte US$</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase">%</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase">Utilidad COP</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase">Utilidad US$</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filas.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted text-sm">
                      Sin aportes registrados en este contenedor
                    </td></tr>
                  ) : filas.map(f => (
                    <tr key={f.id} className="hover:bg-primary/3">
                      <td className="px-3 py-2.5 font-medium text-primary">{f.inversionista_nombre}</td>
                      {editAporte?.id === f.id ? (
                        <>
                          <td className="px-3 py-2">
                            <input type="text" inputMode="decimal" value={editAporte.aporte_cop} autoFocus
                              onChange={(e) => setEditAporte({ ...editAporte, aporte_cop: e.target.value })}
                              className={inp + ' w-32 text-right'} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" inputMode="decimal" value={editAporte.aporte_usd}
                              onChange={(e) => setEditAporte({ ...editAporte, aporte_usd: e.target.value })}
                              className={inp + ' w-28 text-right'} />
                          </td>
                          <td colSpan={3} className="px-3 py-2 text-xs text-muted">
                            Deja una en blanco y se calcula con la tasa.
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button onClick={guardarEdicion} title="Guardar"
                              className="p-1.5 text-success hover:bg-success/10 rounded-lg"><Check size={15} /></button>
                            <button onClick={() => setEditAporte(null)} title="Cancelar"
                              className="p-1.5 text-muted hover:bg-primary/5 rounded-lg"><X size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCOP(f.cop)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">{fmtUSD(f.dol)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-secondary">
                            {f.pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-600">
                            {formatCOP(f.utilCop)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">{fmtUSD(f.utilUsd)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right">
                            <button onClick={() => setEditAporte({ id: f.id, aporte_cop: String(f.cop), aporte_usd: String(f.dol.toFixed(2)) })}
                              title="Editar" className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-primary/5">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => borrarAporte(f)} title="Quitar"
                              className="p-1.5 text-muted hover:text-error rounded-lg hover:bg-error/5">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {filas.length > 0 && (
                  <tfoot>
                    <tr className="bg-primary/5 font-bold">
                      <td className="px-3 py-2.5 text-primary">TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCOP(totales.cop)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">{fmtUSD(totales.dol)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${Math.abs(totales.pct - 100) > 0.5 ? 'text-warning' : 'text-secondary'}`}>
                        {totales.pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-600">{formatCOP(totales.utilCop)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">{fmtUSD(totales.utilUsd)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {Math.abs(totales.pct - 100) > 0.5 && filas.length > 0 && (
            <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              Los aportes suman {totales.pct.toFixed(2)}% de la inversión total, no el 100%.
              Falta registrar aportes o la inversión del contenedor cambió.
            </p>
          )}

          {/* Agregar aporte */}
          {contSel && (
            <form onSubmit={guardarAporte} className="flex flex-wrap items-end gap-2 pt-1">
              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs font-semibold text-muted mb-1">Inversionista</label>
                <select value={aporteForm.inversionista_id} className={inp + ' w-full'}
                  onChange={(e) => setAporteForm({ ...aporteForm, inversionista_id: e.target.value })}>
                  <option value="">Elige…</option>
                  {disponibles.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Aporte COP</label>
                <input type="text" inputMode="decimal" placeholder="0" className={inp + ' w-36 text-right'}
                  value={aporteForm.aporte_cop}
                  onChange={(e) => setAporteForm({ ...aporteForm, aporte_cop: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Aporte US$</label>
                <input type="text" inputMode="decimal" placeholder="0" className={inp + ' w-32 text-right'}
                  value={aporteForm.aporte_usd}
                  onChange={(e) => setAporteForm({ ...aporteForm, aporte_usd: e.target.value })} />
              </div>
              <Button type="submit" disabled={!aporteForm.inversionista_id}>
                <Plus size={15} className="mr-1" /> Agregar
              </Button>
              {disponibles.length === 0 && inversionistas.length > 0 && (
                <p className="text-xs text-muted w-full">
                  Todos los inversionistas ya tienen aporte en este contenedor.
                </p>
              )}
            </form>
          )}
        </CardBody>
      </Card>

      {/* Catálogo de inversionistas */}
      <Modal isOpen={gestorOpen} onClose={() => { setGestorOpen(false); setEditInv(null); }}
             title="Inversionistas">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            La lista de quienes financian los contenedores. El total aportado suma todos sus contenedores.
          </p>

          <form onSubmit={crearInversionista} className="flex gap-2">
            <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Nombre completo…" className={inp + ' flex-1'} />
            <Button type="submit" disabled={!nuevoNombre.trim()}>
              <Plus size={15} className="mr-1" /> Agregar
            </Button>
          </form>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
            {inversionistas.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Sin inversionistas registrados</p>
            ) : inversionistas.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                {editInv?.id === i.id ? (
                  <>
                    <input type="text" value={editInv.nombre} autoFocus
                      onChange={(e) => setEditInv({ ...editInv, nombre: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); renombrar(); } }}
                      className={inp + ' flex-1'} />
                    <button onClick={renombrar} title="Guardar"
                      className="p-1.5 text-success hover:bg-success/10 rounded-lg"><Check size={15} /></button>
                    <button onClick={() => setEditInv(null)} title="Cancelar"
                      className="p-1.5 text-muted hover:bg-primary/5 rounded-lg"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-primary truncate">{i.nombre}</p>
                      <p className="text-[11px] text-muted font-mono">
                        Total aportado: {formatCOP(i.total_aporte_cop)}
                        {parseFloat(i.total_aporte_usd) > 0 && ` · ${fmtUSD(parseFloat(i.total_aporte_usd))}`}
                        {i.contenedores > 0 && ` · ${i.contenedores} contenedor(es)`}
                      </p>
                    </div>
                    <button onClick={() => setEditInv({ id: i.id, nombre: i.nombre })} title="Renombrar"
                      className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-primary/5">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => borrarInversionista(i)} title="Quitar"
                      className="p-1.5 text-muted hover:text-error rounded-lg hover:bg-error/5">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => { setGestorOpen(false); setEditInv(null); }}>Cerrar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
