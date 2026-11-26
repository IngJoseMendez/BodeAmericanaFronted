import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, useToast, useConfirm, BuscadorLista } from '../components/common';
import { cuentasApi, bancosApi, metodosPagoApi } from '../services/api';
import { Wallet, Plus, Trash2, Pencil, Landmark, Building2, CreditCard, Check, X, RotateCcw } from 'lucide-react';

import { mensajeDeError } from '../lib/errores';
// Tipos base. La lista se amplía sola con cualquier tipo que ya se haya usado,
// así que se pueden crear tipos nuevos desde esta misma pantalla.
const TIPOS_BASE = [
  { value: 'banco', label: 'Banco' },
  { value: 'caja', label: 'Caja' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'billetera', label: 'Billetera digital' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export default function Cuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'banco', banco_id: '', numero_cuenta: '' });
  const [guardando, setGuardando] = useState(false);

  // Gestor del catálogo de bancos
  const [bancosOpen, setBancosOpen] = useState(false);
  const [nuevoBanco, setNuevoBanco] = useState('');
  const [editBanco, setEditBanco] = useState(null); // { id, nombre }

  // ── GESTOR DE LOS MÉTODOS DE PAGO ─────────────────────────────────────────
  //
  // Esta lista era FIJA y estaba escrita en el código, por una decisión escrita
  // («es un tipo y no algo que crezca»). Se volvió catálogo cuando se vio que
  // había DOS listas fijas distintas y que la de pagar estaba mal: la cartera
  // decía efectivo / consignación / transferencia / giro —lo que de verdad pasa
  // aquí— y cuentas por pagar se quedó con la genérica vieja, así que para
  // GIRARLE a un proveedor no se podía elegir «giro».
  //
  // Vive en ESTA pantalla y no en una propia porque es la misma pregunta que ya
  // contesta: por dónde entra y sale la plata. Al lado de las entidades y las
  // cuentas, que es lo que se elige junto con el método.
  const [metodos, setMetodos] = useState([]);
  const [metodosOpen, setMetodosOpen] = useState(false);
  const [nuevoMetodo, setNuevoMetodo] = useState('');
  // { id, etiqueta, tiene_destino, para_cobrar, para_pagar }
  const [editMetodo, setEditMetodo] = useState(null);

  const { addToast } = useToast();
  const confirm = useConfirm();

  // Deep-link: ?focus=<id> resalta la cuenta referenciada (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    setHighlightId(Number(focus));
    setSearchParams({}, { replace: true });
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [searchParams]);

  const load = async () => {
    try {
      setLoading(true);
      // allSettled: si el catálogo de bancos falla, las cuentas se siguen viendo.
      const [c, b, m] = await Promise.allSettled([
        cuentasApi.getAll({ todas: 'true' }),
        // todos=true trae también los bancos desactivados: antes desaparecían de la
        // lista y no había forma de volver a activarlos desde la pantalla.
        bancosApi.getAll({ todos: 'true' }),
        // Y los métodos igual: los desactivados hay que poder volver a activar.
        metodosPagoApi.getAll({ todos: 'true' }),
      ]);
      setCuentas(c.status === 'fulfilled' && Array.isArray(c.value) ? c.value : []);
      setBancos(b.status === 'fulfilled' && Array.isArray(b.value) ? b.value : []);
      setMetodos(m.status === 'fulfilled' && Array.isArray(m.value) ? m.value : []);
      if (c.status === 'rejected') addToast(c.reason?.message || 'Error cargando cuentas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tiposDisponibles = Array.from(new Set([
    ...TIPOS_BASE.map(t => t.value),
    ...cuentas.map(c => (c.tipo || '').trim().toLowerCase()).filter(Boolean),
  ]));

  const bancosActivos = bancos.filter(b => b.activo !== false);
  const metodosActivos = metodos.filter(m => m.activo !== false);
  // Los desactivados al final, igual que los bancos y las cuentas: una lista
  // donde lo que ya no sirve estorba entre lo que sirve se lee peor cada vez
  // que crece.
  const metodosOrdenados = [...metodos].sort(
    (a, b) => Number(a.activo === false) - Number(b.activo === false)
  );
  // En el selector solo se ofrecen bancos activos, salvo el que ya tenga puesto la
  // cuenta que se está editando: si se ocultara, el select quedaría vacío y al
  // guardar se borraría el banco de una cuenta que sí lo tenía.
  const bancosSelect = bancos.filter(
    b => b.activo !== false || String(b.id) === String(form.banco_id)
  );
  // Los que quedaron fuera de la lista se muestran al final, para que no estorben.
  const bancosOrdenados = [...bancos].sort(
    (a, b) => Number(a.activo === false) - Number(b.activo === false)
  );
  // Las cuentas, igual. Antes se quedaban en su sitio alfabético al 50% de
  // opacidad, mezcladas entre las que sí se usan: una lista donde lo que ya no
  // sirve estorba entre lo que sirve se lee peor cada vez que crece.
  const cuentasOrdenadas = [...cuentas].sort(
    (a, b) => Number(a.activo === false) - Number(b.activo === false)
  );
  const cuentasInactivas = cuentas.filter((c) => c.activo === false).length;

  // ── Cuentas ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditando(null);
    setForm({ nombre: '', tipo: 'banco', banco_id: '', numero_cuenta: '' });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditando(c);
    setForm({
      nombre: c.nombre || '',
      tipo: c.tipo || 'banco',
      banco_id: c.banco_id != null ? String(c.banco_id) : '',
      numero_cuenta: c.numero_cuenta || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { addToast('Escribe el nombre de la cuenta', 'error'); return; }
    // La entidad YA NO ES OBLIGATORIA, y el cambio tiene una razón concreta:
    // desde que un abono guarda su propia entidad, una cuenta puede ser una
    // persona que recibe por varias (Caro por Bancolombia hoy y por Western
    // Union mañana). Atarla a una sola volvería a juntar las dos cosas que se
    // separaron, y además dejaba sin poder guardar a las cuentas que ya están
    // creadas sin banco.
    const datos = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      // Vacío viaja como null y no como 0: Number('') es 0, y un 0 no existe
      // en la tabla de entidades. Hoy el servidor lo salvaría porque 0 es
      // falsy, pero depender de esa casualidad es pedirle al próximo que la
      // descubra a base de un error de clave ajena.
      banco_id: form.tipo === 'banco' && form.banco_id ? Number(form.banco_id) : null,
      numero_cuenta: form.tipo === 'banco' ? form.numero_cuenta.trim() : '',
    };
    try {
      setGuardando(true);
      if (editando) await cuentasApi.update(editando.id, datos);
      else await cuentasApi.create(datos);
      addToast(editando ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
      setModalOpen(false);
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleDelete = async (c) => {
    const ok = await confirm({
      title: '¿Desactivar cuenta?',
      message: `Se desactivará "${c.nombre}". Los abonos ya registrados se conservan.`,
      confirmText: 'Desactivar', variant: 'danger',
    });
    if (!ok) return;
    try {
      await cuentasApi.delete(c.id);
      addToast('Cuenta desactivada', 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  // Vuelve a poner en la lista una cuenta desactivada. Faltaba, y las
  // entidades sí lo tenían: desactivar «Caro» por error era irreversible
  // desde la pantalla, aunque el endpoint siempre lo permitió.
  const reactivarCuenta = async (c) => {
    try {
      await cuentasApi.update(c.id, { activo: true });
      addToast(`"${c.nombre}" vuelve a estar disponible`, 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err, 'reactivar la cuenta'), 'error');
    }
  };

  // ── Catálogo de bancos ───────────────────────────────────────────

  const crearBanco = async (e) => {
    e?.preventDefault();
    const nombre = nuevoBanco.trim();
    if (!nombre) return;
    try {
      await bancosApi.create({ nombre });
      addToast(`"${nombre}" agregado`, 'success');
      setNuevoBanco('');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const guardarNombreBanco = async () => {
    const nombre = editBanco?.nombre.trim();
    if (!nombre) return;
    // Al renombrar no se valida el nombre en el servidor, así que dos bancos podían
    // quedar llamados igual y ya no se sabía cuál elegir al crear la cuenta.
    const repetido = bancos.some(
      b => b.id !== editBanco.id && (b.nombre || '').trim().toLowerCase() === nombre.toLowerCase()
    );
    if (repetido) { addToast(`Ya hay un banco llamado "${nombre}"`, 'error'); return; }
    try {
      await bancosApi.update(editBanco.id, { nombre });
      addToast('Banco actualizado', 'success');
      setEditBanco(null);
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  // Vuelve a poner en la lista un banco desactivado (por ejemplo si se quitó por error).
  const reactivarBanco = async (b) => {
    try {
      await bancosApi.update(b.id, { activo: true });
      addToast(`"${b.nombre}" vuelve a estar disponible`, 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  // ── Catálogo de métodos de pago ──────────────────────────────────
  //
  // Sólo se teclea el NOMBRE. El valor que queda guardado en los movimientos lo
  // deriva el servidor («Consignación» → «consignacion»): pedirlo dos veces es
  // pedir que un día no coincidan.
  const crearMetodo = async (e) => {
    e?.preventDefault();
    const etiqueta = nuevoMetodo.trim();
    if (!etiqueta) return;
    try {
      await metodosPagoApi.create({ etiqueta });
      addToast(`"${etiqueta}" agregado`, 'success');
      setNuevoMetodo('');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const guardarMetodo = async () => {
    const etiqueta = editMetodo?.etiqueta.trim();
    if (!etiqueta) return;
    const repetido = metodos.some(
      (m) => m.id !== editMetodo.id && (m.etiqueta || '').trim().toLowerCase() === etiqueta.toLowerCase()
    );
    if (repetido) { addToast(`Ya hay un método llamado "${etiqueta}"`, 'error'); return; }
    if (!editMetodo.para_cobrar && !editMetodo.para_pagar) {
      addToast('Marca al menos «para cobrar» o «para pagar», o no se podrá elegir en ninguna pantalla', 'error');
      return;
    }
    try {
      await metodosPagoApi.update(editMetodo.id, {
        etiqueta,
        tiene_destino: editMetodo.tiene_destino,
        para_cobrar: editMetodo.para_cobrar,
        para_pagar: editMetodo.para_pagar,
      });
      addToast('Método actualizado', 'success');
      setEditMetodo(null);
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const reactivarMetodo = async (m) => {
    try {
      await metodosPagoApi.update(m.id, { activo: true });
      addToast(`"${m.etiqueta}" vuelve a estar disponible`, 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const borrarMetodo = async (m) => {
    const usos = (m.usos_cartera || 0) + (m.usos_pagos || 0);
    const ok = await confirm({
      title: usos ? '¿Desactivar método?' : '¿Eliminar método?',
      message: usos
        ? `"${m.etiqueta}" lo usan ${usos} movimiento(s) ya registrados, así que se`
          + ' desactivará en vez de borrarse: no se ofrecerá para nuevos, y los viejos'
          + ' seguirán diciendo lo que decían el día que se registraron.'
        : `Se eliminará "${m.etiqueta}" de la lista. No lo usa ningún movimiento.`,
      confirmText: usos ? 'Desactivar' : 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await metodosPagoApi.delete(m.id);
      addToast(usos ? 'Método desactivado' : 'Método eliminado', 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const borrarBanco = async (b) => {
    const enUso = b.cuentas_asociadas > 0;
    const ok = await confirm({
      title: enUso ? '¿Desactivar banco?' : '¿Eliminar banco?',
      message: enUso
        ? `"${b.nombre}" tiene ${b.cuentas_asociadas} cuenta(s) asociadas, así que se desactivará en vez de borrarse para no romper los abonos ya registrados.`
        : `Se eliminará "${b.nombre}" de la lista.`,
      confirmText: enUso ? 'Desactivar' : 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await bancosApi.delete(b.id);
      addToast(enUso ? 'Banco desactivado' : 'Banco eliminado', 'success');
      load();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const selectCls = 'w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <Layout title="Cuentas y entidades" subtitle="Por dónde entra y sale la plata">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-muted">
            Estas dos listas son las que aparecen al registrar un abono de un cliente,
            un pago a un proveedor o un gasto. Lo que se quita de una lista no se
            borra: queda guardado y se puede volver a usar cuando quieras.
          </p>
          <div className="flex gap-2">
            {/* El formulario de abono dice «Entidad»; esta pantalla decía
                «Bancos». Es la misma cosa, y gana la palabra que ella va a
                buscar. «bancos» se queda de apoyo para reconocerlo. */}
            <Button variant="outline" onClick={() => setBancosOpen(true)}>
              <Building2 size={16} className="mr-1" /> Entidades ({bancosActivos.length})
            </Button>
            {/* Al lado de Entidades porque es la misma pregunta: por dónde entra
                y sale la plata. El método se elige junto con la entidad y la
                cuenta, así que se administra en el mismo sitio. */}
            <Button variant="outline" onClick={() => setMetodosOpen(true)}>
              <CreditCard size={16} className="mr-1" /> Métodos ({metodosActivos.length})
            </Button>
            <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Nueva cuenta</Button>
          </div>
        </div>

        <Card>
          <CardBody>
            {loading ? (
              <p className="text-center text-muted py-8">Cargando…</p>
            ) : cuentas.length === 0 ? (
              <div className="text-center py-10">
                <Wallet size={36} className="mx-auto text-muted/40 mb-3" />
                <p className="text-muted">Sin cuentas registradas</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={openCreate}>
                  Crear la primera
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {cuentasInactivas > 0 && (
                  <p className="text-xs text-muted pb-1">
                    {cuentasInactivas === 1
                      ? 'Hay 1 cuenta fuera de la lista, al final.'
                      : `Hay ${cuentasInactivas} cuentas fuera de la lista, al final.`}
                    {' '}Siguen guardadas y se reactivan con el botón de deshacer.
                  </p>
                )}
                {cuentasOrdenadas.map(c => (
                  <div key={c.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                      highlightId === c.id ? 'border-secondary bg-secondary/10 ring-2 ring-secondary/30' : 'border-border'
                    } ${c.activo === false ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-primary">{c.nombre}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted bg-primary/5 px-1.5 py-0.5 rounded">
                          {c.tipo}
                        </span>
                        {c.activo === false && <span className="text-xs text-error">(inactiva)</span>}
                      </div>
                      {c.banco_nombre && (
                        <p className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                          <Landmark size={12} className="flex-shrink-0" />
                          <span className="font-medium text-secondary">{c.banco_nombre}</span>
                          {c.numero_cuenta && <span className="font-mono">· N.º {c.numero_cuenta}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openEdit(c)} title="Editar" aria-label="Editar"
                        className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:text-primary rounded-lg hover:bg-primary/5">
                        <Pencil size={16} />
                      </button>
                      {c.activo === false ? (
                        // Con <Button size="icono"> y no con un <button> a pelo: el
                        // componente ya trae los 44x44 táctiles y el anillo de foco,
                        // que es justo lo que se olvida al escribirlos a mano. El
                        // trinquete de tests/sistema-de-diseno lo cazó al escribirlo.
                        <Button variant="ghost" size="icono" icon={RotateCcw}
                          onClick={() => reactivarCuenta(c)}
                          title="Volver a usarla" aria-label="Volver a usarla"
                          className="text-muted hover:text-success hover:bg-success/10 rounded-lg" />
                      ) : (
                        <button onClick={() => handleDelete(c)} title="Desactivar" aria-label="Desactivar"
                          className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:text-error rounded-lg hover:bg-error/5">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Crear / editar cuenta ───────────────────────────────── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
             title={editando ? 'Editar cuenta' : 'Nueva cuenta'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1" htmlFor="cuenta-tipo">
              Tipo de cuenta
            </label>
            <BuscadorLista
              value={form.tipo}
              onChange={(valorElegido) => setForm({ ...form, tipo: valorElegido })}
              opciones={[
                ...tiposDisponibles.map((t) => ({ value: t, label: TIPOS_BASE.find(b => b.value === t)?.label || capitalizar(t) })),
              ]}
              id="cuenta-tipo"
              className={selectCls}
            />
          </div>

          {form.tipo === 'banco' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-primary" htmlFor="cuenta-banco">
                    Entidad fija <span className="text-muted font-normal">(opcional)</span>
                  </label>
                  <button type="button" onClick={() => setBancosOpen(true)}
                    className="text-xs font-semibold text-secondary hover:underline underline-offset-2">
                    ¿Falta una? Agrégala
                  </button>
                </div>
                <BuscadorLista
                  value={form.banco_id}
                  onChange={(valorElegido) => setForm({ ...form, banco_id: valorElegido })}
                  opcionVacia="Se pregunta en cada abono"
                  placeholder="Se pregunta en cada abono"
                  opciones={[
                    ...bancosSelect.map((b) => ({ value: b.id, label: `${b.nombre}${b.activo === false ? ' (fuera de la lista)' : ''}` })),
                  ]}
                  id="cuenta-banco"
                  className={selectCls}
                />
                <p className="text-xs text-muted mt-1">
                  Déjalo vacío si esta cuenta recibe por varias entidades: al registrar
                  cada abono se escoge por dónde entró. Pónle una sola si siempre es la
                  misma.
                </p>
              </div>

              <Input label="Número de cuenta (opcional)" value={form.numero_cuenta}
                onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                placeholder="Ej: 123-456789-01" />
            </>
          )}

          <Input label="Nombre con el que la verás" value={form.nombre} required
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder={form.tipo === 'banco' ? 'Ej: Ahorros gerencia' : 'Ej: Caja principal'} />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Catálogo de bancos ──────────────────────────────────── */}
      <Modal isOpen={bancosOpen} onClose={() => { setBancosOpen(false); setEditBanco(null); }}
             title="Entidades">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Bancos, giros y billeteras: por dónde llega la plata. Esta es la lista
            que aparece como <strong>Entidad</strong> al registrar un abono. Agregarla
            aquí evita que la misma entidad quede escrita de tres formas distintas.
            Una que ya tenga cuentas no se borra: queda fuera de la lista y se puede
            volver a activar cuando quieras.
          </p>

          <form onSubmit={crearBanco} className="flex gap-2">
            <input type="text" value={nuevoBanco} onChange={(e) => setNuevoBanco(e.target.value)}
              aria-label="Nombre de la entidad nueva"
              placeholder="Ej: Nequi, Daviplata, Bancolombia…"
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
            <Button type="submit" disabled={!nuevoBanco.trim()}>
              <Plus size={15} className="mr-1" /> Agregar
            </Button>
          </form>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
            {bancos.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Sin bancos en la lista</p>
            ) : bancosOrdenados.map(b => (
              <div key={b.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 ${b.activo === false ? 'bg-primary/[0.03]' : ''}`}>
                {editBanco?.id === b.id ? (
                  <>
                    <input type="text" value={editBanco.nombre} autoFocus
                      onChange={(e) => setEditBanco({ ...editBanco, nombre: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNombreBanco(); } }}
                      className="flex-1 px-2 py-1 rounded-lg border border-secondary bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40" />
                    <button type="button" onClick={guardarNombreBanco} title="Guardar" aria-label="Guardar"
                      className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-success hover:bg-success/10 rounded-lg"><Check size={15} /></button>
                    <button type="button" onClick={() => setEditBanco(null)} title="Cancelar" aria-label="Cancelar"
                      className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:bg-primary/5 rounded-lg"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm truncate ${b.activo === false ? 'text-muted' : 'text-primary'}`}>
                      {b.nombre}
                      {b.cuentas_asociadas > 0 && (
                        <span className="ml-2 text-[10px] text-muted bg-primary/5 px-1.5 py-0.5 rounded-full">
                          {b.cuentas_asociadas} cuenta{b.cuentas_asociadas !== 1 ? 's' : ''}
                        </span>
                      )}
                      {b.activo === false && (
                        <span className="ml-2 text-[10px] text-error">(fuera de la lista)</span>
                      )}
                    </span>
                    <button type="button" onClick={() => setEditBanco({ id: b.id, nombre: b.nombre })}
                      title="Renombrar" aria-label="Renombrar" className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:text-primary rounded-lg hover:bg-primary/5">
                      <Pencil size={14} />
                    </button>
                    {b.activo === false ? (
                      <button type="button" onClick={() => reactivarBanco(b)} title="Volver a usarlo" aria-label="Volver a usarlo"
                        className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:text-success rounded-lg hover:bg-success/10">
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <button type="button" onClick={() => borrarBanco(b)} title="Quitar" aria-label="Quitar"
                        className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center text-muted hover:text-error rounded-lg hover:bg-error/5">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => { setBancosOpen(false); setEditBanco(null); }}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Catálogo de métodos de pago ──────────────────────────── */}
      <Modal isOpen={metodosOpen} onClose={() => { setMetodosOpen(false); setEditMetodo(null); }}
             title="Métodos de pago">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Cómo se mueve la plata: efectivo, consignación, transferencia, giro. Esta es la
            lista que aparece como <strong>Método</strong> al registrar un abono de un cliente
            y al pagarle a un proveedor. Antes estaba fija en el código, y estaban
            <strong> dos listas distintas</strong>: al pagarle a un proveedor no se podía
            elegir <strong>giro</strong>, que es justo como se le paga.
          </p>

          <form onSubmit={crearMetodo} className="flex gap-2">
            <input type="text" value={nuevoMetodo} onChange={(e) => setNuevoMetodo(e.target.value)}
              aria-label="Nombre del método nuevo"
              placeholder="Ej: Giro, Nequi, Cheque…"
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
            <Button type="submit" disabled={!nuevoMetodo.trim()}>
              <Plus size={15} className="mr-1" /> Agregar
            </Button>
          </form>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
            {metodos.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Sin métodos en la lista</p>
            ) : metodosOrdenados.map((m) => {
              const usos = (m.usos_cartera || 0) + (m.usos_pagos || 0);
              return (
              <div key={m.id}
                className={`px-3 py-2 ${m.activo === false ? 'bg-primary/[0.03]' : ''}`}>
                {editMetodo?.id === m.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="text" value={editMetodo.etiqueta} autoFocus
                        aria-label="Nombre del método"
                        onChange={(e) => setEditMetodo({ ...editMetodo, etiqueta: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarMetodo(); } }}
                        className="flex-1 px-2 py-1 rounded-lg border border-secondary bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40" />
                      <Button variant="ghost" size="icono" className="rounded-lg text-success hover:bg-success/10"
                        onClick={guardarMetodo} title="Guardar" aria-label="Guardar el método">
                        <Check size={15} />
                      </Button>
                      <Button variant="ghost" size="icono" className="rounded-lg text-muted hover:bg-primary/5"
                        onClick={() => setEditMetodo(null)} title="Cancelar" aria-label="Cancelar">
                        <X size={15} />
                      </Button>
                    </div>
                    {/* ── LAS TRES COSAS QUE EL MÉTODO DECIDE ──────────────
                        No son adorno. «Lleva entidad y cuenta» es la regla que
                        antes estaba escrita en el código como «¿se llama
                        efectivo?», y eso deja de valer en cuanto la lista la
                        administras tú: un método nuevo que tampoco pase por el
                        banco no se va a llamar así.
                        Y el ámbito evita que la cartera ofrezca «cheque» al
                        cobrar: aquí no se reciben, pero sí se giran. */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer min-h-11">
                        <input type="checkbox" checked={!!editMetodo.tiene_destino}
                          onChange={(e) => setEditMetodo({ ...editMetodo, tiene_destino: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/40" />
                        Lleva entidad y cuenta
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer min-h-11">
                        <input type="checkbox" checked={!!editMetodo.para_cobrar}
                          onChange={(e) => setEditMetodo({ ...editMetodo, para_cobrar: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/40" />
                        Para cobrar
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer min-h-11">
                        <input type="checkbox" checked={!!editMetodo.para_pagar}
                          onChange={(e) => setEditMetodo({ ...editMetodo, para_pagar: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/40" />
                        Para pagar
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex-1 min-w-0 text-sm ${m.activo === false ? 'text-muted' : 'text-primary'}`}>
                      {m.etiqueta}
                      {/* Para qué sirve y si lleva destino, a la vista: son lo
                          que decide dónde aparece y qué campos habilita. */}
                      <span className="ml-2 text-[10px] text-muted">
                        {[m.para_cobrar && 'cobrar', m.para_pagar && 'pagar'].filter(Boolean).join(' · ')}
                        {!m.tiene_destino && ' · sin entidad'}
                      </span>
                      {usos > 0 && (
                        <span className="ml-2 text-[10px] text-muted bg-primary/5 px-1.5 py-0.5 rounded-full">
                          {usos} uso{usos !== 1 ? 's' : ''}
                        </span>
                      )}
                      {m.activo === false && (
                        <span className="ml-2 text-[10px] text-error">(fuera de la lista)</span>
                      )}
                    </span>
                    <Button variant="ghost" size="icono" className="rounded-lg text-muted hover:text-primary"
                      onClick={() => setEditMetodo({
                        id: m.id, etiqueta: m.etiqueta,
                        tiene_destino: m.tiene_destino, para_cobrar: m.para_cobrar, para_pagar: m.para_pagar,
                      })}
                      title="Editar" aria-label={`Editar el método ${m.etiqueta}`}>
                      <Pencil size={14} />
                    </Button>
                    {m.activo === false ? (
                      <Button variant="ghost" size="icono" className="rounded-lg text-muted hover:text-success hover:bg-success/10"
                        onClick={() => reactivarMetodo(m)}
                        title="Volver a usarlo" aria-label={`Volver a usar ${m.etiqueta}`}>
                        <RotateCcw size={14} />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icono" className="rounded-lg text-muted hover:text-error hover:bg-error/5"
                        onClick={() => borrarMetodo(m)}
                        title="Quitar" aria-label={`Quitar ${m.etiqueta}`}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          <p className="text-xs text-muted leading-relaxed">
            El nombre que se escribe es el que se lee; lo que queda guardado en cada
            movimiento lo deriva el sistema («Consignación» → <code>consignacion</code>), para
            que no se tecleen dos veces y un día no coincidan. Un método que ya usen
            movimientos registrados no se borra: queda fuera de la lista y los viejos siguen
            diciendo lo que decían.
          </p>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => { setMetodosOpen(false); setEditMetodo(null); }}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
